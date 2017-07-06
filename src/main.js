import _ from 'underscore';

let rxFactory = function(_) {
  let asyncBind, bind, depMgr, lagBind, postLagBind, promiseBind, recorder;
  let rx = {};
  let nextUid = 0;
  let mkuid = () => nextUid += 1;

  let union = (first, second) => new Set([...Array.from(first), ...Array.from(second)]);
  let intersection = (first, second) => new Set(Array.from(first).filter(item => second.has(item)));
  let difference = (first, second) => new Set(Array.from(first).filter(item => !second.has(item)));

  let popKey = function(x, k) {
    if (!(k in x)) {
      throw new Error(`object has no key ${k}`);
    }
    let v = x[k];
    delete x[k];
    return v;
  };

  let mapPop = function(x, k) {
    let v = x.get(k);
    x.delete(k);
    return v;
  };

  let nthWhere = function(xs, n, f) {
    for (let i = 0; i < xs.length; i++) {
      let x = xs[i];
      if (f(x) && ((n -= 1) < 0)) {
        return [x, i];
      }
    }
    return [null, -1];
  };

  let firstWhere = (xs, f) => nthWhere(xs, 0, f);

  let mkMap = function(xs) {
    let k, v;
    if (xs == null) { xs = []; }
    let map = (Object.create != null) ? Object.create(null) : {};
    if (_.isArray(xs)) {
      for ([k,v] of Array.from(xs)) { map[k] = v; }
    } else {
      for (k in xs) { v = xs[k]; map[k] = v; }
    }
    return map;
  };

  let sum = function(xs) {
    let n = 0;
    for (let x of Array.from(xs)) { n += x; }
    return n;
  };

  //
  // Events and pub-sub dependency management
  //

  // Just a global mapping from subscription UIDs to source Evs; this essentially
  // enables us to follow subscription UIDs up the dependency graph (from
  // dependents)
  let DepMgr = (rx.DepMgr = class DepMgr {
    constructor() {
      this.buffering = 0;
      this.buffer = [];
      this.events = new Set();
    }
    // called by Ev.sub to register a new subscription
    transaction(f) {
      let res;
      this.buffering += 1;
      try {
        res = f();
      } finally {
        this.buffering -= 1;
        if (this.buffering === 0) {
          let immediateDeps = new Set(_.flatten(Array.from(this.events).map(({downstreamCells}) => Array.from(downstreamCells))));
          let allDeps = rx.allDownstream(...Array.from(immediateDeps || []));
          allDeps.forEach(cell => cell._shield = true);
          try {
            // we need to clear the buffer now, in case rx.transaction is called as a result of one
            // the events that we're publishing, since that would cause transaction to execute again with
            // the full buffer, causing an infinite loop.
            let bufferedPubs = this.buffer;
            this.buffer = [];
            this.events.clear();

            bufferedPubs.map(function(...args) { let [ev, data] = Array.from(args[0]); return ev.pub(data); });
            allDeps.forEach(c => c.refresh());
          } finally {
            allDeps.forEach(cell => cell._shield = false);
          }
        }
      }
      return res;
    }
  });

  rx._depMgr = (depMgr = new DepMgr());

  let Ev = (rx.Ev = class Ev {
    constructor(init, observable) {
      this.observable = observable;
      this.init = init;
      this.subs = mkMap();
      this.downstreamCells = new Set();
    }
    sub(listener) {
      let uid = mkuid();
      if (this.init != null) { listener(this.init()); }
      this.subs[uid] = listener;
      return uid;
    }
    // callable only by the src
    pub(data) {
      if (depMgr.buffering) {
        depMgr.buffer.push([this, data]);
        return depMgr.events.add(this);
      } else {
        return (() => {
          let result = [];
          for (let uid in this.subs) {
            let listener = this.subs[uid];
            result.push(listener(data));
          }
          return result;
        })();
      }
    }
    unsub(uid) {
      return popKey(this.subs, uid);
    }
    // listener is subscribed only for the duration of the context
    scoped(listener, context) {
      let uid = this.sub(listener);
      try { return context(); }
      finally {this.unsub(uid); }
    }
  });

  rx.skipFirst = function(f) {
    let first = true;
    return function(...args) {
      if (first) {
        return first = false;
      } else {
        return f(...Array.from(args || []));
      }
    };
  };

  //
  // Reactivity
  //

  rx.upstream = function(cell) {
    let events = Array.from(cell.upstreamEvents);
    let depCells = events.map(ev => ev.observable);
    return Array.from(new Set(depCells));
  };

  var allDownstreamHelper = (rx._allDownstreamHelper = function(...cells) {
    if (cells.length) {
      let downstream = Array.from(new Set(_.flatten(cells.map(cell => Array.from(cell.onSet.downstreamCells))
      )
      )
      );
      let r = _.flatten([downstream, allDownstreamHelper(...Array.from(downstream || []))]);
      return r;
    }
    return [];
  });

  rx.allDownstream = (...cells) => Array.from(new Set([...Array.from(cells), ...Array.from(allDownstreamHelper(...Array.from(cells || [])))].reverse())).reverse();


  let Recorder = (rx.Recorder = class Recorder {
    constructor() {
      this.stack = [];
      this.isMutating = false;
      this.isIgnoring = false;
      this.hidingMutationWarnings = false;
      this.onMutationWarning = new Ev(); // just fires null for now
    }
    // takes a dep cell and push it onto the stack as the current invalidation
    // listener, so that calls to .sub (e.g. by ObsCell.get) can establish a
    // dependency
    record(dep, f) {
      if ((this.stack.length > 0) && !this.isMutating) { _(this.stack).last().addNestedBind(dep); }
      this.stack.push(dep);
      // reset isMutating
      let wasMutating = this.isMutating;
      this.isMutating = false;
      // reset isIgnoring
      let wasIgnoring = this.isIgnoring;
      this.isIgnoring = false;
      try {
        return f();
      } finally {
        this.isIgnoring = wasIgnoring;
        this.isMutating = wasMutating;
        this.stack.pop();
      }
    }

    // subscribes the current cell to an event; the cell will refresh if the event fires and condFn returns true.
    // note that we are establishing both directions of the dependency tracking here (subscribing
    // to the dependency's events as well as registering the subscription UID with the current listener)
    sub(event, condFn) {
      if (condFn == null) { condFn = () => true; }
      if ((this.stack.length > 0) && !this.isIgnoring) {
        let topCell = _(this.stack).last();
        topCell.upstreamEvents.add(event);
        event.downstreamCells.add(topCell);
        return rx.autoSub(event, function(...evData) {
          if (condFn(...Array.from(evData || []))) { return topCell.refresh(); }
        });
      }
    }

    addCleanup(cleanup) {
      if (this.stack.length > 0) { return _(this.stack).last().addCleanup(cleanup); }
    }
    // Delimit the function as one where a mutation takes place, such that if
    // within this function we refresh a bind, we don't treat that bind as a
    // nested bind (which causes all sorts of problems e.g. the cascading
    // disconnects)
    hideMutationWarnings(f) {
      let wasHiding = this.hidingMutationWarnings;
      this.hidingMutationWarnings = true;
      try { return f(); }
      finally {this.hidingMutationWarnings = wasHiding; }
    }

    fireMutationWarning() {
      console.warn('Mutation to observable detected during a bind context');
      return this.onMutationWarning.pub(null);
    }
    mutating(f) {
      if ((this.stack.length > 0) && !this.hidingMutationWarnings) {
        this.fireMutationWarning();
      }
      let wasMutating = this.isMutating;
      this.isMutating = true;
      try { return f(); }
      finally {this.isMutating = wasMutating; }
    }
    // Ignore event hooks while evaluating f (but limited to the current bind
    // context; subsequent binds will still subscribe those binds to event hooks)
    ignoring(f) {
      let wasIgnoring = this.isIgnoring;
      this.isIgnoring = true;
      try { return f(); }
      finally {this.isIgnoring = wasIgnoring; }
    }
  });

  rx.types = {'cell': 'cell', 'array': 'array', 'map': 'map', 'set': 'set'};

  rx._recorder = (recorder = new Recorder());

  rx.hideMutationWarnings = f => recorder.hideMutationWarnings(f);

  rx.asyncBind = (asyncBind = function(init, f) {
    let dep = new DepCell(f, init);
    dep.refresh();
    return dep;
  });

  rx.promiseBind = (promiseBind = (init, f) => asyncBind(init, function() { return this.record(f).done(res => this.done(res)); }));

  rx.bind = (bind = f => asyncBind(null, function() { return this.done(this.record(f)); }));

  rx.lagBind = (lagBind = function(lag, init, f) {
    let timeout = null;
    return asyncBind(init, function() {
      if (timeout != null) { clearTimeout(timeout); }
      return timeout = setTimeout(
        () => this.done(this.record(f)),
        lag
      );
    });
  });

  rx.postLagBind = (postLagBind = function(init, f) {
    let timeout = null;
    return asyncBind(init, function() {
      let {val, ms} = this.record(f);
      if (timeout != null) {
        clearTimeout(timeout);
      }
      return timeout = setTimeout((() => this.done(val)), ms);
    });
  });

  rx.snap = f => recorder.ignoring(f);

  rx.onDispose = cleanup => recorder.addCleanup(cleanup);

  rx.autoSub = function(ev, listener) {
    let subid = ev.sub(listener);
    rx.onDispose(() => ev.unsub(subid));
    return subid;
  };

  rx.subOnce = function(event, listener) {
    var uid = rx.autoSub(event, rx.skipFirst(function(...args) {
      _.defer(() => listener(...Array.from(args || [])));
      return event.unsub(uid);
    })
    );
    return uid;
  };

  let ObsBase = (function() {
    let Cls = (rx.ObsBase = class ObsBase {
      static initClass() {
        this.prototype.to = {
          cell: () => rx.cell.from(this),
          array: () => rx.array.from(this),
          map: () => rx.map.from(this),
          set: () => rx.set.from(this)
        };
      }
      constructor() {
        this.events = [];
      }
      flatten() { return rx.flatten(this); }
      subAll(condFn) { if (condFn == null) { condFn = () => true; } return this.events.forEach(ev => recorder.sub(ev, condFn)); }
      raw() { return this._base; }
      _mkEv(f) {
        let ev = new Ev(f, this);
        this.events.push(ev);
        return ev;
      }
    });
    Cls.initClass();
    return Cls;
  })();


  let ObsCell = (rx.ObsCell = class ObsCell extends ObsBase {
    constructor(_base) {
      super();
      this._base = _base != null ? _base : null;
      this.onSet = this._mkEv(() => [null, this._base]); // [old, new]
      this._shield = false;
      let downstreamCells = () => this.onSet.downstreamCells;
      this.refreshAll = () => {
        if (this.onSet.downstreamCells.size && !this._shield) {
          this._shield = true;
          let cells = rx.allDownstream(...Array.from(Array.from(downstreamCells()) || []));
          cells.forEach(c => c._shield = true);
          try { return cells.forEach(c => c.refresh()); }
          finally {
            cells.forEach(c => c._shield = false);
            this._shield = false;
          }
        }
      };
      this.refreshSub = rx.autoSub(this.onSet, this.refreshAll);
    }

    all() {
      this.subAll(() => !this._shield);
      return this._base;
    }
    get() { return this.all(); }
    readonly() { return new DepCell(() => this.all()); }
  });

  let SrcCell = (rx.SrcCell = class SrcCell extends ObsCell {
    set(x) { return recorder.mutating(() => { if (this._base !== x) {
      let old = this._base;
      this._base = x;
      this.onSet.pub([old, x]);
      return old;
    }
     }); }
  });

  var DepCell = (rx.DepCell = class DepCell extends ObsCell {
    constructor(body, init) {
      super(init != null ? init : null);
      this.body = body != null ? body : null;
      this.refreshing = false;
      this.nestedBinds = [];
      this.cleanups = [];
      this.upstreamEvents = new Set();
    }
    refresh() {
      if (!this.refreshing) {
        let old = this._base;
        // TODO we are immediately disconnecting; something that disconnects upon
        // completion may have better semantics for asynchronous operations:
        //
        // - enabling lagBind to defer evaluation so long as its current
        //   dependencies keep changing
        // - allowing nested binds to continue reacting during asynchronous
        //   operation
        //
        // But the implementation is more complex as it requires being able to
        // create and discard tentative recordings.  It's also unclear whether
        // such a lagBind is more desirable (in the face of changing dependencies)
        // and whether on-completion is what's most generalizable.
        let realDone = _base => {
          this._base = _base;
          return this.onSet.pub([old, this._base]);
        };
        let recorded = false;
        let syncResult = null;
        let isSynchronous = false;
        var env = {
          // next two are for tolerating env.done calls from within env.record
          record: f => {
            // TODO document why @refreshing exists
            // guards against recursively evaluating this recorded
            // function (@body or an async body) when calling `.get()`
            if (!this.refreshing) {
              let res;
              this.disconnect();
              if (recorded) { throw new Error('this refresh has already recorded its dependencies'); }
              this.refreshing = true;
              recorded = true;
              try { res = recorder.record(this, () => f.call(env)); }
              finally {this.refreshing = false; }
              if (isSynchronous) { realDone(syncResult); }
              return res;
            }
          },
          done: x => {
            if (old !== x) {
              if (this.refreshing) {
                isSynchronous = true;
                return syncResult = x;
              } else {
                return realDone(x);
              }
            }
          }
        };
        return this.body.call(env);
      }
    }
    // unsubscribe from all dependencies and recursively have all nested binds
    // disconnect themselves as well
    disconnect() {
      // TODO ordering of cleanup vs unsubscribes may require revisiting
      for (let cleanup of Array.from(this.cleanups)) {
        cleanup();
      }
      for (let nestedBind of Array.from(this.nestedBinds)) {
        nestedBind.disconnect();
      }
      this.nestedBinds = [];
      this.cleanups = [];
      this.upstreamEvents.forEach(ev => ev.downstreamCells.delete(this));
      return this.upstreamEvents.clear();
    }
    // called by recorder
    addNestedBind(nestedBind) {
      return this.nestedBinds.push(nestedBind);
    }
    // called by recorder
    addCleanup(cleanup) {
      return this.cleanups.push(cleanup);
    }
  });

  let ObsArray = (rx.ObsArray = class ObsArray extends ObsBase {
    constructor(_cells, diff) {
      if (_cells == null) { _cells = []; }
      if (diff == null) { diff = rx.basicDiff(); }
      super();
      this._cells = _cells;
      this.diff = diff;
      this.onChange = this._mkEv(() => [0, [], this._cells.map(c => c.raw())]); // [index, removed, added]
      this.onChangeCells = this._mkEv(() => [0, [], this._cells]); // [index, removed, added]
      this._indexed = null;
    }
    all() {
      recorder.sub(this.onChange);
      return this._cells.map(c => c.get());
    }
    raw() { return this._cells.map(c => c.raw()); }
    readonly() { return new DepArray(() => this.all()); }
    rawCells() { return this._cells; }
    at(i) {
      recorder.sub(this.onChange, function(...args) {
        // if elements were inserted or removed prior to this element
        let [index, removed, added] = Array.from(args[0]);
        if ((index <= i) && (removed.length !== added.length)) { return true;
        // if this element is one of the elements changed
        } else if ((removed.length === added.length) && (i <= (index + removed.length))) { return true;
        } else { return false; }
      });
      return (this._cells[i] != null ? this._cells[i].get() : undefined);
    }
    length() {
      recorder.sub(this.onChangeCells, function(...args) { let [index, removed, added] = Array.from(args[0]); return removed.length !== added.length; });
      return this._cells.length;
    }
    size() { return this.length(); }
    map(f) {
      let ys = new MappedDepArray();
      rx.autoSub(this.onChangeCells, (...args) => {
        let [index, removed, added] = Array.from(args[0]);
        for (var cell of Array.from(ys._cells.slice(index, index + removed.length))) {
          cell.disconnect();
        }
        let newCells =
          added.map(item => cell = bind(() => f(item.get())));
        return ys.realSpliceCells(index, removed.length, newCells);
      });
      return ys;
    }
    transform(f, diff) { return new DepArray((() => f(this.all())), diff); }
    filter(f) { return this.transform(arr => arr.filter(f)); }
    slice(x, y) { return this.transform(arr => arr.slice(x, y)); }
    reduce(f, init) {  return this.all().reduce(f, init != null ? init : this.at(0)); }
    reduceRight(f, init) {  return this.all().reduceRight(f, init != null ? init : this.at(0)); }
    every(f) {  return this.all().every(f); }
    some(f) {  return this.all().some(f); }
    indexOf(val, from) { if (from == null) { from = 0; } return this.all().indexOf(val, from); }
    lastIndexOf(val, from) {
      if (from == null) { from = this.length() - 1; }
      return this.all().lastIndexOf(val, from);
    }
    join(separator) {  if (separator == null) { separator = ','; } return this.all().join(separator); }
    first() { return this.at(0); }
    last() { return this.at(this.length() - 1); }
    indexed() {
      if ((this._indexed == null)) {
        this._indexed = new IndexedDepArray();
        rx.autoSub(this.onChangeCells, (...args) => {
          let [index, removed, added] = Array.from(args[0]);
          return this._indexed.realSpliceCells(index, removed.length, added);
        });
      }
      return this._indexed;
    }
    concat(...those) { return rx.concat(this, ...Array.from(those)); }
    realSpliceCells(index, count, additions) {
      let removed = this._cells.splice.apply(this._cells, [index, count].concat(additions));
      let removedElems = rx.snap(() => Array.from(removed).map((x2) => x2.get()));
      let addedElems = rx.snap(() => Array.from(additions).map((x3) => x3.get()));
      return rx.transaction(() => {
        this.onChangeCells.pub([index, removed, additions]);
        return this.onChange.pub([index, removedElems, addedElems]);
      });
    }
    realSplice(index, count, additions) {
      return this.realSpliceCells(index, count, additions.map(rx.cell));
    }
    _update(val, diff) {
      let left;
      if (diff == null) { ({ diff } = this); }
      let old = rx.snap(() => (Array.from(this._cells).map((x) => x.get())));
      let fullSplice = [0, old.length, val];
      let x = null;
      let splices =
        (diff != null) ?
          (left = permToSplices(old.length, val, diff(old, val))) != null ? left : [fullSplice]
        :
          [fullSplice];
      //console.log(old, val, splices, fullSplice, diff, @diff)
      return (() => {
        let result = [];
        for (let splice of Array.from(splices)) {
          let [index, count, additions] = Array.from(splice);
          result.push(this.realSplice(index, count, additions));
        }
        return result;
      })();
    }
  });

  let SrcArray = (rx.SrcArray = class SrcArray extends ObsArray {
    spliceArray(index, count, additions) { return recorder.mutating(() => {
      return this.realSplice(index, count, additions);
    }); }
    splice(index, count, ...additions) { return this.spliceArray(index, count, additions); }
    insert(x, index) { return this.splice(index, 0, x); }
    remove(x) {
      let i = _(this.raw()).indexOf(x);
      if (i >= 0) { return this.removeAt(i); }
    }
    removeAll(x) { return rx.transaction(() => {
      let i = _(rx.snap(() => this.all())).indexOf(x);
      return (() => {
        let result = [];
        while (i >= 0) {
          this.removeAt(i);
          result.push(i = _(rx.snap(() => this.all())).indexOf(x));
        }
        return result;
      })();
    }); }
    removeAt(index) {
      let val = rx.snap(() => this.at(index));
      this.splice(index, 1);
      return val;
    }
    push(x) { return this.splice(rx.snap(() => this.length()), 0, x); }
    pop() { return this.removeAt(rx.snap(() => this.length() - 1)); }
    put(i, x) { return this.splice(i, 1, x); }
    replace(xs) { return this.spliceArray(0, rx.snap(() => this.length()), xs); }
    unshift(x) { return this.insert(x, 0); }
    shift() { return this.removeAt(0); }
    // TODO: How is this different from replace? we should use one or the other.
    update(xs) { return recorder.mutating(() => this._update(xs)); }
    move(src, dest) { return rx.transaction(() => {
      // moves element at src to index before dest
      if (src === dest) { return; }

      let len = rx.snap(() => this.length());

      if ((src < 0) || (src > (len - 1))) {
        throw `Source ${src} is outside of bounds of array of length ${len}`;
      }
      if ((dest < 0) || (dest > len)) {
        throw `Destination ${dest} is outside of bounds of array of length ${len}`;
      }

      let val = rx.snap(() => this.all()[src]);

      if (src > dest) {
        this.removeAt(src);
        this.insert(val, dest);
      } else {
        this.insert(val, dest);
        this.removeAt(src);
      }

    }); }  // removeAt returns, but insert doesn't, so let's avoid inconsistency
    swap(i1, i2) { return rx.transaction(() => {
      let len = rx.snap(() => this.length());
      if ((i1 < 0) || (i1 > (len - 1))) {
        throw `i1 ${i1} is outside of bounds of array of length ${len}`;
      }
      if ((i2 < 0) || (i2 > (len - 1))) {
        throw `i2 ${i2} is outside of bounds of array of length ${len}`;
      }

      let first = Math.min(i1, i2);
      let second = Math.max(i1, i2);

      this.move(first, second);
      return this.move(second, first);
    }); }

    reverse() {
      // Javascript's Array.reverse both reverses the Array and returns its new value
      this.update(rx.snap(() => this.all().reverse()));
      return rx.snap(() => this.all());
    }
  });

  var MappedDepArray = (rx.MappedDepArray = class MappedDepArray extends ObsArray {
    constructor() { super(); }
  });
  var IndexedDepArray = (rx.IndexedDepArray = class IndexedDepArray extends ObsArray {
    constructor(xs, diff) {
      if (xs == null) { xs = []; }
      super(xs, diff);
      this.is = (Array.from(this._cells).map((x, i) => rx.cell(i)));
      this.onChangeCells = this._mkEv(() => [0, [], _.zip(this._cells, this.is)]); // [index, removed, added]
      this.onChange = this._mkEv(() => [0, [], _.zip(this.is, rx.snap(() => this.all()))]);
    }
    // TODO duplicate code with ObsArray
    map(f) {
      let ys = new MappedDepArray();
      rx.autoSub(this.onChangeCells, (...args) => {
        let [index, removed, added] = Array.from(args[0]);
        for (var cell of Array.from(ys._cells.slice(index, index + removed.length))) {
          cell.disconnect();
        }
        let newCells =
          (() => {
          let result = [];
          for (var [item, icell] of Array.from(added)) {
            result.push(cell = bind(() => f(item.get(), icell)));
          }
          return result;
        })();
        return ys.realSpliceCells(index, removed.length, newCells);
      });
      return ys;
    }
    realSpliceCells(index, count, additions) {
      let i;
      let removed = this._cells.splice.apply(this._cells, [index, count].concat(additions));
      let removedElems = rx.snap(() => Array.from(removed).map((x2) => x2.get()));

      let iterable = this.is.slice(index + count);
      for (let offset = 0; offset < iterable.length; offset++) {
        i = iterable[offset];
        i.set(index + additions.length + offset);
      }
      let newIs = ((() => {
        let asc, end;
        let result = [];
        for (i = 0, end = additions.length, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
          result.push(rx.cell(index + i));
        }
        return result;
      })());
      this.is.splice(index, count, ...Array.from(newIs));

      let addedElems = rx.snap(() => Array.from(additions).map((x3) => x3.get()));
      return rx.transaction(() => {
        this.onChangeCells.pub([index, removed, _.zip(additions, newIs)]);
        return this.onChange.pub([index, removedElems, _.zip(addedElems, newIs)]);
      });
    }
  });
  let IndexedMappedDepArray = (rx.IndexedMappedDepArray = class IndexedMappedDepArray extends IndexedDepArray {});

  var DepArray = (rx.DepArray = class DepArray extends ObsArray {
    constructor(f, diff) {
      super([], diff);
      this.f = f;
      rx.autoSub((bind(() => Array.from(this.f()))).onSet, (...args) => { let [old, val] = Array.from(args[0]); return this._update(val); });
    }
  });

  let IndexedArray = (rx.IndexedArray = class IndexedArray extends DepArray {
    constructor(_cells) {
      super();
      this._cells = _cells;
    }
    map(f) {
      let ys = new MappedDepArray();
      rx.autoSub(this._cells.onChange, function(...args) {
        let [index, removed, added] = Array.from(args[0]);
        return ys.realSplice(index, removed.length, added.map(f));
      });
      return ys;
    }
  });

  rx.concat = function(...xss) {
    let xs;
    let ys = new MappedDepArray();
    let casted = xss.map(xs => rx.cast(xs, 'array'));
    let repLens = ((() => {
      let result = [];
      for (xs of Array.from(xss)) {         result.push(0);
      }
      return result;
    })());
    casted.forEach((xs, i) =>
      rx.autoSub(xs.onChange, function(...args) {
        let [index, removed, added] = Array.from(args[0]);
        let xsOffset = sum(repLens.slice(0, i));
        repLens[i] += added.length - removed.length;
        return ys.realSplice(xsOffset + index, removed.length, added);
      })
    );
    return ys;
  };

  let objToJSMap = function(obj) {
    if (obj instanceof Map) { return obj;
    } else if (_.isArray(obj)) { return new Map(obj);
    } else { return new Map(_.pairs(obj)); }
  };

  let ObsMap = (rx.ObsMap = class ObsMap extends ObsBase {
    constructor(_base) {
      if (_base == null) { _base = new Map(); }
      super();
      this._base = objToJSMap(_base);
      this.onAdd = this._mkEv(() => new Map(this._base)); // {key: new...}
      this.onRemove = this._mkEv(() => new Map()); // {key: old...}
      this.onChange = this._mkEv(() => new Map()); // {key: [old, new]...}
    }
    get(key) {
      this.subAll(result => result.has(key));
      return this._base.get(key);
    }
    has(key) {
      recorder.sub(this.onAdd, additions => additions.has(key));
      recorder.sub(this.onRemove, removals => removals.has(key));
      return this._base.has(key);
    }
    all() {
      this.subAll();
      return new Map(this._base);
    }
    readonly() { return new DepMap(() => this.all()); }
    size() {
      recorder.sub(this.onRemove);
      recorder.sub(this.onAdd);
      return this._base.size;
    }
    realPut(key, val) {
      if (this._base.has(key)) {
        let old = this._base.get(key);
        if (old !== val) {
          this._base.set(key, val);
          this.onChange.pub(new Map([[key, [old, val]]]));
        }
        return old;
      } else {
        this._base.set(key, val);
        this.onAdd.pub(new Map([[key, val]]));
        return undefined;
      }
    }
    realRemove(key) {
      let val = mapPop(this._base, key);
      this.onRemove.pub(new Map([[key, val]]));
      return val;
    }
    _update(other) {
      let val;
      let otherMap = objToJSMap(other);
      let ret = new Map(this._base);
      let removals = (() => {
        return _.chain(Array.from(this._base.keys()))
         .difference(Array.from(otherMap.keys()))
         .map(k => [k, mapPop(this._base, k)])
         .value();
      })();

      let additions = (() => {
        return _.chain(Array.from(otherMap.keys()))
         .difference(Array.from(this._base.keys()))
         .map(k => {
           val = otherMap.get(k);
           this._base.set(k, val);
           return [k, val];
       })
         .value();
      })();

      let changes = (() => {
        let k;
        return _.chain(Array.from(otherMap))
         .filter((...args) => { [k, val] = Array.from(args[0]); return this._base.has(k) && (this._base.get(k) !== val); })
         .map((...args) => {
           [k, val] = Array.from(args[0]);
           let old = this._base.get(k);
           this._base.set(k, val);
           return [k, [old, val]];
       })
         .value();
      })();

      rx.transaction(() => {
        if (removals.length) { this.onRemove.pub(new Map(removals)); }
        if (additions.length) { this.onAdd.pub(new Map(additions)); }
        if (changes.length) { return this.onChange.pub(new Map(changes)); }
      });

      return ret;
    }
  });

  let SrcMap = (rx.SrcMap = class SrcMap extends ObsMap {
    put(key, val) { return recorder.mutating(() => this.realPut(key, val)); }
    set(key, val) { return this.put(key, val); }
    delete(key) { return recorder.mutating(() => {
      let val = undefined;
      if (this._base.has(key)) {
        val = this.realRemove(key);
        this.onRemove.pub(new Map([[key, val]]));
      }
      return val;
    }); }
    remove(key) { return this.delete(key); }
    clear() { return recorder.mutating(() => {
      let removals = new Map(this._base);
      this._base.clear();
      if (removals.size) { this.onRemove.pub(removals); }
      return removals;
    }); }
    update(x) { return recorder.mutating(() => this._update(x)); }
  });

  var DepMap = (rx.DepMap = class DepMap extends ObsMap {
    constructor(f) {
      super();
      this.f = f;
      let c = bind(this.f);
      rx.autoSub(c.onSet, (...args) => { let [old, val] = Array.from(args[0]); return this._update(val); });
    }
  });

  //
  // Converting POJO attributes to reactive ones.
  //

  let objToJSSet = function(obj) { if (obj instanceof Set) { return obj; } else { return new Set(obj); } };
  let _castOther = function(other) {
    if (other instanceof Set) { other;
    } else if (other instanceof ObsSet) { other = other.all(); }

    if (other instanceof ObsArray) { other = other.all(); }
    if (other instanceof ObsCell) { other = other.get(); }
    return new Set(other);
  };

  var ObsSet = (rx.ObsSet = class ObsSet extends ObsBase {
    constructor(_base) {
      if (_base == null) { _base = new Set(); }
      super();
      this._base = objToJSSet(_base);
      this.onChange = this._mkEv(() => [this._base, new Set()]);  // additions, removals
    }
    has(key) {
      this.subAll(function(...args) { let [additions, removals] = Array.from(args[0]); return additions.has(key) || removals.has(key); });
      return this._base.has(key);
    }
    all() {
      this.subAll();
      return new Set(this._base);
    }
    readonly() { return new DepSet(() => this.all()); }
    values() { return this.all(); }
    entries() { return this.all(); }
    size() {
      this.subAll(function(...args) { let [additions, removals] = Array.from(args[0]); return additions.size !== removals.size; });
      return this._base.size;
    }
    union(other) { return new DepSet(() => union(this.all(), _castOther(other))); }
    intersection(other) { return new DepSet(() => intersection(this.all(), _castOther(other))); }
    difference(other) { return new DepSet(() => difference(this.all(), _castOther(other))); }
    symmetricDifference(other) {
      return new DepSet(() => {
        let me = this.all();
        other = _castOther(other);
        return new Set(Array.from(union(me, other)).filter(item => !me.has(item) || !other.has(item)));
      });
    }
    _update(y) { return rx.transaction(() => {
      let old_ = new Set(this._base);
      let new_ = objToJSSet(y);

      let additions = new Set();
      let removals = new Set();

      // JS sets don't come with subtraction :(
      old_.forEach(function(item) { if (!new_.has(item)) { return removals.add(item); } });
      new_.forEach(function(item) { if (!old_.has(item)) { return additions.add(item); } });

      old_.forEach(item => this._base.delete(item));
      new_.forEach(item => this._base.add(item));

      this.onChange.pub([
        additions,
        removals
      ]);
      return old_;
    }); }
  });


  let SrcSet = (rx.SrcSet = class SrcSet extends ObsSet {
    add(item) { return recorder.mutating(() => {
      if (!this._base.has(item)) {
        this._base.add(item);
        this.onChange.pub([
          new Set([item]),
          new Set()
        ]);
      }
      return item;
    }); }
    put(item) { return this.add(item); }
    delete(item) { return recorder.mutating(() => {
      if (this._base.has(item)) {
        this._base.delete(item);
        this.onChange.pub([
          new Set(),
          new Set([item])
        ]);
      }
      return item;
    }); }
    remove(item) { return this.delete(item); }
    clear() { return recorder.mutating(() => {
      let removals = new Set(this._base);
      if (this._base.size) {
        this._base.clear();
        this.onChange.pub([
          new Set(),
          removals
        ]);
      }
      return removals;
    }); }
    update(y) { return recorder.mutating(() => this._update(y)); }
  });

  var DepSet = (rx.DepSet = class DepSet extends ObsSet {
    constructor(f) {
      super();
      this.f = f;
      let c = bind(this.f);
      rx.autoSub(c.onSet, (...args) => { let [old, val] = Array.from(args[0]); return this._update(val); });
    }
  });

  rx.cellToSet = c => new rx.DepSet(function() { return c.get(); });

  rx.liftSpec = obj =>
    _.object((() => {
      let result = [];
      
      for (let name of Array.from(Object.getOwnPropertyNames(obj))) {
        var val = obj[name];
        if ((val != null) && [rx.ObsMap, rx.ObsCell, rx.ObsArray, rx.ObsSet].some(cls => val instanceof cls)) { continue; }
        let type =
          _.isFunction(val) ? null
          : _.isArray(val) ? 'array'
          : val instanceof Set ? 'set'
          : val instanceof Map ? 'map'
          : 'cell';
        result.push([name, {type, val}]);
      }
    
      return result;
    })())
  ;

  rx.lift = function(x, fieldspec) {
    if (fieldspec == null) { fieldspec = rx.liftSpec(x); }
    return _.mapObject(fieldspec, function({type}, name) {
      if (!(x[name] instanceof ObsBase) && type in rx.types) { return rx[type](x[name]); }
      return x[name];
  });
  };

  rx.unlift = x => _.mapObject(x, function(v) { if (v instanceof rx.ObsBase) { return v.all(); } else { return v; } });

  //
  // Implicitly reactive objects
  //

  rx.reactify = function(obj, fieldspec) {
    let spec;
    if (_.isArray(obj)) {
      let arr = rx.array(_.clone(obj));
      Object.defineProperties(obj, _.object(
        Object.getOwnPropertyNames(SrcArray.prototype)
          .concat(Object.getOwnPropertyNames(ObsArray.prototype))
          .concat(Object.getOwnPropertyNames(ObsBase.prototype))
          .filter((methName) => methName !== 'length').map((methName) => {
            let meth = obj[methName];
            let newMeth = function(...args) {
              let res;
              if (meth != null) { res = meth.call(obj, ...args); }
              arr[methName].call(arr, ...args);
              return res;
            };
            spec = {
              configurable: true,
              enumerable: false,
              value: newMeth,
              writable: true
            };
            return [methName, spec];
          })
      )
      );
      return obj;
    } else {
      return Object.defineProperties(obj, _.object((() => {
        let result = [];
        
        for (let name in fieldspec) {
          spec = fieldspec[name];
          result.push((function(name, spec) {
            let desc = null;
            switch (spec.type) {
              case 'cell':
                let obs = rx.cell(spec.val != null ? spec.val : null);
                desc = {
                  configurable: true,
                  enumerable: true,
                  get() { return obs.get(); },
                  set(x) { return obs.set(x); }
                };
                break;
              case 'array':
                let view = rx.reactify(spec.val != null ? spec.val : []);
                desc = {
                  configurable: true,
                  enumerable: true,
                  get() {
                    view.all();
                    return view;
                  },
                  set(x) {
                    view.splice(0, view.length, ...Array.from(x));
                    return view;
                  }
                };
                break;
              default: throw new Error(`Unknown observable type: ${type}`);
            }
            return [name, desc];
          })(name, spec));
        }
      
        return result;
      })())
      );
    }
  };

  rx.autoReactify = obj =>
    rx.reactify(obj, _.object((() => {
      let result = [];
      
      for (let name of Array.from(Object.getOwnPropertyNames(obj))) {
        let val = obj[name];
        if (val instanceof ObsBase) { continue; }
        let type =
          _.isFunction(val) ? null
          : _.isArray(val) ? 'array'
          : 'cell';
        result.push([name, {type, val}]);
      }
    
      return result;
    })())
    )
  ;

  rx.cell = value => new SrcCell(value);
  rx.cell.from = function(value) {
    if (value instanceof ObsCell) { return value;
    } else if (value instanceof ObsBase) { return bind(() => value.all());
    } else { return bind(() => value); }
  };

  rx.array = (xs, diff) => new SrcArray((xs != null ? xs : []).map(rx.cell), diff);
  rx.array.from = function(value, diff) {
    let f;
    if (value instanceof rx.ObsArray) { return value;
    } else if (_.isArray(value)) { f = () => value;
    } else if (value instanceof ObsBase) { f = () => value.all();
    } else { throw new Error(`Cannot cast ${value.constructor.name} to array!`); }

    return new DepArray(f, diff);
  };

  rx.map = value => new SrcMap(value);
  rx.map.from = function(value) {
    if (value instanceof rx.ObsMap) { return value;
    } else if (value instanceof ObsBase) { return new DepMap(function() { return value.get(); });
    } else { return new DepMap(function() { return value; }); }
  };


  rx.set = value => new SrcSet(value);
  rx.set.from = function(value) {
    if (value instanceof rx.ObsSet) { return value;
    } else if (value instanceof rx.ObsBase) { return new DepSet(function() { return value.all(); });
    } else { return new DepSet(function() { return value; }); }
  };

  rx.cast = function(value, type) {
    if (type == null) { type = 'cell'; }
    if ([ObsCell, ObsArray, ObsMap, ObsSet].includes(type)) {
      let realType = null;
      switch (type) {
        case ObsCell: realType = 'cell'; break;
        case ObsArray: realType = 'array'; break;
        case ObsMap: realType = 'map'; break;
        case ObsSet: realType = 'set'; break;
      }
      type = realType;
    }
    if (_.isString(type)) {
      if (type in rx.types) { return rx[type].from(value);
      } else { return value; }
    } else {
      let opts  = value;
      let types = type;
      let x = _.mapObject(opts, function(value, key) { if (types[key]) { return rx.cast(value, types[key]); } else { return value; } });
      return x;
    }
  };

  //
  // Reactive utilities
  //

  rx.flatten = xs => new DepArray(function() {
    return _.chain(flattenHelper([xs]))
     .flatten()
     .filter(x => x != null)
     .value();
  }) ;

  let prepContents = function(contents) {
    if (contents instanceof ObsCell || contents instanceof ObsArray || _.isArray(contents)) {
      contents = rx.flatten(contents);
    }
    return contents;
  };


  var flattenHelper = function(x) {
    if (x instanceof ObsArray) { return flattenHelper(x.all());
    } else if (x instanceof ObsSet) { return flattenHelper(Array.from(x.values()));
    } else if (x instanceof ObsCell) { return flattenHelper(x.get());
    } else if (x instanceof Set) { return flattenHelper(Array.from(x));
    } else if (_.isArray(x)) { return x.map(x_k => flattenHelper(x_k));
    } else { return x; }
  };

  let flatten = function(xss) {
    let xs = _.flatten(xss);
    return rx.cellToArray(bind(() => _.flatten(xss)));
  };

  rx.cellToArray = (cell, diff) => new DepArray((function() { return cell.get(); }), diff);
  rx.cellToMap = cell => new rx.DepMap(function() { return cell.get(); });
  rx.cellToSet = c => new rx.DepSet(function() { return c.get(); });

  // O(n) using hash key
  rx.basicDiff = function(key) { if (key == null) { key = rx.smartUidify; } return function(oldXs, newXs) {
    let x;
    let oldKeys = mkMap((() => {
      let result = [];
      for (let i = 0; i < oldXs.length; i++) {
        x = oldXs[i];
        result.push([key(x), i]);
      }
      return result;
    })());
    return ((() => {
      let result1 = [];
      for (x of Array.from(newXs)) {         var left;
      result1.push(((left = oldKeys[key(x)]) != null ? left : -1));
      }
      return result1;
    })());
  }; };

  // This is invasive; WeakMaps can't come soon enough....
  rx.uidify = x =>
    x.__rxUid != null ? x.__rxUid : (
      Object.defineProperty(x, '__rxUid', {
        enumerable: false,
        value: mkuid()
      })
    ).__rxUid
  ;

  // Need a "hash" that distinguishes different types and distinguishes object
  // UIDs from ints.
  rx.smartUidify = function(x) {
    if (_.isObject(x)) {
      return rx.uidify(x);
    } else {
      return JSON.stringify(x);
    }
  };

  // Note: this gives up and returns null if there are reorderings or
  // duplications; only handles (multiple) simple insertions and removals
  // (batching them together into splices).
  var permToSplices = function(oldLength, newXs, perm) {
    let i;
    if (!newXs.length) {
      return null; // just do a full splice if we're emptying the array
    }
    let refs = ((() => {
      let result = [];
      for (i of Array.from(perm)) {         if (i >= 0) {
          result.push(i);
        }
      }
      return result;
    })());
    if (_.some((() => {
      let asc, end;
      let result1 = [];
      for (i = 0, end = refs.length - 1, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
        result1.push((refs[i + 1] - refs[i]) <= 0);
      }
      return result1;
    })())) { return null; }
    let splices = [];
    let last = -1;
    i = 0;
    while (i < perm.length) {
      // skip over any good consecutive runs
      while ((i < perm.length) && (perm[i] === (last + 1))) {
        last += 1;
        i += 1;
      }
      // lump any additions into this splice
      let splice = {index: i, count: 0, additions: []};
      while ((i < perm.length) && (perm[i] === -1)) {
        splice.additions.push(newXs[i]);
        i += 1;
      }
      // Find the step difference to find how many from old were removed/skipped;
      // if no step (perm[i] == last + 1) then count should be 0.  If we see no
      // more references to old elements, then we need oldLength to determine how
      // many remaining old elements were logically removed.
      let cur = i === perm.length ? oldLength : perm[i];
      splice.count = cur - (last + 1);
      if ((splice.count > 0) || (splice.additions.length > 0)) {
        splices.push([splice.index, splice.count, splice.additions]);
      }
      last = cur;
      i += 1;
    }
    return splices;
  };

  rx.transaction = f => depMgr.transaction(f);
  return rx;
};
// end rxFactory definition

export default rxFactory(_);
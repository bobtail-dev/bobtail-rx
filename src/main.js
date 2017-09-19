import _ from "underscore";

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

let mkMap = function(xs) {
  let k, v;
  if (xs == null) { xs = []; }
  let map = (Object.create != null) ? Object.create(null) : {};
  if (_.isArray(xs)) {
    for ([k,v] of xs) { map[k] = v; }
  } else {
    for (k in xs) { v = xs[k]; map[k] = v; }
  }
  return map;
};

let sum = function(xs) {
  let n = 0;
  for (let x of xs) { n += x; }
  return n;
};

//
// Events and pub-sub dependency management
//

// Just a global mapping from subscription UIDs to source Evs; this essentially
// enables us to follow subscription UIDs up the dependency graph (from
// dependents)
export class DepMgr {
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
        let allDeps = allDownstream(...Array.from(immediateDeps || []));
        allDeps.forEach(cell => cell._shield = true);
        try {
          // we need to clear the buffer now, in case transaction is called as a result of one
          // the events that we're publishing, since that would cause transaction to execute again with
          // the full buffer, causing an infinite loop.
          let bufferedPubs = this.buffer;
          this.buffer = [];
          this.events.clear();

          bufferedPubs.map(([ev, data]) => ev.pub(data));
          allDeps.forEach(c => c.refresh());
        } finally {
          allDeps.forEach(cell => cell._shield = false);
        }
      }
    }
    return res;
  }
}

export let _depMgr = new DepMgr();
let depMgr = _depMgr;

export class Ev {
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
      depMgr.events.add(this);
    } else {
      for (let uid in this.subs) {
        let listener = this.subs[uid];
        listener(data);
      }
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
}

export let skipFirst = function(f) {
  let first = true;
  return function(...args) {
    if (first) {
      return first = false;
    } else {
      return f(...args || []);
    }
  };
};

//
// Reactivity
//
export let upstream = function(cell) {
  let events = Array.from(cell.upstreamEvents);
  let depCells = events.map(ev => ev.observable);
  return Array.from(new Set(depCells));
};

var allDownstreamHelper = function(...cells) {
  if (cells.length) {
    let downstream = Array.from(new Set(_.flatten(cells.map(cell => Array.from(cell.onSet.downstreamCells)))));
    return _.flatten([downstream, allDownstreamHelper(...Array.from(downstream || []))]);
  }
  return [];
};

export let allDownstream = (...cells) => Array.from(
  new Set([
    ...cells,
    ...allDownstreamHelper(...(cells || []))
  ].reverse())
).reverse();


class Recorder {
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
      return autoSub(event, function(...evData) {
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
    /*eslint-disable*/
    console.warn("Mutation to observable detected during a bind context");
    /*eslint-enable*/
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
}

export let types = {"cell": "cell", "array": "array", "map": "map", "set": "set"};

export let _recorder = new Recorder();
let recorder = _recorder;

export let hideMutationWarnings = f => recorder.hideMutationWarnings(f);

export let asyncBind = function(init, f) {
  let dep = new DepCell(f, init);
  dep.refresh();
  return dep;
};

export let promiseBind = (init, f) => asyncBind(
  init,
  function() { return this.record(f).done(res => this.done(res)); }
);

export let bind = f => asyncBind(null, function() { return this.done(this.record(f)); });

export let lagBind = function(lag, init, f) {
  let timeout = null;
  return asyncBind(init, function() {
    if (timeout != null) { clearTimeout(timeout); }
    return timeout = setTimeout(
      () => this.done(this.record(f)),
      lag
    );
  });
};

export let postLagBind = function(init, f) {
  let timeout = null;
  return asyncBind(init, function() {
    let {val, ms} = this.record(f);
    if (timeout != null) {
      clearTimeout(timeout);
    }
    return timeout = setTimeout(
      () => this.done(val),
      ms
    );
  });
};

export let snap = f => recorder.ignoring(f);

export let onDispose = cleanup => recorder.addCleanup(cleanup);

export let autoSub = function(ev, listener) {
  let subid = ev.sub(listener);
  onDispose(() => ev.unsub(subid));
  return subid;
};

export let subOnce = function(event, listener) {
  let uid = autoSub(event, skipFirst((...args) => {
    listener(...args);
    event.unsub(uid);
  }));
  return uid;
};

class ObsBase {
  constructor() {
    this.events = [];
  }
  flatten() { return flatten(this); }
  subAll(condFn) { if (condFn == null) { condFn = () => true; } return this.events.forEach(ev => recorder.sub(ev, condFn)); }
  raw() { return this._base; }
  _mkEv(f) {
    let ev = new Ev(f, this);
    this.events.push(ev);
    return ev;
  }
  toCell() {return cell.from(this);}
  toArray() {return array.from(this);}
  toMap() {return map.from(this);}
  toSet() {return set.from(this);}

}

ObsBase.prototype.to = {
  cell: () => cell.from(this),
  array: () => array.from(this),
  map: () => map.from(this),
  set: () => set.from(this)
};

export {ObsBase};

export class ObsCell extends ObsBase {
  constructor(_base) {
    super();
    this._base = _base != null ? _base : null;
    this.onSet = this._mkEv(() => [null, this._base]); // [old, new]
    this._shield = false;
    let downstreamCells = () => this.onSet.downstreamCells;
    this.refreshAll = () => {
      if (this.onSet.downstreamCells.size && !this._shield) {
        this._shield = true;
        let cells = allDownstream(...Array.from(downstreamCells()) || []);
        cells.forEach(c => c._shield = true);
        try { return cells.forEach(c => c.refresh()); }
        finally {
          cells.forEach(c => c._shield = false);
          this._shield = false;
        }
      }
    };
    this.refreshSub = autoSub(this.onSet, this.refreshAll);
  }

  all() {
    this.subAll(() => !this._shield);
    return this._base;
  }
  get() { return this.all(); }
  readonly() { return new DepCell(() => this.all()); }
}

export class SrcCell extends ObsCell {
  set(x) {
    return recorder.mutating(() => {
      if (this._base !== x) {
        let old = this._base;
        this._base = x;
        this.onSet.pub([old, x]);
        return old;
      }
    });
  }
}

export class DepCell extends ObsCell {
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
            if (recorded) { throw new Error("this refresh has already recorded its dependencies"); }
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
    for (let cleanup of this.cleanups) {
      cleanup();
    }
    for (let nestedBind of this.nestedBinds) {
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
}

export class ObsArray extends ObsBase {
  constructor(_cells, diff) {
    if (_cells == null) { _cells = []; }
    if (diff == null) { diff = basicDiff(); }
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
    recorder.sub(this.onChange, function([index, removed, added]) {
      // if elements were inserted or removed prior to this element
      if ((index <= i) && (removed.length !== added.length))
        return true;
      // if this element is one of the elements changed
      if ((removed.length === added.length) && (i <= (index + removed.length)))
        return true;
      return false;
    });
    return (this._cells[i] != null ? this._cells[i].get() : undefined);
  }
  length() {
    recorder.sub(this.onChangeCells, ([index, removed, added]) => removed.length !== added.length);
    return this._cells.length;
  }
  size() { return this.length(); }
  map(f) {
    let ys = new MappedDepArray();
    autoSub(this.onChangeCells, ([index, removed, added]) => {
      for (let cell of ys._cells.slice(index, index + removed.length)) {
        cell.disconnect();
      }
      let newCells = added.map(item => bind(() => f(item.get())));
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
  join(separator) {  if (separator == null) { separator = ","; } return this.all().join(separator); }
  first() { return this.at(0); }
  last() { return this.at(this.length() - 1); }
  indexed() {
    if ((this._indexed == null)) {
      this._indexed = new IndexedDepArray();
      autoSub(this.onChangeCells, ([index, removed, added]) =>
        this._indexed.realSpliceCells(index, removed.length, added));
    }
    return this._indexed;
  }
  concat(...those) { return concat(this, ...those); }
  realSpliceCells(index, count, additions) {
    let removed = this._cells.splice.apply(this._cells, [index, count].concat(additions));
    let removedElems = snap(() => removed.map((x2) => x2.get()));
    let addedElems = snap(() => additions.map((x3) => x3.get()));
    return transaction(() => {
      this.onChangeCells.pub([index, removed, additions]);
      return this.onChange.pub([index, removedElems, addedElems]);
    });
  }
  realSplice(index, count, additions) {
    return this.realSpliceCells(index, count, additions.map(cell));
  }
  _update(val, diff) {
    let left, splices;
    let old = snap(() => (this._cells.map((x) => x.get())));
    let fullSplice = [0, old.length, val];
    diff = diff || this.diff;
    left = permToSplices(old.length, val, diff(old, val));
    splices = left != null ? left : [fullSplice];
    return splices.map(([index, count, additions]) => this.realSplice(index, count, additions));
  }
}

export class SrcArray extends ObsArray {
  spliceArray(index, count, additions) { return recorder.mutating(() => {
    return this.realSplice(index, count, additions);
  }); }
  splice(index, count, ...additions) { return this.spliceArray(index, count, additions); }
  insert(x, index) { return this.splice(index, 0, x); }
  remove(x) {
    let i = _(this.raw()).indexOf(x);
    if (i >= 0) { return this.removeAt(i); }
  }
  removeAll(x) {
    return transaction(() => {
      let i = _(snap(() => this.all())).indexOf(x);
      while (i >= 0) {
        this.removeAt(i);
        i = snap(() => _(this.all().slice(i))).indexOf(x);
      }
    });
  }
  removeAt(index) {
    let val = snap(() => this.at(index));
    this.splice(index, 1);
    return val;
  }
  push(x) { return this.splice(snap(() => this.length()), 0, x); }
  pop() { return this.removeAt(snap(() => this.length() - 1)); }
  put(i, x) { return this.splice(i, 1, x); }
  replace(xs) { return this.spliceArray(0, snap(() => this.length()), xs); }
  unshift(x) { return this.insert(x, 0); }
  shift() { return this.removeAt(0); }
  // TODO: How is this different from replace? we should use one or the other.
  update(xs) { return recorder.mutating(() => this._update(xs)); }
  move(src, dest) { return transaction(() => {
    // moves element at src to index before dest
    if (src === dest) { return; }

    let len = snap(() => this.length());

    if ((src < 0) || (src > (len - 1))) {
      throw `Source ${src} is outside of bounds of array of length ${len}`;
    }
    if ((dest < 0) || (dest > len)) {
      throw `Destination ${dest} is outside of bounds of array of length ${len}`;
    }

    let val = snap(() => this.all()[src]);

    if (src > dest) {
      this.removeAt(src);
      this.insert(val, dest);
    } else {
      this.insert(val, dest);
      this.removeAt(src);
    }

  }); }  // removeAt returns, but insert doesn't, so let's avoid inconsistency
  swap(i1, i2) { return transaction(() => {
    let len = snap(() => this.length());
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
    this.update(snap(() => this.all().reverse()));
    return snap(() => this.all());
  }
}

export class MappedDepArray extends ObsArray {
  constructor() { super(); }
}

export class IndexedDepArray extends ObsArray {
  constructor(xs, diff) {
    if (xs == null) { xs = []; }
    super(xs, diff);
    this.is = (this._cells.map((x, i) => cell(i)));
    this.onChangeCells = this._mkEv(() => [0, [], _.zip(this._cells, this.is)]); // [index, removed, added]
    this.onChange = this._mkEv(() => [0, [], _.zip(this.is, snap(() => this.all()))]);
  }
  // TODO duplicate code with ObsArray
  map(f) {
    let ys = new MappedDepArray();
    autoSub(this.onChangeCells, ([index, removed, added]) => {
      for (let cell of ys._cells.slice(index, index + removed.length)) {
        cell.disconnect();
      }
      let newCells = added.map(([item, icell]) => bind(() => f(item.get(), icell)));
      return ys.realSpliceCells(index, removed.length, newCells);
    });
    return ys;
  }
  realSpliceCells(index, count, additions) {
    let i;
    let removed = this._cells.splice.apply(this._cells, [index, count].concat(additions));
    let removedElems = snap(() => removed.map((x2) => x2.get()));

    let iterable = this.is.slice(index + count);
    for (let offset = 0; offset < iterable.length; offset++) {
      i = iterable[offset];
      i.set(index + additions.length + offset);
    }
    let newIs = [];
    let end = additions.length;
    let asc = 0 <= end;
    for (i = 0; asc ? i < end : i > end; asc ? i++ : i--) {
      newIs.push(cell(index + i));
    }
    this.is.splice(index, count, ...newIs);

    let addedElems = snap(() => additions.map((x3) => x3.get()));
    return transaction(() => {
      this.onChangeCells.pub([index, removed, _.zip(additions, newIs)]);
      return this.onChange.pub([index, removedElems, _.zip(addedElems, newIs)]);
    });
  }
}

export class DepArray extends ObsArray {
  constructor(f, diff) {
    super([], diff);
    this.f = f;
    autoSub((bind(() => Array.from(this.f()))).onSet, ([old, val]) => this._update(val));
  }
}

export class IndexedArray extends DepArray {
  constructor(_cells) {
    super();
    this._cells = _cells;
  }
  map(f) {
    let ys = new MappedDepArray();
    autoSub(this._cells.onChange, ([index, removed, added]) =>
      ys.realSplice(index, removed.length, added.map(f))
    );
    return ys;
  }
}

export let concat = function(...xss) {
  let ys = new MappedDepArray();
  let casted = xss.map(xs => cast(xs, "array"));
  let repLens = xss.map(() => 0);
  casted.forEach((xs, i) =>
    autoSub(xs.onChange, function([index, removed, added]) {
      let xsOffset = sum(repLens.slice(0, i));
      repLens[i] += added.length - removed.length;
      return ys.realSplice(xsOffset + index, removed.length, added);
    })
  );
  return ys;
};

let objToJSMap = function(obj) {
  if (obj instanceof Map) { return obj;
  } else if (_.isArray(obj) || obj instanceof Set) { return new Map(obj);
  } else { return new Map(_.pairs(obj)); }
};

export class ObsMap extends ObsBase {
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
    let removals = _
      .chain(Array.from(this._base.keys()))
      .difference(Array.from(otherMap.keys()))
      .map(k => [k, mapPop(this._base, k)])
      .value();

    let additions = _
      .chain(Array.from(otherMap.keys()))
      .difference(Array.from(this._base.keys()))
      .map(k => {
        val = otherMap.get(k);
        this._base.set(k, val);
        return [k, val];
      })
      .value();

    let changes = _
      .chain(Array.from(otherMap))
      .filter(([k, val]) => this._base.has(k) && this._base.get(k) !== val)
      .map(([k, val]) => {
        let old = this._base.get(k);
        this._base.set(k, val);
        return [k, [old, val]];
      })
      .value();

    transaction(() => {
      if (removals.length) { this.onRemove.pub(new Map(removals)); }
      if (additions.length) { this.onAdd.pub(new Map(additions)); }
      if (changes.length) { return this.onChange.pub(new Map(changes)); }
    });

    return ret;
  }
}

export class SrcMap extends ObsMap {
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
}

export class DepMap extends ObsMap {
  constructor(f) {
    super();
    this.f = f;
    let c = bind(this.f);
    autoSub(c.onSet, ([old, val]) => this._update(val));
  }
}

//
// Converting POJO attributes to reactive ones.
//

let objToJSSet = function(obj) { if (obj instanceof Set) { return obj; } else { return new Set(obj); } };
let _castOther = function(other) {
  if (other instanceof ObsBase) { other = other.all(); }
  return new Set(other);
};

export class ObsSet extends ObsBase {
  constructor(_base) {
    if (_base == null) { _base = new Set(); }
    super();
    this._base = objToJSSet(_base);
    this.onChange = this._mkEv(() => [this._base, new Set()]);  // additions, removals
  }
  has(key) {
    this.subAll(([additions, removals]) => additions.has(key) || removals.has(key));
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
    this.subAll(([additions, removals]) => additions.size !== removals.size);
    return this._base.size;
  }
  union(other) { return new DepSet(() => union(this.all(), _castOther(other))); }
  intersection(other) { return new DepSet(() => intersection(this.all(), _castOther(other))); }
  difference(other) { return new DepSet(() => difference(this.all(), _castOther(other))); }
  symmetricDifference(other) {
    return new DepSet(() => {
      return difference(this.union(other).all(), this.intersection(other).all());
    });
  }
  _update(y) { return transaction(() => {
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
}

export class SrcSet extends ObsSet {
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
}

export class DepSet extends ObsSet {
  constructor(f) {
    super();
    this.f = f;
    let c = bind(this.f);
    autoSub(c.onSet, ([old, val]) => this._update(val));
  }
}

export let liftSpec = obj => {
  let result = [];
  let val, type;
  for (let name of Object.getOwnPropertyNames(obj)) {
    val = obj[name];
    if (val != null && [ObsMap, ObsCell, ObsArray, ObsSet].some(cls => val instanceof cls)) {
      continue;
    } else if (_.isFunction(val)) {
      type = null;
    } else if (_.isArray(val)) {
      type = "array";
    } else if (val instanceof Set) {
      type = "set";
    } else if (val instanceof Map) {
      type = "map";
    } else {
      type = "cell";
    }
    result.push([name, {type, val}]);
  }
  return _.object(result);
};

export let lift = function(x, fieldspec) {
  if (fieldspec == null) {
    fieldspec = liftSpec(x);
  }

  return _.mapObject(fieldspec, function({type}, name) {
    if (!(x[name] instanceof ObsBase) && type in types) { return rxTypes[type](x[name]); }
    return x[name];
  });
};

export let unlift = x => _.mapObject(x, function(v) {
  if (v instanceof ObsBase) { return v.all(); }
  else { return v; }
});

//
// Implicitly reactive objects
//
export let reactify = function(obj, fieldspec) {
  let spec;
  if (_.isArray(obj)) {
    let arr = array(_.clone(obj));
    Object.defineProperties(obj, _.object(
      Object.getOwnPropertyNames(SrcArray.prototype)
        .concat(Object.getOwnPropertyNames(ObsArray.prototype))
        .concat(Object.getOwnPropertyNames(ObsBase.prototype))
        .filter((methName) => methName !== "length").map((methName) => {
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
          case "cell": {
            let obs = cell(spec.val != null ? spec.val : null);
            desc = {
              configurable: true,
              enumerable: true,
              get() { return obs.get(); },
              set(x) { return obs.set(x); }
            };
            break;
          }
          case "array": {
            let view = reactify(spec.val != null ? spec.val : []);
            desc = {
              configurable: true,
              enumerable: true,
              get() {
                view.all();
                return view;
              },
              set(x) {
                view.splice(0, view.length, ...x);
                return view;
              }
            };
            break;
          }
          default: throw new Error(`Unknown observable type: ${spec.type}`);
          }
          return [name, desc];
        })(name, spec));
      }

      return result;
    })())
    );
  }
};
export let autoReactify = obj => {
  let result = [];

  for (let name of Object.getOwnPropertyNames(obj)) {
    let val = obj[name];
    if (val instanceof ObsBase) {
      continue;
    }
    let type =
      _.isFunction(val) ? null
        : _.isArray(val) ? "array"
          : "cell";
    result.push([name, {type, val}]);
  }

  reactify(obj, _.object(result));
};

export let cell = value => new SrcCell(value);
cell.from = function(value) {
  if (value instanceof ObsCell) { return value;
  } else if (value instanceof ObsBase) { return bind(() => value.all());
  } else { return bind(() => value); }
};

export let array = (xs, diff) => new SrcArray((xs != null ? xs : []).map(cell), diff);
array.from = function(value, diff) {
  let f;
  if (value instanceof ObsArray) { return value;
  } else if (_.isArray(value)) { f = () => value;
  } else if (value instanceof ObsBase) { f = () => value.all();
  } else { throw new Error(`Cannot cast ${value.constructor.name} to array!`); }

  return new DepArray(f, diff);
};

export let map = value => new SrcMap(value);
map.from = function(value) {
  if (value instanceof ObsMap) { return value;
  } else if (value instanceof ObsBase) { return new DepMap(function() { return value.all(); });
  } else { return new DepMap(function() { return value; }); }
};


export let set = value => new SrcSet(value);
set.from = function(value) {
  if (value instanceof ObsSet) { return value;
  } else if (value instanceof ObsBase) { return new DepSet(function() { return value.all(); });
  } else { return new DepSet(function() { return value; }); }
};

let rxTypes = {cell, array, map, set};

export let cast = function(value, type) {
  if (type == null) { type = "cell"; }
  if ([ObsCell, ObsArray, ObsMap, ObsSet].includes(type)) {
    let realType = null;
    switch (type) {
    case ObsCell: realType = "cell"; break;
    case ObsArray: realType = "array"; break;
    case ObsMap: realType = "map"; break;
    case ObsSet: realType = "set"; break;
    }
    type = realType;
  }
  if (_.isString(type)) {
    if (type in types) { return rxTypes[type].from(value);
    } else { return value; }
  } else {
    let opts  = value;
    let types = type;
    return _.mapObject(opts, function(value, key) {
      if (types[key]) { return cast(value, types[key]); }
      else { return value; }
    });
  }
};

//
// Reactive utilities
//

export let flatten = xs => new DepArray(() => _
  .chain(flattenHelper([xs]))
  .flatten()
  .filter(x => x != null)
  .value()
);

let flattenHelper = function(x) {
  if (x instanceof ObsArray) { return flattenHelper(x.all());
  } else if (x instanceof ObsSet) { return flattenHelper(Array.from(x.values()));
  } else if (x instanceof ObsCell) { return flattenHelper(x.get());
  } else if (x instanceof Set) { return flattenHelper(Array.from(x));
  } else if (_.isArray(x)) { return x.map(x_k => flattenHelper(x_k));
  } else { return x; }
};

export let cellToArray = (cell, diff) => new DepArray((function() { return cell.get(); }), diff);
export let cellToMap = cell => new DepMap(function() { return cell.get(); });
export let cellToSet = c => new DepSet(function() { return c.get(); });

// O(n) using hash key
export let basicDiff = function(key) {
  if (key == null) {
    key = smartUidify;
  }
  return function(oldXs, newXs) {
    let oldKeys = mkMap(oldXs.map((x, i) => [key(x), i]));
    let left;
    return newXs.map(x => {
      left = oldKeys[key(x)];
      return left != null ? left : -1;
    });
  };
};

// This is invasive; WeakMaps can't come soon enough....
export let uidify = x =>
  x.__rxUid != null ? x.__rxUid : (
    Object.defineProperty(x, "__rxUid", {
      enumerable: false,
      value: mkuid()
    })
  ).__rxUid
;

// Need a "hash" that distinguishes different types and distinguishes object
// UIDs from ints.
export let smartUidify = function(x) {
  if (_.isObject(x)) {
    return uidify(x);
  } else {
    return JSON.stringify(x);
  }
};

// Note: this gives up and returns null if there are reorderings or
// duplications; only handles (multiple) simple insertions and removals
// (batching them together into splices).
let permToSplices = function(oldLength, newXs, perm) {
  let i;
  if (!newXs.length) {
    return null; // just do a full splice if we're emptying the array
  }
  let refs = perm.filter(i => i >= 0);
  let end = refs.length -1;
  let asc = 0 <= end;
  let giveUp = [];
  for (i = 0; asc ? i < end : i > end; asc ? i++ : i--) {
    giveUp.push((refs[i + 1] - refs[i]) <= 0);
  }
  if (giveUp.some(_.identity)) { return null; }

  let splices = [];
  let last = -1;
  i = 0;
  while (i < perm.length) {
    // skip over any good consecutive runs
    while (i < perm.length && perm[i] === last + 1) {
      last += 1;
      i += 1;
    }
    // lump any additions into this splice
    let splice = {index: i, count: 0, additions: []};
    while (i < perm.length && perm[i] === -1) {
      splice.additions.push(newXs[i]);
      i += 1;
    }
    // Find the step difference to find how many from old were removed/skipped;
    // if no step (perm[i] == last + 1) then count should be 0.  If we see no
    // more references to old elements, then we need oldLength to determine how
    // many remaining old elements were logically removed.
    let cur = i === perm.length ? oldLength : perm[i];
    splice.count = cur - (last + 1);
    if (splice.count > 0 || splice.additions.length > 0) {
      splices.push([splice.index, splice.count, splice.additions]);
    }
    last = cur;
    i += 1;
  }
  return splices;
};

export let transaction = f => depMgr.transaction(f);

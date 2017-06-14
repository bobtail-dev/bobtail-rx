(function() {
  var rxFactory,
    slice = [].slice,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  rxFactory = function(_) {
    var DepArray, DepCell, DepMap, DepMgr, DepSet, Ev, IndexedArray, IndexedDepArray, IndexedMappedDepArray, MappedDepArray, ObsArray, ObsBase, ObsCell, ObsMap, ObsSet, Recorder, SrcArray, SrcCell, SrcMap, SrcSet, _castOther, allDownstreamHelper, asyncBind, bind, depMgr, difference, firstWhere, flatten, flattenHelper, intersection, lagBind, mapPop, mkMap, mkuid, nextUid, nthWhere, objToJSMap, objToJSSet, permToSplices, popKey, postLagBind, promiseBind, recorder, rx, sum, union;
    rx = {};
    nextUid = 0;
    mkuid = function() {
      return nextUid += 1;
    };
    union = function(first, second) {
      return new Set(slice.call(first).concat(slice.call(second)));
    };
    intersection = function(first, second) {
      return new Set(Array.from(first).filter(function(item) {
        return second.has(item);
      }));
    };
    difference = function(first, second) {
      return new Set(Array.from(first).filter(function(item) {
        return !second.has(item);
      }));
    };
    popKey = function(x, k) {
      var v;
      if (!(k in x)) {
        throw new Error('object has no key ' + k);
      }
      v = x[k];
      delete x[k];
      return v;
    };
    mapPop = function(x, k) {
      var v;
      v = x.get(k);
      x["delete"](k);
      return v;
    };
    nthWhere = function(xs, n, f) {
      var i, j, len1, x;
      for (i = j = 0, len1 = xs.length; j < len1; i = ++j) {
        x = xs[i];
        if (f(x) && (n -= 1) < 0) {
          return [x, i];
        }
      }
      return [null, -1];
    };
    firstWhere = function(xs, f) {
      return nthWhere(xs, 0, f);
    };
    mkMap = function(xs) {
      var j, k, len1, map, ref, v;
      if (xs == null) {
        xs = [];
      }
      map = Object.create != null ? Object.create(null) : {};
      if (_.isArray(xs)) {
        for (j = 0, len1 = xs.length; j < len1; j++) {
          ref = xs[j], k = ref[0], v = ref[1];
          map[k] = v;
        }
      } else {
        for (k in xs) {
          v = xs[k];
          map[k] = v;
        }
      }
      return map;
    };
    sum = function(xs) {
      var j, len1, n, x;
      n = 0;
      for (j = 0, len1 = xs.length; j < len1; j++) {
        x = xs[j];
        n += x;
      }
      return n;
    };
    DepMgr = rx.DepMgr = (function() {
      function DepMgr() {
        this.buffering = 0;
        this.buffer = [];
        this.events = new Set();
      }

      DepMgr.prototype.transaction = function(f) {
        var allDeps, bufferedPubs, immediateDeps, res;
        this.buffering += 1;
        try {
          res = f();
        } finally {
          this.buffering -= 1;
          if (this.buffering === 0) {
            immediateDeps = new Set(_.flatten(Array.from(this.events).map(function(arg) {
              var downstreamCells;
              downstreamCells = arg.downstreamCells;
              return Array.from(downstreamCells);
            })));
            allDeps = rx.allDownstream.apply(rx, immediateDeps);
            allDeps.forEach(function(cell) {
              return cell._shield = true;
            });
            try {
              bufferedPubs = this.buffer;
              this.buffer = [];
              this.events.clear();
              bufferedPubs.map(function(arg) {
                var data, ev;
                ev = arg[0], data = arg[1];
                return ev.pub(data);
              });
              allDeps.forEach(function(c) {
                return c.refresh();
              });
            } finally {
              allDeps.forEach(function(cell) {
                return cell._shield = false;
              });
            }
          }
        }
        return res;
      };

      return DepMgr;

    })();
    rx._depMgr = depMgr = new DepMgr();
    Ev = rx.Ev = (function() {
      function Ev(init1, observable) {
        this.init = init1;
        this.observable = observable;
        this.subs = mkMap();
        this.downstreamCells = new Set();
      }

      Ev.prototype.sub = function(listener) {
        var uid;
        uid = mkuid();
        if (this.init != null) {
          listener(this.init());
        }
        this.subs[uid] = listener;
        return uid;
      };

      Ev.prototype.pub = function(data) {
        var listener, ref, results, uid;
        if (depMgr.buffering) {
          depMgr.buffer.push([this, data]);
          return depMgr.events.add(this);
        } else {
          ref = this.subs;
          results = [];
          for (uid in ref) {
            listener = ref[uid];
            results.push(listener(data));
          }
          return results;
        }
      };

      Ev.prototype.unsub = function(uid) {
        return popKey(this.subs, uid);
      };

      Ev.prototype.scoped = function(listener, context) {
        var uid;
        uid = this.sub(listener);
        try {
          return context();
        } finally {
          this.unsub(uid);
        }
      };

      return Ev;

    })();
    rx.skipFirst = function(f) {
      var first;
      first = true;
      return function() {
        var args;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        if (first) {
          return first = false;
        } else {
          return f.apply(null, args);
        }
      };
    };
    rx.upstream = function(cell) {
      var depCells, events;
      events = Array.from(cell.upstreamEvents);
      depCells = events.map(function(ev) {
        return ev.observable;
      });
      return Array.from(new Set(depCells));
    };
    allDownstreamHelper = rx._allDownstreamHelper = function() {
      var cells, downstream, r;
      cells = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      if (cells.length) {
        downstream = Array.from(new Set(_.flatten(cells.map(function(cell) {
          return Array.from(cell.onSet.downstreamCells);
        }))));
        r = _.flatten([downstream, allDownstreamHelper.apply(null, downstream)]);
        return r;
      }
      return [];
    };
    rx.allDownstream = function() {
      var cells;
      cells = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      return Array.from(new Set(slice.call(cells).concat(slice.call(allDownstreamHelper.apply(null, cells))).reverse())).reverse();
    };
    Recorder = rx.Recorder = (function() {
      function Recorder() {
        this.stack = [];
        this.isMutating = false;
        this.isIgnoring = false;
        this.hidingMutationWarnings = false;
        this.onMutationWarning = new Ev();
      }

      Recorder.prototype.record = function(dep, f) {
        var wasIgnoring, wasMutating;
        if (this.stack.length > 0 && !this.isMutating) {
          _(this.stack).last().addNestedBind(dep);
        }
        this.stack.push(dep);
        wasMutating = this.isMutating;
        this.isMutating = false;
        wasIgnoring = this.isIgnoring;
        this.isIgnoring = false;
        try {
          return f();
        } finally {
          this.isIgnoring = wasIgnoring;
          this.isMutating = wasMutating;
          this.stack.pop();
        }
      };

      Recorder.prototype.sub = function(event, condFn) {
        var topCell;
        if (condFn == null) {
          condFn = function() {
            return true;
          };
        }
        if (this.stack.length > 0 && !this.isIgnoring) {
          topCell = _(this.stack).last();
          topCell.upstreamEvents.add(event);
          event.downstreamCells.add(topCell);
          return rx.autoSub(event, function() {
            var evData;
            evData = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            if (condFn.apply(null, evData)) {
              return topCell.refresh();
            }
          });
        }
      };

      Recorder.prototype.addCleanup = function(cleanup) {
        if (this.stack.length > 0) {
          return _(this.stack).last().addCleanup(cleanup);
        }
      };

      Recorder.prototype.hideMutationWarnings = function(f) {
        var wasHiding;
        wasHiding = this.hidingMutationWarnings;
        this.hidingMutationWarnings = true;
        try {
          return f();
        } finally {
          this.hidingMutationWarnings = wasHiding;
        }
      };

      Recorder.prototype.fireMutationWarning = function() {
        console.warn('Mutation to observable detected during a bind context');
        return this.onMutationWarning.pub(null);
      };

      Recorder.prototype.mutating = function(f) {
        var wasMutating;
        if (this.stack.length > 0 && !this.hidingMutationWarnings) {
          this.fireMutationWarning();
        }
        wasMutating = this.isMutating;
        this.isMutating = true;
        try {
          return f();
        } finally {
          this.isMutating = wasMutating;
        }
      };

      Recorder.prototype.ignoring = function(f) {
        var wasIgnoring;
        wasIgnoring = this.isIgnoring;
        this.isIgnoring = true;
        try {
          return f();
        } finally {
          this.isIgnoring = wasIgnoring;
        }
      };

      return Recorder;

    })();
    rx.types = {
      'cell': 'cell',
      'array': 'array',
      'map': 'map',
      'set': 'set'
    };
    rx._recorder = recorder = new Recorder();
    rx.hideMutationWarnings = function(f) {
      return recorder.hideMutationWarnings(f);
    };
    rx.asyncBind = asyncBind = function(init, f) {
      var dep;
      dep = new DepCell(f, init);
      dep.refresh();
      return dep;
    };
    rx.promiseBind = promiseBind = function(init, f) {
      return asyncBind(init, function() {
        return this.record(f).done((function(_this) {
          return function(res) {
            return _this.done(res);
          };
        })(this));
      });
    };
    rx.bind = bind = function(f) {
      return asyncBind(null, function() {
        return this.done(this.record(f));
      });
    };
    rx.lagBind = lagBind = function(lag, init, f) {
      var timeout;
      timeout = null;
      return asyncBind(init, function() {
        if (timeout != null) {
          clearTimeout(timeout);
        }
        return timeout = setTimeout((function(_this) {
          return function() {
            return _this.done(_this.record(f));
          };
        })(this), lag);
      });
    };
    rx.postLagBind = postLagBind = function(init, f) {
      var timeout;
      timeout = null;
      return asyncBind(init, function() {
        var ms, ref, val;
        ref = this.record(f), val = ref.val, ms = ref.ms;
        if (timeout != null) {
          clearTimeout(timeout);
        }
        return timeout = setTimeout(((function(_this) {
          return function() {
            return _this.done(val);
          };
        })(this)), ms);
      });
    };
    rx.snap = function(f) {
      return recorder.ignoring(f);
    };
    rx.onDispose = function(cleanup) {
      return recorder.addCleanup(cleanup);
    };
    rx.autoSub = function(ev, listener) {
      var subid;
      subid = ev.sub(listener);
      rx.onDispose(function() {
        return ev.unsub(subid);
      });
      return subid;
    };
    rx.subOnce = function(event, listener) {
      var uid;
      uid = rx.autoSub(event, rx.skipFirst(function() {
        var args;
        args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        _.defer(function() {
          return listener.apply(null, args);
        });
        return event.unsub(uid);
      }));
      return uid;
    };
    ObsBase = rx.ObsBase = (function() {
      function ObsBase() {
        this.events = [];
      }

      ObsBase.prototype.to = {
        cell: function() {
          return rx.cell.from(ObsBase);
        },
        array: function() {
          return rx.array.from(ObsBase);
        },
        map: function() {
          return rx.map.from(ObsBase);
        },
        set: function() {
          return rx.set.from(ObsBase);
        }
      };

      ObsBase.prototype.flatten = function() {
        return rx.flatten(this);
      };

      ObsBase.prototype.subAll = function(condFn) {
        if (condFn == null) {
          condFn = function() {
            return true;
          };
        }
        return this.events.forEach(function(ev) {
          return recorder.sub(ev, condFn);
        });
      };

      ObsBase.prototype.raw = function() {
        return this._base;
      };

      ObsBase.prototype._mkEv = function(f) {
        var ev;
        ev = new Ev(f, this);
        this.events.push(ev);
        return ev;
      };

      return ObsBase;

    })();
    ObsCell = rx.ObsCell = (function(superClass) {
      extend(ObsCell, superClass);

      function ObsCell(_base) {
        var downstreamCells, ref;
        this._base = _base;
        ObsCell.__super__.constructor.call(this);
        this._base = (ref = this._base) != null ? ref : null;
        this.onSet = this._mkEv((function(_this) {
          return function() {
            return [null, _this._base];
          };
        })(this));
        this._shield = false;
        downstreamCells = (function(_this) {
          return function() {
            return _this.onSet.downstreamCells;
          };
        })(this);
        this.refreshAll = (function(_this) {
          return function() {
            var cells;
            if (_this.onSet.downstreamCells.size && !_this._shield) {
              _this._shield = true;
              cells = rx.allDownstream.apply(rx, Array.from(downstreamCells()));
              cells.forEach(function(c) {
                return c._shield = true;
              });
              try {
                return cells.forEach(function(c) {
                  return c.refresh();
                });
              } finally {
                cells.forEach(function(c) {
                  return c._shield = false;
                });
                _this._shield = false;
              }
            }
          };
        })(this);
        this.refreshSub = rx.autoSub(this.onSet, this.refreshAll);
      }

      ObsCell.prototype.all = function() {
        this.subAll((function(_this) {
          return function() {
            return !_this._shield;
          };
        })(this));
        return this._base;
      };

      ObsCell.prototype.get = function() {
        return this.all();
      };

      ObsCell.prototype.readonly = function() {
        return new DepCell((function(_this) {
          return function() {
            return _this.all();
          };
        })(this));
      };

      return ObsCell;

    })(ObsBase);
    SrcCell = rx.SrcCell = (function(superClass) {
      extend(SrcCell, superClass);

      function SrcCell() {
        return SrcCell.__super__.constructor.apply(this, arguments);
      }

      SrcCell.prototype.set = function(x) {
        return recorder.mutating((function(_this) {
          return function() {
            var old;
            if (_this._base !== x) {
              old = _this._base;
              _this._base = x;
              _this.onSet.pub([old, x]);
              return old;
            }
          };
        })(this));
      };

      return SrcCell;

    })(ObsCell);
    DepCell = rx.DepCell = (function(superClass) {
      extend(DepCell, superClass);

      function DepCell(body, init) {
        this.body = body;
        DepCell.__super__.constructor.call(this, init != null ? init : null);
        this.refreshing = false;
        this.nestedBinds = [];
        this.cleanups = [];
        this.upstreamEvents = new Set();
      }

      DepCell.prototype.refresh = function() {
        var env, isSynchronous, old, realDone, recorded, syncResult;
        if (!this.refreshing) {
          old = this._base;
          realDone = (function(_this) {
            return function(_base) {
              _this._base = _base;
              return _this.onSet.pub([old, _this._base]);
            };
          })(this);
          recorded = false;
          syncResult = null;
          isSynchronous = false;
          env = {
            record: (function(_this) {
              return function(f) {
                var res;
                if (!_this.refreshing) {
                  _this.disconnect();
                  if (recorded) {
                    throw new Error('this refresh has already recorded its dependencies');
                  }
                  _this.refreshing = true;
                  recorded = true;
                  try {
                    res = recorder.record(_this, function() {
                      return f.call(env);
                    });
                  } finally {
                    _this.refreshing = false;
                  }
                  if (isSynchronous) {
                    realDone(syncResult);
                  }
                  return res;
                }
              };
            })(this),
            done: (function(_this) {
              return function(x) {
                if (old !== x) {
                  if (_this.refreshing) {
                    isSynchronous = true;
                    return syncResult = x;
                  } else {
                    return realDone(x);
                  }
                }
              };
            })(this)
          };
          return this.body.call(env);
        }
      };

      DepCell.prototype.disconnect = function() {
        var cleanup, j, l, len1, len2, nestedBind, ref, ref1;
        ref = this.cleanups;
        for (j = 0, len1 = ref.length; j < len1; j++) {
          cleanup = ref[j];
          cleanup();
        }
        ref1 = this.nestedBinds;
        for (l = 0, len2 = ref1.length; l < len2; l++) {
          nestedBind = ref1[l];
          nestedBind.disconnect();
        }
        this.nestedBinds = [];
        this.cleanups = [];
        this.upstreamEvents.forEach((function(_this) {
          return function(ev) {
            return ev.downstreamCells["delete"](_this);
          };
        })(this));
        return this.upstreamEvents.clear();
      };

      DepCell.prototype.addNestedBind = function(nestedBind) {
        return this.nestedBinds.push(nestedBind);
      };

      DepCell.prototype.addCleanup = function(cleanup) {
        return this.cleanups.push(cleanup);
      };

      return DepCell;

    })(ObsCell);
    ObsArray = rx.ObsArray = (function(superClass) {
      extend(ObsArray, superClass);

      function ObsArray(_cells, diff1) {
        this._cells = _cells != null ? _cells : [];
        this.diff = diff1 != null ? diff1 : rx.basicDiff();
        ObsArray.__super__.constructor.call(this);
        this.onChange = this._mkEv((function(_this) {
          return function() {
            return [
              0, [], _this._cells.map(function(c) {
                return c.raw();
              })
            ];
          };
        })(this));
        this.onChangeCells = this._mkEv((function(_this) {
          return function() {
            return [0, [], _this._cells];
          };
        })(this));
        this._indexed = null;
      }

      ObsArray.prototype.all = function() {
        recorder.sub(this.onChange);
        return this._cells.map(function(c) {
          return c.get();
        });
      };

      ObsArray.prototype.raw = function() {
        return this._cells.map(function(c) {
          return c.raw();
        });
      };

      ObsArray.prototype.readonly = function() {
        return new DepArray((function(_this) {
          return function() {
            return _this.all();
          };
        })(this));
      };

      ObsArray.prototype.rawCells = function() {
        return this._cells;
      };

      ObsArray.prototype.at = function(i) {
        var ref;
        recorder.sub(this.onChange, function(arg) {
          var added, index, removed;
          index = arg[0], removed = arg[1], added = arg[2];
          if (index <= i && removed.length !== added.length) {
            return true;
          } else if (removed.length === added.length && i <= index + removed.length) {
            return true;
          } else {
            return false;
          }
        });
        return (ref = this._cells[i]) != null ? ref.get() : void 0;
      };

      ObsArray.prototype.length = function() {
        recorder.sub(this.onChangeCells, function(arg) {
          var added, index, removed;
          index = arg[0], removed = arg[1], added = arg[2];
          return removed.length !== added.length;
        });
        return this._cells.length;
      };

      ObsArray.prototype.size = function() {
        return this.length();
      };

      ObsArray.prototype.map = function(f) {
        var ys;
        ys = new MappedDepArray();
        rx.autoSub(this.onChangeCells, (function(_this) {
          return function(arg) {
            var added, cell, index, j, len1, newCells, ref, removed;
            index = arg[0], removed = arg[1], added = arg[2];
            ref = ys._cells.slice(index, index + removed.length);
            for (j = 0, len1 = ref.length; j < len1; j++) {
              cell = ref[j];
              cell.disconnect();
            }
            newCells = added.map(function(item) {
              return cell = bind(function() {
                return f(item.get());
              });
            });
            return ys.realSpliceCells(index, removed.length, newCells);
          };
        })(this));
        return ys;
      };

      ObsArray.prototype.transform = function(f, diff) {
        return new DepArray(((function(_this) {
          return function() {
            return f(_this.all());
          };
        })(this)), diff);
      };

      ObsArray.prototype.filter = function(f) {
        return this.transform(function(arr) {
          return arr.filter(f);
        });
      };

      ObsArray.prototype.slice = function(x, y) {
        return this.transform(function(arr) {
          return arr.slice(x, y);
        });
      };

      ObsArray.prototype.reduce = function(f, init) {
        return this.all().reduce(f, init != null ? init : this.at(0));
      };

      ObsArray.prototype.reduceRight = function(f, init) {
        return this.all().reduceRight(f, init != null ? init : this.at(0));
      };

      ObsArray.prototype.every = function(f) {
        return this.all().every(f);
      };

      ObsArray.prototype.some = function(f) {
        return this.all().some(f);
      };

      ObsArray.prototype.indexOf = function(val, from) {
        if (from == null) {
          from = 0;
        }
        return this.all().indexOf(val, from);
      };

      ObsArray.prototype.lastIndexOf = function(val, from) {
        if (from == null) {
          from = this.length() - 1;
        }
        return this.all().lastIndexOf(val, from);
      };

      ObsArray.prototype.join = function(separator) {
        if (separator == null) {
          separator = ',';
        }
        return this.all().join(separator);
      };

      ObsArray.prototype.first = function() {
        return this.at(0);
      };

      ObsArray.prototype.last = function() {
        return this.at(this.length() - 1);
      };

      ObsArray.prototype.indexed = function() {
        if (this._indexed == null) {
          this._indexed = new IndexedDepArray();
          rx.autoSub(this.onChangeCells, (function(_this) {
            return function(arg) {
              var added, index, removed;
              index = arg[0], removed = arg[1], added = arg[2];
              return _this._indexed.realSpliceCells(index, removed.length, added);
            };
          })(this));
        }
        return this._indexed;
      };

      ObsArray.prototype.concat = function() {
        var those;
        those = 1 <= arguments.length ? slice.call(arguments, 0) : [];
        return rx.concat.apply(rx, [this].concat(slice.call(those)));
      };

      ObsArray.prototype.realSpliceCells = function(index, count, additions) {
        var addedElems, removed, removedElems;
        removed = this._cells.splice.apply(this._cells, [index, count].concat(additions));
        removedElems = rx.snap(function() {
          var j, len1, results, x2;
          results = [];
          for (j = 0, len1 = removed.length; j < len1; j++) {
            x2 = removed[j];
            results.push(x2.get());
          }
          return results;
        });
        addedElems = rx.snap(function() {
          var j, len1, results, x3;
          results = [];
          for (j = 0, len1 = additions.length; j < len1; j++) {
            x3 = additions[j];
            results.push(x3.get());
          }
          return results;
        });
        return rx.transaction((function(_this) {
          return function() {
            _this.onChangeCells.pub([index, removed, additions]);
            return _this.onChange.pub([index, removedElems, addedElems]);
          };
        })(this));
      };

      ObsArray.prototype.realSplice = function(index, count, additions) {
        return this.realSpliceCells(index, count, additions.map(rx.cell));
      };

      ObsArray.prototype._update = function(val, diff) {
        var additions, count, fullSplice, index, j, len1, old, ref, results, splice, splices, x;
        if (diff == null) {
          diff = this.diff;
        }
        old = rx.snap((function(_this) {
          return function() {
            var j, len1, ref, results, x;
            ref = _this._cells;
            results = [];
            for (j = 0, len1 = ref.length; j < len1; j++) {
              x = ref[j];
              results.push(x.get());
            }
            return results;
          };
        })(this));
        fullSplice = [0, old.length, val];
        x = null;
        splices = diff != null ? (ref = permToSplices(old.length, val, diff(old, val))) != null ? ref : [fullSplice] : [fullSplice];
        results = [];
        for (j = 0, len1 = splices.length; j < len1; j++) {
          splice = splices[j];
          index = splice[0], count = splice[1], additions = splice[2];
          results.push(this.realSplice(index, count, additions));
        }
        return results;
      };

      return ObsArray;

    })(ObsBase);
    SrcArray = rx.SrcArray = (function(superClass) {
      extend(SrcArray, superClass);

      function SrcArray() {
        return SrcArray.__super__.constructor.apply(this, arguments);
      }

      SrcArray.prototype.spliceArray = function(index, count, additions) {
        return recorder.mutating((function(_this) {
          return function() {
            return _this.realSplice(index, count, additions);
          };
        })(this));
      };

      SrcArray.prototype.splice = function() {
        var additions, count, index;
        index = arguments[0], count = arguments[1], additions = 3 <= arguments.length ? slice.call(arguments, 2) : [];
        return this.spliceArray(index, count, additions);
      };

      SrcArray.prototype.insert = function(x, index) {
        return this.splice(index, 0, x);
      };

      SrcArray.prototype.remove = function(x) {
        var i;
        i = _(this.raw()).indexOf(x);
        if (i >= 0) {
          return this.removeAt(i);
        }
      };

      SrcArray.prototype.removeAll = function(x) {
        return rx.transaction((function(_this) {
          return function() {
            var i, results;
            i = _(rx.snap(function() {
              return _this.all();
            })).indexOf(x);
            results = [];
            while (i >= 0) {
              _this.removeAt(i);
              results.push(i = _(rx.snap(function() {
                return _this.all();
              })).indexOf(x));
            }
            return results;
          };
        })(this));
      };

      SrcArray.prototype.removeAt = function(index) {
        var val;
        val = rx.snap((function(_this) {
          return function() {
            return _this.at(index);
          };
        })(this));
        this.splice(index, 1);
        return val;
      };

      SrcArray.prototype.push = function(x) {
        return this.splice(rx.snap((function(_this) {
          return function() {
            return _this.length();
          };
        })(this)), 0, x);
      };

      SrcArray.prototype.pop = function() {
        return this.removeAt(rx.snap((function(_this) {
          return function() {
            return _this.length() - 1;
          };
        })(this)));
      };

      SrcArray.prototype.put = function(i, x) {
        return this.splice(i, 1, x);
      };

      SrcArray.prototype.replace = function(xs) {
        return this.spliceArray(0, rx.snap((function(_this) {
          return function() {
            return _this.length();
          };
        })(this)), xs);
      };

      SrcArray.prototype.unshift = function(x) {
        return this.insert(x, 0);
      };

      SrcArray.prototype.shift = function() {
        return this.removeAt(0);
      };

      SrcArray.prototype.update = function(xs) {
        return recorder.mutating((function(_this) {
          return function() {
            return _this._update(xs);
          };
        })(this));
      };

      SrcArray.prototype.move = function(src, dest) {
        return rx.transaction((function(_this) {
          return function() {
            var len, val;
            if (src === dest) {
              return;
            }
            len = rx.snap(function() {
              return _this.length();
            });
            if (src < 0 || src > len - 1) {
              throw "Source " + src + " is outside of bounds of array of length " + len;
            }
            if (dest < 0 || dest > len) {
              throw "Destination " + dest + " is outside of bounds of array of length " + len;
            }
            val = rx.snap(function() {
              return _this.all()[src];
            });
            if (src > dest) {
              _this.removeAt(src);
              _this.insert(val, dest);
            } else {
              _this.insert(val, dest);
              _this.removeAt(src);
            }
          };
        })(this));
      };

      SrcArray.prototype.swap = function(i1, i2) {
        return rx.transaction((function(_this) {
          return function() {
            var first, len, second;
            len = rx.snap(function() {
              return _this.length();
            });
            if (i1 < 0 || i1 > len - 1) {
              throw "i1 " + i1 + " is outside of bounds of array of length " + len;
            }
            if (i2 < 0 || i2 > len - 1) {
              throw "i2 " + i2 + " is outside of bounds of array of length " + len;
            }
            first = Math.min(i1, i2);
            second = Math.max(i1, i2);
            _this.move(first, second);
            return _this.move(second, first);
          };
        })(this));
      };

      SrcArray.prototype.reverse = function() {
        this.update(rx.snap((function(_this) {
          return function() {
            return _this.all().reverse();
          };
        })(this)));
        return rx.snap((function(_this) {
          return function() {
            return _this.all();
          };
        })(this));
      };

      return SrcArray;

    })(ObsArray);
    MappedDepArray = rx.MappedDepArray = (function(superClass) {
      extend(MappedDepArray, superClass);

      function MappedDepArray() {
        MappedDepArray.__super__.constructor.call(this);
      }

      return MappedDepArray;

    })(ObsArray);
    IndexedDepArray = rx.IndexedDepArray = (function(superClass) {
      extend(IndexedDepArray, superClass);

      function IndexedDepArray(xs, diff) {
        var i, x;
        if (xs == null) {
          xs = [];
        }
        IndexedDepArray.__super__.constructor.call(this, xs, diff);
        this.is = (function() {
          var j, len1, ref, results;
          ref = this._cells;
          results = [];
          for (i = j = 0, len1 = ref.length; j < len1; i = ++j) {
            x = ref[i];
            results.push(rx.cell(i));
          }
          return results;
        }).call(this);
        this.onChangeCells = this._mkEv((function(_this) {
          return function() {
            return [0, [], _.zip(_this._cells, _this.is)];
          };
        })(this));
        this.onChange = this._mkEv((function(_this) {
          return function() {
            return [
              0, [], _.zip(_this.is, rx.snap(function() {
                return _this.all();
              }))
            ];
          };
        })(this));
      }

      IndexedDepArray.prototype.map = function(f) {
        var ys;
        ys = new MappedDepArray();
        rx.autoSub(this.onChangeCells, (function(_this) {
          return function(arg) {
            var added, cell, icell, index, item, j, len1, newCells, ref, removed;
            index = arg[0], removed = arg[1], added = arg[2];
            ref = ys._cells.slice(index, index + removed.length);
            for (j = 0, len1 = ref.length; j < len1; j++) {
              cell = ref[j];
              cell.disconnect();
            }
            newCells = (function() {
              var l, len2, ref1, results;
              results = [];
              for (l = 0, len2 = added.length; l < len2; l++) {
                ref1 = added[l], item = ref1[0], icell = ref1[1];
                results.push(cell = bind(function() {
                  return f(item.get(), icell);
                }));
              }
              return results;
            })();
            return ys.realSpliceCells(index, removed.length, newCells);
          };
        })(this));
        return ys;
      };

      IndexedDepArray.prototype.realSpliceCells = function(index, count, additions) {
        var addedElems, i, j, len1, newIs, offset, ref, ref1, removed, removedElems;
        removed = this._cells.splice.apply(this._cells, [index, count].concat(additions));
        removedElems = rx.snap(function() {
          var j, len1, results, x2;
          results = [];
          for (j = 0, len1 = removed.length; j < len1; j++) {
            x2 = removed[j];
            results.push(x2.get());
          }
          return results;
        });
        ref = this.is.slice(index + count);
        for (offset = j = 0, len1 = ref.length; j < len1; offset = ++j) {
          i = ref[offset];
          i.set(index + additions.length + offset);
        }
        newIs = (function() {
          var l, ref1, results;
          results = [];
          for (i = l = 0, ref1 = additions.length; 0 <= ref1 ? l < ref1 : l > ref1; i = 0 <= ref1 ? ++l : --l) {
            results.push(rx.cell(index + i));
          }
          return results;
        })();
        (ref1 = this.is).splice.apply(ref1, [index, count].concat(slice.call(newIs)));
        addedElems = rx.snap(function() {
          var l, len2, results, x3;
          results = [];
          for (l = 0, len2 = additions.length; l < len2; l++) {
            x3 = additions[l];
            results.push(x3.get());
          }
          return results;
        });
        return rx.transaction((function(_this) {
          return function() {
            _this.onChangeCells.pub([index, removed, _.zip(additions, newIs)]);
            return _this.onChange.pub([index, removedElems, _.zip(addedElems, newIs)]);
          };
        })(this));
      };

      return IndexedDepArray;

    })(ObsArray);
    IndexedMappedDepArray = rx.IndexedMappedDepArray = (function(superClass) {
      extend(IndexedMappedDepArray, superClass);

      function IndexedMappedDepArray() {
        return IndexedMappedDepArray.__super__.constructor.apply(this, arguments);
      }

      return IndexedMappedDepArray;

    })(IndexedDepArray);
    DepArray = rx.DepArray = (function(superClass) {
      extend(DepArray, superClass);

      function DepArray(f1, diff) {
        this.f = f1;
        DepArray.__super__.constructor.call(this, [], diff);
        rx.autoSub((bind((function(_this) {
          return function() {
            return Array.from(_this.f());
          };
        })(this))).onSet, (function(_this) {
          return function(arg) {
            var old, val;
            old = arg[0], val = arg[1];
            return _this._update(val);
          };
        })(this));
      }

      return DepArray;

    })(ObsArray);
    IndexedArray = rx.IndexedArray = (function(superClass) {
      extend(IndexedArray, superClass);

      function IndexedArray(_cells) {
        this._cells = _cells;
      }

      IndexedArray.prototype.map = function(f) {
        var ys;
        ys = new MappedDepArray();
        rx.autoSub(this._cells.onChange, function(arg) {
          var added, index, removed;
          index = arg[0], removed = arg[1], added = arg[2];
          return ys.realSplice(index, removed.length, added.map(f));
        });
        return ys;
      };

      return IndexedArray;

    })(DepArray);
    rx.concat = function() {
      var casted, repLens, xs, xss, ys;
      xss = 1 <= arguments.length ? slice.call(arguments, 0) : [];
      ys = new MappedDepArray();
      casted = xss.map(function(xs) {
        return rx.cast(xs, 'array');
      });
      repLens = (function() {
        var j, len1, results;
        results = [];
        for (j = 0, len1 = xss.length; j < len1; j++) {
          xs = xss[j];
          results.push(0);
        }
        return results;
      })();
      casted.forEach(function(xs, i) {
        return rx.autoSub(xs.onChange, function(arg) {
          var added, index, removed, xsOffset;
          index = arg[0], removed = arg[1], added = arg[2];
          xsOffset = sum(repLens.slice(0, i));
          repLens[i] += added.length - removed.length;
          return ys.realSplice(xsOffset + index, removed.length, added);
        });
      });
      return ys;
    };
    objToJSMap = function(obj) {
      if (obj instanceof Map) {
        return obj;
      } else if (_.isArray(obj)) {
        return new Map(obj);
      } else {
        return new Map(_.pairs(obj));
      }
    };
    ObsMap = rx.ObsMap = (function(superClass) {
      extend(ObsMap, superClass);

      function ObsMap(_base) {
        this._base = _base != null ? _base : new Map();
        ObsMap.__super__.constructor.call(this);
        this._base = objToJSMap(this._base);
        this.onAdd = this._mkEv((function(_this) {
          return function() {
            return new Map(_this._base);
          };
        })(this));
        this.onRemove = this._mkEv((function(_this) {
          return function() {
            return new Map();
          };
        })(this));
        this.onChange = this._mkEv((function(_this) {
          return function() {
            return new Map();
          };
        })(this));
      }

      ObsMap.prototype.get = function(key) {
        this.subAll(function(result) {
          return result.has(key);
        });
        return this._base.get(key);
      };

      ObsMap.prototype.has = function(key) {
        recorder.sub(this.onAdd, function(additions) {
          return additions.has(key);
        });
        recorder.sub(this.onRemove, function(removals) {
          return removals.has(key);
        });
        return this._base.has(key);
      };

      ObsMap.prototype.all = function() {
        this.subAll();
        return new Map(this._base);
      };

      ObsMap.prototype.readonly = function() {
        return new DepMap((function(_this) {
          return function() {
            return _this.all();
          };
        })(this));
      };

      ObsMap.prototype.size = function() {
        recorder.sub(this.onRemove);
        recorder.sub(this.onAdd);
        return this._base.size;
      };

      ObsMap.prototype.realPut = function(key, val) {
        var old;
        if (this._base.has(key)) {
          old = this._base.get(key);
          if (old !== val) {
            this._base.set(key, val);
            this.onChange.pub(new Map([[key, [old, val]]]));
          }
          return old;
        } else {
          this._base.set(key, val);
          this.onAdd.pub(new Map([[key, val]]));
          return void 0;
        }
      };

      ObsMap.prototype.realRemove = function(key) {
        var val;
        val = mapPop(this._base, key);
        this.onRemove.pub(new Map([[key, val]]));
        return val;
      };

      ObsMap.prototype._update = function(other) {
        var additions, changes, otherMap, removals, ret;
        otherMap = objToJSMap(other);
        ret = new Map(this._base);
        removals = (function(_this) {
          return function() {
            return _.chain(Array.from(_this._base.keys())).difference(Array.from(otherMap.keys())).map(function(k) {
              return [k, mapPop(_this._base, k)];
            }).value();
          };
        })(this)();
        additions = (function(_this) {
          return function() {
            return _.chain(Array.from(otherMap.keys())).difference(Array.from(_this._base.keys())).map(function(k) {
              var val;
              val = otherMap.get(k);
              _this._base.set(k, val);
              return [k, val];
            }).value();
          };
        })(this)();
        changes = (function(_this) {
          return function() {
            return _.chain(Array.from(otherMap)).filter(function(arg) {
              var k, val;
              k = arg[0], val = arg[1];
              return _this._base.has(k) && _this._base.get(k) !== val;
            }).map(function(arg) {
              var k, old, val;
              k = arg[0], val = arg[1];
              old = _this._base.get(k);
              _this._base.set(k, val);
              return [k, [old, val]];
            }).value();
          };
        })(this)();
        rx.transaction((function(_this) {
          return function() {
            if (removals.length) {
              _this.onRemove.pub(new Map(removals));
            }
            if (additions.length) {
              _this.onAdd.pub(new Map(additions));
            }
            if (changes.length) {
              return _this.onChange.pub(new Map(changes));
            }
          };
        })(this));
        return ret;
      };

      return ObsMap;

    })(ObsBase);
    SrcMap = rx.SrcMap = (function(superClass) {
      extend(SrcMap, superClass);

      function SrcMap() {
        return SrcMap.__super__.constructor.apply(this, arguments);
      }

      SrcMap.prototype.put = function(key, val) {
        return recorder.mutating((function(_this) {
          return function() {
            return _this.realPut(key, val);
          };
        })(this));
      };

      SrcMap.prototype.set = function(key, val) {
        return this.put(key, val);
      };

      SrcMap.prototype["delete"] = function(key) {
        return recorder.mutating((function(_this) {
          return function() {
            var val;
            val = void 0;
            if (_this._base.has(key)) {
              val = _this.realRemove(key);
              _this.onRemove.pub(new Map([[key, val]]));
            }
            return val;
          };
        })(this));
      };

      SrcMap.prototype.remove = function(key) {
        return this["delete"](key);
      };

      SrcMap.prototype.clear = function() {
        return recorder.mutating((function(_this) {
          return function() {
            var removals;
            removals = new Map(_this._base);
            _this._base.clear();
            if (removals.size) {
              _this.onRemove.pub(removals);
            }
            return removals;
          };
        })(this));
      };

      SrcMap.prototype.update = function(x) {
        return recorder.mutating((function(_this) {
          return function() {
            return _this._update(x);
          };
        })(this));
      };

      return SrcMap;

    })(ObsMap);
    DepMap = rx.DepMap = (function(superClass) {
      extend(DepMap, superClass);

      function DepMap(f1) {
        var c;
        this.f = f1;
        DepMap.__super__.constructor.call(this);
        c = bind(this.f);
        rx.autoSub(c.onSet, (function(_this) {
          return function(arg) {
            var old, val;
            old = arg[0], val = arg[1];
            return _this._update(val);
          };
        })(this));
      }

      return DepMap;

    })(ObsMap);
    objToJSSet = function(obj) {
      if (obj instanceof Set) {
        return obj;
      } else {
        return new Set(obj);
      }
    };
    _castOther = function(other) {
      if (other instanceof Set) {
        other;
      } else if (other instanceof ObsSet) {
        other = other.all();
      }
      if (other instanceof ObsArray) {
        other = other.all();
      }
      if (other instanceof ObsCell) {
        other = other.get();
      }
      return new Set(other);
    };
    ObsSet = rx.ObsSet = (function(superClass) {
      extend(ObsSet, superClass);

      function ObsSet(_base) {
        this._base = _base != null ? _base : new Set();
        ObsSet.__super__.constructor.call(this);
        this._base = objToJSSet(this._base);
        this.onChange = this._mkEv((function(_this) {
          return function() {
            return [_this._base, new Set()];
          };
        })(this));
      }

      ObsSet.prototype.has = function(key) {
        this.subAll(function(arg) {
          var additions, removals;
          additions = arg[0], removals = arg[1];
          return additions.has(key) || removals.has(key);
        });
        return this._base.has(key);
      };

      ObsSet.prototype.all = function() {
        this.subAll();
        return new Set(this._base);
      };

      ObsSet.prototype.readonly = function() {
        return new DepSet((function(_this) {
          return function() {
            return _this.all();
          };
        })(this));
      };

      ObsSet.prototype.values = function() {
        return this.all();
      };

      ObsSet.prototype.entries = function() {
        return this.all();
      };

      ObsSet.prototype.size = function() {
        this.subAll(function(arg) {
          var additions, removals;
          additions = arg[0], removals = arg[1];
          return additions.size !== removals.size;
        });
        return this._base.size;
      };

      ObsSet.prototype.union = function(other) {
        return new DepSet((function(_this) {
          return function() {
            return union(_this.all(), _castOther(other));
          };
        })(this));
      };

      ObsSet.prototype.intersection = function(other) {
        return new DepSet((function(_this) {
          return function() {
            return intersection(_this.all(), _castOther(other));
          };
        })(this));
      };

      ObsSet.prototype.difference = function(other) {
        return new DepSet((function(_this) {
          return function() {
            return difference(_this.all(), _castOther(other));
          };
        })(this));
      };

      ObsSet.prototype.symmetricDifference = function(other) {
        return new DepSet((function(_this) {
          return function() {
            var me;
            me = _this.all();
            other = _castOther(other);
            return new Set(Array.from(union(me, other)).filter(function(item) {
              return !me.has(item) || !other.has(item);
            }));
          };
        })(this));
      };

      ObsSet.prototype._update = function(y) {
        return rx.transaction((function(_this) {
          return function() {
            var additions, new_, old_, removals;
            old_ = new Set(_this._base);
            new_ = objToJSSet(y);
            additions = new Set();
            removals = new Set();
            old_.forEach(function(item) {
              if (!new_.has(item)) {
                return removals.add(item);
              }
            });
            new_.forEach(function(item) {
              if (!old_.has(item)) {
                return additions.add(item);
              }
            });
            old_.forEach(function(item) {
              return _this._base["delete"](item);
            });
            new_.forEach(function(item) {
              return _this._base.add(item);
            });
            _this.onChange.pub([additions, removals]);
            return old_;
          };
        })(this));
      };

      return ObsSet;

    })(ObsBase);
    SrcSet = rx.SrcSet = (function(superClass) {
      extend(SrcSet, superClass);

      function SrcSet() {
        return SrcSet.__super__.constructor.apply(this, arguments);
      }

      SrcSet.prototype.add = function(item) {
        return recorder.mutating((function(_this) {
          return function() {
            if (!_this._base.has(item)) {
              _this._base.add(item);
              _this.onChange.pub([new Set([item]), new Set()]);
            }
            return item;
          };
        })(this));
      };

      SrcSet.prototype.put = function(item) {
        return this.add(item);
      };

      SrcSet.prototype["delete"] = function(item) {
        return recorder.mutating((function(_this) {
          return function() {
            if (_this._base.has(item)) {
              _this._base["delete"](item);
              _this.onChange.pub([new Set(), new Set([item])]);
            }
            return item;
          };
        })(this));
      };

      SrcSet.prototype.remove = function(item) {
        return this["delete"](item);
      };

      SrcSet.prototype.clear = function() {
        return recorder.mutating((function(_this) {
          return function() {
            var removals;
            removals = new Set(_this._base);
            if (_this._base.size) {
              _this._base.clear();
              _this.onChange.pub([new Set(), removals]);
            }
            return removals;
          };
        })(this));
      };

      SrcSet.prototype.update = function(y) {
        return recorder.mutating((function(_this) {
          return function() {
            return _this._update(y);
          };
        })(this));
      };

      return SrcSet;

    })(ObsSet);
    DepSet = rx.DepSet = (function(superClass) {
      extend(DepSet, superClass);

      function DepSet(f1) {
        var c;
        this.f = f1;
        DepSet.__super__.constructor.call(this);
        c = bind(this.f);
        rx.autoSub(c.onSet, (function(_this) {
          return function(arg) {
            var old, val;
            old = arg[0], val = arg[1];
            return _this._update(val);
          };
        })(this));
      }

      return DepSet;

    })(ObsSet);
    rx.cellToSet = function(c) {
      return new rx.DepSet(function() {
        return c.get();
      });
    };
    rx.liftSpec = function(obj) {
      var name, type, val;
      return _.object((function() {
        var j, len1, ref, results;
        ref = Object.getOwnPropertyNames(obj);
        results = [];
        for (j = 0, len1 = ref.length; j < len1; j++) {
          name = ref[j];
          val = obj[name];
          if ((val != null) && [rx.ObsMap, rx.ObsCell, rx.ObsArray, rx.ObsSet].some(function(cls) {
            return val instanceof cls;
          })) {
            continue;
          }
          type = _.isFunction(val) ? null : _.isArray(val) ? 'array' : val instanceof Set ? 'set' : val instanceof Map ? 'map' : 'cell';
          results.push([
            name, {
              type: type,
              val: val
            }
          ]);
        }
        return results;
      })());
    };
    rx.lift = function(x, fieldspec) {
      if (fieldspec == null) {
        fieldspec = rx.liftSpec(x);
      }
      return _.mapObject(fieldspec, function(arg, name) {
        var type;
        type = arg.type;
        if (!(x[name] instanceof ObsBase) && type in rx.types) {
          return rx[type](x[name]);
        }
        return x[name];
      });
    };
    rx.unlift = function(x) {
      return _.mapObject(x, function(v) {
        if (v instanceof rx.ObsBase) {
          return v.all();
        } else {
          return v;
        }
      });
    };
    rx.reactify = function(obj, fieldspec) {
      var arr, methName, name, spec;
      if (_.isArray(obj)) {
        arr = rx.array(_.clone(obj));
        Object.defineProperties(obj, _.object((function() {
          var j, len1, ref, results;
          ref = _.functions(arr);
          results = [];
          for (j = 0, len1 = ref.length; j < len1; j++) {
            methName = ref[j];
            if (methName !== 'length') {
              results.push((function(methName) {
                var meth, newMeth, spec;
                meth = obj[methName];
                newMeth = function() {
                  var args, ref1, res;
                  args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
                  if (meth != null) {
                    res = meth.call.apply(meth, [obj].concat(slice.call(args)));
                  }
                  (ref1 = arr[methName]).call.apply(ref1, [arr].concat(slice.call(args)));
                  return res;
                };
                spec = {
                  configurable: true,
                  enumerable: false,
                  value: newMeth,
                  writable: true
                };
                return [methName, spec];
              })(methName));
            }
          }
          return results;
        })()));
        return obj;
      } else {
        return Object.defineProperties(obj, _.object((function() {
          var results;
          results = [];
          for (name in fieldspec) {
            spec = fieldspec[name];
            results.push((function(name, spec) {
              var desc, obs, ref, ref1, view;
              desc = null;
              switch (spec.type) {
                case 'cell':
                  obs = rx.cell((ref = spec.val) != null ? ref : null);
                  desc = {
                    configurable: true,
                    enumerable: true,
                    get: function() {
                      return obs.get();
                    },
                    set: function(x) {
                      return obs.set(x);
                    }
                  };
                  break;
                case 'array':
                  view = rx.reactify((ref1 = spec.val) != null ? ref1 : []);
                  desc = {
                    configurable: true,
                    enumerable: true,
                    get: function() {
                      view.all();
                      return view;
                    },
                    set: function(x) {
                      view.splice.apply(view, [0, view.length].concat(slice.call(x)));
                      return view;
                    }
                  };
                  break;
                default:
                  throw new Error("Unknown observable type: " + type);
              }
              return [name, desc];
            })(name, spec));
          }
          return results;
        })()));
      }
    };
    rx.autoReactify = function(obj) {
      var name, type, val;
      return rx.reactify(obj, _.object((function() {
        var j, len1, ref, results;
        ref = Object.getOwnPropertyNames(obj);
        results = [];
        for (j = 0, len1 = ref.length; j < len1; j++) {
          name = ref[j];
          val = obj[name];
          if (val instanceof ObsMap || val instanceof ObsCell || val instanceof ObsArray) {
            continue;
          }
          type = _.isFunction(val) ? null : _.isArray(val) ? 'array' : 'cell';
          results.push([
            name, {
              type: type,
              val: val
            }
          ]);
        }
        return results;
      })()));
    };
    rx.cell = function(value) {
      return new SrcCell(value);
    };
    rx.cell.from = function(value) {
      if (value instanceof ObsCell) {
        return value;
      } else if (value instanceof ObsBase) {
        return bind(function() {
          return value.all();
        });
      } else {
        return bind(function() {
          return value;
        });
      }
    };
    rx.array = function(xs, diff) {
      return new SrcArray((xs != null ? xs : []).map(rx.cell), diff);
    };
    rx.array.from = function(value, diff) {
      var f;
      if (value instanceof rx.ObsArray) {
        return value;
      } else if (_.isArray(value)) {
        f = function() {
          return value;
        };
      } else if (value instanceof ObsBase) {
        f = function() {
          return value.all();
        };
      } else {
        throw new Error("Cannot cast " + value.constructor.name + " to array!");
      }
      return new DepArray(f, diff);
    };
    rx.map = function(value) {
      return new SrcMap(value);
    };
    rx.map.from = function(value) {
      if (value instanceof rx.ObsMap) {
        return value;
      } else if (value instanceof ObsBase) {
        return new DepMap(function() {
          return value.get();
        });
      } else {
        return new DepMap(function() {
          return value;
        });
      }
    };
    rx.set = function(value) {
      return new SrcSet(value);
    };
    rx.set.from = function(value) {
      if (value instanceof rx.ObsSet) {
        return value;
      } else if (value instanceof rx.ObsBase) {
        return new DepSet(function() {
          return value.all();
        });
      } else {
        return new DepSet(function() {
          return value;
        });
      }
    };
    rx.cast = function(value, type) {
      var opts, realType, types, x;
      if (type == null) {
        type = 'cell';
      }
      if (type === ObsCell || type === ObsArray || type === ObsMap || type === ObsSet) {
        realType = null;
        switch (type) {
          case ObsCell:
            realType = 'cell';
            break;
          case ObsArray:
            realType = 'array';
            break;
          case ObsMap:
            realType = 'map';
            break;
          case ObsSet:
            realType = 'set';
        }
        type = realType;
      }
      if (_.isString(type)) {
        if (type in rx.types) {
          return rx[type].from(value);
        } else {
          return value;
        }
      } else {
        opts = value;
        types = type;
        x = _.mapObject(opts, function(value, key) {
          if (types[key]) {
            return rx.cast(value, types[key]);
          } else {
            return value;
          }
        });
        return x;
      }
    };
    rx.flatten = function(xs) {
      return new DepArray(function() {
        return _.chain(flattenHelper([xs])).flatten().filter(function(x) {
          return x != null;
        }).value();
      });
    };
    flattenHelper = function(x) {
      if (x instanceof ObsArray) {
        return flattenHelper(x.all());
      } else if (x instanceof ObsSet) {
        return flattenHelper(Array.from(x.values()));
      } else if (x instanceof ObsCell) {
        return flattenHelper(x.get());
      } else if (x instanceof Set) {
        return flattenHelper(Array.from(x));
      } else if (_.isArray(x)) {
        return x.map(function(x_k) {
          return flattenHelper(x_k);
        });
      } else {
        return x;
      }
    };
    flatten = function(xss) {
      var xs;
      xs = _.flatten(xss);
      return rx.cellToArray(bind(function() {
        return _.flatten(xss);
      }));
    };
    rx.cellToArray = function(cell, diff) {
      return new DepArray((function() {
        return cell.get();
      }), diff);
    };
    rx.cellToMap = function(cell) {
      return new rx.DepMap(function() {
        return cell.get();
      });
    };
    rx.cellToSet = function(c) {
      return new rx.DepSet(function() {
        return c.get();
      });
    };
    rx.basicDiff = function(key) {
      if (key == null) {
        key = rx.smartUidify;
      }
      return function(oldXs, newXs) {
        var i, j, len1, oldKeys, ref, results, x;
        oldKeys = mkMap((function() {
          var j, len1, results;
          results = [];
          for (i = j = 0, len1 = oldXs.length; j < len1; i = ++j) {
            x = oldXs[i];
            results.push([key(x), i]);
          }
          return results;
        })());
        results = [];
        for (j = 0, len1 = newXs.length; j < len1; j++) {
          x = newXs[j];
          results.push((ref = oldKeys[key(x)]) != null ? ref : -1);
        }
        return results;
      };
    };
    rx.uidify = function(x) {
      var ref;
      return (ref = x.__rxUid) != null ? ref : (Object.defineProperty(x, '__rxUid', {
        enumerable: false,
        value: mkuid()
      })).__rxUid;
    };
    rx.smartUidify = function(x) {
      if (_.isObject(x)) {
        return rx.uidify(x);
      } else {
        return JSON.stringify(x);
      }
    };
    permToSplices = function(oldLength, newXs, perm) {
      var cur, i, last, refs, splice, splices;
      if (!newXs.length) {
        return null;
      }
      refs = (function() {
        var j, len1, results;
        results = [];
        for (j = 0, len1 = perm.length; j < len1; j++) {
          i = perm[j];
          if (i >= 0) {
            results.push(i);
          }
        }
        return results;
      })();
      if (_.some((function() {
        var j, ref, results;
        results = [];
        for (i = j = 0, ref = refs.length - 1; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
          results.push(refs[i + 1] - refs[i] <= 0);
        }
        return results;
      })())) {
        return null;
      }
      splices = [];
      last = -1;
      i = 0;
      while (i < perm.length) {
        while (i < perm.length && perm[i] === last + 1) {
          last += 1;
          i += 1;
        }
        splice = {
          index: i,
          count: 0,
          additions: []
        };
        while (i < perm.length && perm[i] === -1) {
          splice.additions.push(newXs[i]);
          i += 1;
        }
        cur = i === perm.length ? oldLength : perm[i];
        splice.count = cur - (last + 1);
        if (splice.count > 0 || splice.additions.length > 0) {
          splices.push([splice.index, splice.count, splice.additions]);
        }
        last = cur;
        i += 1;
      }
      return splices;
    };
    rx.transaction = function(f) {
      return depMgr.transaction(f);
    };
    return rx;
  };

  (function(root, factory) {
    var _, deps, rx;
    deps = ['underscore'];
    if ((typeof define !== "undefined" && define !== null ? define.amd : void 0) != null) {
      return define(deps, factory);
    } else if ((typeof module !== "undefined" && module !== null ? module.exports : void 0) != null) {
      _ = require('underscore');
      rx = factory(_);
      return module.exports = rx;
    } else if (root._ != null) {
      return root.rx = factory(root._);
    } else {
      throw "Dependencies are not met for bobtail-core: _ not found";
    }
  })(this, rxFactory);

}).call(this);

//# sourceMappingURL=reactive.js.map

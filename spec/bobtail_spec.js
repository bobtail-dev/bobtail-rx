import _ from 'underscore';
import * as rx from '../src/main.js';
let {snap, bind, Ev} = rx;
jasmine.CATCH_EXCEPTIONS = false;;
Error.stackTraceLimit = 20;

describe('ObsBase', () => it('should start', function() {}));

describe('source cell', function() {
  let src = null;
  beforeEach(() => src = rx.cell());
  it('initially contains null', () => expect(src.get()).toBe(null));
  it('has get value that is same as last set value', function() {
    src.set(1);
    expect(src.get()).toBe(1);
  });
  it('should not nest (and thus disconnect) binds refreshed from inside a mutation', function() {
    let x = rx.cell();
    let xx = bind(() => x.get());
    let y = bind(() => x.set(src.get()));
    return (() => {
      let result = [];
      for (let i = 1; i <= 3; i++) {
        src.set(i);
        result.push(expect(xx.get()).toBe(i));
      }
      return result;
    })();
  });
});

describe('dependent cell', function() {
  let src;
  let dep = (src = null);
  beforeEach(function() {
    src = rx.cell();
    return dep = bind(() => src.get());
  });
  it('always reflects the dependency', function() {
    expect(src.get()).toBe(dep.get());
    src.set(0);
    expect(src.get()).toBe(dep.get());
    expect(src.get()).toBe(0);
    src.set(1);
    expect(src.get()).toBe(dep.get());
    expect(src.get()).toBe(1);
  });
  it('cannot be set', () => expect(() => dep.set(0)).toThrow());
});

describe('ObsArray', function() {
  describe('all', () =>
    it('should return all items in the ObsArray', function() {
      let xs = rx.array([]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      expect(snap(() => ys.all())).toEqual([]);
      xs.push(1);
      expect(snap(() => ys.all())).toEqual([1]);
      xs.push(2);
      expect(snap(() => ys.all())).toEqual([1, 2]);
      xs.push(3);
      expect(snap(() => ys.all())).toEqual([1, 2, 3]);
      xs.push(4);
      expect(snap(() => ys.all())).toEqual([1, 2, 3, 4]);
      xs.update([]);
      expect(snap(() => ys.all())).toEqual([]);
      xs.update([]);
      expect(snap(() => ys.all())).toEqual([]);
  }));

  describe('at', function() {
    it('should return the value of the array at a given index', function() {
      let arr = rx.array([4, 3, 2, 1, 0]);
      expect(snap(() => arr.at(0))).toBe(4);
      expect(snap(() => arr.at(4))).toBe(0);
    });
    it('should update if the value of the array at that index changes', function() {
      let arr;
      return arr = rx.array([1, 2]);
    });

    it('should return undefined if the index is invalid', function() {
      let arr = rx.array([0, 1, 2, 3, 4, 5]);
      expect(snap(() => arr.at(-1))).toBeUndefined();
      expect(snap(() => arr.at(42))).toBeUndefined();
      expect(snap(() => arr.at(undefined))).toBeUndefined();
      expect(snap(() => arr.at("foo"))).toBeUndefined();
    });
  });

  describe('length', () =>
    it('should track the length of the array, and update only when the array length changes', function() {
      let count = 0;
      let arr = rx.array();
      let len = bind(() => arr.length());
      rx.autoSub(len.onSet, rx.skipFirst(() => count += 1));
      expect(count).toBe(0);
      expect(snap(() => len.get())).toBe(0);
      arr.push(1);
      expect(snap(() => len.get())).toBe(1);
      expect(count).toBe(1);
      arr.update([4]);
      expect(snap(() => len.get())).toBe(1);
      expect(count).toBe(1);
      arr.push(6);
      expect(snap(() => len.get())).toBe(2);
      expect(count).toBe(2);
      arr.pop();
      expect(snap(() => len.get())).toBe(1);
      expect(count).toBe(3);
      arr.pop();
      expect(snap(() => len.get())).toBe(0);
      expect(count).toBe(4);
      arr.pop();
      expect(snap(() => len.get())).toBe(0);
      expect(count).toBe(4);
    })
  );
  describe('transform', () =>
    it('should allow arbitrary transformation of an array, and track changes', function() {
      let arr = rx.array([1, 2, 3, 4, 5, 6]);
      let squaredEvens = arr.transform(array => array.filter(e => (e % 2) === 0).map(e => Math.pow(e, 2)));
      expect(snap(() => squaredEvens.all())).toEqual([4, 16, 36]);
      arr.push(8);
      expect(snap(() => squaredEvens.all())).toEqual([4, 16, 36, 64]);
      arr.update([]);
      expect(snap(() => squaredEvens.all())).toEqual([]);
  })
);
  describe('map', () => it('', function() {})); // TODO
  describe('filter', function() {
    it('should keep only elements that pass the provided test', function() {
      let arr = rx.array([1, 2, 3, 4, 5, 6]);
      expect(snap(() => arr.filter(e => (e % 2) === 0).all())).toEqual([2, 4, 6]);
      expect(snap(() => arr.filter(e => (e % 2) === 1).all())).toEqual([1, 3, 5]);
  });
    it('should update when the array changes', function() {});
  });

  describe('slice', function() {
    it('should work like its analagous ES method', function() {
      let arr = rx.array([1, 2, 3, 4, 5, 6]);
      expect(snap(() => arr.slice(2, 4).all())).toEqual([3, 4]);
      expect(snap(() => arr.slice(0, 4).all())).toEqual([1, 2, 3, 4]);
      expect(snap(() => arr.slice(0, -1).all())).toEqual([1, 2, 3, 4, 5]);
      expect(snap(() => arr.slice(1, -2).all())).toEqual([2, 3, 4]);
      expect(snap(() => arr.slice(1).all())).toEqual([2, 3, 4, 5, 6]);
      expect(snap(() => arr.slice(-2).all())).toEqual([5, 6]);
    });
    it('should correctly handle invalid indices', function() {
      let arr = rx.array([1, 2, 3, 4, 5, 6]);
      expect(snap(() => arr.slice(12, 28).all())).toEqual([]);
      expect(snap(() => arr.slice(1, 0).all())).toEqual([]);
      expect(snap(() => arr.slice(0, 12).all())).toEqual([1, 2, 3, 4, 5, 6]);
      expect(snap(() => arr.slice(-8, -1).all())).toEqual([1, 2, 3, 4, 5]);
    });
    it('should track changes', function() {
      let arr = rx.array([1, 2, 3, 4, 5, 6]);
      let x = arr.slice(1, -1);
      expect(snap(() => x.all())).toEqual([2, 3, 4, 5]);
      arr.push(7);
      expect(snap(() => x.all())).toEqual([2, 3, 4, 5, 6]);
      arr.pop();
      expect(snap(() => x.all())).toEqual([2, 3, 4, 5]);
      arr.update([8, 9, 10]);
      expect(snap(() => x.all())).toEqual([9]);
    });
  });
  describe('reduce', () =>
    it('should work like its analagous ES method', function() {
      let xs = rx.array([]);
      let y = bind(() => xs.reduce(
        (accum, curr, i) => (accum - curr) * Math.pow((-1), i),
        0
      )
       );
      let z = bind(() => xs.reduce(
        (accum, curr, i) => accum + (curr * (Math.pow(2, i))),
        1
      )
       );
      let a = bind(() => xs.reduce(
        (accum, curr, i, arr) => accum + curr + i + arr.length,
        0
      )
       );
      expect(y.get()).toBe(0);
      expect(z.get()).toBe(1);
      expect(a.get()).toBe(0);
      xs.replace([16, 8, 4, 2, 1]);
      expect(y.get()).toBe(-19);
      expect(z.get()).toBe(81);
      expect(a.get()).toBe(66);
    })
  );
  describe('reduceRight', () =>
    it('should work like its analagous ES method', function() {
      let xs = rx.array([]);
      let y = bind(() => xs.reduceRight(
        (accum, curr, i) => (accum - curr) * Math.pow((-1), i),
        0
      )
       );
      let z = bind(() => xs.reduceRight(
        (accum, curr, i, arr) => accum + (curr * (Math.pow(2, (arr.length - i - 1)))),
        1
      )
       );
      let a = bind(() => xs.reduceRight(
        (accum, curr, i, arr) => accum + curr + i + arr.length,
        0
      )
       );
      expect(y.get()).toBe(0);
      expect(z.get()).toBe(1);
      expect(a.get()).toBe(0);
      xs.replace([1, 2, 4, 8, 16]);
      expect(y.get()).toBe(-19);
      expect(z.get()).toBe(81);
      expect(a.get()).toBe(66);
    })
  );
  describe('every', function() {
    it('should return true if every element in the array passes the test', function() { // TODO
      let truthy = rx.array([1, 1, 1]);
      let falsy = rx.array([1, 1, 0]);
      expect(snap(() => truthy.every(_.identity))).toBe(true);
      expect(snap(() => falsy.every(_.identity))).toBe(false);
    });
    it('should short circuit as soon as one element in the array fails', function() { // TODO
      let count = 0;
      let arr = rx.array([1, 1, 0, 1, 1]);
      let soma = bind(() => arr.every(function(e) {
        count += 1;
        return e;
      })
       );
      expect(count).toBe(3);
      expect(snap(() => soma.get())).toBe(false);
    });
    it('should recalculate whenever the array changes', function() { // TODO
      let test = rx.array([1, 1, 1]);
      let soma = bind(() => test.every(_.identity));
      expect(snap(() => soma.get())).toBe(true);
      test.push(0);
      expect(snap(() => soma.get())).toBe(false);
      test.pop();
      expect(snap(() => soma.get())).toBe(true);
      test.put(1, 0);
      expect(snap(() => soma.get())).toBe(false);
    });
  });
  describe('some', function() {
    it('should return true if any element in the array passes the test', function() { // TODO
      let truthy = rx.array([0, 0, 0, 0, 1, 0]);
      let falsy = rx.array([0, 0, 0]);
      expect(snap(() => truthy.some(_.identity))).toBe(true);
      expect(snap(() => falsy.some(_.identity))).toBe(false);
    });
    it('should short circuit as soon as one element in the array succeeds', function() {
      let count = 0;
      let arr = rx.array([0, 0, 1, 0]);
      let soma = bind(() => arr.some(function(e) {
        count += 1;
        return e;
      })
       );
      expect(count).toBe(3);
      expect(snap(() => soma.get())).toBe(true);
    });
    it('should recalculate whenever the array changes', function() {
      let test = rx.array([0, 0, 0]);
      let soma = bind(() => test.some(_.identity));
      expect(snap(() => soma.get())).toBe(false);
      test.push(1);
      expect(snap(() => soma.get())).toBe(true);
      test.pop();
      expect(snap(() => soma.get())).toBe(false);
      test.put(1, 1);
      expect(snap(() => soma.get())).toBe(true);
    });
  });
  describe('indexOf', function() {
    it('should return -1 if not found', () => expect(snap(() => rx.array([1,2,3]).indexOf(0))).toBe(-1));
    it('should return the index where the element is otherwise', function() {
      expect(snap(() => rx.array([1,2,3]).indexOf(3))).toBe(2);
      expect(snap(() => rx.array([1,0,1,2,3]).indexOf(1, 2))).toBe(2);
    });
    it('should update when the underlying array changes', function() {
      let arr = rx.array([1,2,3]);
      let i = bind(() => arr.indexOf(4));
      expect(snap(() => i.get())).toBe(-1);
      arr.push(4);
      expect(snap(() => i.get())).toBe(3);
    });
  });

  describe('lastIndexOf', function() {
    it('should return -1 if not found', () => expect(snap(() => rx.array([1,2,3]).lastIndexOf(0))).toBe(-1));
    it('should return the index where the element is otherwise', function() {
      expect(snap(() => rx.array([1,2,3]).lastIndexOf(3))).toBe(2);
      expect(snap(() => rx.array([1,2,3,0,3,0]).lastIndexOf(3, 3))).toBe(2);
    });
    it('should update when the underlying array changes', function() {
      let arr = rx.array([1,2,3]);
      let i = bind(() => arr.lastIndexOf(4));
      expect(snap(() => i.get())).toBe(-1);
      arr.unshift(4);
      expect(snap(() => i.get())).toBe(0);
      arr.push(4);
      expect(snap(() => i.get())).toBe(4);
    });
  });
  describe('join', function() {
    it('should return the empty string for empty arrays', () => expect(snap(() => rx.array().join("abc"))).toEqual(''));
    it('should behave like ES join', () => expect(snap(() => rx.array([1,2,3,4,5]).join(", "))).toEqual('1, 2, 3, 4, 5'));
    it('should update when the source array changes', function() {
      let arr = rx.array([]);
      expect(snap(() => arr.join(", "))).toEqual('');
      arr.update([1,2,3,4,5]);
      expect(snap(() => arr.join(", "))).toEqual('1, 2, 3, 4, 5');
      arr.put(2, 10);
      expect(snap(() => arr.join(", "))).toEqual('1, 2, 10, 4, 5');
      arr.pop();
      expect(snap(() => arr.join(", "))).toEqual('1, 2, 10, 4');
    });
  });
  describe('first', function() {
    it('should be undefined for an empty array', function() {
      let xs = rx.array();
      expect(snap(() => xs.first())).toBeUndefined();
    });
    it('should return the first element of the array', function() {
      let xs = rx.array([1,2,3,4]);
      expect(snap(() => xs.first())).toBe(1);
    });
    it('should update as the array changes', function() {
      let xs = rx.array([]);
      expect(snap(() => xs.first())).toBeUndefined();
      xs.unshift(1);
      expect(snap(() => xs.first())).toBe(1);
      xs.unshift(2);
      expect(snap(() => xs.first())).toBe(2);
      xs.push(3);
      expect(snap(() => xs.first())).toBe(2);
    });
  });
  describe('last', function() {
    it('should be undefined for an empty array', function() {
      let xs = rx.array();
      expect(snap(() => xs.last())).toBeUndefined();
    });
    it('should return the last element of the array', function() {
      let xs = rx.array([1,2,3,4]);
      expect(snap(() => xs.last())).toBe(4);
    });
    it('should update as the array changes', function() {
      let xs = rx.array([]);
      expect(snap(() => xs.last())).toBeUndefined();
      xs.push(1);
      expect(snap(() => xs.last())).toBe(1);
      xs.push(2);
      expect(snap(() => xs.last())).toBe(2);
      xs.unshift(3);
      expect(snap(() => xs.last())).toBe(2);
    });
  });
  describe('indexed', () => it('', function() {})); // TODO
  describe('concat', function() {
    it('should form a single array out of many', () => expect(snap(() => rx.array([1,2,3]).concat([4,5,6], rx.array([7, 8, 9]), rx.array([10])).all())).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    it('should update whenever any of its parent arrays change', function() {
      let arr1 = rx.array([1,2,3]);
      let arr2 = rx.array([4,5,6]);
      let arr3 = rx.array([7,8,9]);

      let concat = arr1.concat(arr2, arr3);
      expect(snap(() => concat.all())).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      arr1.update([]);
      expect(snap(() => concat.all())).toEqual([4, 5, 6, 7, 8, 9]);
      arr2.unshift(3);
      expect(snap(() => concat.all())).toEqual([3, 4, 5, 6, 7, 8, 9]);
      arr3.push(10);
      expect(snap(() => concat.all())).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });
});

describe('SrcArray', function() {
  describe('insert', () =>
    it('should insert elements before their target index', function() {
      let xs = rx.array([]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      xs.insert(1, 0);
      expect(ys.all()).toEqual([1]);
      xs.insert(2, 0);
      expect(ys.all()).toEqual([2, 1]);
      xs.insert(3, 3);
      expect(ys.all()).toEqual([2, 1, 3]);
      xs.insert(5, -1);
      expect(ys.all()).toEqual([2, 1, 5, 3]);
      xs.insert(6, 5);
      expect(ys.all()).toEqual([2, 1, 5, 3, 6]);
    })
  );

  describe('remove', () =>
    it('should not remove anything if element not found', function() {
      let xs = rx.array(['a','b','c']);
      xs.remove('d');
      expect(xs.all()).toEqual(['a','b','c']);
      xs.remove('b');
      expect(xs.all()).toEqual(['a','c']);
    })
  );

  describe('removeAll', function() {
    it('should remove all elements that match the value', function() {
      let xs = rx.array(['a', 'b', 'a', 'c']);
      let zs = rx.cellToArray(bind(() => xs.all()));
      xs.removeAll('a');
      expect(xs.all()).toEqual(['b', 'c']);
      expect(zs.all()).toEqual(['b', 'c']);
    });
    it('should do nothing if no matching elements found', function() {
      let ys = rx.array(['b', 'c']);
      return ys.removeAll('a');
    });
  });


  describe('removeAt', function() {
    it('should remove elements by index and return the removed value', function() {
      let xs = rx.array([0, 1, 2, 3]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      let x1 = xs.removeAt(1);
      expect(xs.all()).toEqual([0, 2, 3]);
      expect(ys.all()).toEqual([0, 2, 3]);

      let x2 = xs.removeAt(2);

      expect(xs.all()).toEqual([0, 2]);
      expect(ys.all()).toEqual([0, 2]);
      expect(x1).toEqual(1);
      expect(x2).toEqual(3);
    });

    it('should not fail due to attempting to remove an element out of range', function() {
      let xs = rx.array([0, 2]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      expect(xs.removeAt(2)).toBeUndefined();
      expect(xs.all()).toEqual([0, 2]);
      expect(ys.all()).toEqual([0, 2]);
  });
});

  describe('push', () =>
    it('should append elements to the array', function() {
      let xs = rx.array([]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      xs.push(1);
      xs.push(2);
      xs.push(3);

      expect(xs.all()).toEqual([1, 2, 3]);
      expect(ys.all()).toEqual([1, 2, 3]);
    })
  );

  describe('pop', function() {
    it('should remove and return elements from the back of the array', function() {
      let xs = rx.array([1, 2, 3]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      expect(xs.pop()).toEqual(3);
      expect(xs.all()).toEqual([1, 2]);
      expect(xs.pop()).toEqual(2);
      expect(xs.all()).toEqual([1]);
      expect(xs.pop()).toEqual(1);
      expect(xs.all()).toEqual([]);
      expect(ys.all()).toEqual([]);
    });

    it('should return undefined if the array is empty', () => expect(rx.array().pop()).toBeUndefined());
  });


  describe('put', function() {
    it('should replace the selected element', function() {
      let xs = rx.array([1, 2, 3, 4]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      xs.put(1, 10);
      expect(xs.all()).toEqual([1, 10, 3, 4]);
      expect(ys.all()).toEqual([1, 10, 3, 4]);
    });
    it('should append if the index is out of bounds', function() {
      let xs = rx.array([]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      xs.put(12, 10);
      expect(xs.all()).toEqual([10]);
      expect(ys.all()).toEqual([10]);
    });
  });

  describe('replace', () =>
    it('should replace the entire array', function() {
      let xs = rx.array([1, 2, 3]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      xs.replace([1, 2, 4]);
      expect(xs.all()).toEqual([1, 2, 4]);
      expect(ys.all()).toEqual([1, 2, 4]);

      xs.replace([]);
      expect(xs.all()).toEqual([]);
      expect(ys.all()).toEqual([]);

      xs.replace([10, 10, 10, 15]);
      expect(xs.all()).toEqual([10, 10, 10, 15]);
      expect(ys.all()).toEqual([10, 10, 10, 15]);
    })
  );

  describe('unshift', () =>
    it('should insert at the beginning of the array', function() {
      let xs = rx.array([3, 2, 1]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      xs.unshift(4);

      expect(xs.all()).toEqual([4, 3, 2, 1]);
      expect(ys.all()).toEqual([4, 3, 2, 1]);

      xs.unshift(5);
      expect(xs.all()).toEqual([5, 4, 3, 2, 1]);
      expect(ys.all()).toEqual([5, 4, 3, 2, 1]);
    })
  );

  describe('shift', function() {
    it('should return undefined if the array is empty', function() {
      let xs = rx.array([]);
      expect(xs.shift()).toBeUndefined();
      expect(xs.all()).toEqual([]);
    });

    it('should remove and return the first element in the array', function() {
      let xs = rx.array([3, 2, 1]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      expect(xs.shift()).toEqual(3);
      expect(xs.all()).toEqual([2, 1]);
      expect(ys.all()).toEqual([2, 1]);

      expect(xs.shift()).toEqual(2);
      expect(xs.all()).toEqual([1]);
      expect(ys.all()).toEqual([1]);

      expect(xs.shift()).toEqual(1);
      expect(xs.all()).toEqual([]);
      expect(ys.all()).toEqual([]);
    });
  });

  describe('move', function() {
    it('should move the element to the index before its target', function() {
      let xs = rx.array([1, 2, 3, 4]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      xs.move(0, 1);
      expect(xs.all()).toEqual([1, 2, 3, 4]);
      expect(ys.all()).toEqual([1, 2, 3, 4]);
      xs.move(0, 3);
      expect(xs.all()).toEqual([2, 3, 1, 4]);
      expect(ys.all()).toEqual([2, 3, 1, 4]);
      xs.move(2, 4);
      expect(xs.all()).toEqual([2, 3, 4, 1]);
      expect(ys.all()).toEqual([2, 3, 4, 1]);
      xs.move(3, 0);
      expect(xs.all()).toEqual([1, 2, 3, 4]);
      expect(ys.all()).toEqual([1, 2, 3, 4]);
    });

    it('do nothing if the indices are the same', function() {
      let xs = rx.array([1, 2, 3, 4]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      return [0, 1, 2, 3].forEach(function(i) {
        xs.move(i, i);
        expect(xs.all()).toEqual([1, 2, 3, 4]);
        expect(ys.all()).toEqual([1, 2, 3, 4]);});
    });

    it('should throw an error if the target index is greater than @length', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.move(0, 5)).toThrow();
    });

    it('should throw an error if the target index is less than 0', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.move(2, -1)).toThrow();
    });

    it('should throw an error if the source index is greater than length', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.move(4, 0)).toThrow();
    });

    it('should throw an error if the source index is less than 0', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.move(-1, 2)).toThrow();
    });
  });

  describe('swap', function() {
    it('should swap elements at the specified indices', function() {
      let xs = rx.array([1, 2, 3, 4]);
      let ys = rx.cellToArray(bind(() => xs.all()));

      xs.swap(0, 3);
      expect(xs.all()).toEqual([4, 2, 3, 1]);
      expect(ys.all()).toEqual([4, 2, 3, 1]);

      xs.swap(3, 0);
      expect(xs.all()).toEqual([1, 2, 3, 4]);
      expect(ys.all()).toEqual([1, 2, 3, 4]);

      xs.swap(2, 3);
      expect(xs.all()).toEqual([1, 2, 4, 3]);
      expect(ys.all()).toEqual([1, 2, 4, 3]);
    });

    it('do nothing if the indices are the same', function() {
      let xs = rx.array([1, 2, 3, 4]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      return [0, 1, 2, 3].forEach(function(i) {
        xs.move(i, i);
        expect(xs.all()).toEqual([1, 2, 3, 4]);
        expect(ys.all()).toEqual([1, 2, 3, 4]);});
    });

    it('should throw an error if the target index is greater than @length', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.swap(0, 4)).toThrow();
    });

    it('should throw an error if the target index is less than 0', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.swap(2, -1)).toThrow();
    });

    it('should throw an error if the source index is greater or equal to length', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.swap(4, 0)).toThrow();
    });

    it('should throw an error if the source index is less than 0', function() {
      let xs = rx.array([1, 2, 3, 4]);
      expect(() => xs.swap(-1, 2)).toThrow();
    });
  });

  describe('reverse', function() {
    it('should reverse the SrcArray and its new value', function() {
      let xs = rx.array([4, 3, 2, 1]);
      let ys = rx.cellToArray(bind(() => xs.all()));
      expect(xs.reverse()).toEqual([1, 2, 3, 4]);
      expect(xs.all()).toEqual([1, 2, 3, 4]);
      expect(ys.all()).toEqual([1, 2, 3, 4]);
    });
    it('should would with an empty array', function() {
      let zs = rx.array([]);
      expect(zs.reverse()).toEqual([]);
      expect(zs.all()).toEqual([]);
    });
  });
});


describe('DepArray', function() {
  let xs, ys;
  let x = (xs = (ys = null));
  beforeEach(function() {
    x = rx.cell([1,2,3]);
    xs = new rx.DepArray(function() { return x.get(); });
    ys = xs.map(x => 2 * x);
  });
  it('should initialize to cell array contents', function() {
    expect(xs.all()).toEqual([1,2,3]);
    expect(ys.all()).toEqual([2,4,6]);
  });
  it('should update in response to cell updates', function() {
    x.set([2,3,4]);
    expect(xs.all()).toEqual([2,3,4]);
    expect(ys.all()).toEqual([4,6,8]);
  });
  it('should capture, react, and cleanup like a regular bind', function() {
    let nums = rx.array([0,1]);
    expect(nums.all()).toEqual([0,1]);

    let mapEvalCount = 0;
    let cleanupCount = 0;
    let bump = rx.cell(5);
    let bumped = nums.map(function(num) {
      mapEvalCount += 1;
      rx.onDispose(() => cleanupCount += 1);
      return num + bump.get();
    });
    expect(bumped.all()).toEqual([5,6]);
    bump.set(3);
    expect(bumped.all()).toEqual([3,4]);

    let noCapture = bind(function() {
      let bumpDup = bind(() => bump.get());
      bumped = nums.map(num => num + bump.get());
      return 0;
    });
    rx.autoSub(noCapture.onSet, rx.skipFirst(function() { throw new Error(); }));
    bump.set(2);
    nums.push(2);
    expect(noCapture.get()).toBe(0);

    let startCleanupCount = cleanupCount;
    nums.removeAt(2);
    expect(cleanupCount).toBe(startCleanupCount + 1);

    let startMapEvalCount = mapEvalCount;
    nums.push(2);
    expect(mapEvalCount).toBe(startMapEvalCount + 1);

    startMapEvalCount = mapEvalCount;
    nums.put(2,4);
    expect(mapEvalCount).toBe(startMapEvalCount + 1);

    mapEvalCount = 0;
    bump.set(0);
    expect(mapEvalCount).toBe(3);
  });
});

describe('Recorder.depsEvsMap', function() {
  it('should track the dependency tree', function() {
    let a = rx.cell(5);
    let b = rx.cell(4);
    let c = rx.cell(3);
    let d = rx.cell(2);
    let e = rx.cell(1);
    let x = bind(() => a.get() * b.get());
    let y = bind(() => b.get() * c.get());
    let z = bind(() => d.get() * e.get());
    let f = () => x.get() + y.get() + z.get() + x.get();
    let res = bind(f);
    let resplus = bind(() => res.get() + b.get());
    let resplusplus = bind(() => resplus.get() + b.get());
    let triangle = bind(() => x.get() + a.get());
    let arr = new rx.DepArray(function() { return [a.get(), x.get(), y.get(), z.get()]; });
    b.set(3);
    expect(res.raw()).toEqual(snap(f));
    rx.transaction(function() {
      a.set(4);
      a.set(6);
      b.set(5);
      c.set(4);
      d.set(3);
      return e.set(2);
    });
    expect(res.raw()).toEqual(snap(f));
    expect(resplus.raw()).toEqual(snap(() => f() + b.get()));
    expect(resplusplus.raw()).toEqual(snap(() => f() + (b.get() * 2)));
    expect(triangle.raw()).toEqual(snap(() => x.get() + a.get()));
  });

  it('should not run in exponential time', function() {
    let a = rx.cell(0);
    let inc = rx.cell(1);
    let b = bind(() => a.get() + inc.get());
    let c = bind(() => a.get() + inc.get());
    let d = bind(() => b.get() + c.get());
    let e = bind(() => d.get() + inc.get());
    let f = bind(() => d.get() + inc.get());
    let g = bind(() => e.get() + f.get());
    let h = bind(() => g.get() + inc.get());
    let i = bind(() => g.get() + inc.get());
    let j = bind(() => h.get() + i.get());
    let k = bind(() => j.get() + inc.get());
    let l = bind(() => j.get() + inc.get());
    let m = bind(() => j.get() + inc.get());
    let func = () => k.get() + l.get() + m.get();
    let n = bind(func);
    a.set(1);
    expect(b.raw()).toBe(2);
    expect(d.raw()).toBe(4);
    expect(g.raw()).toBe(10);
    expect(j.raw()).toBe(22);
    expect(n.raw()).toBe(69);
    expect(n.raw()).toBe(snap(() => func()));
    return inc.set(0);
  });

  describe('crazy diamond shapes', function() {
    // this reverses the order binds are stored, to let us test shapes like
    //   A
    //   |\
    //   | B
    //   |/
    //   C
    // These are relatively difficult to construct due to the need to instantiate B before C.
    let reverseBinds = c => c.onSet.downstreamCells = new Set(Array.from(c.onSet.downstreamCells).reverse());
    it('should work with left triangle', function() {
      let a = rx.cell(0);
      let b = bind(() => a.get() * 2);
      let c = bind(() => a.get() + b.get());
      expect(a.onSet.downstreamCells).toEqual(new Set([b, c]));

      let marker = {};
      let counter = 0;

      rx.autoSub(b.onSet, rx.skipFirst(() => marker.b = ++counter));
      rx.autoSub(c.onSet, rx.skipFirst(() => marker.c = ++counter));
      a.set(1);
      expect(b.raw()).toBe(2);
      expect(c.raw()).toBe(3);
      // ensure b executes before c
      expect(marker.b).toBe(1);
      expect(marker.c).toBe(2);

      reverseBinds(a);
      expect(a.onSet.downstreamCells).toEqual(new Set([c, b]));

      counter = 0;
      a.set(2);
      expect(b.raw()).toBe(4);
      expect(c.raw()).toBe(6);
      // ensure b executes before c
      expect(marker.b).toBe(1);
      expect(marker.c).toBe(2);
    });
    it('should work with right triangle', function() {
      let a = rx.cell(0);
      let b = bind(() => a.get() * 2);
      let c = bind(() => a.get() + b.get());
      a.set(1);
      expect(b.raw()).toBe(2);
      expect(c.raw()).toBe(3);
    });
    it('should work with diamond', function() {
      let a = rx.cell(0);
      let b = bind(() => a.get() * 2);
      let c = bind(() => a.get() * 3);
      let d = bind(() => b.get() + c.get());
      a.set(1);
      expect(b.raw()).toBe(2);
      expect(c.raw()).toBe(3);
      expect(d.raw()).toBe(5);
    });
    it('should work with k5', function() {
      let a = rx.cell(0);
      let b = bind(() => a.get() * 2);
      let c = bind(() => a.get() * b.get());
      let d = bind(() => a.get() * b.get() * c.get());
      let e = bind(() => (bind(() => (bind(() => a.get() * b.get())).get() * c.get() * d.get())).get() + d.get());
      a.set(1);
      expect(b.raw()).toBe(2);
      expect(c.raw()).toBe(2);
      expect(d.raw()).toBe(4);
      expect(e.raw()).toBe(20);
      reverseBinds(a);
      a.set(0);
      [b,c,d,e].map(cell => expect(cell.raw()).toBe(0));
      a.set(1);
      expect(b.raw()).toBe(2);
      expect(c.raw()).toBe(2);
      expect(d.raw()).toBe(4);
      expect(e.raw()).toBe(20);
    });
  });
});

describe('ObsMap', function() {
  let a, all, b, cb, cbA, cbAll, cbB, cbHasA, cbHasB, cbSize, hasA, hasB, size, x;
  beforeEach(function() {
    x = rx.map({a:0});
    cb = jasmine.createSpy('cb');
    a = bind(() => x.get('a'));
    b = bind(() => x.get('b'));
    hasA = bind(() => x.has('a'));
    hasB = bind(() => x.has('b'));
    all = bind(() => x.all());
    size = bind(() => x.size());
    cbA = jasmine.createSpy('cbA');
    cbB = jasmine.createSpy('cbB');
    cbHasA = jasmine.createSpy('cbHasA');
    cbHasB = jasmine.createSpy('cbHasB');
    cbAll = jasmine.createSpy('all');
    cbSize = jasmine.createSpy('size');
    rx.autoSub(a.onSet, cbA);
    rx.autoSub(b.onSet, cbB);
    rx.autoSub(hasA.onSet, cbHasA);
    rx.autoSub(hasB.onSet, cbHasB);
    rx.autoSub(all.onSet, cbAll);
    rx.autoSub(size.onSet, cbAll);
    cbA.calls.reset();
    cbB.calls.reset();
    cbHasA.calls.reset();
    cbHasB.calls.reset();
    cbAll.calls.reset();
    return cbSize.calls.reset();
  });
  describe('events', function() {
    it('should fire onChange event for replaced keys', function() {
      rx.autoSub(x.onChange, map => cb(map));
      expect(x.put('a', 1)).toBe(0);
      expect(Array.from(cb.calls.mostRecent().args[0])).toEqual([['a', [0,1]]]);
      expect(cb.calls.mostRecent().args.length).toEqual(1);
      expect(x.put('a', 2)).toBe(1);
      expect(Array.from(cb.calls.mostRecent().args[0])).toEqual([['a', [1,2]]]);
      expect(cb.calls.mostRecent().args.length).toEqual(1);
    });
    it('should not fire onChange event if value does not change', function() {
      rx.autoSub(x.onChange, cb);
      cb.calls.reset();
      x.put('a', 0);
      expect(cb).not.toHaveBeenCalled();
    });
    it('should fire onAdd event for new keys', function() {
      rx.autoSub(x.onAdd, cb);
      cb.calls.reset();
      x.put('b', 2);
      expect(Array.from(cb.calls.mostRecent().args[0])).toEqual([['b', 2]]);
      expect(cb.calls.mostRecent().args.length).toEqual(1);
    });
    it('should not fire onAdd event for existing keys', function() {
      rx.autoSub(x.onAdd, cb);
      cb.calls.reset();
      x.put('a', 0);
      expect(cb).not.toHaveBeenCalled();
      x.put('a', 1);
      expect(cb).not.toHaveBeenCalled();
    });
    it('should fire onRemove event for deleted keys', function() {
      rx.autoSub(x.onRemove, cb);
      cb.calls.reset();
      x.remove('a');
      expect(Array.from(cb.calls.mostRecent().args[0])).toEqual([['a', 0]]);
      expect(cb.calls.mostRecent().args.length).toBe(1);
    });
    it('should not fire onRemove event if key is not in Map', function() {
      rx.autoSub(x.onRemove, cb);
      cb.calls.reset();
      x.remove('nope');
      expect(cb).not.toHaveBeenCalled();
    });
  });
  describe('binds', function() {
    it('should re-evaluate .get() binds on any change', function() {
      expect(a.get()).toBe(0);
      expect(b.get()).toBeUndefined();
      x.put('a', 1);
      expect(a.get()).toBe(1);
      expect(b.get()).toBeUndefined();
      x.put('b', 2);
      expect(a.get()).toBe(1);
      expect(b.get()).toBe(2);
      x.remove('a');
      expect(a.get()).toBeUndefined();
      expect(b.get()).toBe(2);
    });
    it('should not re-evaluate binds on no-ops', function() {
      x.put('a', 0);
      x.remove('b');
      expect(cbA).not.toHaveBeenCalled();
      expect(cbB).not.toHaveBeenCalled();
      expect(cbAll).not.toHaveBeenCalled();
      expect(cbHasA).not.toHaveBeenCalled();
      expect(cbHasB).not.toHaveBeenCalled();
      expect(cbSize).not.toHaveBeenCalled();
      expect(a.get()).toBe(0);
      expect(b.get()).toBe(undefined);
      expect(hasA.get()).toBe(true);
      expect(hasB.get()).toBe(false);
      expect(Array.from(all.get())).toEqual([['a', 0]]);
      expect(size.get()).toEqual(1);
    });
    it('should re-evaluate .has() or .size() binds on any additions and removals', function() {
      expect(hasA.get()).toBe(true);
      expect(hasB.get()).toBe(false);
      expect(size.get()).toBe(1);
      x.remove('a');
      expect(hasA.get()).toBe(false);
      expect(size.get()).toBe(0);
      x.put('b', 42);
      expect(hasB.get()).toBe(true);
      expect(size.get()).toBe(1);
      x.put({}, 50);
      expect(size.get()).toBe(2);
    });
    it('should not re-evaluate .has() or .size() binds when keys are not added or removed', function() {
      x.put('a', 42);
      x.remove('b');
      expect(cbHasA).not.toHaveBeenCalled();
      expect(cbHasB).not.toHaveBeenCalled();
      expect(cbSize).not.toHaveBeenCalled();
    });
    it('should re-evaluate .all() binds on any change', function() {
      expect(snap(() => Array.from(all.get()))).toEqual([['a', 0]]);
      x.put('a', 1);
      expect(snap(() => Array.from(all.get()))).toEqual([['a', 1]]);
      x.put('b', 2);
      expect(snap(() => Array.from(all.get()))).toEqual([['a', 1], ['b', 2]]);
      x.remove('a');
      expect(snap(() => Array.from(all.get()))).toEqual([['b', 2]]);
    });
  });
  describe('SrcMap mutations', function() {
    it('should support update() via object, pair array, and Map', function() {
      let called = {};
      rx.autoSub(a.onSet, function(...args) { let [o,n] = Array.from(args[0]); return called.a = [o,n]; });
      rx.autoSub(b.onSet, function(...args) { let [o,n] = Array.from(args[0]); return called.b = [o,n]; });
      expect(a.get()).toBe(0);
      expect(called.a).toEqual([null, 0]);
      expect(snap(() => Array.from(x.update({a: 1, b: 2})))).toEqual([['a', 0]]);
      expect(a.get()).toBe(1);
      expect(b.get()).toBe(2);
      expect(called.a).toEqual([0, 1]);
      expect(snap(() => Array.from(x.update({a: 0, b: 1})))).toEqual([['a', 1], ['b', 2]]);
      let expected = [['a', 0], ['b', 1]];
      expect(Array.from(snap(() => x.all()))).toEqual(expected);
      expect(Array.from(x.update([['b', 2], ['c', 3]]))).toEqual(expected);
      expect(called.a).toEqual([0, undefined]);
      expect(called.b).toEqual([1, 2]);
      expected = [['b', 2], ['c', 3]];
      expect(Array.from(snap(() => x.all()))).toEqual(expected);
      expect(Array.from(snap(() => x.update(new Map([[]]))))).toEqual(expected);
    });
    it('should support put', function() {
      expect(x.put('a', 1)).toBe(0);
      expect(x.put('a', 2)).toBe(1);
      expect(x.put('b', 10)).toBe(undefined);
      expect(x.put('b', 20)).toBe(10);
    });
    it('should support remove', function() {
      expect(x.remove('a')).toBe(0);
      expect(x.remove('b')).toBe(undefined);
    });
    it('should support clear', function() {
      rx.autoSub(x.onRemove, cb);
      cb.calls.reset();
      expect(snap(() => Array.from(x.clear()))).toEqual([['a', 0]]);
      cb.calls.reset();
      expect(snap(() => Array.from(x.clear()))).toEqual([]);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  it('should support non-string keys', function() {
    let obj = {zzz: 777};
    x.put(obj, 888);
    expect(x.get(obj)).toBe(888);
    expect(x.has(obj)).toBe(true);
    x.remove(obj);
    expect(x.has(obj)).toBe(false);
    x.update([[obj, 999]]);
    expect(x.get(obj)).toBe(999);
    expect(x.has(obj)).toBe(true);
  });
  describe('initialization', function() {
    it('should support initialization by object', function() {
      let y = rx.map({a: 0, b: 1});
      expect(Array.from(y.all())).toEqual([['a', 0], ['b', 1]]);
    });
    it('should support initialization by array of pairs', function() {
      let arr = [];
      let y = rx.map([['a', 42], [arr, 0]]);
      expect(Array.from(y.all())).toEqual([['a', 42], [arr, 0]]);
    });
    it('should support initialization by Map', function() {
      let arr = [];
      let y = rx.map(new Map([['a', 42], [arr, 0]]));
      expect(Array.from(y.all())).toEqual([['a', 42], [arr, 0]]);
    });
  });
});


describe('ObsSet', function() {
  let all, cb, cbAll, cbHasA, cbHasB, cbSize, hasA, hasB, size;
  let x = (cb = (all = (hasA = (hasB = (size = (cbHasA = (cbHasB = (cbAll = (cbSize = null)))))))));
  beforeEach(function() {
    x = rx.set(['a']);
    cb = jasmine.createSpy('cb');
    hasA = bind(() => x.has('a'));
    hasB = bind(() => x.has('b'));
    all = bind(() => x.all());
    size = bind(() => x.size());
    cbHasA = jasmine.createSpy('cbHasA');
    cbHasB = jasmine.createSpy('cbHasB');
    cbAll = jasmine.createSpy('all');
    cbSize = jasmine.createSpy('size');
    rx.autoSub(hasA.onSet, cbHasA);
    rx.autoSub(hasB.onSet, cbHasB);
    rx.autoSub(all.onSet, cbAll);
    rx.autoSub(size.onSet, cbSize);
    cbHasA.calls.reset();
    cbHasB.calls.reset();
    cbAll.calls.reset();
    return cbSize.calls.reset();
  });
  describe('events', function() {
    it('should fire onChange event for new keys', function() {
      rx.autoSub(x.onChange, cb);
      cb.calls.reset();
      x.put('b');
      expect(cb.calls.mostRecent().args).toEqual([[new Set(['b']), new Set()]]);
    });
    it('should not fire onChange event for existing keys', function() {
      rx.autoSub(x.onChange, cb);
      cb.calls.reset();
      x.put('a');
      expect(cb).not.toHaveBeenCalled();
      x.put('a');
      expect(cb).not.toHaveBeenCalled();
    });
    it('should fire onChange event for deleted keys', function() {
      rx.autoSub(x.onChange, cb);
      cb.calls.reset();
      x.remove('a');
      expect(cb.calls.mostRecent().args).toEqual([[new Set(), new Set(['a'])]]);
    });
    it('should not fire onChange event if key is not in Set', function() {
      rx.autoSub(x.onChange, cb);
      cb.calls.reset();
      x.remove('nope');
      expect(cb).not.toHaveBeenCalled();
    });
  });
  describe('binds', function() {
    it('should not re-evaluate .all() binds on no-ops', function() {
      x.put('a');
      x.remove('b');
      expect(cbAll).not.toHaveBeenCalled();
      expect(all.get()).toEqual(new Set(['a']));
    });
    it('should re-evaluate .has() and .size() binds on any additions and removals', function() {
      expect(hasA.get()).toBe(true);
      expect(hasB.get()).toBe(false);
      expect(size.get()).toBe(1);
      x.remove('a');
      expect(size.get()).toBe(0);
      expect(hasA.get()).toBe(false);
      x.put('b');
      expect(hasB.get()).toBe(true);
      expect(size.get()).toBe(1);
      x.put({a: 42});
      expect(size.get()).toBe(2);
    });
    it('should re-evaluate .all() binds on any change', function() {
      expect(all.get()).toEqual(new Set(['a']));
      x.put('b');
      expect(all.get()).toEqual(new Set(['a', 'b']));
      x.remove('a');
      expect(all.get()).toEqual(new Set(['b']));
    });
  });
  describe('SrcSet mutations', function() {
    it('should support update', function() {
      expect(x.update(['zzzyx', 42])).toEqual(new Set(['a']));
      expect(x.update(new Set('xkcd'))).toEqual(new Set(['zzzyx', 42]));
    });
    it('should support put', function() {
      expect(x.put(42)).toBe(42);
      expect(x.has(42)).toBe(true);
      expect(x.put(42)).toBe(42);
      expect(x.has(42)).toBe(true);
      expect(x.put(43)).toBe(43);
      expect(x.has(42)).toBe(true);
      expect(x.has(43)).toBe(true);
    });
    it('should support remove', () => expect(x.remove('a')).toBe('a'));
  });
  it('should support non-string values', function() {
    let obj = {zzz: 777};
    x.put(obj);
    expect(x.has(obj)).toBe(true);
    x.remove(obj);
    expect(x.has(obj)).toBe(false);
  });
});

function setContentsEqual(set1, set2) {
  let x = _.sortBy(Array.from(set1), JSON.stringify);
  let y = _.sortBy(Array.from(set2), JSON.stringify);
  expect(x).toEqual(y);
}

describe('ObsSet operations', function() {
  let y, z;
  let x = (y = (z = null));
  beforeEach(function() {
    x = rx.set(['a', 'c', []]);
    y = rx.set(['a', {}, 'b']);
    z = new Set(['a', {}, 'b']);
  });
  it('should support union', function() {
    const reactive = x.union(y);
    const simple = x.union(z);
    setContentsEqual(reactive.all(), new Set(['a', 'b', 'c', {}, []]));
    setContentsEqual(simple.all(), new Set(['a', 'b', 'c', {}, []]));
    x.put(42);
    setContentsEqual(reactive.all(), new Set([42, 'a', 'b', 'c', {}, []]));
    setContentsEqual(simple.all(), new Set([42, 'a', 'b', 'c', {}, []]));
    y.put(42);
    setContentsEqual(reactive.all(), new Set([42, 'a', 'b', 'c', {}, []]));
    setContentsEqual(simple.all(), new Set([42, 'a', 'b', 'c', {}, []]));
    x.put(50);
    setContentsEqual(reactive.all(), new Set([42, 50, 'a', 'b', 'c', {}, []]));
    setContentsEqual(simple.all(), new Set([42, 50, 'a', 'b', 'c', {}, []]));
    y.put(60);
    setContentsEqual(reactive.all(), new Set([60, 42, 50, 'a', 'b', 'c', {}, []]));
    setContentsEqual(simple.all(), new Set([42, 50, 'a', 'b', 'c', {}, []]));
  });
  it('should support intersection', function() {
    const reactive = x.intersection(y);
    const simple = x.intersection(z);
    setContentsEqual(reactive.all(), new Set(['a']));
    setContentsEqual(simple.all(), new Set(['a']));
    x.put(42);
    setContentsEqual(reactive.all(), new Set(['a']));
    setContentsEqual(simple.all(), new Set(['a']));
    y.put(42);
    setContentsEqual(reactive.all(), new Set([42, 'a']));
    setContentsEqual(simple.all(), new Set(['a']));
    x.put(50);
    setContentsEqual(reactive.all(), new Set([42, 'a']));
    setContentsEqual(simple.all(), new Set(['a']));
    y.put(60);
    setContentsEqual(reactive.all(), new Set([42, 'a']));
    setContentsEqual(simple.all(), new Set(['a']));
  });
  it('should support difference', function() {
    const reactive = x.difference(y);
    const simple = x.difference(z);
    setContentsEqual(reactive.all(), new Set(['c', []]));
    setContentsEqual(simple.all(), new Set(['c', []]));
    x.put(42);
    setContentsEqual(reactive.all(), new Set(['c', 42, []]));
    setContentsEqual(simple.all(), new Set(['c', 42, []]));
    y.put(42);
    setContentsEqual(reactive.all(), new Set(['c', []]));
    setContentsEqual(simple.all(), new Set(['c', 42, []]));
    x.put(50);
    setContentsEqual(reactive.all(), new Set(['c', 50, []]));
    setContentsEqual(simple.all(), new Set(['c', 42, 50, []]));
    y.put(60);
    setContentsEqual(reactive.all(), new Set(['c', 50, []]));
    setContentsEqual(simple.all(), new Set(['c', 42, 50, []]));
  });
  it('should support symmetricDifference', function() {
    const reactive = x.symmetricDifference(y);
    const simple = x.symmetricDifference(z);
    setContentsEqual(reactive.all(), new Set(['c', [], {}, 'b']));
    setContentsEqual(simple.all(), new Set(['c', [], {}, 'b']));
    x.put(42);
    setContentsEqual(reactive.all(), new Set(['c', [], 42, {}, 'b']));
    setContentsEqual(simple.all(), new Set(['c', [], {}, 42, 'b']));
    y.put(42);
    setContentsEqual(reactive.all(), new Set(['c', [], {}, 'b']));
    setContentsEqual(simple.all(), new Set(['c', [], {}, 42, 'b']));
    x.put(50);
    setContentsEqual(reactive.all(), new Set(['c', 50, [], {}, 'b']));
    setContentsEqual(simple.all(), new Set([50, 'c', [], {}, 42, 'b']));
    y.put(60);
    setContentsEqual(reactive.all(), new Set(['c', 50, [], {},  60, 'b']));
    setContentsEqual(simple.all(), new Set([50, 'c', [], {}, 42, 'b']));
  });
});

describe('nested bindings', function() {
  let a, b, elt, innerDisposed;
  let x = (a = (b = (elt = null)));
  let outerDisposed = (innerDisposed = false);
  beforeEach(function() {
    outerDisposed = (innerDisposed = false);
    x = rx.cell('');
    a =
      bind(function() {
        bind(function() {
          rx.onDispose(() => innerDisposed = true);
          return x.get();
        });
        rx.onDispose(() => outerDisposed = true);
        return x.get();
      });
    b = bind(function() {
      bind(() => x.get());
      bind(function() {
        bind(() => x.get());
        return x.get();
      });
      return x.get();
    });
  });
  it('should not leak memory via subscription references', function() {
    expect(innerDisposed).toBe(false);
    expect(outerDisposed).toBe(false);
    let nsubs0 = x.onSet.subs.size;
    x.set(' ');
    expect(innerDisposed).toBe(true);
    expect(outerDisposed).toBe(true);
    let nsubs1 = x.onSet.subs.size;
    x.set('  ');
    let nsubs2 = x.onSet.subs.size;
    expect(nsubs0).toBe(nsubs1);
    expect(nsubs0).toBe(nsubs2);
    x.set('   ');
    let nsubs3 = x.onSet.subs.size;
    expect(nsubs0).toBe(nsubs3);
  });
});

describe('onDispose', function() {
  it('should not die even outside any bind context', () => rx.onDispose(() => expect(false).toBe(true)));
  it('should not fire after context is disposed', function() {
    let x = rx.cell();
    let y = bind(function() {
      let counter = 0;
      rx.onDispose(() => expect(counter += 1).toBe(1));
      return x.get();
    });
    x.set(0);
    return x.set(1);
  });
});

describe('reactify', function() {
  let deck, lastIsFlipped;
  let cards = (deck = null);
  let lastInDeckIsFlipped = (lastIsFlipped = null);
  let operate = null;
  class Card {
    constructor(isFlipped) {
      this.isFlipped = isFlipped != null ? isFlipped : false;
      rx.autoReactify(this);
    }
  }
  class Deck {
    constructor() {
      this.cards = [new Card(), new Card()];
      rx.autoReactify(this);
    }
  }
  beforeEach(function() {
    cards = rx.reactify([new Card(), new Card()]);
    deck = new Deck();
    operate = function(cards) {
      let card = cards[cards.length - 1];
      return card.isFlipped = !card.isFlipped;
    };
    lastIsFlipped = bind(() => cards[cards.length - 1].isFlipped);
    return lastInDeckIsFlipped = bind(() => deck.cards[deck.cards.length - 1].isFlipped);
  });
  it('should make object fields reactive', function() {
    expect(lastIsFlipped.get()).toBe(false);
    expect(lastInDeckIsFlipped.get()).toBe(false);
    operate(cards);
    expect(lastIsFlipped.get()).toBe(true);
    expect(lastInDeckIsFlipped.get()).toBe(false);
    operate(deck.cards);
    expect(lastIsFlipped.get()).toBe(true);
    expect(lastInDeckIsFlipped.get()).toBe(true);
  });
  it('should make array fields reactive', function() {
    deck.cards.push(new Card(true));
    expect(lastInDeckIsFlipped.get()).toBe(true);
  });
  it('should not make non-field arrays reactive', function() {
    cards.push(new Card(true));
    expect(lastIsFlipped.get()).toBe(false);
  });
  it('should make array field sets do a full replacement', function() {
    deck.cards = [new Card(true)];
    expect(lastInDeckIsFlipped.get()).toBe(true);
    deck.cards = [new Card(false)];
    expect(lastInDeckIsFlipped.get()).toBe(false);
  });
  it('should give back the same fields it was given', function() {
    let options = {one: 'hello', two: 'world'};
    rx.autoReactify(options);
    expect(options.one).toBe('hello');
    expect(options.two).toBe('world');
  });
  it('should leave observables unchanged', function() {
    let x = {one: 'hello', two: 'world', three: (bind(() => 0)), four: rx.array([1,2])};
    let origThree = x.three;
    let origFour = x.four;
    rx.autoReactify(x);
    expect(x.one).toBe('hello');
    expect(x.two).toBe('world');
    expect(x.three).toBe(origThree);
    expect(x.four).toBe(origFour);
  });
});

describe('flatten', function() {
  let i, mapped, xs, ys;
  let flattened = (mapped = (xs = (ys = (i = null))));
  beforeEach(function() {
    xs = rx.array(['b','c']);
    ys = rx.array(['E','F']);
    i = rx.cell('i');
    let zset = rx.set(['X', 'K', [], 'C', 'D', [new Set(['XKCD!'])]]);
    new Set([50]);
    flattened = rx.flatten([
      'A',
      xs.map(x => x.toUpperCase()),
      'D',
      ys.map(y => y),
      ['G','H'],
      bind(() => i.get().toUpperCase()),
      zset.all()
    ]);
    return mapped = flattened.map(x => x.toLowerCase());
  });
  it('should flatten and react to observables', function() {
    expect(flattened.all()).toEqual(['A','B','C','D','E','F','G','H','I','X','K','C','D','XKCD!']);
    expect(mapped.all()).toEqual(['a','b','c','d','e','f','g','h','i','x','k','c','d','xkcd!']);
    i.set('j');
    expect(flattened.all()).toEqual(['A','B','C','D','E','F','G','H','J','X','K','C','D','XKCD!']);
    expect(mapped.all()).toEqual(['a','b','c','d','e','f','g','h','j','x','k','c','d','xkcd!']);
    ys.push('f');
    expect(flattened.all()).toEqual(['A','B','C','D','E','F','f','G','H','J','X','K','C','D','XKCD!']);
    expect(mapped.all()).toEqual(['a','b','c','d','e','f','f','g','h','j','x','k','c','d','xkcd!']);
  });
  // # todo: figure out alternate way to test
  // it('should not flatten jQuery objects (which are array-like)', function() {
  //   flattened = rx.flatten([
  //     $('body'),
  //     bind(() => $('<div/>'))
  //   ]);
  //   expect(flattened.at(0).is('body')).toBe(true);
  //   expect(flattened.at(1).is('div')).toBe(true);
  // });
  it('should remove undefineds/nulls (for convenient conditionals)', function() {
    flattened = rx.flatten([
      1,
      rx.cell(),
      undefined,
      [undefined],
      bind(() => undefined),
      rx.array([null]),
      2
    ]);
    expect(flattened.all()).toEqual([1,2]);
  });
  it('should flatten recursively', function() {
    flattened = rx.flatten([
      1,
      rx.cell(),
      rx.cell([rx.array([42]), [500, undefined, rx.set([800])], [null, new Set([null])]]),
      undefined,
      [undefined],
      bind(() => undefined),
      rx.array([null]),
      rx.array([
        rx.array(["ABC"]),
        rx.array([rx.array(["DEF"]), ["GHI"]]), [null], rx.array([[null]])]),
      "XYZ",
      2
    ]);
    expect(snap(() => flattened.all())).toEqual([
      1, 42, 500, 800, "ABC", "DEF", "GHI", "XYZ", 2
    ]);
  });
});

describe('Ev', () =>
  it('should support scoped subscription', function() {
    let ev = new Ev();
    let n = 0;
    let hits = 0;
    let listener = function(x) {
      hits += 1;
      expect(x).toBe(n);
    };
    ev.pub(n += 1);
    ev.scoped(listener, function() {
      ev.pub(n += 1);
      return ev.pub(n += 1);
    });
    ev.pub(n += 1);
    expect(hits).toBe(2);
  })
);

describe('mutating', function() {
  it('should not emit warnings if wrapped in a hideMutationWarnings block', function() {
    let warnSpy = jasmine.createSpy('warn1');
    let oldWarningFn = rx._recorder.fireMutationWarning;
    rx._recorder.fireMutationWarning = warnSpy;
    let a = rx.cell(0);
    let b = rx.cell(2);
    expect(warnSpy).not.toHaveBeenCalled();
    let c = bind(() => rx.hideMutationWarnings(function() {
      b.set(rx.snap(() => b.get() + 1));
      return a.get() * 2;
    })
     );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(rx.snap(() => c.get())).toBe(0);
    expect(rx.snap(() => b.get())).toBe(3);

    a.set(2);
    expect(rx.snap(() => c.get())).toBe(4);
    expect(warnSpy).not.toHaveBeenCalled();
    return rx._recorder.fireMutationWarning = oldWarningFn;
  });

  it('should otherwise fire a warning', function() {
    let warnSpy = jasmine.createSpy('warn2');
    let oldWarningFn = rx._recorder.fireMutationWarning;
    rx._recorder.fireMutationWarning = warnSpy;
    let a = rx.cell(0);
    let b = rx.cell(2);
    expect(warnSpy).not.toHaveBeenCalled();
    let c = bind(function() {
      b.set(rx.snap(() => b.get() + 1));
      return a.get() * 2;
    });
    expect(warnSpy.calls.count()).toBe(1);
    expect(rx.snap(() => c.get())).toBe(0);
    expect(rx.snap(() => b.get())).toBe(3);
    a.set(2);
    expect(rx.snap(() => c.get())).toBe(4);
    expect(warnSpy.calls.count()).toBe(2);
    return rx._recorder.fireMutationWarning = oldWarningFn;
  });
});


describe('nested mutations', function() {
  it('should not complain about directly nested mutations in dependent binds of dependent binds', function() {
    let a = rx.cell(0);
    let b = rx.cell();
    let aa = bind(() => b.set(a.get()));
    let aaa = bind(() => b.set(aa.get()+1));
    a.set(0);
    expect(aaa.get()).toBe(0);
  });
  it('should not complain about directly nested mutations in listeners', function() {
    let a = rx.cell();
    let b = rx.cell();
    a.onSet.sub(function(...args) { let [old,val] = Array.from(args[0]); return b.set(val); });
    expect(() => a.set(0)).not.toThrow();
  });
});

describe('snap', () =>
  it('should shield from enclosing bind', function() {
    let runs = [];
    let x = rx.cell();
    let y = bind(function() {
      y = snap(() => x.get());
      runs.push(null);
      return y;
    });
    expect(runs.length).toBe(1);
    expect(y.get()).toBeNull();
    x.set(0);
    expect(runs.length).toBe(1);
    expect(y.get()).toBeNull();
  })
);

describe('skipFirst', () =>
  it('should skip first', function() {
    let x = rx.cell();
    let xs = [];
    x.onSet.sub(rx.skipFirst(function(...args) { let [o,n] = Array.from(args[0]); return xs.push(n); }));
    expect(xs.length).toBe(0);
    x.set(true);
    expect(xs.length).toBe(1);
    expect(xs[0]).toBe(true);
    x.set(false);
    expect(xs.length).toBe(2);
    expect(xs[1]).toBe(false);
  })
);

describe('asyncBind', function() {
  describe('synchronous tests', function() {
    it('should work synchronously as well', function() {
      let x = rx.cell(0);
      let y = rx.asyncBind('none', function() { return this.done(this.record(() => x.get())); });
      expect(y.get()).toBe(0);
      x.set(1);
      expect(y.get()).toBe(1);
    });
    it('should not be a SrcCell', function() {
      let x = rx.cell(0);
      let y = rx.asyncBind('none', function() { return this.done(x.get()); });
      expect(() => y.set(0)).toThrow();
    });
    it('should enforce one-time record', function() {
      let x = rx.cell(0);
      return rx.asyncBind('none', function() {
        this.record(() => x.get());
        _.defer(() => expect(() => this.done(this.record(() => x.get()))).toThrow());
      });
    });
  });

  describe('asynchronous tests', function() {
    // _.defer essentially enqueues a new task for the JS VM to run.
    // Because we're not using AJAX requests, we can thus use _.defer instead
    // of callback handlers, which would be very tricky to work with here.

    it('should work asynchronously', function() {
      let x = rx.cell(0);
      let y = rx.asyncBind('none', function() {
        _.defer(() => this.done(x.get()));
      });
      expect(y.get()).toBe('none');
      x.set(1);
      expect(y.get()).toBe('none');
      _.defer(() => expect(y.get()).toBe(1));
    });
    it('should work asynchronously with recording at the end', function() {
      let x = rx.cell(0);
      let y = rx.asyncBind('none', function() {
        _.defer(() => this.done(this.record(() => x.get())));
      });
      expect(y.get()).toBe('none');
      x.set(1);
      expect(y.get()).toBe('none');
      _.defer(() => expect(y.get()).toBe(1));
    });
    it('should work asynchronously with recording at the beginning', function() {
      let x = rx.cell(0);
      let y = rx.asyncBind('none', function() {
        let xx = this.record(() => x.get());
        _.defer(() => this.done(xx));
      });
      expect(y.get()).toBe('none');
      x.set(1);
      expect(y.get()).toBe('none');
      _.defer(() => expect(y.get()).toBe(1));
    });
    it('should support @done called from within @record', function() {
      let x = rx.cell();
      let y = rx.cell(1);
      let z = rx.asyncBind('none', function() { return this.record(() => {
        if ((x.get() == null)) { return this.done(0); }
        let sum = x.get() + y.get();
        _.defer(() => this.done(sum));
      });
       });
      let w = bind(() => z.get());
      expect(w.get()).toBe(0);
      _.defer(function() {
        x.set(2);
        _.defer(function() {
          expect(w.get()).toBe(3);
          x.set(5);
          _.defer(() => expect(w.get()).toBe(6));
        });
      });
    });
  });
});

// todo: remove jquery dependency

// describe('promiseBind', () =>
//   it('should work', function() {
//     let sleep = function(wait) {
//       let deferred = $.Deferred();
//       setTimeout(
//         () => deferred.resolve(42 + wait),
//         wait
//       );
//       return deferred.promise();
//     };
//     let waitTime = rx.cell(10);
//     let closure = {};
//     let secretToLife = rx.promiseBind(null, function() {
//       let c = sleep(waitTime.get());
//       closure.callback = c;
//       return c;
//     });
//     expect(secretToLife.get()).toBe(null);
//     return closure.callback.done(function() {
//       expect(secretToLife.get()).toBe === 52;
//       waitTime.set(5);
//       return closure.callback.done(() => expect(secretToLife.get()).toBe(47));
//     });
//   })
// );

describe('lagBind', function() {
  let start, y;
  let x = (y = (start = null));
  beforeEach(function() {
    x = rx.cell(0);
    return y = rx.lagBind(30, 'none', () => x.get());
  });
  it('should remain at init value until the given lag', function() {
    expect(y.get()).toBe('none');
    setTimeout((() => expect(y.get()).toBe('none')), 10);
    return setTimeout((() => expect(y.get()).toBe(0)), 60);
  });
  it('should (after init) update on upstream set by (and not before) the given lag', done =>
    setTimeout(
      function() {
        expect(y.get()).toBe(0);
        x.set(1);
        return setTimeout(
          function() {
            expect(y.get()).toBe(1);
            return done();
          },
          60
        );
      },
      45
    )
  );
  it('should not evaluate as long as new refresh keeps getting scheduled', function() {
    // potentially flaky test :(
    expect(y.get()).toBe('none');
    return setTimeout(
      function() { // nothing we can do before first evaluation
        for (let snooze of [5, 10, 15, 20]) {
          (snooze =>
            setTimeout((function() {
              expect(y.get()).toBe(0);
              return x.set(snooze);
            }), snooze)
          )(snooze);
        }
        return setTimeout(
          () => expect(y.get()).toBe(20),
          60
        );
      },
      30
    );
  });
});

describe('postLagBind', function() {
  let evaled, y;
  let x = (y = (evaled = null));
  beforeEach(function() {
    x = rx.cell(30);
    return y = rx.postLagBind('none', function() {
      let r = {val: x.get(), ms: x.get()};
      return r;
    });
  });
  it('should evaluate immediately but not update value', done =>
    _.defer(function() {
      expect(y.get()).toBe('none');
      return done();
    })
  );
  it('should evaluate by (and not before) the given lag', function(done) {
    expect(snap(() => y.get())).toBe('none');
    x.set(15);
    setTimeout((() => expect(snap(() => y.get())).toBe('none')), 5);
    return setTimeout(
      function() {
        expect(y.get()).toBe(15);
        return done();
      },
      60
    );
  });
  it('should not update as long as new refresh keeps getting scheduled', function(done) {
    for (let snooze of [5, 10, 15, 20]) {
      (snooze =>
        setTimeout((function() {
          expect(y.get()).toBe('none');
          return x.set(snooze);
        }), snooze)
      )(snooze);
    }
    return setTimeout(
      function() {
        expect(y.get()).toBe(20);
        return done();
      },
      60
    );
  });
});

describe('cast', () =>
  it('should work', function() {
    let opts = {
      change() {},
      selected: bind(() => 0),
      label: 'hello',
      options: [1, 2, 3],
      values: bind(() => [1, 2, 3])
    };
    let casted = rx.cast(opts, {
      selected: 'cell',
      label: 'cell',
      options: 'array',
      values: 'array'
    });
    expect(casted.change).toBe(opts.change);
    expect(casted.selected).toBe(opts.selected);
    expect(casted.label.get()).toBe(opts.label);
    expect(casted.options.all()).toEqual(opts.options);
    expect(casted.values.all()).toEqual(opts.values.get());
  })
);

describe('autoSub', () => {
  it('should automatically unsubscribe on bind exit', () => {
    let count = 0;
    let x = rx.cell();
    let y = rx.cell();
    let z = bind(function() {
      rx.autoSub(x.onSet, () => count += 1);
      return y.get();
    });
    x.set(0);
    x.set(1);
    y.set(0);
    x.set(2);
    x.set(3);
    expect(count).toBe(6);
  });
});

describe('subOnce', () => {
  it('should correctly unsubscribe from the event after a single call', () => {
    let x = rx.cell(0);
    let spy = jasmine.createSpy('spy');
    expect(spy.calls.count()).toBe(0);

    rx.subOnce(x.onSet, () => spy());
    expect(spy.calls.count()).toBe(0);
    x.set(1);
    expect(spy.calls.count()).toBe(1);
    x.set(2);
    expect(spy.calls.count()).toBe(1);
    x.set(3);
    expect(spy.calls.count()).toBe(1);
  });
});

describe('cellToMap', () =>
  it('should correctly track changes', function() {
    let x = rx.map({a: 42});
    let y = rx.cellToMap(bind(() => x.all())
    );
    expect(Array.from(rx.snap(() => y.all()))).toEqual([['a', 42]]);
    x.put('b', 17);
    expect(Array.from(rx.snap(() => y.all()))).toEqual([['a', 42], ['b', 17]]);
    x.put('c', 4);
    expect(Array.from(rx.snap(() => y.all()))).toEqual([['a', 42], ['b', 17], ['c', 4]]);
    x.update(new Map([]));
    expect(Array.from(rx.snap(() => y.all()))).toEqual([]);
    let obj = {};
    x.update(new Map([[obj, 0]]));
    expect(Array.from(rx.snap(() => y.all()))).toEqual([[obj, 0]]);
  })
);

describe('cellToSet', () =>
  it('should correctly track changes', function() {
    let obj = {};
    let x = rx.set(['a', obj, 42]);
    let y = rx.cellToSet(bind(() => x.all()));
    expect(Array.from(rx.snap(() => y.all()))).toEqual(['a', obj, 42]);
    x.put('b');
    expect(Array.from(rx.snap(() => y.all()))).toEqual(['a', obj, 42, 'b']);
    x.put('c');
    expect(Array.from(rx.snap(() => y.all()))).toEqual(['a', obj, 42, 'b', 'c']);
    x.update(new Set([]));
    expect(Array.from(rx.snap(() => y.all()))).toEqual([]);
  })
);


describe('cellToArray', function() {
  it('should propagate minimal splices for primitives', function() {
    let x = rx.cell([1,2,3]);
    let y = rx.cell([4,5,6]);
    let z = bind(() => _.flatten([x.get(), y.get()]));
    let zs = rx.cellToArray(z);
    rx.autoSub(zs.onChange, rx.skipFirst(function(...args) {
      let [index, removed, added] = Array.from(args[0]);
      expect([index, removed, added]).toEqual([2, [3], [0]]);
    })
    );
    return x.set([1,2,0]);
  });
  it('should propagate minimal splices for objects', function() {
    let x = rx.cell([1,2,{x:3}]);
    let y = rx.cell([[4],5,'6']);
    let z = bind(() => _.flatten([x.get(), y.get()]));
    let zs = rx.cellToArray(z);
    rx.autoSub(zs.onChange, rx.skipFirst(function(...args) {
      let [index, removed, added] = Array.from(args[0]);
      expect([index, removed, added]).toEqual([2, [{x:3}], [0]]);
    })
    );
    return x.set([1,2,0]);
  });
  it('should not confuse different types', function() {
    let x = rx.cell([1,'1']);
    let y = bind(() => x.get());
    let ys = rx.cellToArray(y);
    rx.autoSub(ys.onChange, rx.skipFirst(function(...args) {
      let [index, removed, added] = Array.from(args[0]);
      expect(false).toBe(true);
    })
    );
    return x.set([1,'1']);
  });
});

describe('DepArray', function() {
  it('should concat arrays efficiently', function() {
    let xs = rx.array([-1]);
    let ys = rx.array();
    let zs = rx.concat(xs, ys);
    rx.autoSub(zs.onChange, function(...args) {
      let [index, removed, added] = Array.from(args[0]);
      expect(zs.all()).toEqual(xs.all().concat(ys.all()));
    });
    xs.push(2);
    ys.insert(5, 0);
    xs.push(4);
    ys.insert(4, 0);
    xs.put(2, 3);
    ys.push(6);
    xs.splice(0, 1, 0, 1);
    return ys.replace([4,5,6,7]);
  });
  it('should behave correctly if the last element is removed', function() {
    let foo = rx.array([1]);
    let bar = rx.cellToArray(bind(() => foo.all())); // easy way to get a DepArray
    expect(bar instanceof rx.DepArray).toBe(true);
    foo.removeAt(0);
    expect(snap(() => foo.all().length)).toBe(0);
    expect(snap(() => bar.all().length)).toBe(0);
  });
});

describe('SrcArray', function() {
  it('should not change anything if remove query not found', function() {
    let xs = rx.array([0]);
    xs.remove(1);
    expect(xs.all()).toEqual([0]);
  });
  it('should issue only minimal events for updates', function() {
    let xs = rx.array([1,2,3]);
    let lastEvent = null;
    xs.onChange.sub(e => lastEvent = e);
    expect(lastEvent).toEqual([0,[],[1,2,3]]);
    lastEvent = null;
    xs.update([1,2,3]);
    expect(lastEvent).toEqual(null);
    lastEvent = null;
    xs.update([1,2]);
    expect(lastEvent).toEqual([2,[3],[]]);
  });
});

describe('ObsArray.indexed', () =>
  it('should update indexes', function() {
    let xs = rx.array(['a','b','c']);
    let ys = xs.indexed().map((x,i) => bind(() => `${x} ${i.get()}`));
    let readYs = () => ys.map(x => x.get()).all();
    expect(readYs()).toEqual(['a 0','b 1','c 2']);
    xs.removeAt(1);
    expect(readYs()).toEqual(['a 0','c 1']);
    xs.insert('B', 1);
    expect(readYs()).toEqual(['a 0','B 1','c 2']);
  })
);

describe('smartUidify', function() {
  it('should return JSON string of scalars', function() {
    expect(rx.smartUidify(0)).toBe('0');
    expect(rx.smartUidify('0')).toBe('"0"');
  });
  it('should attach non-enumerable _rxUid to objects', () =>
    (() => {
      let result = [];
      for (let x of [{}, []]) {
        let uid = rx.smartUidify(x);
        expect(uid).toEqual(jasmine.any(Number));
        expect(_.keys(x)).toEqual([]);
        result.push(expect(x[rx._rxUid]).toBe(uid));
      }
      return result;
    })()
  );
});

describe('lift', function() {
  it('should have no effect on empty objects', () => expect(rx.lift({})).toEqual({}));
  it('should convert POJO attributes to observable ones', function() {
    let x = {x:0, y:[], z:{}, n:null};
    let y = rx.lift(x);
    expect(_.mapObject(y, v => v.all())).toEqual(x);
    expect(y.x).toEqual(jasmine.any(rx.ObsCell));
    expect(y.y).toEqual(jasmine.any(rx.ObsArray));
    expect(y.z).toEqual(jasmine.any(rx.ObsCell));
    expect(y.n).toEqual(jasmine.any(rx.ObsCell));
    expect({
      x:y.x.get(),
      y:y.y.all(),
      z:y.z.get(),
      n:y.n.get()
    }).toEqual({x:0, y:[], z:{}, n:null});
});
  it('should skip over already-observable members', function() {
    let c = {x: bind(() => 0), y: rx.array(), z: rx.map()};
    let {x,y,z} = c;
    rx.lift(c);
    // expect nothing to change
    expect(c.x).toBe(x);
    expect(c.y).toBe(y);
    expect(c.z).toBe(z);
  });
});

describe('transaction', function() {
  it('should buffer up events', function() {
    let x = rx.cell(5);
    let y = rx.cell(0);
    let z = bind(() => x.get() + y.get());
    rx.transaction(function() {
      x.set(0);
      expect(z.get()).toBe(5);
      y.set(5);
      expect(z.get()).toBe(5);
    });
    expect(z.get()).toBe(5);
  });
  it('should work for DepArrays', function() {
    let x = rx.array([1,2,3]);
    let y = x.indexed().map((c, iCell) => c * (iCell.get() + 1));
    let changes = rx.cell(0);
    rx.transaction(function() {
      let len = bind(() => x.length());
      x.push(4);
      x.removeAt(1);
      x.put(1, 2);
      expect(len.get()).toBe(3);
    });
    expect(x.raw()).toEqual([1,2,4]);
  });
  it('should not infinite loop if we call transaction as the result of an event pubbed by a transaction', function() {
    let x = rx.cell(0);
    let changes = rx.cell(0);
    rx.autoSub(x.onSet, () => rx.transaction(() => changes.set(changes.raw() + 1)));
    expect(changes.raw()).toBe(1);
    rx.transaction(() => x.set(1));
    expect(changes.raw()).toBe(2);
    rx.transaction(function() {
      x.set(2);
      x.set(3);
      return rx.transaction(function() {
        x.set(4);
        return rx.transaction(() => x.set(5));
      });
    });
    expect(changes.raw()).toBe(6);
  });
});

describe('.to casting', () => {
  let cell, array, map, set;
  beforeEach(() => {
    cell = rx.cell([['a', 1]]);
    array = rx.array([['b', 2]]);
    set = rx.set([['e', 5], ['f', 6]]);
    map = rx.map([['c', 3], ['d', 4]]);
  });
  it('from cells should work', () => {
    expect(cell.toCell().raw()).toEqual([['a', 1]]);
    expect(cell.toArray().raw()).toEqual([['a', 1]]);
    expect(cell.toMap().raw()).toEqual(new Map([['a', 1]]));
    expect(cell.toSet().raw()).toEqual(new Set([['a', 1]]));

    cell.set([['z', 26]]);
    expect(cell.toCell().raw()).toEqual([['z', 26]]);
    expect(cell.toArray().raw()).toEqual([['z', 26]]);
    expect(cell.toMap().raw()).toEqual(new Map([['z', 26]]));
    expect(cell.toSet().raw()).toEqual(new Set([['z', 26]]));
  });
  it('from arrays should work', () => {
    expect(array.toCell().raw()).toEqual([['b', 2]]);
    expect(array.toArray().raw()).toEqual([['b', 2]]);
    expect(array.toMap().raw()).toEqual(new Map([['b', 2]]));
    expect(array.toSet().raw()).toEqual(new Set([['b', 2]]));

    array.push(['xkcd', 42]);

    expect(array.toCell().raw()).toEqual([['b', 2], ['xkcd', 42]]);
    expect(array.toArray().raw()).toEqual([['b', 2], ['xkcd', 42]]);
    expect(array.toMap().raw()).toEqual(new Map([['b', 2], ['xkcd', 42]]));
    expect(array.toSet().raw()).toEqual(new Set([['b', 2], ['xkcd', 42]]));
  });
  it('from sets should work', () => {
    expect(set.toCell().raw()).toEqual(new Set([['e', 5], ['f', 6]]));
    expect(set.toArray().raw()).toEqual([['e', 5], ['f', 6]]);
    expect(set.toMap().raw()).toEqual(new Map([['e', 5], ['f', 6]]));
    expect(set.toSet().raw()).toEqual(new Set([['e', 5], ['f', 6]]));

    set.put(['bob', 'smith']);

    expect(set.toCell().raw()).toEqual(new Set([['e', 5], ['f', 6], ['bob', 'smith']]));
    expect(set.toArray().raw()).toEqual([['e', 5], ['f', 6], ['bob', 'smith']]);
    expect(set.toMap().raw()).toEqual(new Map([['e', 5], ['f', 6], ['bob', 'smith']]));
    expect(set.toSet().raw()).toEqual(new Set([['e', 5], ['f', 6], ['bob', 'smith']]));
  });
  it('from maps should work', () => {
    expect(map.toCell().raw()).toEqual(new Map([['c', 3], ['d', 4]]));
    expect(map.toArray().raw()).toEqual([['c', 3], ['d', 4]]);
    expect(map.toMap().raw()).toEqual(new Map([['c', 3], ['d', 4]]));
    expect(map.toSet().raw()).toEqual(new Set([['c', 3], ['d', 4]]));

    map.put('joe', 'schmoe');

    expect(map.toCell().raw()).toEqual(new Map([['c', 3], ['d', 4], ['joe', 'schmoe']]));
    expect(map.toArray().raw()).toEqual([['c', 3], ['d', 4], ['joe', 'schmoe']]);
    expect(map.toMap().raw()).toEqual(new Map([['c', 3], ['d', 4], ['joe', 'schmoe']]));
    expect(map.toSet().raw()).toEqual(new Set([['c', 3], ['d', 4], ['joe', 'schmoe']]));
  });
});

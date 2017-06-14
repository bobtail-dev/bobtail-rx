export type Primitive = boolean|string|number|null|undefined;

export type objTypes = 'cell'|'array'|'map';
export type typedObj<T> = {
  [s:string]: T;
}

export interface Event {
  sub(listener:(arg:any) => void): number;
  pub(data:any);
  unsub(subId:number);
}

export interface ObsCell<T> {
  get(): T;
  onSet: Event;
}

export interface SrcCell<T> extends ObsCell<T> {
  set(val:T): T;
}

export interface DepCell<T> extends ObsCell<T> {
  disconnect();
}

export interface ObsArray<T> {
  at(i:number): any;
  all(): T[];
  raw(): T[];
  length(): number;
  map(fn:(val:T) => T): DepArray<T>
  onChange: Event;
  // todo: indexed()?
}

interface NestableCell<T> extends ObsCell<T | NestableCell<T>> {}

interface FlattenableRX<T> extends ObsArray<
  T |
  NestableCell<T | FlattenableJS<T> | FlattenableRX<T>> |
  FlattenableJS<T> |
  FlattenableRX<T>
> {}

interface FlattenableJS<T> extends Array<
  T |
  NestableCell<T | FlattenableJS<T> | FlattenableRX<T>> |
  FlattenableJS<T> |
  FlattenableRX<T>
> {}

export type Flattenable<T> = FlattenableRX<T> | FlattenableJS<T>

export interface DepArray<T> extends ObsArray<T> {}

export interface diffFn<T> {
  (key:(x:T) => string): (old:Array<T>, new_:Array<T>) => Array<T>
}

export interface SrcArray<T> extends ObsArray<T> {
  constructor(init:T[], diff?: diffFn<T>);
  splice(index:number, count:number, ...additions:T[]);
  insert(x:T, i:number);
  remove(x:T);
  removeAt(i:number);
  push(x:T);
  put(i: number, x:T);
  replace(xs:T[]);
  update(xs:T[], diff?:diffFn<T>);
}

export interface ObsMap<T> {
  get(k:string|number);
  all(): typedObj<T>;
  onAdd: Event;
  onRemove: Event;
  onChange: Event;
}

export interface SrcMap<T> extends ObsMap<T> {
  put(k:string|number, v:T): T;
  remove(k:string|number);
  update(map:typedObj<T>);
}

export interface DepMap<T> extends ObsMap<T> {}

export interface ReactiveInterface {
  cell<T>(init:T): SrcCell<T>;
  array<T>(init:Array<T>, diff?:diffFn<T>): SrcArray<T>;
  bind<T>(f: () => T): DepCell<T>;
  snap<T>(f:() => T): T;
  asyncBind<T>(init:T, f:() => T): DepCell<T>;
  lagBind<T>(lag:number, init:T, f:() => T): DepCell<T>;
  postLagBind<T>(init:T, fn:() => {val:T, ms:number}): ObsCell<T>;
  // reactify
  // autoReactify
  flatten<T>(xs:Flattenable<T>): DepArray<T>;
  onDispose(fn:() => void);
  skipFirst(fn:() => void);
  autoSub(ev:Event, listener:(arg:any) => void);
  concat<T>(...arrays:ObsArray<T>[]): DepArray<T>;
  cellToArray<T>(cell:ObsCell<T>): DepArray<T>;
  cellToMap<T>(cell:ObsCell<T>): DepMap<T>;
  basicDiff:diffFn<any>;
  smartUidify(x:any):string;
  lift(x:typedObj<any>, spec: {s: objTypes})
  liftSpec(x:typedObj<any>): {s: objTypes}
  transaction(f:() => void);
}

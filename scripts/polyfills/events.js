// Minimal browser shim for Node's `events` module (EventEmitter).
// Only the surface ketcher-core actually uses is implemented.
export class EventEmitter {
  constructor() { this._events = new Map(); }
  on(name, fn) {
    if (!this._events.has(name)) this._events.set(name, []);
    this._events.get(name).push(fn);
    return this;
  }
  addListener(name, fn) { return this.on(name, fn); }
  once(name, fn) {
    const wrap = (...args) => { this.removeListener(name, wrap); fn.apply(this, args); };
    return this.on(name, wrap);
  }
  off(name, fn) { return this.removeListener(name, fn); }
  removeListener(name, fn) {
    const list = this._events.get(name);
    if (list) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }
    return this;
  }
  removeAllListeners(name) {
    if (name === undefined) this._events.clear();
    else this._events.delete(name);
    return this;
  }
  emit(name, ...args) {
    const list = this._events.get(name);
    if (!list || list.length === 0) return false;
    for (const fn of list.slice()) fn.apply(this, args);
    return true;
  }
  listenerCount(name) { const l = this._events.get(name); return l ? l.length : 0; }
  listeners(name) { return (this._events.get(name) || []).slice(); }
  eventNames() { return [...this._events.keys()]; }
  setMaxListeners() { return this; }
  getMaxListeners() { return 0; }
}
export default { EventEmitter };

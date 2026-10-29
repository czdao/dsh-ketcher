// Minimal browser shim for Node's `stream` module. ketcher-core references it
// but does not exercise stream internals in the browser path.
export class Stream {
  constructor() { this._events = {}; }
  on() { return this; }
  once() { return this; }
  emit() { return false; }
  pipe(dest) { return dest; }
  write() { return true; }
  end() { return this; }
}
export class Readable extends Stream {}
export class Writable extends Stream {}
export class Transform extends Stream {}
export class PassThrough extends Stream {}
export class Duplex extends Stream {}
export const Stream_p = Stream;
export function pipeline() { return undefined; }
export default { Stream, Readable, Writable, Transform, PassThrough, Duplex };

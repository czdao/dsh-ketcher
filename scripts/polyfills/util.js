// Minimal browser shim for Node's `util` module.
export function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}
export function format(...args) { return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '); }
export function inspect(x) { try { return JSON.stringify(x); } catch { return String(x); } }
export function isArray(x) { return Array.isArray(x); }
export function isString(x) { return typeof x === 'string'; }
export function isObject(x) { return x !== null && typeof x === 'object'; }
export function isFunction(x) { return typeof x === 'function'; }
export function deprecate(fn) { return fn; }

// `util.types.*` used by some Node-internal-derived code paths.
const toStr = Object.prototype.toString;
export const types = {
  isPromise: (x) => x != null && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function',
  isRegExp: (x) => x instanceof RegExp,
  isDate: (x) => x instanceof Date,
  isArray: (x) => Array.isArray(x),
  isMap: (x) => x instanceof Map,
  isSet: (x) => x instanceof Set,
  isWeakMap: (x) => typeof WeakMap !== 'undefined' && x instanceof WeakMap,
  isWeakSet: (x) => typeof WeakSet !== 'undefined' && x instanceof WeakSet,
  isAnyArrayBuffer: (x) => x instanceof ArrayBuffer,
  isArrayBufferView: (x) => ArrayBuffer.isView(x),
  isTypedArray: (x) => ArrayBuffer.isView(x) && !(x instanceof DataView),
  isUint8Array: (x) => x instanceof Uint8Array,
  isFunction: (x) => typeof x === 'function',
  isObject: (x) => x !== null && typeof x === 'object',
  isNumberObject: (x) => toStr.call(x) === '[object Number]',
  isStringObject: (x) => toStr.call(x) === '[object String]',
  isBooleanObject: (x) => toStr.call(x) === '[object Boolean]',
  isNativeError: (x) => x instanceof Error,
  isBoxedPrimitive: (x) => x instanceof Number || x instanceof String || x instanceof Boolean,
};

export default { inherits, format, inspect, isArray, isString, isObject, isFunction, deprecate, types };

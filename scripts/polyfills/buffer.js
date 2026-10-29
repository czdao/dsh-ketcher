// Minimal browser shim for Node's `buffer` module. Provides Buffer backed by
// Uint8Array with the handful of static helpers common in library code.
class Buf extends Uint8Array {
  static from(input, encoding) {
    if (typeof input === 'string') {
      if (encoding === 'base64') {
        const bin = atob(input);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Buf(arr.buffer);
      }
      if (encoding === 'hex') {
        const arr = new Uint8Array(input.length / 2);
        for (let i = 0; i < arr.length; i++) arr[i] = parseInt(input.substr(i * 2, 2), 16);
        return new Buf(arr.buffer);
      }
      const enc = new TextEncoder().encode(input);
      const b = new Buf(enc.length);
      b.set(enc);
      return b;
    }
    if (input instanceof ArrayBuffer) return new Buf(input);
    if (input && input.buffer) return new Buf(input.buffer, input.byteOffset || 0, input.length);
    return new Buf(0);
  }
  static alloc(n) { return new Buf(n); }
  static isBuffer(x) { return x instanceof Buf; }
  toString(encoding) {
    if (encoding === 'base64') {
      let s = '';
      for (let i = 0; i < this.length; i++) s += String.fromCharCode(this[i]);
      return btoa(s);
    }
    if (encoding === 'hex') {
      let s = '';
      for (let i = 0; i < this.length; i++) s += this[i].toString(16).padStart(2, '0');
      return s;
    }
    return new TextDecoder().decode(this);
  }
}
export const Buffer = Buf;
export default { Buffer: Buf };

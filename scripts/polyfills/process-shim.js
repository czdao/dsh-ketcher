// Injected into the bundle so `process.env.*` reads resolve in the browser.
export const process = { env: {}, argv: [], platform: 'browser', version: '', cwd: () => '/', nextTick: (fn) => Promise.resolve().then(fn) };

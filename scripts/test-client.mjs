// Client-harness: evaluate dsh-ketcher/client.js against a fake
// window.__ModuleLoader__ + fake react, and assert it registers into
// conversation.composer.dock. Also render the component tree shallowly to catch
// obvious runtime errors (JSX via React.createElement calls).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(pkgDir, 'client.js'), 'utf8');

let captured = null;
const fakeReact = {
  createElement: (type, props, children) => ({ type, props: props || {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useRef: (v) => ({ current: v }),
  useEffect: () => {},
};
const slotsRegistrations = [];
const ctx = {
  slots: {
    inject(kind, cb) { cb(); },
    register(spec, comp) { slotsRegistrations.push({ spec, comp }); return () => {}; },
  },
};

const windowMock = {
  __ModuleLoader__: {
    load(def) {
      captured = def;
      const mod = def.factory((name) => {
        if (name === 'react') return fakeReact;
        throw new Error('unexpected require: ' + name);
      });
      mod.apply(ctx);
    },
  },
  Ketcher: undefined,
};
globalThis.window = windowMock;
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ style: {}, dataset: {}, addEventListener() {}, setAttribute() {} }),
  head: { appendChild() {} },
};

// Evaluate the client source with window in scope.
const fn = new Function('window', 'document', source);
fn(windowMock, globalThis.document);

// Render the panel component once (closed state) to catch crashes.
const reg = slotsRegistrations[0];
const rendered = reg.comp({ inputActions: { captureInsertion() {}, insertText() {} } });

console.log(JSON.stringify({
  loadedId: captured && captured.id,
  registrationCount: slotsRegistrations.length,
  slotName: reg && reg.spec.name,
  slotId: reg && reg.spec.id,
  order: reg && reg.spec.order,
  componentIsFunction: typeof reg.comp === 'function',
  renderedClosedIsObject: rendered != null,
  renderedHasType: rendered && (rendered.type || (Array.isArray(rendered) ? 'array' : typeof rendered)),
}, null, 2));

// Client-harness for the sidebar version: evaluate dsh-ketcher/client.js against
// a fake window.__ModuleLoader__ + fake react, assert it registers a sidebar tab
// type and its body slot, and that the body component renders without crashing.
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
  useMemo: (fn) => fn(),
};

const tabTypes = [];
const slotRegs = [];
const dicts = [];
const ctx = {
  effect: (fn) => fn(),
  locale: {
    bind: () => (key) => key,
    register: (ns, d) => { dicts.push({ ns, d }); return () => {}; },
  },
  sidebarRightTabs: { register: (def) => { tabTypes.push(def); return () => {}; } },
  sidebarRight: {},
  slots: {
    inject: (kind, cb) => { cb(); },
    register: (spec, comp) => { slotRegs.push({ spec, comp }); return () => {}; },
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
      captured.__mod = mod;
    },
  },
  Ketcher: undefined,
};
globalThis.window = windowMock;
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ style: {}, dataset: {}, addEventListener() {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
  body: { appendChild() {}, removeChild() {} },
};
const fakeNavigator = { clipboard: { writeText: async () => {} } };

const fn = new Function('window', 'document', 'navigator', source);
fn(windowMock, globalThis.document, fakeNavigator);

// Render the tab body once (loading state) to catch crashes.
const bodyReg = slotRegs.find((r) => r.spec.name === 'sidebar.right.pane.tab');
const rendered = bodyReg.comp({ t: (k) => k });

console.log(JSON.stringify({
  loadedId: captured && captured.id,
  inject: captured.__mod && captured.__mod.inject,
  tabTypeCount: tabTypes.length,
  tabKind: tabTypes[0] && tabTypes[0].kind,
  tabId: tabTypes[0] && tabTypes[0].id,
  hasGuide: !!(tabTypes[0] && tabTypes[0].guide && tabTypes[0].guide.length),
  slotNames: slotRegs.map((r) => r.spec.name + ':' + r.spec.key),
  bodyIsFunction: typeof bodyReg.comp === 'function',
  renderedHasType: rendered && rendered.type,
  dictNamespaces: dicts.map((d) => d.ns),
}, null, 2));

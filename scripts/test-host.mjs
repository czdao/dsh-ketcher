// Mock-host harness: exercise dsh-ketcher's Host `apply()` with fake ctx to
// prove it registers the static route, readiness route, and the agent tool, and
// that the tool executes correctly. No DSH runtime required.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const { apply } = await import(pathToFileURL(join(pkgDir, 'index.js')).href);

const registered = { routes: [], tools: [], effects: [] };
let injectedServices = [];

const makeEffect = (fn, label) => {
  const dispose = fn();
  registered.effects.push({ label, dispose });
  return dispose;
};

const webServer = {
  register(spec) {
    registered.routes.push(spec);
    return () => {};
  },
};

const tools = {
  register(def) {
    registered.tools.push(def);
    return () => {};
  },
};

const ctx = {
  effect: makeEffect,
  inject(services, cb) {
    injectedServices.push(...services);
    if (services.includes('webServer')) cb({ effect: makeEffect, webServer });
  },
  tools,
};

apply(ctx, { mountPath: '/ketcher-assets' });

const summary = {
  injected: injectedServices,
  routes: registered.routes.map((r) => `${r.kind} ${r.path}`),
  tools: registered.tools.map((t) => t.name),
  toolHasRender: registered.tools.every((t) => typeof t.output.render === 'function'),
};

// Execute the tool against sample SMILES.
const tool = registered.tools.find((t) => t.name === 'ketcher_analyze_smiles');
const results = {};
for (const smi of ['CCO', 'c1ccccc1', 'CC(=O)Oc1ccccc1C(=O)O', 'not-a-smiles']) {
  results[smi] = await tool.execute({ smiles: smi }, {});
}

// Exercise the static route handler for the "not built" readiness path.
const readyRoute = registered.routes.find((r) => r.path === '/ketcher-api/ready');
let readyAnswer;
const fakeRes = {
  status: 0,
  headers: {},
  body: '',
  writeHead(s, h) { this.status = s; this.headers = h || {}; },
  end(b) { this.body = b == null ? '' : String(b); },
};
await readyRoute.handler({ method: 'GET' }, fakeRes);
readyAnswer = { status: fakeRes.status, body: fakeRes.body };

console.log(JSON.stringify({ summary, results, readyAnswer }, null, 2));

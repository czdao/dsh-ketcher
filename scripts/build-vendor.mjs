/**
 * Build the Ketcher standalone runtime into vendor/ketcher-app.js.
 *
 * This is the ONLY heavy step. It bundles Ketcher's React editor plus its local
 * Indigo (WASM) engine into one browser script that exposes a tiny global:
 *
 *     window.Ketcher.mount(container, { staticResourcesUrl, onInit })
 *
 * and copies the static resources (WASM, fonts, templates) that Ketcher fetches
 * at runtime into ./vendor so the Host half can serve them.
 *
 * Usage:
 *     cd <this package>
 *     npm install --no-save ketcher-core ketcher-react ketcher-standalone react react-dom esbuild
 *     node scripts/build-vendor.mjs
 *
 * If the packages are not installed, the script writes nothing and exits 0 with
 * a clear notice; the Client panel then shows a "assets not built" hint instead
 * of crashing. That keeps `install_bundle` safe on a machine without network.
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(here, '..');
const vendorDir = join(pkgDir, 'vendor');
const entryFile = join(here, 'ketcher-entry.js');
const outFile = join(vendorDir, 'ketcher-app.js');

function fail(msg) {
  console.log('[dsh-ketcher] ' + msg);
  process.exit(0);
}

// 1) Resolve the installed Ketcher + React + esbuild from the package's own
//    node_modules (installed ad hoc with --no-save during build).
function tryResolve(spec, fromDir) {
  try {
    return import.meta.resolve ? import.meta.resolve(spec) : null;
  } catch {
    return null;
  }
}

const hasKetcherReact = existsSync(join(pkgDir, 'node_modules/ketcher-react'));
const hasKetcherStandalone = existsSync(join(pkgDir, 'node_modules/ketcher-standalone'));
const hasEsbuild = existsSync(join(pkgDir, 'node_modules/esbuild'));

if (!hasKetcherReact || !hasKetcherStandalone) {
  fail(
    'Ketcher packages not installed — skipping vendor build.\n' +
    '          Run: npm install --no-save ketcher-core ketcher-react ketcher-standalone react react-dom esbuild\n' +
    '          then: node scripts/build-vendor.mjs',
  );
}
if (!hasEsbuild) {
  fail('esbuild not installed — run: npm install --no-save esbuild');
}

// 2) Write the bootstrap entry that the bundle exposes as a global.
const entrySource = `\
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import 'ketcher-react/dist/index.css';

const structServiceProvider = new StandaloneStructServiceProvider();

function mount(container, options) {
  const opts = options || {};
  const root = createRoot(container);
  const element = React.createElement(Editor, {
    staticResourcesUrl: opts.staticResourcesUrl,
    structServiceProvider,
    onInit: (ketcher) => { if (typeof opts.onInit === 'function') opts.onInit(ketcher); },
  });
  root.render(element);
  return { destroy() { try { root.unmount(); } catch (e) { /* ignore */ } } };
}

export { mount };
`;
writeFileSync(entryFile, entrySource, 'utf8');

// 3) Bundle with esbuild into a single IIFE exposing window.Ketcher = { mount }.
const esbuild = await import(pathToFileURL(join(pkgDir, 'node_modules/esbuild/lib/main.js')).href);
const esbuildFn = esbuild.build || esbuild.default?.build;
if (typeof esbuildFn !== 'function') fail('esbuild API not found');

mkdirSync(vendorDir, { recursive: true });
const rawOut = join(vendorDir, 'ketcher-app.raw.js');
// ketcher-core imports a few Node builtins (events, stream, buffer, util). Map
// them to tiny browser shims so the bundle runs in the page.
const polyfillDir = join(here, 'polyfills');
await esbuildFn({
  entryPoints: [entryFile],
  bundle: true,
  format: 'iife',
  globalName: 'KetcherLib',
  outfile: rawOut,
  platform: 'browser',
  target: ['es2020'],
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' },
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  alias: {
    events: join(polyfillDir, 'events.js'),
    stream: join(polyfillDir, 'stream.js'),
    buffer: join(polyfillDir, 'buffer.js'),
    util: join(polyfillDir, 'util.js'),
  },
  inject: [join(polyfillDir, 'process-shim.js')],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
});

// Wrap so the global surface is exactly { mount } and this IS ketcher-app.js.
import { readFileSync as rf, unlinkSync } from 'node:fs';
const bundled = rf(rawOut, 'utf8');
writeFileSync(outFile, `(function(){${bundled}\nwindow.Ketcher = { mount: KetcherLib.mount };})();`, 'utf8');
try { unlinkSync(rawOut); } catch { /* keep */ }

// esbuild extracts CSS imported by JS into a sibling "<outfile>.css". Move it to
// a stable name the Client <link>s.
const rawCss = join(vendorDir, 'ketcher-app.raw.css');
const cssOut = join(vendorDir, 'ketcher-app.css');
if (existsSync(rawCss)) {
  writeFileSync(cssOut, rf(rawCss, 'utf8'), 'utf8');
  try { unlinkSync(rawCss); } catch { /* keep */ }
  console.log('[dsh-ketcher] wrote ketcher-app.css');
}

// Copy the self-contained host frame page (loads this bundle, exposes a
// postMessage protocol for the sidebar tab body).
const frameSrc = join(here, 'ketcher-frame.html');
const frameOut = join(vendorDir, 'ketcher-frame.html');
if (existsSync(frameSrc)) {
  writeFileSync(frameOut, rf(frameSrc, 'utf8'), 'utf8');
  console.log('[dsh-ketcher] wrote ketcher-frame.html');
}

// 4) Copy Ketcher's runtime static resources (WASM, fonts, templates, etc.).
function copyDir(src, dst) {
  if (!existsSync(src)) return 0;
  mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) n += copyDir(s, d);
    else { copyFileSync(s, d); n += 1; }
  }
  return n;
}
const staticSrc = join(pkgDir, 'node_modules/ketcher-standalone/dist');
if (existsSync(staticSrc)) {
  const copied = copyDir(staticSrc, join(vendorDir, 'static'));
  console.log('[dsh-ketcher] copied ' + copied + ' static resource files');
}

console.log('[dsh-ketcher] vendor build complete -> ' + outFile);

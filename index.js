/**
 * dsh-ketcher — Host half.
 *
 * Responsibilities:
 *  1. Serve Ketcher's prebuilt static assets (JS/CSS/WASM/fonts) under a mount
 *     path so the Client `<Editor staticResourcesUrl=...>` can load them.
 *  2. Expose a tiny readiness endpoint so the Client panel can tell whether the
 *     assets have been built yet.
 *  3. Register an agent tool that validates a SMILES string and estimates its
 *     molecular formula. Format conversion (SMILES <-> molfile) is done in the
 *     browser by Ketcher's local Indigo engine, so the tool stays honest about
 *     what it can and cannot do offline.
 *
 * The Client half (client.js) renders the drawing panel. Nothing here touches
 * the DOM or the session log.
 *
 * @module @local/dsh-ketcher
 */
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { estimateFormula, validateSmiles } from './src/chem.js';

/** Cordis plugin name used in loader diagnostics. */
export const name = 'ketcher';

/** `webServer` is injected lazily; `tools` must be present for the agent tool. */
export const inject = ['tools'];

/** Package directory (absolute), used to resolve the bundled vendor assets. */
const PKG_DIR = dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = join(PKG_DIR, 'vendor');
const MARKET_DIR = join(PKG_DIR, 'market');

/** Map a file extension to a response content type for static serving. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * 配置：见 cordis.patch.yml。
 * @typedef {{ mountPath: string }} Config
 */

/**
 * 插件入口。
 * @param ctx Cordis 插件上下文。
 * @param config 本行的 config。
 */
export function apply(ctx, config) {
  const mountPath = normalizeMount(config?.mountPath);

  // --- Host static asset serving -------------------------------------------
  // The Client editor loads its WASM/fonts/workers from here. Registering on
  // the webServer is optional: a host without a web server simply gets no
  // route, and the panel reports the assets as unavailable.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'prefix',
        path: mountPath,
        handler: (request, response) => serveVendor(request, response, mountPath, VENDOR_DIR),
      }),
      `webServer.register(${mountPath})`,
    );

    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'exact',
        path: '/ketcher-api/ready',
        handler: async (request, response) => {
          if (request.method !== 'GET') {
            response.writeHead(405, { allow: 'GET' });
            response.end();
            return;
          }
          const ready = await vendorEntryExists(VENDOR_DIR);
          sendJson(response, 200, { ready });
        },
      }),
      'webServer.register(/ketcher-api/ready)',
    );

    // Self-hosted plugin-market index (format 1) + its icon. DSH's market fetches
    // index sources over HTTP; serving ours here keeps it reachable on this
    // machine and offline. Add the URL below as an index source in the market's
    // Discover tab (see README).
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'exact',
        path: '/ketcher-market/index.json',
        handler: (request, response) => serveFile(request, response, join(MARKET_DIR, 'index.json'), 'application/json; charset=utf-8'),
      }),
      'webServer.register(/ketcher-market/index.json)',
    );
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'exact',
        path: '/ketcher-market/icon.svg',
        handler: (request, response) => serveFile(request, response, join(MARKET_DIR, 'icon.svg'), 'image/svg+xml'),
      }),
      'webServer.register(/ketcher-market/icon.svg)',
    );
  });

  // --- Agent tool ----------------------------------------------------------
  // One operation, two callers: the panel and the agent both measure a structure
  // the same way. Confirmed by inspection that `tools.register` takes a raw
  // definition { name, description, parameters, output: { schema, render } }.
  ctx.effect(
    () => ctx.tools.register({
      name: 'ketcher_analyze_smiles',
      description:
        'Validate a SMILES string and estimate its molecular formula. ' +
        'Use this to sanity-check a structure the user drew or typed. ' +
        'It does not do stereo perception or produce a molfile; for format conversion ' +
        'use the Ketcher panel and insert the result into the composer.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          smiles: {
            type: 'string',
            description: 'The SMILES string to analyze, e.g. "CC(=O)Oc1ccccc1C(=O)O".',
            required: true,
          },
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            valid: { type: 'boolean', description: 'Whether the string parses as SMILES.' },
            atomCount: { type: 'integer', description: 'Heavy atom count (0 when invalid).' },
            formula: { type: 'string', description: 'Estimated molecular formula, or empty when invalid.' },
            error: { type: 'string', description: 'Parse error message, or empty when valid.' },
          },
        },
        // Display-only: fall back to the generic tool presentation.
        render: () => null,
      },
      async execute(args) {
        const smiles = typeof args?.smiles === 'string' ? args.smiles : '';
        const result = validateSmiles(smiles);
        if (!result.valid) {
          return { valid: false, atomCount: 0, formula: '', error: result.error ?? 'invalid SMILES' };
        }
        let formula = '';
        let formulaError = '';
        try {
          formula = estimateFormula(smiles);
        } catch (error) {
          formulaError = error instanceof Error ? error.message : String(error);
        }
        return {
          valid: true,
          atomCount: result.atomCount ?? 0,
          formula,
          error: formulaError,
        };
      },
    }),
    'tools.register(ketcher_analyze_smiles)',
  );
}

/** Normalize the configured mount path to a leading-slash, no-trailing-slash form. */
function normalizeMount(raw) {
  let p = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : '/ketcher-assets';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/** True when the built Ketcher entry (`ketcher-app.js`) is present. */
async function vendorEntryExists(dir) {
  try {
    const info = await stat(join(dir, 'ketcher-app.js'));
    return info.isFile();
  } catch {
    return false;
  }
}

/** Serve one file from disk with a fixed content type. */
async function serveFile(request, response, filePath, contentType) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end();
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-cache, must-revalidate' });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found');
  }
}

/**
 * Serve a file from the vendor directory, rejecting traversal.
 * @param request incoming request
 * @param response response to write
 * @param mountPath the URL prefix that maps to the vendor dir
 * @param vendorRoot absolute vendor directory
 */
async function serveVendor(request, response, mountPath, vendorRoot) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end();
    return;
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  let rel = decodeURIComponent(url.pathname.slice(mountPath.length));
  if (rel === '' ) rel = '/ketcher-app.js';
  // Reject path traversal outside the vendor root.
  const target = normalize(join(vendorRoot, rel));
  if (target !== vendorRoot && !target.startsWith(vendorRoot + '/') && !target.startsWith(vendorRoot + '\\')) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }
  try {
    const body = await readFile(target);
    const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream';
    // The main runtime JS may be rebuilt/replaced; never let browsers cache a
    // stale (possibly broken) build. Immutable sub-assets (fonts, wasm images)
    // can still be cached briefly.
    const isMain = /\/(ketcher-app\.js|ketcher-app\.css)$/.test(target.replace(/\\/g, '/'));
    const cacheControl = isMain ? 'no-cache, must-revalidate' : 'public, max-age=3600';
    response.writeHead(200, { 'content-type': type, 'cache-control': cacheControl });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('not found: ' + rel);
  }
}

/** Write a JSON response. */
function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
}

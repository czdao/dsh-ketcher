// Upload a local directory to a GitHub repo via the Contents API.
// Works on an empty repository (Git Data blob API rejects empty repos with 409).
// Each file is one commit; acceptable for a one-time publish.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO = process.argv[2];
const DIR = process.argv[3];
const TOKEN = process.argv[4];
const BRANCH = process.argv[5] || 'main';

const API = 'https://api.github.com';
const headers = {
  authorization: 'token ' + TOKEN,
  accept: 'application/vnd.github+json',
  'user-agent': 'dsh-ketcher-upload',
  'content-type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json, text };
}

const IGNORE = new Set(['.git', 'node_modules', 'package-lock.json']);
function collect(dir, base) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = join(dir, name);
    const rel = relative(base, full).split(sep).join('/');
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full, base));
    else out.push({ path: rel, full });
  }
  return out;
}

function enc(buf) {
  // Contents API requires base64 for text and binary alike.
  return buf.toString('base64');
}

const files = collect(DIR, DIR).sort((a, b) => a.path.localeCompare(b.path));
console.error('files: ' + files.length);

let lastCommit = null;
for (const f of files) {
  const buf = readFileSync(f.full);
  // Does the file already exist? (get its sha to update rather than create)
  let existingSha;
  const head = await api('GET', `/repos/${REPO}/contents/${encodeURIComponent(f.path).replace(/%2F/g, '/')}?ref=${BRANCH}`);
  if (head.ok && head.json && head.json.sha) existingSha = head.json.sha;

  const body = {
    message: 'feat: add ' + f.path,
    content: enc(buf),
    branch: BRANCH,
  };
  if (existingSha) body.sha = existingSha;
  // First file: no branch exists yet -> omit branch so it creates default branch.
  if (!lastCommit && !existingSha) { delete body.branch; }

  const r = await api('PUT', `/repos/${REPO}/contents/${encodeURIComponent(f.path).replace(/%2F/g, '/')}`, body);
  if (!r.ok) {
    console.error('FAIL ' + f.path + ' -> ' + r.status + ' ' + r.text.slice(0, 300));
    process.exit(1);
  }
  lastCommit = r.json.commit && r.json.commit.sha;
  console.error('  ok ' + f.path + ' (' + (existingSha ? 'update' : 'create') + ')');
}

console.log(JSON.stringify({
  ok: true, repo: REPO, branch: BRANCH, files: files.length, lastCommit,
  url: `https://github.com/${REPO}`,
}));

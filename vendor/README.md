# vendor/

This directory holds the **prebuilt Ketcher runtime** that the Host half serves
at `/ketcher-assets` and the Client panel loads lazily.

- `ketcher-app.js` — a standalone browser bundle exposing `window.Ketcher.mount(container, { staticResourcesUrl, onInit })`.
- `static/` — Ketcher's runtime resources (WASM chemistry engine, fonts, templates).

They are **not** committed here. Generate them with:

```powershell
cd D:\化学agent\dsh-ketcher
npm install --no-save ketcher-core ketcher-react ketcher-standalone react react-dom esbuild
node scripts/build-vendor.mjs
```

Until then the panel still mounts and shows a short hint ("Ketcher 资源未就绪");
the plugin installs and stays inert rather than erroring.

Why not ship a CDN `<script>`? The DSH plugin guide forbids an iframe and asks
plugin UI to be real React in a slot; loading the editor from the host keeps the
page same-origin, offline-capable, and without third-party network calls.

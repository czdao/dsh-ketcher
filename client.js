/**
 * dsh-ketcher — Client half.
 *
 * Registers Ketcher as a **right-sidebar tab type**. The tab body renders a
 * same-origin <iframe> served by this plugin's Host half
 * (`/ketcher-assets/ketcher-frame.html`). Ketcher runs inside that frame's own
 * document, so it never depends on the host page's React, module table, or CSP —
 * the chemistry engine (Indigo WASM in a blob Worker) initializes in a clean
 * page context. The host page talks to the frame over postMessage to read
 * SMILES/molfile and copy them to the clipboard.
 *
 * Registration follows the public sidebar-right path (as `ui-sidebar-files`):
 *   - type:  ctx.sidebarRightTabs.register({ id, kind, priority, title, guide })
 *   - body:  ctx.slots.inject('sidebar.right.pane.tab', () =>
 *              ctx.slots.register({ name, key: id, locale }, Body))
 *   - open:  ctx.sidebarRight.openTab('ketcher')
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ketcher',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dshKetcher';
    const TAB_ID = '@local/dsh-ketcher';
    const TAB_KIND = 'ketcher';

    const DICT = {
      zh: {
        'type.label': 'Ketcher 化学编辑器',
        'guide.title': 'Ketcher 化学编辑器',
        'guide.description': '绘制 / 编辑分子结构，复制 SMILES 或 molfile',
        'panel.title': 'Ketcher 分子编辑器',
        'btn.copySmiles': '复制 SMILES',
        'btn.copyMolfile': '复制 molfile',
        'btn.clear': '清空',
        'status.loading': '正在加载 Ketcher…',
        'status.unavailable': 'Ketcher 资源未就绪：',
        'status.hint': '（运行插件目录下的 node scripts/build-vendor.mjs 生成 vendor/ketcher-app.js）',
        'err.timeout': '等待编辑器响应超时。',
        'err.copyFailed': '复制失败：',
        'copied': '已复制到剪贴板',
      },
      en: {
        'type.label': 'Ketcher Chemistry Editor',
        'guide.title': 'Ketcher Chemistry Editor',
        'guide.description': 'Draw / edit a molecule, copy SMILES or molfile',
        'panel.title': 'Ketcher Molecule Editor',
        'btn.copySmiles': 'Copy SMILES',
        'btn.copyMolfile': 'Copy molfile',
        'btn.clear': 'Clear',
        'status.loading': 'Loading Ketcher…',
        'status.unavailable': 'Ketcher assets are not ready: ',
        'status.hint': ' (run `node scripts/build-vendor.mjs` in the plugin directory to build vendor/ketcher-app.js)',
        'err.timeout': 'Timed out waiting for the editor.',
        'err.copyFailed': 'Copy failed: ',
        'copied': 'Copied to clipboard',
      },
    };

    const ASSET_BASE = '/ketcher-assets';
    const ASSET_VER = 'v4';
    const FRAME_URL = ASSET_BASE + '/ketcher-frame.html?v=' + ASSET_VER;

    /** Glyph for the guide card. */
    function KetcherGlyph() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }, [
        h('path', { key: 'hex', d: 'M12 2.5 20 7v10l-8 4.5L4 17V7z' }),
        h('circle', { key: 'a', cx: 12, cy: 2.5, r: 1.7, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'b', cx: 20, cy: 7, r: 1.7, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'c', cx: 4, cy: 17, r: 1.7, fill: 'currentColor', stroke: 'none' }),
      ]);
    }

    /** Tab body: hosts the Ketcher frame and drives it over postMessage. */
    function KetcherTabBody(props) {
      const t = props.t || ((k) => k);
      const [status, setStatus] = React.useState('loading'); // loading | ready | error
      const [message, setMessage] = React.useState('');
      const frameRef = React.useRef(null);
      const pending = React.useRef(new Map()); // id -> {resolve, reject, timer}
      const seq = React.useRef(0);

      React.useEffect(() => {
        function settle(id, ok, value, error) {
          const p = pending.current.get(id);
          if (!p) return;
          pending.current.delete(id);
          clearTimeout(p.timer);
          if (ok) p.resolve(value); else p.reject(new Error(error || 'error'));
        }
        function onMessage(ev) {
          const f = frameRef.current;
          if (f && ev.source !== f.contentWindow) return;
          const d = ev.data;
          if (!d || d.__dshKetcher !== true) return;
          if (d.type === 'ready') { setStatus('ready'); setMessage(''); }
          else if (d.type === 'error') { setStatus('error'); setMessage(String(d.error || '')); }
          else if (d.type === 'result') { settle(d.id, d.ok === true, d.value, d.error); }
        }
        window.addEventListener('message', onMessage);
        return () => {
          window.removeEventListener('message', onMessage);
          for (const [, p] of pending.current) { clearTimeout(p.timer); try { p.reject(new Error('unmounted')); } catch (e) {} }
          pending.current.clear();
        };
      }, []);

      const command = (kind, value) => new Promise((resolve, reject) => {
        const f = frameRef.current;
        if (!f || !f.contentWindow) { reject(new Error(t('status.loading'))); return; }
        if (status !== 'ready') { reject(new Error(t('err.timeout'))); return; }
        const id = ++seq.current;
        const timer = setTimeout(() => { pending.current.delete(id); reject(new Error(t('err.timeout'))); }, 15000);
        pending.current.set(id, { resolve, reject, timer });
        f.contentWindow.postMessage({ __dshKetcherCmd: true, id, kind, value }, '*');
      });

      const copyText = async (text) => {
        if (!text) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
          else {
            const ta = document.createElement('textarea'); ta.value = text;
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          }
          setMessage(t('copied')); setTimeout(() => setMessage(''), 1500);
        } catch (e) { setMessage(t('err.copyFailed') + (e && e.message ? e.message : String(e))); }
      };
      const copySmiles = () => command('smiles').then(copyText).catch((e) => setMessage(t('err.copyFailed') + e.message));
      const copyMolfile = () => command('molfile').then(copyText).catch((e) => setMessage(t('err.copyFailed') + e.message));
      const clearStructure = () => command('clear').catch((e) => setMessage(e.message));

      const btn = (label, onClick, primary) => h('button', {
        type: 'button', onClick, disabled: status !== 'ready',
        style: {
          appearance: 'none', border: 'none', borderRadius: 'var(--dsw-radius-sm, 6px)',
          padding: '5px 12px', fontSize: '13px', cursor: status !== 'ready' ? 'default' : 'pointer',
          background: primary ? 'var(--dsw-alias-state-business-primary, #247bbf)' : 'var(--dsw-alias-interactive-bg-hover, #f0f0f0)',
          color: primary ? '#fff' : 'var(--dsw-alias-label-primary, #222)', opacity: status !== 'ready' ? 0.5 : 1,
        },
      }, label);

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: 'var(--dsw-alias-bg-layer1, #fafafa)', color: 'var(--dsw-alias-label-primary, #222)' } }, [
        h('div', { key: 'bar', style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1, #eee)', flex: '0 0 auto' } }, [
          h('span', { key: 'title', style: { fontSize: '13px', fontWeight: 600 } }, t('panel.title')),
          h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
          btn(t('btn.copySmiles'), copySmiles, true),
          btn(t('btn.copyMolfile'), copyMolfile, false),
          btn(t('btn.clear'), clearStructure, false),
        ]),
        h('div', { key: 'body', style: { position: 'relative', flex: '1 1 auto', minHeight: 0 } }, [
          h('iframe', {
            key: 'frame', ref: frameRef, src: FRAME_URL, title: t('panel.title'),
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: '0', background: '#fff' },
          }),
          status !== 'ready' ? h('div', {
            key: 'overlay',
            style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '24px', fontSize: '13px', whiteSpace: 'pre-wrap', color: 'var(--dsw-alias-label-tertiary, #888)', background: 'var(--dsw-alias-bg-layer1, #fafafa)', pointerEvents: 'none' },
          }, status === 'error' ? t('status.unavailable') + message + '\n' + t('status.hint') : t('status.loading')) : null,
        ]),
        message && status === 'ready'
          ? h('div', { key: 'msg', style: { flex: '0 0 auto', padding: '6px 10px', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, #666)' } }, message)
          : null,
      ]);
    }

    function definitionOf(t) {
      return {
        id: TAB_ID,
        kind: TAB_KIND,
        priority: 'extension',
        title: () => t('type.label'),
        guide: [{
          id: 'ketcher',
          order: 20,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: KetcherGlyph,
        }],
      };
    }

    const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'];

    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-ketcher: dictionaries');
      ctx.effect(() => ctx.sidebarRightTabs.register(definitionOf(t)), 'dsh-ketcher: tab type');
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS,
      }, KetcherTabBody)), 'dsh-ketcher: tab body');
    }

    return { inject, apply };
  },
});

// frame-refresh-20261029114651


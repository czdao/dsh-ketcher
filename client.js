/**
 * dsh-ketcher — Client half.
 *
 * Registers one entry in `conversation.composer.dock`: a compact button that
 * expands an inline Ketcher drawing panel above the message composer. When the
 * user finishes drawing, they insert the structure's SMILES or molfile into the
 * composer through the standard `inputActions` slot props. Nothing here reads
 * another plugin's DOM or replaces the app root.
 *
 * The heavy Ketcher runtime (`vendor/ketcher-app.js`, a standalone build that
 * exposes `window.Ketcher`) is loaded lazily the first time the panel opens and
 * served by the Host half at `mountPath`. If it has not been built, the panel
 * shows a short hint instead of failing.
 *
 * Module format: the browser module loader calls this factory with `require`,
 * which resolves `react` from the host module table. Do not require any Harness
 * Client package here.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ketcher',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // The panel is loaded lazily; keep per-page loaders cached so re-opening
    // does not re-inject the script.
    let ketcherScriptPromise = null;

    /** Where the Host serves the prebuilt Ketcher runtime. */
    const ASSET_BASE = '/ketcher-assets';
    const KETCHER_SCRIPT_URL = ASSET_BASE + '/ketcher-app.js';

    /** Inject (once) the Ketcher standalone script and resolve when ready. */
    function loadKetcherScript() {
      if (window.Ketcher) return Promise.resolve(window.Ketcher);
      if (ketcherScriptPromise) return ketcherScriptPromise;
      ketcherScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-dsh-ketcher="1"]');
        if (existing) {
          existing.addEventListener('load', () => resolve(window.Ketcher));
          existing.addEventListener('error', () => reject(new Error('ketcher script failed')));
          return;
        }
        const tag = document.createElement('script');
        tag.src = KETCHER_SCRIPT_URL;
        tag.async = true;
        tag.dataset.dshKetcher = '1';
        tag.addEventListener('load', () => {
          if (window.Ketcher) resolve(window.Ketcher);
          else reject(new Error('ketcher global missing after load'));
        });
        tag.addEventListener('error', () => reject(new Error('ketcher script 404 — run the vendor build')));
        document.head.appendChild(tag);
      });
      return ketcherScriptPromise;
    }

    /** A tiny icon for the toolbar button. */
    function MoleculeIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', width: 16, height: 16, 'aria-hidden': true,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }, [
        h('path', { key: 'hex', d: 'M12 2.5 20 7v10l-8 4.5L4 17V7z' }),
        h('circle', { key: 'a', cx: 12, cy: 2.5, r: 1.6, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'b', cx: 20, cy: 7, r: 1.6, fill: 'currentColor', stroke: 'none' }),
        h('circle', { key: 'c', cx: 4, cy: 17, r: 1.6, fill: 'currentColor', stroke: 'none' }),
      ]);
    }

    /**
     * The Ketcher panel component. Mounts Ketcher into a div when opened, and
     * cleans up the editor instance on close/unmount.
     */
    function KetcherPanel(props) {
      const inputActions = props.inputActions;
      const [open, setOpen] = React.useState(false);
      const [status, setStatus] = React.useState('idle'); // idle | loading | ready | error
      const [message, setMessage] = React.useState('');
      const hostRef = React.useRef(null);
      const ketcherRef = React.useRef(null);
      const [editorKey, setEditorKey] = React.useState(0);

      // Mount / unmount the Ketcher editor when the panel opens or closes.
      React.useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        setStatus('loading');
        setMessage('正在加载 Ketcher…');
        const host = hostRef.current;
        if (!host) return undefined;

        loadKetcherScript()
          .then((Ketcher) => {
            if (cancelled || !hostRef.current) return;
            const hostEl = hostRef.current;
            hostEl.innerHTML = '';
            // The vendored build exposes a small imperative bootstrap.
            const onInit = (ketcher) => {
              ketcherRef.current = ketcher;
              if (cancelled) return;
              setStatus('ready');
              setMessage('');
            };
            if (typeof Ketcher.mount === 'function') {
              Ketcher.mount(hostEl, {
                staticResourcesUrl: ASSET_BASE,
                onInit,
              });
            } else if (typeof Ketcher === 'function') {
              // Fallback: constructor form Ketcher(container, { onInit }).
              Ketcher(hostEl, { onInit, staticResourcesUrl: ASSET_BASE });
            } else {
              throw new Error('unsupported Ketcher build');
            }
          })
          .catch((error) => {
            if (cancelled) return;
            setStatus('error');
            setMessage(error instanceof Error ? error.message : String(error));
          });

        return () => {
          cancelled = true;
          // Best-effort teardown of the editor instance.
          const inst = ketcherRef.current;
          ketcherRef.current = null;
          if (inst && typeof inst.destroy === 'function') {
            try { inst.destroy(); } catch { /* ignore */ }
          }
          if (hostRef.current) hostRef.current.innerHTML = '';
        };
      }, [open, editorKey]);

      const insertText = (text) => {
        if (!text) return;
        if (!inputActions || typeof inputActions.insertText !== 'function' ||
            typeof inputActions.captureInsertion !== 'function') {
          setMessage('当前输入框不支持插入。');
          return;
        }
        const span = inputActions.captureInsertion();
        const ok = inputActions.insertText(text, span);
        if (!ok) setMessage('草稿已变化，请重试插入。');
      };

      const insertSmiles = async () => {
        const inst = ketcherRef.current;
        if (!inst) return;
        try {
          const smiles = await inst.getSmiles();
          insertText(smiles);
        } catch (error) {
          setMessage('获取 SMILES 失败：' + (error instanceof Error ? error.message : String(error)));
        }
      };

      const insertMolfile = async () => {
        const inst = ketcherRef.current;
        if (!inst) return;
        try {
          const mol = await inst.getMolfile();
          insertText(mol);
        } catch (error) {
          setMessage('获取 molfile 失败：' + (error instanceof Error ? error.message : String(error)));
        }
      };

      const clearStructure = () => {
        const inst = ketcherRef.current;
        if (inst && typeof inst.setMolecule === 'function') {
          try { inst.setMolecule(''); } catch { /* ignore */ }
        }
      };

      const toggleOpen = () => {
        setOpen((v) => {
          const next = !v;
          if (next) setEditorKey((k) => k + 1);
          return next;
        });
      };

      const btn = (label, onClick, opts = {}) => h('button', {
        type: 'button',
        onClick,
        disabled: opts.disabled === true,
        style: {
          appearance: 'none', border: 'none', borderRadius: 'var(--dsw-radius-sm, 6px)',
          padding: '6px 12px', fontSize: '13px', cursor: opts.disabled ? 'default' : 'pointer',
          background: opts.primary ? 'var(--dsw-alias-state-business-primary, #247bbf)' : 'var(--dsw-alias-interactive-bg-hover, #f0f0f0)',
          color: opts.primary ? '#fff' : 'var(--dsw-alias-label-primary, #222)',
          opacity: opts.disabled ? 0.5 : 1,
        },
      }, label);

      const rootStyle = {
        boxSizing: 'border-box',
        width: '100%',
        margin: '0 auto',
        borderRadius: 'var(--dsw-radius-lg, 12px)',
        background: 'var(--dsw-specific-menu, #fff)',
        boxShadow: 'var(--dsw-elevation-panel, 0 4px 16px rgba(0,0,0,0.12))',
        border: '1px solid var(--dsw-alias-border-l1, #e2e2e2)',
        overflow: 'hidden',
        color: 'var(--dsw-alias-label-primary, #222)',
      };

      const trigger = h('button', {
        type: 'button',
        onClick: toggleOpen,
        title: 'Ketcher 化学结构编辑器',
        'aria-expanded': open,
        style: {
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          appearance: 'none', background: 'transparent', border: 'none',
          color: 'var(--dsw-alias-label-secondary, #555)', cursor: 'pointer',
          fontSize: '13px', padding: '4px 8px', borderRadius: 'var(--dsw-radius-sm, 6px)',
        },
      }, [h(MoleculeIcon, { key: 'i' }), h('span', { key: 't' }, '结构式')]);

      if (!open) {
        return h('div', { style: { width: '100%', display: 'flex', justifyContent: 'flex-start' } }, trigger);
      }

      return h('div', { style: rootStyle }, [
        h('div', {
          key: 'head',
          style: {
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 12px', borderBottom: '1px solid var(--dsw-alias-border-l1, #eee)',
          },
        }, [
          h('span', { key: 'title', style: { fontSize: '13px', fontWeight: 600 } }, 'Ketcher 分子编辑器'),
          h('span', { key: 'spacer', style: { flex: '1 1 auto' } }),
          btn('插入 SMILES', insertSmiles, { disabled: status !== 'ready', primary: true }),
          btn('插入 molfile', insertMolfile, { disabled: status !== 'ready' }),
          btn('清空', clearStructure, { disabled: status !== 'ready' }),
          btn('收起', () => setOpen(false)),
        ]),
        h('div', {
          key: 'body',
          style: { position: 'relative', height: '420px', width: '100%', background: 'var(--dsw-alias-bg-layer1, #fafafa)' },
        }, [
          h('div', {
            key: 'host',
            ref: hostRef,
            style: { position: 'absolute', inset: 0 },
          }),
          status !== 'ready' ? h('div', {
            key: 'overlay',
            style: {
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center', padding: '24px',
              color: 'var(--dsw-alias-label-tertiary, #888)', fontSize: '13px',
              background: 'var(--dsw-alias-bg-layer1, #fafafa)',
            },
          }, status === 'error'
            ? 'Ketcher 资源未就绪：' + message + '\n（运行插件目录下的 `node scripts/build-vendor.mjs` 生成 vendor/ketcher-app.js）'
            : '正在加载 Ketcher…') : null,
        ]),
        message && status === 'ready'
          ? h('div', { key: 'msg', style: { padding: '6px 12px', fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, #c0392b)' } }, message)
          : null,
      ]);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'dsh-ketcher-panel',
          order: 20,
        }, KetcherPanel));
      },
    };
  },
});

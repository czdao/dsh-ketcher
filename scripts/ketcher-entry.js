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

import { JSDOM } from 'jsdom';
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.SVGElement = dom.window.SVGElement;
global.DOMMatrixReadOnly = dom.window.DOMMatrixReadOnly;
global.PointerEvent = dom.window.PointerEvent || dom.window.MouseEvent;
global.MutationObserver = dom.window.MutationObserver;
global.matchMedia = dom.window.matchMedia;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
// Node's fetch reaches the local Django API; jsdom does not provide one.
global.fetch = globalThis.fetch;
global.AbortController = globalThis.AbortController;
global.structuredClone = global.structuredClone || ((v) => JSON.parse(JSON.stringify(v)));

const out = path.resolve('tests/.bundle.mjs');
await esbuild.build({
  entryPoints: ['tests/flow.test.jsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  jsx: 'automatic',
  loader: { '.js': 'jsx', '.jsx': 'jsx', '.json': 'json' },
  define: {
    'process.env.NODE_ENV': '"development"',
    // the app reads this from Vite at build time; supply it here instead
    'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: process.env.API_BASE || 'http://127.0.0.1:8000' })
  },
  external: ['react', 'react-dom', 'react-dom/client', 'react-dom/test-utils', 'react-router-dom'],
  plugins: [
    {
      // CSS Modules: hand back a proxy so class names resolve to their key.
      name: 'css-modules-stub',
      setup(build) {
        build.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'cssmod' }));
        build.onLoad({ filter: /.*/, namespace: 'cssmod' }, () => ({
          contents: 'export default new Proxy({}, { get: (_, k) => String(k) });',
          loader: 'js'
        }));
      }
    }
  ]
});

const { run } = await import(out + '?t=' + Date.now());
const failures = await run();
fs.rmSync(out, { force: true });
process.exit(failures === 0 ? 0 : 1);

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP for the production build: the page can only load its own files,
// so history data provably cannot leave the browser. Injected only at build
// time because the dev server needs inline scripts and websockets for HMR.
// GitHub Pages cannot set response headers, so a <meta> tag is used.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const cspPlugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
    );
  },
};

export default defineConfig({
  plugins: [react(), cspPlugin],
  // Relative asset paths so the build works from any sub-path (e.g. GitHub Pages
  // project sites at https://<user>.github.io/<repo>/).
  base: './',
  build: { assetsInlineLimit: 0 },
});

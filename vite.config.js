// Vite build for Bullet Hell Micro.
// - Dev server on port 3000 (replaces the old zero-dependency server.js).
// - Production build goes to www/ with relative paths so Capacitor can load it from the APK.
// - A strict Content-Security-Policy is injected into the built index.html only
//   (the dev server needs inline scripts and websockets for hot reload).
import { defineConfig } from 'vite';

const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'"
].join('; ');

function injectCsp() {
    return {
        name: 'inject-csp',
        apply: 'build',
        transformIndexHtml(html) {
            return html.replace(
                '<meta charset="UTF-8">',
                `<meta charset="UTF-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`
            );
        }
    };
}

export default defineConfig({
    base: './',
    plugins: [injectCsp()],
    server: { port: 3000, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
        outDir: 'www',
        emptyOutDir: true,
        target: 'es2020',
        sourcemap: false,
        assetsInlineLimit: 0,
        chunkSizeWarningLimit: 1200,
        rollupOptions: { input: 'index.html' }
    }
});

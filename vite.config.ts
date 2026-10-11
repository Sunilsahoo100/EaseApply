import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

const root = import.meta.dirname;

// Builds the Angular side panel and the background service worker (ES module).
// The content script has its own config because it must be a classic IIFE script.
export default defineConfig({
  plugins: [angular({ tsconfig: resolve(root, 'tsconfig.app.json') })],
  resolve: { mainFields: ['module'] },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    minify: 'terser',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: resolve(root, 'sidepanel.html'),
        'service-worker': resolve(root, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});

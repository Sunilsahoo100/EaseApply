import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content scripts declared in the manifest can't be ES modules, so this bundles
// everything into a single self-contained IIFE file.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    rollupOptions: {
      input: resolve(import.meta.dirname, 'src/content/index.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        inlineDynamicImports: true,
      },
    },
  },
});

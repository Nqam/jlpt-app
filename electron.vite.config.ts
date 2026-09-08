import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: { entry: resolve(__dirname, 'shells/electron/main.ts') },
    },
    // content.db не бандлится: в dev main читает `resources/content.db` из корня репо,
    // в упакованной сборке — `process.resourcesPath/content.db` (кладётся через
    // `extraResources` в electron-builder.yml, задача 11).
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: { entry: resolve(__dirname, 'shells/electron/preload.ts') },
    },
  },
  renderer: {
    root: '.',
    base: './',
    server: { host: '127.0.0.1' },
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(
        process.env['npm_package_version'] ?? '0.0.0',
      ),
    },
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'index.html') },
    },
    plugins: [react()],
  },
});

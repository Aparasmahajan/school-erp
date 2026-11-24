import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The console API runs on :8788; Vite proxies /api so the browser sees one origin.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8788' } },
  },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});

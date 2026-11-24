import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :8787 and Vite proxies /api to it, so the browser sees a
// single origin and the session cookie works exactly as it will in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:8787' } },
  },
  build: { outDir: 'dist', target: 'es2022' },
});

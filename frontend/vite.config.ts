import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const BACKEND_HTTP = 'http://127.0.0.1:8000';

// The browser only talks to the Vite origin. REST goes through /api (prefix stripped) and the replay
// WebSocket through /ws, so there is no CORS in development or in `vite preview`.
function proxy(backend: string) {
  return {
    '/api': {
      target: backend,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ''),
    },
    '/ws': { target: backend.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
  };
}

export default defineConfig(({ mode }) => {
  const backend = loadEnv(mode, process.cwd(), '').VTAC_BACKEND_URL ?? BACKEND_HTTP;
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { port: 5173, proxy: proxy(backend) },
    preview: { port: 4173, proxy: proxy(backend) },
    build: { target: 'es2022', sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
    },
  };
});

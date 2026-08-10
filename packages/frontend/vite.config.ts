import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': proxyTarget,
      '/health': proxyTarget,
      '/artefacts': proxyTarget,
      '/records': proxyTarget,
      '/search': proxyTarget,
      '/doc/api': proxyTarget,
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});

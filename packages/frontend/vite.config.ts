import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const proxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [tailwindcss(), react()],
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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built site run from any folder or static host (HashRouter is used for routing)
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/v1': process.env.API_PROXY_TARGET || 'http://localhost:8001',
    },
  },
});

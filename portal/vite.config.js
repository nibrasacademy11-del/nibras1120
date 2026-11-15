import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the Express app at /portal. In development, API calls go to the local server.
export default defineConfig({
  base: '/portal/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/assets': 'http://localhost:3000',
      '/logo.png': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});

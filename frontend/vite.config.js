import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    // En desarrollo, proxea las llamadas al API hacia el backend FastAPI
    proxy: {
      '/generate': { target: 'http://localhost:8000', changeOrigin: true },
      '/api':       { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});

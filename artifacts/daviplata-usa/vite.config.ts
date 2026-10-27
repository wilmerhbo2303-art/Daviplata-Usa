import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src'),
      '@assets': path.resolve(projectRoot, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: projectRoot,
  build: {
    outDir: path.resolve(projectRoot, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});

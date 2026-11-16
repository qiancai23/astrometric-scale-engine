import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const THREE_PACKAGES = [
  '/node_modules/three/',
  '/node_modules/@react-three/',
  '/node_modules/three-stdlib/',
  '/node_modules/three-mesh-bvh/',
  '/node_modules/troika-',
  '/node_modules/maath/',
  '/node_modules/meshline/',
  '/node_modules/camera-controls/',
];

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const path = id.split('\\').join('/');
          if (THREE_PACKAGES.some((p) => path.includes(p))) return 'three';
          if (path.endsWith('/scripts/stars.json') || path.endsWith('/scripts/systemic.json')) return 'catalog';
          return undefined;
        },
      },
    },
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    watch: { ignored: ['**/artifacts/**', '**/.work/**'], usePolling: true, interval: 700 },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});

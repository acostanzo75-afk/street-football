import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build can be served from any sub-path
  // (e.g. costanzogabriel.io/street-football/).
  base: './',
  build: {
    target: 'es2022',
    // rapier3d-compat embeds its WASM as base64 (~3 MB) in the JS chunk by design.
    chunkSizeWarningLimit: 5500,
  },
});

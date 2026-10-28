import { defineConfig } from 'vite';

// ONNX Runtime's WebAssembly file is bundled by Vite as a local asset, so the app works offline.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: 'es2022' },
});

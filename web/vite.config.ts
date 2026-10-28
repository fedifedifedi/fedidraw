import { defineConfig, type Plugin } from 'vite';

/**
 * Preloads the two Latin font files used above the fold, so text is drawn with the final
 * fonts on first paint instead of shifting when they arrive (layout shift / CLS).
 */
function preloadFonts(): Plugin {
  const wanted = [/gochi-hand-latin-400-normal-.*\.woff2$/, /bricolage-grotesque-latin-wght-normal-.*\.woff2$/];
  return {
    name: 'fedidraw:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => wanted.some((re) => re.test(f)));
        return files.map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', href: `./${f}`, as: 'font', type: 'font/woff2', crossorigin: '' },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

// ONNX Runtime's WebAssembly file is bundled by Vite as a local asset, so the app works offline.
export default defineConfig({
  base: './',
  plugins: [preloadFonts()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { target: 'es2022' },
});

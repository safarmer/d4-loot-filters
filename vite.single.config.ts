import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// One JS bundle with everything inlined (data, bundled filters); tools/make_single.ts then folds the
// JS and CSS into one HTML file.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist-single",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

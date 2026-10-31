import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // relative asset paths: dist/ works from any static host or subfolder
  // the dev server may read the owner's filters next to editor/ (bundled via import.meta.glob)
  server: { fs: { allow: [".", "../Loot Filters"] } },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});

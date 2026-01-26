import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const rootDir = resolve(fileURLToPath(import.meta.url), "..");

const tailwindConfigCandidates = [
  resolve(rootDir, "frontend", "tailwind.config.js"),
  resolve(rootDir, "frontend", "tailwind.config.ts")
];

const tailwindConfigPath = tailwindConfigCandidates.find((path) => existsSync(path)) ?? tailwindConfigCandidates[0];

export default defineConfig({
  root: resolve(rootDir, "frontend"),
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: tailwindConfigPath }), autoprefixer()]
    }
  },
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true
  }
});

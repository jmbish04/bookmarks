import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindConfig from "./frontend/tailwind.config.js";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const rootDir = resolve(fileURLToPath(import.meta.url), "..");

export default defineConfig({
  root: resolve(rootDir, "frontend"),
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"]
  },
  css: {
    postcss: {
      plugins: [tailwindcss({ config: tailwindConfig }), autoprefixer()]
    }
  },
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true
  }
});

import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist", assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
  server: { port: 5199, strictPort: true, proxy: { "/api": "http://127.0.0.1:8787" } },
});

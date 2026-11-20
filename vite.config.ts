import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname, "src/web");
const pages = ["index", "menu", "pedido", "cocina", "admin", "aviso-legal", "privacidad", "cookies", "terminos", "404"];

export default defineConfig({
  root,
  publicDir: resolve(import.meta.dirname, "public"),
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(root, `${p}.html`)])),
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:8788" },
  },
});

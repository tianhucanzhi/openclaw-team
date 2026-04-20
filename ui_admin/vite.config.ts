import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  build: {
    outDir: path.resolve(here, "../dist/ui-admin"),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.OPENCLAW_ADMIN_SERVER_PORT ?? "38765"}`,
        changeOrigin: true,
      },
    },
  },
});

import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/portolan-ai",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // Stub optional peer deps from @standard-community/standard-json
      effect: resolve(__dirname, "src/stubs/empty.ts"),
      sury: resolve(__dirname, "src/stubs/empty.ts"),
      "@valibot/to-json-schema": resolve(__dirname, "src/stubs/empty.ts"),
    },
  },
  // react-draggable (via react-grid-layout) reads process.env.DRAGGABLE_DEBUG at
  // drag start; without a static replacement, `process` is undefined in the browser
  // and every panel drag throws ReferenceError.
  define: {
    "process.env.DRAGGABLE_DEBUG": "false",
  },
  build: {
    outDir: "out",
  },
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
    // config.define is not applied to pre-bundled deps in dev; mirror it here
    esbuildOptions: {
      define: {
        "process.env.DRAGGABLE_DEBUG": "false",
      },
    },
  },
});

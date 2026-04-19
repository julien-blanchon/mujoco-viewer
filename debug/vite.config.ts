import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUJOCO_SVELTE_SRC = path.resolve(
  __dirname,
  "../packages/mujoco-svelte/src/lib",
);
const VIEWER_UI_SRC = path.resolve(__dirname, "../packages/viewer-ui/src/lib");

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^mujoco-svelte$/,
        replacement: MUJOCO_SVELTE_SRC + "/index.ts",
      },
      { find: /^\$lib$/, replacement: VIEWER_UI_SRC },
      { find: /^\$lib\//, replacement: VIEWER_UI_SRC + "/" },
    ],
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: [".."],
    },
  },
  optimizeDeps: {
    exclude: ["mujoco-js", "mujoco-svelte", "@mujoco-viewer/viewer-ui"],
  },
});

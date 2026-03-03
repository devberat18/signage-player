import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  base: "./",
  plugins: [
    legacy({
      targets: ["chrome 56"],
      modernPolyfills: true,
    }),
  ],
  build: {
    target: "es2015",
    outDir: "dist",
  },
});

import { defineConfig } from "vite";

// Served from christophersoria.com/capitol-world/ in production.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/capitol-world/" : "/",
  build: { chunkSizeWarningLimit: 2000 },
}));

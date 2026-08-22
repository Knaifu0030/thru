import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Port 3000 is only a local developer convenience. Production is a static
// Vercel deployment connected to the public THRU gateway.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000, strictPort: true },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { charts: ["recharts"], motion: ["framer-motion"] },
      },
    },
  },
});

import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// En dev, /api et /ws sont redirigés vers le backend (localhost ou service docker).
const target = process.env.BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: {
    // Écoute sur le réseau local (joueurs sur le même wifi), par IP ou par nom mDNS (`machine.local`).
    host: true,
    allowedHosts: [".local"],
    proxy: {
      "/api": target,
      "/ws": { target, ws: true },
    },
  },
});

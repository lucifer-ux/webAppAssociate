import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ["VITE_", "CONTEXTCORE_"],
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), cloudflare()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
    allowedHosts: [
      "multilobed-scoriaceous-zayden.ngrok-free.dev"
    ]
  }
})
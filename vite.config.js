import { defineConfig } from "vite";

// Dev UX: the UI runs on :5173, the local API runs on :8787.
// This proxy makes fetch('/api/...') work in local dev without any 'backend URL' setting.
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The repo is split three ways: frontend/ (this app), backend/ (server code)
// and database/ (schema and migrations). Vite is pointed at frontend/ as its
// root, so index.html, src/ and public/ all resolve from there, while the build
// still lands in dist/ at the repo root — which is what vercel.json publishes.
//
// The config itself stays at the root because that is where npm runs and where
// Vercel looks for it.
export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: {
    // Relative to `root`, so this climbs back out to the repo root.
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    // Images dropped straight into frontend/public are often still being written
    // when the watcher sees them; Windows then reports the file as busy (EBUSY) and
    // the dev server crashes. The site never loads those loose files by path change,
    // so they are not watched (they are still served).
    watch: { ignored: ['**/frontend/public/*.png', '**/frontend/public/*.jpg', '**/frontend/public/*.jpeg', '**/frontend/public/*.webp'] },
    proxy: {
      // Soru Kutty chatbot, checkout and analytics: the local dev server in
      // backend/server/ holds the API keys server-side. On Vercel the same
      // handlers run as functions and no proxy is involved.
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})

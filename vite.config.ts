import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Honour an assigned port when the harness provides one, so the preview
    // lands where it is expected instead of hunting for a free port itself.
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // three.js is by far the largest dependency and it almost never
        // changes, so give it its own long-lived chunk instead of
        // re-downloading the whole bundle on every app edit.
        manualChunks: {
          three: ['three', 'three/examples/jsm/controls/OrbitControls.js'],
          motion: ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
})

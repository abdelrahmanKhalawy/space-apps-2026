import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build straight into the API's wwwroot so one link serves everything.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../api/wwwroot', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:5080', '/hubs': { target: 'http://localhost:5080', ws: true } } },
})

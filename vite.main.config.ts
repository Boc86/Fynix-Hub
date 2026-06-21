import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/main',
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'webtorrent'],
    },
  },
})

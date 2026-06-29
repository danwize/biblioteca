import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Biblioteca',
        short_name: 'Biblioteca',
        description: 'Scan, correct, and catalog physical books.',
        theme_color: '#16251f',
        background_color: '#f7f0df',
        display: 'standalone'
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/graphql': 'http://localhost:5000',
      '/images': 'http://localhost:5000'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
})

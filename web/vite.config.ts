import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vite build for the PWA. Output goes to web/dist, which the Express gateway
// serves. In dev, API paths are proxied to the gateway on :8787 so the app runs
// same-origin exactly like it does in production.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sunset LLM',
        short_name: 'Sunset',
        description: 'Chat over the best free LLM for each coding task',
        theme_color: '#1a0b2e',
        background_color: '#120a1f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Never cache the API; only precache the app shell.
        navigateFallbackDenylist: [/^\/v1/, /^\/auth/, /^\/status/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/v1': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
      '/status': 'http://localhost:8787',
    },
  },
})

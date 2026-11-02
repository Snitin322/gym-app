import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/** Onthec olive: status bar and splash screen. */
const themeColor = '#4a5141'

// The app calls the API at /api on its own origin, so the refresh cookie is first-party
// (Safari blocks third-party cookies). In dev Vite forwards /api to the local API; in
// production the Cloudflare Worker does the same.
const apiProxy = {
  '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', changeOrigin: true },
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.png', 'apple-touch-icon-180x180.png'],
      workbox: {
        // Never answer API requests from the offline cache or with the SPA shell.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        id: '/',
        name: 'Onthec Fitness Club',
        short_name: 'Onthec',
        description: 'Your membership, PT sessions and check-ins at Onthec Fitness Club.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: themeColor,
        background_color: themeColor,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true, proxy: apiProxy },
  preview: { host: true, proxy: apiProxy },
})

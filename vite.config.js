import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icons/daymark-192.png', 'icons/daymark-512.png', 'icons/daymark-512-maskable.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Daymark — make room for what matters',
        short_name: 'Daymark',
        description: 'A quiet little space for what matters.',
        theme_color: '#f7f6f4',
        background_color: '#f7f6f4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: './icons/daymark-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/daymark-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/daymark-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})

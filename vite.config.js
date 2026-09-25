import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/times-parking-pwa/',

  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      workbox: {
        globIgnores: ['**/status.json'],
        cleanupOutdatedCaches: true,
      },

      manifest: {
        name: 'タイムズ Parking Information',
        short_name: 'タイムズ Parking Information',
        description: 'タイムズ駐車場 空車情報',
        theme_color: '#ffd400',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',

        icons: [
          {
            src: 'times-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },

      devOptions: {
        enabled: true,
      },
    }),
  ],
})
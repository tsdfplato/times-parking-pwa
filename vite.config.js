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
      },

      manifest: {
        name: 'タイムズ Parking Information',
        short_name: 'タイムズ満空',
        description: '野田・吉野周辺のタイムズ駐車場 満空情報',
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


import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const isAndroidAssetBuild =
  process.env.VITE_ANDROID_ASSET === 'true'

export default defineConfig({
  // APKへ同梱する版は file:///android_asset/ から読むため相対パスにする。
  // GitHub Pages版は従来どおりリポジトリ配下の絶対パスを使う。
  base: isAndroidAssetBuild ? './' : '/times-parking-pwa/',

  plugins: [
    react(),

    VitePWA({
      registerType: 'prompt',

      workbox: {
        globIgnores: ['**/status.json'],
        cleanupOutdatedCaches: true,
        importScripts: ['push-handler.js'],
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

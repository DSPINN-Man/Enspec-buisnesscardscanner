/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // App shell gets cached. Everything else falls through to the network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Gemini proxy — never cache, always online.
            urlPattern: /\/api\/extract(\?|$)/,
            handler: 'NetworkOnly',
          },
          {
            // Sync endpoint — bypass service worker entirely.
            urlPattern: /\/api\/sync(\?|$)/,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'ENSPEC Card Scanner',
        short_name: 'Cards',
        description: 'Offline-first business card & conference badge scanner.',
        theme_color: '#EFEAE3',
        background_color: '#EFEAE3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});

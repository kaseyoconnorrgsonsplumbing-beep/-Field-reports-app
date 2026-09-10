import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['letterhead.jpg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'RG & Sons Field Reports',
        short_name: 'Field Reports',
        description: 'Walk a job, capture issues with photos and notes, generate a PDF report.',
        theme_color: '#1b2a5e',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,jpg,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/\.netlify\//],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 2000 },
});

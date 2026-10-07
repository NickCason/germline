/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

const BUILD_SHA = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  base: '/germline/',
  server: { host: '0.0.0.0', port: 5173 },
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'src/sim/**'],
  },
  define: {
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-16.png'],
      manifest: {
        name: 'Germline',
        short_name: 'Germline',
        description: 'Hold the line against the germ train.',
        theme_color: '#1b1730',
        background_color: '#1b1730',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/germline/',
        start_url: '/germline/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // New builds take over immediately so the home-screen app picks up
        // the latest version on next launch without a close/reopen dance.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});

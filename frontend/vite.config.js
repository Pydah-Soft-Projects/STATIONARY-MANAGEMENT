import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  // Get backend URL from environment variable or use default for development
  const backendUrl = env.VITE_API_BASE_URL || env.BACKEND_URL || 'http://localhost:5000';

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['Pydah_LOGO.png', 'vite.svg', 'offline.html'],
        manifest: {
          name: 'Pydah Stationery Management',
          short_name: 'Pydah Stationery',
          description: 'Offline-capable stationery management for the Pydah Group.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'Pydah_LOGO.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'Pydah_LOGO.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'Pydah_LOGO.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable any',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 10485760, // 10 MiB
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          cleanupOutdatedCaches: true,
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              urlPattern: ({ request }) =>
                request.destination === 'document' ||
                request.destination === 'style' ||
                request.destination === 'script' ||
                request.destination === 'worker',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'app-shell',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              urlPattern: /\/api\/.*$/i,
              handler: 'NetworkFirst',
              method: 'GET',
              options: {
                cacheName: 'api-get-cache',
                networkTimeoutSeconds: 10,
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 60 * 60 * 6, // 6 hours
                },
              },
            },
            {
              urlPattern: /\/api\/.*$/i,
              handler: 'NetworkOnly',
              method: 'POST',
              options: {
                backgroundSync: {
                  name: 'api-post-queue',
                  options: {
                    maxRetentionTime: 24 * 60, // retry for 24 hours
                  },
                },
              },
            },
            {
              urlPattern: /\/api\/.*$/i,
              handler: 'NetworkOnly',
              method: 'PUT',
              options: {
                backgroundSync: {
                  name: 'api-put-queue',
                  options: {
                    maxRetentionTime: 24 * 60,
                  },
                },
              },
            },
            {
              urlPattern: /\/api\/.*$/i,
              handler: 'NetworkOnly',
              method: 'DELETE',
              options: {
                backgroundSync: {
                  name: 'api-delete-queue',
                  options: {
                    maxRetentionTime: 24 * 60,
                  },
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          suppressWarnings: true,
        },
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
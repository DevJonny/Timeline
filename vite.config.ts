import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// `base` must match the GitHub Pages project path (github.com/DevJonny/Timeline
// is served from https://devjonny.github.io/Timeline/). All runtime fetches of
// files in public/ must go through import.meta.env.BASE_URL to honour it.
export default defineConfig({
  base: '/Timeline/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      // Only the Safari icon needs listing: the plugin precaches manifest
      // icons itself, so a PNG glob below would enter them twice.
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Timeline',
        short_name: 'Timeline',
        description:
          'A zoomable, inspectable timeline from the Stone Age to the present day.',
        start_url: '/Timeline/',
        scope: '/Timeline/',
        display: 'standalone',
        // Unlocked: the timeline is usable in both orientations, and it
        // preserves the visible year range across rotation.
        orientation: 'any',
        background_color: '#1a1a19',
        theme_color: '#1a1a19',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        /**
         * entries.json is precached, NOT left to a runtime cache.
         *
         * This is the main cache-invalidation trap for a data-driven PWA: a
         * runtime-cached index would let a stale service worker pin the entry
         * list forever, so newly published entries never appear. Precaching
         * makes Workbox revision the file per build, so a deploy that changes
         * the data also changes the precache manifest and forces an update.
         */
        /**
         * The focus index is precached for the same reason entries.json is:
         * it is an index, and a stale one hides timelines that have since been
         * published. The focuses' own entries and prose are not — they are
         * opened on demand and revalidate below.
         */
        globPatterns: [
          '**/*.{js,css,html,svg,woff2}',
          'data/entries.json',
          'data/focus/index.json',
        ],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Detail files are fetched on demand and are individually
            // immutable in practice, so stale-while-revalidate gives an
            // instant open with a background refresh.
            urlPattern: ({ url }) => url.pathname.includes('/data/details/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'entry-details',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // A focused timeline's own data: its metadata, its entries, and
            // its prose. Cached under its own name so one large focus cannot
            // evict the main timeline's details. The index is excluded — it is
            // precached above, and two routes claiming one URL is ambiguous.
            urlPattern: ({ url }) =>
              url.pathname.includes('/data/focus/') &&
              !url.pathname.endsWith('/data/focus/index.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'focus-data',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Off in dev: a service worker caching a dev server is a debugging
        // hazard, and the behaviour worth testing is the built output.
        enabled: false,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

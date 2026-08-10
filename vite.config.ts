import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// `base` must match the GitHub Pages project path (github.com/DevJonny/Timeline
// is served from https://devjonny.github.io/Timeline/). All runtime fetches of
// files in public/ must go through import.meta.env.BASE_URL to honour it.
export default defineConfig({
  base: '/Timeline/',
  plugins: [svelte()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});

# Timeline

A zoomable, inspectable vertical timeline running from the Stone Age
(c. 3,300,000 BCE) to the present day — where "present" is recomputed on every
page load.

Client-side only. No server, no API, no build-time data fetching.
Live at **https://devjonny.github.io/Timeline/**

## Stack

| Concern | Choice |
|---|---|
| UI | Svelte 5 (runes) |
| Build | Vite 8 |
| Language | TypeScript |
| Axis maths | `d3-scale`, `d3-zoom` |
| Data validation | `zod` (devDependency only — types are erased at build) |
| Tests | Vitest |
| Hosting | GitHub Pages via GitHub Actions |

There is deliberately **no SvelteKit**: this is a single client-rendered page
with no routing or SSR, so the router and `adapter-static` would be
configuration overhead solving nothing.

## Develop

```sh
npm install
npm run dev            # http://localhost:5173/Timeline/
npm run dev -- --host  # expose on LAN to test on a real phone
npm test
npm run check          # svelte-check
npm run build && npm run preview
```

Because the site is served from a subpath (`/Timeline/`), **every runtime fetch
of a file in `public/` must go through `import.meta.env.BASE_URL`**. A wrong
base path will not show up in `npm run dev` — only in `preview` and production.

## Deploying

Pushing to `main` runs tests, builds, and deploys via
`.github/workflows/deploy.yml`. Pages must be set to the **GitHub Actions**
source in repository settings.

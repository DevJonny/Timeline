# Timeline

A zoomable, inspectable vertical timeline running from the Stone Age
(c. 3,300,000 BCE) to the present day — where "present" is recomputed on every
page load.

The scale is broken where the record is. The Palaeolithic, Mesolithic and
Neolithic are 99.6% of that span and hold nothing, so they compress to a hatched
stub at the top rather than pushing everything that ever happened into the last
half-percent of the screen. Any age with nothing in it does the same, in either
kind of timeline; add an entry to one and it opens back up.

Over 200 entries: the periodising ages, the rise and fall of empires, British
and Scottish monarchs, prime ministers and presidents, the battles of both
world wars, and a century of armoured vehicles. What you see depends on how far
you have zoomed in.

Client-side only. No server, no API, no build-time data fetching.
**https://devjonny.github.io/Timeline/**

## Stack

| Concern | Choice |
|---|---|
| UI | Svelte 5 (runes) |
| Build | Vite 8 |
| Language | TypeScript |
| Axis maths | `d3-scale`, `d3-zoom` |
| Data validation | `zod` (devDependency only — never reaches the bundle) |
| Offline | `vite-plugin-pwa` (Workbox) |
| Tests | Vitest |
| Hosting | GitHub Pages via GitHub Actions |

There is deliberately **no SvelteKit**: this is a single client-rendered page
with no routing or SSR, so a router and `adapter-static` would be configuration
overhead solving nothing.

## Develop

```sh
npm install
npm run dev            # http://localhost:5173/Timeline/
npm run dev -- --host  # expose on the LAN to test on a real phone
npm test               # unit tests
npm run validate       # data integrity
npm run check          # svelte-check, warnings are errors
npm run build && npm run preview
npm run icons          # regenerate PWA icons (output is committed)

npm run brief -- /tmp/b/BRIEF.md   # authoring brief, generated from live data
npm run merge-staged -- /tmp/b     # merge staged entries; --apply to write
```

Because the site is served from a subpath, **every runtime fetch of a file in
`public/` must go through `import.meta.env.BASE_URL`**. A wrong base path will
not show up in `npm run dev` — only in `preview` and production.

The service worker is disabled in dev. To exercise offline behaviour, use
`npm run build && npm run preview`.

## Adding content

Content is data, not code. Add an entry to `public/data/entries.json`:

```json
{
  "id": "battle-of-hastings",
  "title": "Battle of Hastings",
  "type": "battle",
  "start": { "year": 1066, "month": 10, "day": 14 },
  "importance": 2,
  "keywords": ["england", "medieval", "norman-conquest"]
}
```

and a matching `public/data/details/battle-of-hastings.json`:

```json
{
  "id": "battle-of-hastings",
  "short": "One sentence, shown at the top of the detail sheet.",
  "full": "Longer prose. Blank lines separate paragraphs."
}
```

Then run `npm run validate`. CI runs it too, so a missing or misnamed detail
file fails the build rather than 404-ing for a reader.

| Field | Notes |
|---|---|
| `id` | Lowercase hyphenated slug. Must match the detail filename. |
| `type` | `age`, `empire`, `ruler`, `person`, `war`, `battle`, `event`. `ruler` spans a reign or term of office, not a lifetime; equipment and technologies use `event`, spanning introduction to withdrawal. |
| `start` / `end` | `year` is signed: `-3300` is 3300 BCE. **There is no year 0.** `month`/`day` optional; `circa: true` renders "c. 3300 BCE". |
| `end` | Omit for an instant. Use the string `"present"` for something ongoing. |
| `importance` | 1 (era-defining) to 5 (minor). Drives what appears at which zoom. **Start at 2** — see below. |
| `keywords` | Lowercase hyphenated slugs. Drive filtering and grouping. The search panel shows the sixteen most common, so prefer an existing slug to a synonym. |

**Importance is the main authoring lever.** It decides the zoom at which an
entry appears, so a timeline full of `1`s is as unreadable as one full of `5`s.

**Level 1 is closed.** It is what renders when the timeline is fully zoomed
out, and it belongs to the ages and the handful of spans already holding it.
New content starts at 2, and most of it belongs at 3 or 4.

### Focused timelines

A focused timeline covers one subject at a grain the main timeline has no room
for: pick **The Roman Empire** from the timelines menu and the axis becomes
27 BCE to 476 CE, with its own chapters, its own entries and its own search.

Each lives in `public/data/focus/<id>/`, listed in `public/data/focus/index.json`:

```json
{
  "schemaVersion": 1,
  "id": "roman-empire",
  "title": "The Roman Empire",
  "blurb": "One sentence for the menu.",
  "subject": "roman-empire",
  "range": { "start": { "year": -27 }, "end": { "year": 476 } },
  "select": { "keywords": ["rome"], "include": [], "exclude": ["byzantine-empire"] }
}
```

alongside an `entries.json` in the same shape as the main index and a
`details/` directory of prose.

| Field | Notes |
|---|---|
| `range` | The **opening view**, not the axis domain — the domain widens to hold anything the focus contains. |
| `select.keywords` | Main-timeline entries carrying any of these, and overlapping `range`, are inherited. Adding one to the main timeline later adds it here too. |
| `select.include` | Ids pulled in whatever their keywords, and whatever their dates. |
| `select.exclude` | Ids kept out. Beats both of the above — this is how you stop a neighbouring empire stretching the axis past the subject. |
| `subject` | Optional. The main-timeline entry this focus expands. |

Chapters are ordinary entries of type `age` at importance 1 — the only entries
in a focus that may hold 1 — and they become the rail down the right edge. A
chapter you have not written anything into yet collapses to a stub on the axis,
the same as an empty age on the main timeline, and reopens by itself once it
holds something.
`npm run validate` reports what each focus resolved to, which is the quickest
way to see whether a selector did what you meant.

### Adding a lot at once

Bulk additions are researched in parallel, one agent per subject area, writing
to staging directories that are merged centrally by `npm run merge-staged` —
which catches the things a single agent cannot see, chiefly the same subject
written twice under different ids. The brief those agents work from is
generated by `npm run brief` rather than kept in the repo, because it embeds
the ids and keywords that already exist and would otherwise go quietly out of
date. `.claude/skills/timeline-batch/` has the full workflow, and
`.claude/skills/timeline-focus/` the same thing for a focused timeline, where
the brief additionally carries the entries that focus already inherits.

## Architecture notes

Four decisions are load-bearing; changing them will break things in
non-obvious ways.

### Two year conventions

Data is authored *historically* (`-3300` is 3300 BCE, no year zero); the axis
needs a *continuous astronomical* coordinate (1 BCE is 0). Everything entering
the axis goes through `toDecimalYear`, everything shown to a human comes back
through a `format*` function. Never render a raw axis coordinate — and note
that ticks land on round *historical* years, or they read "3501 BCE".

### The zoom transform stays in data space

`src/lib/scale.ts` never CSS-transforms content. At the zoom levels this axis
reaches (k up to 1e7) a translate offset would exceed 1e10 pixels and browsers
lose sub-pixel fidelity. Positions are recomputed each frame from a rescaled
domain instead.

`transformForDomain` is the inverse of that rescale, and is the single function
behind every navigational affordance: zoom-to-extent, the saved default view,
era-rail jumps, deep links, and preserving the visible range across rotation.

### Four colours carry seven types

Timeline markers of different types sit adjacent arbitrarily, so the palette
must clear the **all-pairs** colourblind test, not the easier adjacent-pairs
one. Every subset of the reference palette larger than four fails it. So four
validated hues carry five families, and a **glyph** distinguishes types within
a family.

Two consequences are binding, not stylistic:

- dark mode carries a CVD warning between the conflict and age hues, legal only
  alongside a secondary channel — **every marker renders a glyph**;
- light mode puts two families under 3:1 contrast, triggering the relief rule —
  **every marker renders a visible text label**.

Do not add a fifth hue without re-running a palette validator.

### The search panel is the accessibility story

The viewport is a `role="application"` canvas that a screen reader cannot
meaningfully traverse. The search panel is a real, keyboard-navigable list of
every entry, and selecting from it does exactly what tapping a marker does. It
is not a convenience feature — nothing must ever be reachable only by pointing
at the canvas.

## Mobile

Phones and tablets are the primary target, not a responsive afterthought:

- `touch-action: none` on the viewport, or the browser claims the pinch before
  d3-zoom sees it. iOS Safari additionally needs its non-standard `gesture*`
  events cancelled. `user-scalable=no` is **not** used — it is an accessibility
  anti-pattern and iOS ignores it anyway.
- `100dvh`, never `100vh`; `env(safe-area-inset-*)` throughout.
- Resize and rotation preserve the visible *year range*, not the pixel offset.
- No hover exists: detail prefetch happens on selection and focus.
- Level-of-detail culling is a performance requirement, not decoration — it is
  what bounds the number of DOM nodes.

## Deploying

Pushing to `main` runs validate, typecheck, tests, build, and deploys via
`.github/workflows/deploy.yml`. Pages is set to the **GitHub Actions** source.

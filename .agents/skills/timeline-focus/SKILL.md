---
name: timeline-focus
description: Create or fill a focused timeline — a second timeline covering one subject (the Roman Empire, the Apollo programme) in far more detail than the main timeline can show. Use when asked to add a focused timeline, a deep dive, or a sub-timeline for a period, or to add entries to one that already exists.
---

# Focused timelines

A focus is a second timeline over one subject: its own domain, its own zoom,
its own dataset. It **inherits** the main-timeline entries that belong to its
period through a selector, and adds its own entries at a grain the main
timeline could never render — 27 BCE to 476 CE fills the screen, so a single
consulship is legible where on the main axis it would be a hundredth of a pixel.

The mechanism is documented in `AGENTS.md`; this skill is the authoring
procedure. It is `timeline-batch` with four differences, and every one of them
is a way the batch goes wrong if ignored:

1. the focus and its chapters must exist **before** any research is spawned;
2. the brief is generated with `--focus`, and carries the inherited ids;
3. importance means "within this period", and 1 belongs to the chapters;
4. the merge targets the focus, not `entries.json`.

## 1. Create the focus, if it does not exist

Four files. Write them by hand — this is editorial work, not research.

```
public/data/focus/index.json                    # add an entry
public/data/focus/<id>/focus.json               # metadata and selector
public/data/focus/<id>/entries.json             # start with the chapters
public/data/focus/<id>/details/<id>.json        # prose per chapter
```

`focus.json`:

```json
{
  "schemaVersion": 1,
  "id": "roman-empire",
  "title": "The Roman Empire",
  "blurb": "One sentence for the menu.",
  "subject": "roman-empire",
  "range": { "start": { "year": -27 }, "end": { "year": 476 } },
  "select": {
    "keywords": ["rome"],
    "include": [],
    "exclude": ["classical-antiquity", "roman-republic", "byzantine-empire"]
  }
}
```

The index duplicates `title`, `blurb` and `range` so the menu renders in one
request; validation fails if the copies disagree.

### Choosing the selector — the one judgement call

`range` is the **opening view**. The axis domain is the range *union everything
the focus contains*, so an entry that reaches outside the period widens the
axis rather than being dropped.

That makes `exclude` load-bearing. In the Roman example all three exclusions
exist for that reason:

- `classical-antiquity` — an age spanning 800 BCE to 500 CE would draw a band
  across the entire focus and add a meaningless chapter to the rail;
- `roman-republic` — ends exactly where the focus begins, and would drag the
  domain back to 509 BCE for one entry touching at the boundary;
- `byzantine-empire` — overlaps at 330 CE and would stretch the axis to 1453,
  putting the whole focus in the top third of the screen.

Run `npm run validate` after writing `focus.json`. It reports what the selector
actually caught:

```
  roman-empire: 7 own + 1 inherited, 27 BCE – 476 CE, 3 chapter(s)
```

Check that number before going further. If it inherits nothing, the keywords
are wrong — validation treats that as an error, because it is almost always a
typo rather than an intention.

### Chapters

A focus's chapters are ordinary entries of type `age` at importance 1, and they
are the only entries that may hold 1. They become the era rail — the table of
contents down the right edge — and they should **partition** the period without
overlapping, because the rail's ordering is its only spatial cue.

Keep the titles short: the rail renders initials, so "The Crisis of the Third
Century" becomes "TCO". "Third-Century Crisis" becomes "TC".

## 2. Generate the brief

```sh
node scripts/author-brief.ts /tmp/timeline-focus/BRIEF.md --focus roman-empire
```

**Never hand-write this or reuse an old copy.** Beyond the usual reasons, the
focus brief carries the list of **inherited ids** — the main-timeline entries
this focus already shows. Without it an agent researches Actium, finds it
missing from the focus's own `entries.json`, writes it, and the work is
discarded at merge.

Read it yourself before spawning anything.

## 3. Scope the categories

Same discipline as `timeline-batch`: assign every contested subject to exactly
one agent, and give each agent an explicit **NOT YOURS** list. Overlaps inside
a single subject are worse than across subject areas, because everything in the
focus is about one thing. For a Roman batch:

- Constantine is an emperor *and* the turning point for Christianity — the
  emperors agent owns him, the religion agent is told so.
- The Antonine Wall is a frontier *and* a construction project — one agent.
- The Edict on Maximum Prices is law *and* economic crisis — one agent.

Each agent prompt needs: `STAGING`, the brief path, its category keyword, a
target count, a suggested subject list, and the NOT YOURS list. Spawn them in a
single message so they run concurrently.

Remind each agent of the period. An entry outside `range` is not an error the
schema catches; it simply widens the axis and makes the focus worse.

## 4. Merge

```sh
node scripts/merge-staged.ts /tmp/timeline-focus --focus roman-empire
node scripts/merge-staged.ts /tmp/timeline-focus --focus roman-empire --apply
```

The id check spans both datasets: a focus entry may not reuse a main-timeline
id, because the focus renders inherited entries beside its own and two entries
under one id make a link ambiguous. Prefer a qualified id — `sack-of-rome-410`,
not `sack-of-rome`.

## 5. Validate and verify

```sh
npm run validate && npm run check && npm test && npm run build
npm run preview   # then use the agent-browser skill
```

Check specifically:

- **The main timeline is unchanged.** A focus adds no entries to it. If the
  zoomed-out view differs, something was merged into the wrong dataset.
- **The opening view of the focus** is populated but not crowded. Entering it
  should show the chapters, the major entries and a scattering of detail — not
  a bare band (importance inflated the wrong way) and not a wall of clusters.
- **The chapter rail** covers the period with no gaps.
- **A detail sheet on an inherited entry** — its prose comes from the main
  `details/` directory, not the focus's, and getting that wrong is invisible
  until you open one.
- **A deep link** to `#/f/<id>/e/<entry>`, and Back out of it.
- **No console errors** at any point.

`requestAnimationFrame` does not fire under agent-browser, so set the
`motion: 'reduced'` preference to make zoom synchronous and testable.

## 6. Report

Counts per category, the importance distribution, what agents skipped and why,
and the line `npm run validate` prints for the focus. Commit `focus.json`,
`entries.json`, the detail files and any `index.json` change together.

## Notes

- A focus needs no code change. If one seems to, check `AGENTS.md` first — the
  domain, the zoom ceiling and the importance gate are already generalised over
  the span, and a focus that renders badly is nearly always a data problem.
- Adding a matching entry to the *main* timeline later puts it in the focus
  automatically. That is the point of the selector, and it means a focus is
  never a fork of the data.

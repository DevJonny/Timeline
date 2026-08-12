---
name: timeline-batch
description: Add a batch of timeline entries by researching several subject areas in parallel. Use when asked to add entries, content, or subjects to the timeline in bulk - multiple categories, or one large area worth splitting. Covers scoping non-overlapping categories, spawning timeline-researcher agents, merging, and verifying.
---

# Adding a batch of timeline entries

Research runs in parallel, one `timeline-researcher` agent per subject area,
writing to isolated staging directories. Merging, validation and verification
happen centrally, here.

The failure modes are specific and none of them announce themselves: duplicate
subjects across agents, importance inflation that clutters the zoomed-out view,
keyword sprawl that crowds the search panel, and stale instructions that tell
agents the dataset is smaller than it is. Each step below exists because of one
of those.

## 1. Generate the brief

```sh
node scripts/author-brief.ts /tmp/timeline-batch/BRIEF.md
```

**Never hand-write this or reuse an old copy.** It embeds the existing ids and
the current keyword vocabulary, both of which change with every batch. A stale
brief tells agents that ids they are about to duplicate do not exist yet, and
nothing fails loudly — a duplicate only surfaces at merge, and a redundant
keyword never errors at all.

Read the generated brief yourself before spawning anything. It is also the
quickest way to see the dataset's current shape.

## 2. Scope the categories — the part that needs judgement

Before spawning, work out where the requested areas overlap, and assign every
contested subject to exactly one agent. This cannot be automated and is the
main thing that determines whether the batch is clean.

Overlaps are the norm, not the exception. Real examples from a previous batch:

- Most Sabaton songs are about the world wars, so the world-wars agent owned
  those and the Sabaton agent took only other eras.
- A Sabaton album about the Swedish Empire overlapped both the Sabaton and the
  empires categories, so it was carved out as its own exclusive area.
- Churchill is a prime minister *and* a wartime leader; the PM agent owned him
  and the world-wars agent was told so explicitly.
- Tanks belong to the equipment agent, so the world-wars agent got Kursk while
  the tanks agent got the Tiger.

For each agent, write into its prompt:

- `STAGING` — its own directory, and the path to the brief
- its category keyword, applied to every entry it writes
- a target count and a suggested subject list
- **a "NOT YOURS" list** naming subjects other agents own, and any already-existing
  entries its area would naturally include

Spawn them in a single message so they run concurrently.

## 3. Merge

```sh
node scripts/merge-staged.ts /tmp/timeline-batch            # dry run
node scripts/merge-staged.ts /tmp/timeline-batch --apply    # write
```

Every immediate subdirectory holding an `entries.json` is treated as a
category. Validation reuses the repo's own zod schemas and date helpers, so it
cannot drift from `npm run validate`.

It blocks on: schema violations, unreal dates, `end` before `start`, ids
claimed twice across agents or already in the dataset, entries without detail
files, and detail files without entries.

It reports without blocking: importance 1, which is what renders when fully
zoomed out and should stay reserved; and keyword pairs covering effectively the
same entries, which cost a chip slot in the search panel without narrowing
anything.

**Act on the reports before applying.** Fix keywords in the staging files, not
afterwards in the repo — staging is still cheap to rewrite.

## 4. Validate and verify

```sh
npm run validate && npm run check && npm test && npm run build
```

Then drive the built app, because passing the data gate says nothing about how
the timeline reads:

```sh
npm run preview   # then use the agent-browser skill
```

Check specifically:

- **Fully zoomed out is unchanged.** New entries should be gated out entirely.
  If the top-level view got busier, importance was inflated.
- **The densest period your batch touches.** Confirm clustering absorbs the
  overflow and the DOM stays bounded.
- **A broad filter**, matching a large fraction of entries. This relaxes the
  level-of-detail gate and pushes far more through lane packing than normal
  browsing does — the app's real scaling limit lives here, not in file size.
- **A detail sheet on a new entry**, confirming lazy loading and date
  formatting (BCE years especially).
- **No console errors** at any point.

Note that `requestAnimationFrame` does not fire under agent-browser, so set the
`motion: 'reduced'` preference to make zoom synchronous and testable.

## 5. Report

Give the counts per category, the importance distribution, anything agents
skipped and why, and the resulting `entries.json` size raw and gzipped. Commit
the data and the detail files together.

## Notes

- Agents have no shell and no repository access by design. If one produces
  malformed JSON, the merge reports it with a path — send that agent back to
  fix its own staging file rather than editing it here.
- If agents are interrupted mid-run, check the staging directories before
  resuming: `entries.json` often survives when the detail files do not. Tell
  each agent exactly what is already on disk so it does not repeat research.
- Resist growing a category past what the subject supports. An agent reporting
  "I found nine solid subjects, not twelve" is doing its job.

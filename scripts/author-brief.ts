/**
 * Generate the authoring brief handed to research agents.
 *
 * The brief is generated rather than kept as a file on purpose. It states the
 * ids that already exist and the keyword vocabulary in use, and both change
 * every time a batch lands — a brief written down in January tells agents in
 * March that 33 entries exist, and they duplicate the other 178 in good faith.
 * Nothing fails loudly when that happens: a duplicate id only collides at
 * merge, and a redundant keyword never errors at all.
 *
 * It also restates the schema, which lives in `types.ts` and `schema.ts`. That
 * is why this script imports `ENTRY_TYPES` rather than listing the types: if
 * someone adds a type, the brief follows without anyone remembering to edit it.
 *
 * With `--focus`, the same brief is calibrated for a focused timeline instead:
 * a narrower period, its own keyword vocabulary, and — the part that matters
 * most — the main-timeline entries that focus *inherits*, which an agent would
 * otherwise cheerfully research again.
 *
 * Usage:
 *   node scripts/author-brief.ts                             # to stdout
 *   node scripts/author-brief.ts path/BRIEF.md               # to a file
 *   node scripts/author-brief.ts path/BRIEF.md --focus rome  # for a focus
 *
 * Runs under Node's strip-only TypeScript mode — no build step.
 */

/// <reference types="node" />

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inheritedEntries } from '../src/lib/focus.ts';
import { formatRange, presentDecimalYear } from '../src/lib/time.ts';
import { ENTRY_TYPES } from '../src/lib/types.ts';
import type { Detail, EntriesFile, Entry, Focus } from '../src/lib/types.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(ROOT, 'public', 'data');
const DETAILS_DIR = join(DATA_DIR, 'details');
const FOCUS_DIR = join(DATA_DIR, 'focus');

/** How many real entries to show per importance level, as calibration. */
const EXEMPLARS_PER_LEVEL = 3;

/** The search panel renders this many keyword chips, highest count first. */
const KEYWORD_CHIP_LIMIT = 16;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

function exemplarsFor(entries: Entry[], importance: number): string {
  const matches = entries
    .filter((e) => e.importance === importance)
    .slice(0, EXEMPLARS_PER_LEVEL)
    .map((e) => `\`${e.id}\``);
  return matches.length > 0 ? matches.join(', ') : '_nothing at this level yet_';
}

function keywordCounts(entries: Entry[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const keyword of entry.keywords) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** A real detail file beats a written-down example, which drifts from house style. */
async function proseExample(): Promise<Detail | null> {
  const preferred = 'battle-of-hastings.json';
  let files: string[];
  try {
    files = (await readdir(DETAILS_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  const chosen = files.includes(preferred) ? preferred : files[0]!;
  return (await readJson(join(DETAILS_DIR, chosen))) as Detail;
}

/**
 * What the brief is being written about.
 *
 * The main timeline and a focus differ in five places — the pool the exemplars
 * and vocabulary come from, the period entries must fall in, what importance 1
 * is reserved for, and which ids are already taken. Everything else in the
 * brief is identical, so it is one template with these substituted rather than
 * two that would drift apart.
 */
interface Subject {
  /** The dataset the agent is adding to. */
  pool: Entry[];
  heading: string;
  /** Period constraint, or empty for the main timeline. */
  period: string;
  reserved: string;
  /** Ids that must not be reused, grouped by why. */
  taken: Array<{ label: string; ids: string[] }>;
}

async function focusSubject(id: string, main: Entry[]): Promise<Subject> {
  const focus = (await readJson(join(FOCUS_DIR, id, 'focus.json'))) as Focus;
  const file = (await readJson(join(FOCUS_DIR, id, 'entries.json'))) as EntriesFile;
  const own = file.entries;
  const inherited = inheritedEntries(focus, main, presentDecimalYear());
  const range = formatRange(focus.range.start, focus.range.end);

  const chapters = own
    .filter((entry) => entry.type === 'age')
    .map((entry) => `\`${entry.id}\` (${formatRange(entry.start, entry.end)})`);

  return {
    pool: own,
    heading: `# Authoring brief — ${focus.title}

Generated from the live dataset. This is a **focused timeline**, not the main
one: it covers ${range} alone, at a grain the whole of history has no room for.
Entries you write here appear only in this focus.`,
    period: `## 0. The period — ${range}

Every entry must fall inside it. Something that merely leads up to the period
or follows from it belongs on the main timeline, not here.

The focus is divided into these chapters, which are already written:

${chapters.length > 0 ? chapters.map((c) => `- ${c}`).join('\n') : '_none yet_'}`,
    reserved: `**Level 1 is reserved for the chapters above** and is closed. Everything you
write starts at 2. Because this timeline spans ${range} rather than the whole
of history, the scale is compressed: a 3 here means significant *within this
period*, not within all of history.`,
    taken: [
      { label: `already in this focus`, ids: own.map((e) => e.id).sort() },
      {
        label:
          `inherited from the main timeline — this focus already shows every one of ` +
          `these, so writing them again produces a duplicate that is discarded at merge`,
        ids: inherited.map((e) => e.id).sort(),
      },
    ],
  };
}

function mainSubject(entries: Entry[]): Subject {
  return {
    pool: entries,
    heading: `# Timeline data authoring brief

Generated from the live dataset — ${entries.length} entries. Do not cache this
file; regenerate it for every batch.

You are adding entries to a zoomable historical timeline (a static Svelte app).
Content is pure data: an index entry plus a prose detail file per subject.`,
    period: '',
    reserved: `**Level 1 is effectively closed.** It is what renders when the timeline is
fully zoomed out, and it is reserved for the ages and the few spans already
holding it. Do not use it.`,
    taken: [{ label: 'existing', ids: entries.map((e) => e.id).sort() }],
  };
}

function indentAsQuote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n');
}

interface Args {
  out: string | undefined;
  focus: string | undefined;
}

function parseArgs(argv: string[]): Args {
  let out: string | undefined;
  let focus: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--focus=')) {
      focus = arg.slice('--focus='.length);
    } else if (arg === '--focus') {
      focus = argv[++i];
    } else if (!arg.startsWith('-')) {
      out ??= arg;
    }
  }

  return { out, focus };
}

async function main(): Promise<void> {
  const { out, focus: focusId } = parseArgs(process.argv.slice(2));

  const file = (await readJson(join(DATA_DIR, 'entries.json'))) as EntriesFile;
  const mainEntries = file.entries;

  const subject =
    focusId === undefined ? mainSubject(mainEntries) : await focusSubject(focusId, mainEntries);

  const entries = subject.pool;
  const keywords = keywordCounts(entries);
  const example = await proseExample();

  const chipThreshold = keywords[KEYWORD_CHIP_LIMIT - 1]?.[1] ?? 1;

  const brief = `${subject.heading}

Read this whole file before writing anything. Your category, target count and
ownership boundaries are in your own task prompt.

${subject.period}

## 1. Output — write ONLY to your own staging directory

Your prompt gives you \`STAGING\`.

- \`STAGING/entries.json\` — a **JSON array** of entry objects (NOT wrapped in an
  envelope, just \`[ {...}, {...} ]\`).
- \`STAGING/details/<id>.json\` — one file per entry, named exactly \`<id>.json\`.

**Never touch the repository.** Another process merges your output. Do not read
or write another agent's staging directory.

**Write incrementally.** Write \`entries.json\` first and confirm it parses, then
write detail files in batches of about five. Agents have been interrupted
mid-run before, and everything unwritten at that moment was lost.

## 2. Entry schema — validated strictly, extra fields are rejected

\`\`\`json
{
  "id": "battle-of-hastings",
  "title": "Battle of Hastings",
  "type": "battle",
  "start": { "year": 1066, "month": 10, "day": 14 },
  "end":   { "year": 1087 },
  "importance": 2,
  "keywords": ["england", "medieval", "norman-conquest"]
}
\`\`\`

| Field | Rule |
|---|---|
| \`id\` | lowercase hyphenated slug, \`^[a-z0-9]+(-[a-z0-9]+)*$\`. Unique. Matches the detail filename. |
| \`title\` | Human title, plain text. |
| \`type\` | Exactly one of: ${ENTRY_TYPES.map((t) => `\`${t}\``).join(', ')}. **Never invent a type.** |
| \`start\` | \`{ year, month?, day?, circa? }\` |
| \`end\` | Same shape, or the string \`"present"\`, or **omit** for an instantaneous event. |
| \`importance\` | Integer 1–5. See §4. |
| \`keywords\` | Non-empty array of lowercase hyphenated slugs. |

No other keys are permitted — the schema uses strict objects and rejects
\`description\`, \`notes\`, \`source\` and the like.

### Dates

- \`year\` is **signed and historical**: \`-480\` means 480 BCE, \`1066\` means 1066 CE.
- **There is no year 0.** 1 BCE is followed directly by 1 CE; \`year: 0\` is rejected.
- \`month\` 1–12, \`day\` 1–31, and must be a **real calendar date**.
- \`day\` requires \`month\`. Year alone is fine.
- \`end\` must be after \`start\`.
- \`circa: true\` renders "c. 1200 BCE" — for genuinely approximate dates, not
  for dates you failed to look up.
- \`"present"\` for something still ongoing.

## 3. Choosing \`type\`

- \`ruler\` — anyone holding executive office for a term: monarchs, prime
  ministers, presidents. Span = **reign or term of office**, not lifespan.
- \`person\` — a notable figure without such office. Span = lifetime.
- \`empire\` / \`age\` — long political or periodising spans.
- \`war\` — a whole war. \`battle\` — a single engagement or siege.
- \`event\` — everything else discrete: treaties, assassinations, disasters,
  technologies, machines. **Equipment uses \`event\`** (see \`printing-press\`),
  spanning introduction to withdrawal.

The palette carries these ${ENTRY_TYPES.length} types on four colourblind-validated hues. Adding a
type would need a fifth, so there is no other option.

## 4. \`importance\` — 1 is most important, 5 is least

It drives the level-of-detail gate: \`1\` is visible fully zoomed out, \`5\` only
when zoomed right in. Calibrate against what is already there:

| Value | Meaning | Already at this level |
|---|---|---|
| 1 | Era-defining; shapes the whole timeline | ${exemplarsFor(entries, 1)} |
| 2 | Major; globally or nationally pivotal | ${exemplarsFor(entries, 2)} |
| 3 | Clearly significant | ${exemplarsFor(entries, 3)} |
| 4 | A standard member of your set | ${exemplarsFor(entries, 4)} |
| 5 | Minor, brief or specialist | ${exemplarsFor(entries, 5)} |

${subject.reserved} Aim for a pyramid: roughly 10% at 2, 30% at 3, 45% at 4,
15% at 5.

Note that 5 is the deepest tier and only appears at the very closest zoom, so
it is for genuine marginalia. When in doubt between 4 and 5, choose 4.

## 5. Keywords

The search panel shows only the **top ${KEYWORD_CHIP_LIMIT} keywords by count** — currently
everything at ${chipThreshold} uses or more. A slug that always travels with another
one takes a chip slot without narrowing anything, so prefer an existing term
over a synonym, and do not add a second keyword that means what the first
already says.

Give each entry 3–5 keywords: your category keyword (from your prompt) on every
entry, then reuse this vocabulary wherever it fits.

\`\`\`
${keywords.map(([k, n]) => `${k}:${n}`).join('  ')}
\`\`\`

Add new slugs only where nothing existing fits. Rare slugs are fine — they
never reach the chip list but still work in search, and they earn their keep
once a reader has filtered down.

## 6. Detail files

\`\`\`json
{ "id": "<matches the entry>", "short": "One sentence.", "full": "Para one.\\n\\nPara two." }
\`\`\`

Only these three keys.

- \`short\` — one sentence, under ~90 characters, saying why it matters. Not a
  restatement of the title.
- \`full\` — **two paragraphs**, 120–200 words total, separated by \`\\n\\n\`.

House style, taken from the current dataset — match it closely:

${example ? indentAsQuote(example.full) : '_no detail files yet_'}

Concrete, specific, quietly authoritative. Names, numbers, consequences. No
hype ("legendary", "iconic"), no rhetorical questions, no addressing the
reader. Prefer the second paragraph to explain *what followed*.

## 7. Accuracy is the whole job

- **Verify every date with a web search** unless you would bet a year's salary
  on it. Regnal dates, terms of office, service-entry dates and battle dates
  are where errors creep in.
- If you cannot confirm a month or day, **omit it**. A correct year beats a
  fabricated day.
- Where dates are disputed, take the mainstream scholarly convention, use
  \`circa\` if genuinely approximate, and say so in the prose.
- Do not invent subjects to hit a count. Fewer, correct entries beat padding.

## 8. Do not duplicate these ids

${subject.taken
  .map(
    ({ label, ids }) =>
      `**${ids.length} ${label}:**\n\n\`\`\`\n${ids.length > 0 ? ids.join(', ') : '(none)'}\n\`\`\``,
  )
  .join('\n\n')}

If your category would naturally include one, skip it — it is covered. Do not
create a variant id for the same subject (\`ww2\`, \`hastings\`). Your prompt also
lists subjects owned by other agents; respect those boundaries, because
duplicates are thrown away at merge and a discarded entry is wasted work.

## 9. When finished, report back

- how many entries you wrote, and the id list
- any subject you deliberately skipped, and why
- anything whose dates you could not pin down precisely
- any new keyword slugs you introduced
`;

  if (out === undefined) {
    process.stdout.write(brief);
    return;
  }
  await writeFile(out, brief, 'utf8');
  console.log(
    `Brief written to ${out} — ${focusId === undefined ? 'main timeline' : `focus "${focusId}"`}, ` +
      `${entries.length} entries, ${keywords.length} keywords, chip threshold ${chipThreshold}.`,
  );
}

await main();

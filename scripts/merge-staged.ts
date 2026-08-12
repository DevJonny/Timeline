/**
 * Merge staged entries produced by parallel research agents.
 *
 * Validation reuses `schema.ts` and `time.ts` — the same schemas and date
 * helpers `validate-data.ts` runs on. A hand-rolled copy here would drift from
 * them silently, and the whole point of this script is to catch drift before
 * it reaches the repo.
 *
 * It then checks the two things only a merge can see, because each agent
 * validates happily in isolation:
 *   - the same id claimed by two different agents, or by an existing entry
 *   - detail files with no entry, and entries with no detail file
 *
 * And reports the two things that are legal but degrade the app:
 *   - keywords that always travel with another keyword, which occupy a chip
 *     slot in the search panel without narrowing anything
 *   - importance 1, which is what renders fully zoomed out
 *
 * Usage:
 *   node scripts/merge-staged.ts <staging-root>                    # dry run
 *   node scripts/merge-staged.ts <staging-root> --apply            # write
 *   node scripts/merge-staged.ts <staging-root> --focus rome       # into a focus
 *
 * Each immediate subdirectory of <staging-root> holding an entries.json is
 * treated as one category.
 *
 * With `--focus`, the merge targets that focused timeline's files instead of
 * the main dataset. The id check then spans both: a focus entry may not reuse
 * a main-timeline id, because the focus renders inherited main entries
 * alongside its own and two entries under one id make a link ambiguous.
 *
 * Runs under Node's strip-only TypeScript mode — no build step.
 */

/// <reference types="node" />

import { readFile, writeFile, readdir, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { detailSchema, entriesFileSchema, entrySchema } from '../src/lib/schema.ts';
import { isValidDate, presentDecimalYear, resolveEnd, toDecimalYear } from '../src/lib/time.ts';
import type { Entry } from '../src/lib/types.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(ROOT, 'public', 'data');
const DETAILS_DIR = join(DATA_DIR, 'details');
const ENTRIES_FILE = join(DATA_DIR, 'entries.json');
const FOCUS_DIR = join(DATA_DIR, 'focus');

/** Below this a shared keyword is too rare to be worth reporting. */
const REDUNDANCY_FLOOR = 3;

/**
 * How much of the larger keyword's entries the smaller must cover before the
 * pair counts as redundant rather than as a useful refinement.
 */
const OVERLAP_THRESHOLD = 0.8;

interface Staged {
  category: string;
  entry: Entry;
  detailPath: string;
}

const errors: string[] = [];
const notes: string[] = [];
const fail = (where: string, message: string) => errors.push(`${where}: ${message}`);

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${path} is not valid JSON — ${(cause as Error).message}`);
  }
}

function checkDates(entry: Entry, where: string, present: number): void {
  if (!isValidDate(entry.start)) {
    fail(where, `start is not a real date: ${JSON.stringify(entry.start)}`);
    return;
  }
  if (entry.end === undefined) return;
  if (entry.end !== 'present' && !isValidDate(entry.end)) {
    fail(where, `end is not a real date: ${JSON.stringify(entry.end)}`);
    return;
  }
  const start = toDecimalYear(entry.start);
  const end = resolveEnd(entry.end, present);
  if (end < start) fail(where, `end (${end}) is before start (${start})`);
}

/**
 * Keywords covering effectively the same entries as another keyword.
 *
 * A plain subset test is not enough: `tudor` sits inside `early-modern` but
 * narrows 44 entries to 6, which is exactly what a keyword is for. Redundancy
 * is when the two sets are nearly identical — `us-politics` on all 23 entries
 * that already carry `us-president` — so one of them can never narrow anything
 * the other has not, and only costs a chip slot.
 */
function redundantKeywords(entries: Entry[]): string[] {
  const byKeyword = new Map<string, Set<string>>();
  for (const entry of entries) {
    for (const keyword of entry.keywords) {
      let set = byKeyword.get(keyword);
      if (set === undefined) {
        set = new Set<string>();
        byKeyword.set(keyword, set);
      }
      set.add(entry.id);
    }
  }

  const found: string[] = [];
  const reported = new Set<string>();

  for (const [keyword, ids] of byKeyword) {
    if (ids.size < REDUNDANCY_FLOOR) continue;
    for (const [other, otherIds] of byKeyword) {
      if (other === keyword || otherIds.size < ids.size) continue;

      // Only interesting when the smaller set is most of the larger one.
      if (ids.size / otherIds.size < OVERLAP_THRESHOLD) continue;

      let subset = true;
      for (const id of ids) {
        if (!otherIds.has(id)) {
          subset = false;
          break;
        }
      }
      if (!subset) continue;

      const pair = [keyword, other].sort().join(' ');
      if (reported.has(pair)) continue;
      reported.add(pair);

      found.push(
        ids.size === otherIds.size
          ? `"${keyword}" and "${other}" cover the same ${ids.size} entries — drop one`
          : `"${keyword}" (${ids.size}) never appears without "${other}" (${otherIds.size})`,
      );
      break;
    }
  }
  return found;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let stagingRoot: string | undefined;
  let focusId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--focus=')) focusId = arg.slice('--focus='.length);
    else if (arg === '--focus') focusId = argv[++i];
    else if (!arg.startsWith('-')) stagingRoot ??= arg;
  }

  if (stagingRoot === undefined) {
    console.error(
      'Usage: node scripts/merge-staged.ts <staging-root> [--apply] [--focus <id>]',
    );
    process.exitCode = 1;
    return;
  }
  const apply = argv.includes('--apply');
  const present = presentDecimalYear();

  const targetEntriesFile =
    focusId === undefined ? ENTRIES_FILE : join(FOCUS_DIR, focusId, 'entries.json');
  const targetDetailsDir =
    focusId === undefined ? DETAILS_DIR : join(FOCUS_DIR, focusId, 'details');

  const existingFile = entriesFileSchema.parse(await readJson(targetEntriesFile));
  const claimed = new Map<string, string>();
  for (const entry of existingFile.entries) {
    claimed.set(entry.id, focusId === undefined ? 'existing dataset' : `the "${focusId}" focus`);
  }

  // A focus renders inherited main entries beside its own, so an id taken on
  // the main timeline is taken here too — and this is the last place to catch
  // it before it becomes a validation failure on a directory full of prose.
  if (focusId !== undefined) {
    const mainFile = entriesFileSchema.parse(await readJson(ENTRIES_FILE));
    for (const entry of mainFile.entries) {
      if (!claimed.has(entry.id)) claimed.set(entry.id, 'the main timeline');
    }
  }

  const categories = (await readdir(stagingRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const staged: Staged[] = [];
  const summaries: string[] = [];

  for (const category of categories) {
    const dir = join(stagingRoot, category);
    let raw: unknown;
    try {
      raw = await readJson(join(dir, 'entries.json'));
    } catch {
      continue; // not a category directory
    }

    if (!Array.isArray(raw)) {
      fail(category, 'entries.json must be a bare array of entries');
      continue;
    }

    const detailDir = join(dir, 'details');
    let unclaimedDetails = new Set<string>();
    try {
      unclaimedDetails = new Set(
        (await readdir(detailDir)).filter((f) => f.endsWith('.json')),
      );
    } catch {
      fail(category, 'details/ directory is missing');
    }

    const distribution = new Map<number, number>();

    for (const candidate of raw) {
      const parsed = entrySchema.safeParse(candidate);
      if (!parsed.success) {
        const id =
          typeof (candidate as { id?: unknown })?.id === 'string'
            ? (candidate as { id: string }).id
            : '<unparseable>';
        for (const issue of parsed.error.issues) {
          fail(`${category}/${id} at /${issue.path.join('/')}`, issue.message);
        }
        continue;
      }

      const entry = parsed.data;
      const where = `${category}/${entry.id}`;

      checkDates(entry, where, present);

      const owner = claimed.get(entry.id);
      if (owner !== undefined) fail(where, `duplicate id — already claimed by ${owner}`);
      else claimed.set(entry.id, category);

      if (new Set(entry.keywords).size !== entry.keywords.length) {
        fail(where, 'duplicate keywords');
      }
      if (entry.importance === 1) {
        notes.push(
          focusId === undefined
            ? `${where}: importance 1 renders fully zoomed out — is that intended?`
            : `${where}: importance 1 is reserved for this focus's chapters — is that intended?`,
        );
      }

      const detailFile = `${entry.id}.json`;
      if (!unclaimedDetails.has(detailFile)) {
        fail(where, `no detail file at ${category}/details/${detailFile}`);
      } else {
        unclaimedDetails.delete(detailFile);
        const detail = detailSchema.safeParse(await readJson(join(detailDir, detailFile)));
        if (!detail.success) {
          for (const issue of detail.error.issues) {
            fail(`${category}/details/${detailFile} at /${issue.path.join('/')}`, issue.message);
          }
        } else if (detail.data.id !== entry.id) {
          fail(`${category}/details/${detailFile}`, `declares id "${detail.data.id}"`);
        }
      }

      distribution.set(entry.importance, (distribution.get(entry.importance) ?? 0) + 1);
      staged.push({ category, entry, detailPath: join(detailDir, detailFile) });
    }

    for (const orphan of unclaimedDetails) {
      fail(`${category}/details/${orphan}`, 'orphan — no entry references this id');
    }

    const shape = [1, 2, 3, 4, 5].map((i) => `${i}:${distribution.get(i) ?? 0}`).join(' ');
    const count = staged.filter((s) => s.category === category).length;
    summaries.push(`  ${category.padEnd(16)} ${String(count).padStart(3)} entries   ${shape}`);
  }

  console.log(
    focusId === undefined
      ? 'Merging into the main timeline.'
      : `Merging into the "${focusId}" focused timeline.`,
  );
  console.log('\nStaged categories:');
  for (const line of summaries) console.log(line);
  console.log(
    `\n  new: ${staged.length}   existing: ${existingFile.entries.length}   ` +
      `final: ${existingFile.entries.length + staged.length}`,
  );

  const redundant = redundantKeywords([...existingFile.entries, ...staged.map((s) => s.entry)]);
  if (redundant.length > 0) {
    console.log('\nRedundant keywords (a chip slot each, no narrowing):');
    for (const line of redundant) console.log(`  • ${line}`);
  }

  if (notes.length > 0) {
    console.log('\nWorth a look:');
    for (const note of notes) console.log(`  • ${note}`);
  }

  if (errors.length > 0) {
    console.error(`\n✗ Merge blocked by ${errors.length} problem(s):\n`);
    for (const error of errors) console.error(`  • ${error}`);
    console.error('');
    process.exitCode = 1;
    return;
  }

  console.log('\n✓ All checks passed.');

  if (!apply) {
    console.log('Dry run — pass --apply to write.');
    return;
  }

  // Append by category, chronological within each: the existing entries keep
  // their positions so the diff stays reviewable, and related subjects group.
  const ordered = categories.flatMap((category) =>
    staged
      .filter((s) => s.category === category)
      .sort((a, b) => toDecimalYear(a.entry.start) - toDecimalYear(b.entry.start)),
  );

  existingFile.entries.push(...ordered.map((s) => s.entry));
  await writeFile(targetEntriesFile, `${JSON.stringify(existingFile, null, 2)}\n`, 'utf8');

  await mkdir(targetDetailsDir, { recursive: true });
  for (const item of ordered) {
    await copyFile(item.detailPath, join(targetDetailsDir, `${item.entry.id}.json`));
  }

  console.log(`\nWrote ${ordered.length} entries and ${ordered.length} detail files.`);
  console.log('Run `npm run validate` next.');
}

await main();

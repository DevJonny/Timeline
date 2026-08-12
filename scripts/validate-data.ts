/**
 * Data integrity gate. Run with `npm run validate` and in CI before build.
 *
 * The site is data-driven and fetches `details/{id}.json` lazily at runtime, so
 * a missing or misnamed detail file is invisible until a user taps the entry in
 * production. This script is what makes that class of bug impossible to ship.
 *
 * Runs directly under Node's native TypeScript stripping — no build step.
 */

/// <reference types="node" />

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveFocus } from '../src/lib/focus.ts';
import { detailSchema, entriesFileSchema, focusIndexSchema, focusSchema } from '../src/lib/schema.ts';
import {
  formatRange,
  isValidDate,
  presentDecimalYear,
  resolveEnd,
  toDecimalYear,
} from '../src/lib/time.ts';
import type { Entry, Focus } from '../src/lib/types.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(ROOT, 'public', 'data');
const DETAILS_DIR = join(DATA_DIR, 'details');
const ENTRIES_FILE = join(DATA_DIR, 'entries.json');
const FOCUS_DIR = join(DATA_DIR, 'focus');

const errors: string[] = [];
const fail = (where: string, message: string) => errors.push(`${where}: ${message}`);

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${path} is not valid JSON — ${(cause as Error).message}`);
  }
}

function checkDates(entry: Entry, present: number): void {
  const where = `entry "${entry.id}"`;

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
 * Ids must be unique, keywords must not repeat within an entry.
 *
 * `scope` names which dataset the entry came from, because with focuses in
 * play `entry "x": duplicate id` on its own does not say which file to open.
 */
function checkIdsAndKeywords(
  entries: readonly Entry[],
  present: number,
  scope = 'entries.json',
): Set<string> {
  const seen = new Set<string>();
  for (const entry of entries) {
    const where = `${scope} entry "${entry.id}"`;

    if (seen.has(entry.id)) fail(where, 'duplicate id');
    seen.add(entry.id);

    checkDates(entry, present);

    const unique = new Set(entry.keywords);
    if (unique.size !== entry.keywords.length) {
      fail(where, 'duplicate keywords');
    }
  }
  return seen;
}

/**
 * Every entry has prose, every prose file has an entry, and each declares the
 * id it is filed under. Shared by the main timeline and every focus, because a
 * focus's details are the same contract in a different directory.
 */
async function checkDetailFiles(
  dir: string,
  relative: string,
  entries: readonly Entry[],
): Promise<number> {
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f: string) => f.endsWith('.json'));
  } catch {
    fail(relative, 'directory is missing');
    return 0;
  }

  const detailIds = new Set(files.map((f) => f.replace(/\.json$/, '')));
  const entryIds = new Set(entries.map((entry) => entry.id));

  for (const entry of entries) {
    if (!detailIds.has(entry.id)) {
      fail(`entry "${entry.id}"`, `has no detail file at ${relative}/${entry.id}.json`);
      continue;
    }

    const detail = detailSchema.safeParse(await readJson(join(dir, `${entry.id}.json`)));

    if (!detail.success) {
      for (const issue of detail.error.issues) {
        fail(`${relative}/${entry.id}.json at /${issue.path.join('/')}`, issue.message);
      }
      continue;
    }

    if (detail.data.id !== entry.id) {
      fail(
        `${relative}/${entry.id}.json`,
        `declares id "${detail.data.id}" but is named after "${entry.id}"`,
      );
    }
  }

  for (const id of detailIds) {
    if (!entryIds.has(id)) {
      fail(`${relative}/${id}.json`, 'orphan — no entry references this id');
    }
  }

  return detailIds.size;
}

/**
 * Focused timelines.
 *
 * A focus is only partly its own data: it *selects* main-timeline entries as
 * well as carrying its own, which creates failure modes a single dataset does
 * not have. A selector naming an id that no longer exists silently selects
 * nothing, and a focus entry reusing a main id makes a deep link ambiguous.
 * Neither shows up at runtime as anything but a timeline quietly missing
 * content, so both are errors here.
 */
async function checkFocuses(main: readonly Entry[], present: number): Promise<string[]> {
  let directories: string[] = [];
  try {
    directories = (await readdir(FOCUS_DIR, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
  } catch {
    // No focus directory at all is a valid state: the feature is optional.
    return [];
  }

  const summary: string[] = [];
  const mainIds = new Set(main.map((entry) => entry.id));

  const indexParsed = focusIndexSchema.safeParse(await readJson(join(FOCUS_DIR, 'index.json')));
  if (!indexParsed.success) {
    for (const issue of indexParsed.error.issues) {
      fail(`focus/index.json at /${issue.path.join('/')}`, issue.message);
    }
    return summary;
  }

  const listed = new Map(indexParsed.data.focuses.map((item) => [item.id, item]));

  for (const id of listed.keys()) {
    if (!directories.includes(id)) {
      fail('focus/index.json', `lists "${id}", which has no directory at data/focus/${id}/`);
    }
  }

  for (const id of directories) {
    const where = `focus/${id}`;

    if (!listed.has(id)) {
      fail(where, 'exists but is not listed in focus/index.json, so nothing can reach it');
    }

    const parsed = focusSchema.safeParse(await readJson(join(FOCUS_DIR, id, 'focus.json')));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        fail(`${where}/focus.json at /${issue.path.join('/')}`, issue.message);
      }
      continue;
    }

    const focus: Focus = parsed.data;
    if (focus.id !== id) {
      fail(`${where}/focus.json`, `declares id "${focus.id}" but sits in directory "${id}"`);
    }

    checkFocusRange(focus, where, present);
    checkSelector(focus, where, mainIds);
    checkIndexAgreement(focus, where, listed.get(id));

    const entriesParsed = entriesFileSchema.safeParse(
      await readJson(join(FOCUS_DIR, id, 'entries.json')),
    );
    if (!entriesParsed.success) {
      for (const issue of entriesParsed.error.issues) {
        fail(`${where}/entries.json at /${issue.path.join('/')}`, issue.message);
      }
      continue;
    }

    const own = entriesParsed.data.entries;
    checkIdsAndKeywords(own, present, `${where}/entries.json`);

    for (const entry of own) {
      if (mainIds.has(entry.id)) {
        fail(
          `${where}/entries.json`,
          `"${entry.id}" already exists on the main timeline — the focus inherits that entry, ` +
            'so a second one under the same id makes the link to it ambiguous',
        );
      }
    }

    await checkDetailFiles(join(FOCUS_DIR, id, 'details'), `${where}/details`, own);

    const resolved = resolveFocus(focus, main, own, present);
    const chapters = resolved.entries.filter((entry) => entry.type === 'age').length;
    summary.push(
      `  ${focus.id}: ${own.length} own + ${resolved.inherited.length} inherited, ` +
        `${formatRange(focus.range.start, focus.range.end)}, ${chapters} chapter(s)`,
    );

    if (resolved.inherited.length === 0 && focus.select.keywords.length > 0) {
      fail(
        `${where}/focus.json`,
        `select.keywords [${focus.select.keywords.join(', ')}] match no main entry in range — ` +
          'the focus inherits nothing, which is almost always a typo',
      );
    }
  }

  return summary;
}

function checkFocusRange(focus: Focus, where: string, present: number): void {
  if (!isValidDate(focus.range.start)) {
    fail(`${where}/focus.json`, `range.start is not a real date: ${JSON.stringify(focus.range.start)}`);
    return;
  }
  if (focus.range.end !== 'present' && !isValidDate(focus.range.end)) {
    fail(`${where}/focus.json`, `range.end is not a real date: ${JSON.stringify(focus.range.end)}`);
    return;
  }
  if (resolveEnd(focus.range.end, present) <= toDecimalYear(focus.range.start)) {
    fail(`${where}/focus.json`, 'range.end is not after range.start');
  }
}

function checkSelector(focus: Focus, where: string, mainIds: ReadonlySet<string>): void {
  if (focus.subject !== undefined && !mainIds.has(focus.subject)) {
    fail(`${where}/focus.json`, `subject "${focus.subject}" is not a main-timeline entry`);
  }
  for (const key of ['include', 'exclude'] as const) {
    for (const id of focus.select[key]) {
      if (!mainIds.has(id)) {
        fail(`${where}/focus.json`, `select.${key} names "${id}", which no main entry has`);
      }
    }
  }
}

/** The index duplicates these fields so the menu needs one request; they must agree. */
function checkIndexAgreement(
  focus: Focus,
  where: string,
  listed: { title: string; blurb: string; range: Focus['range'] } | undefined,
): void {
  if (!listed) return;
  const mismatched: string[] = [];
  if (listed.title !== focus.title) mismatched.push('title');
  if (listed.blurb !== focus.blurb) mismatched.push('blurb');
  if (JSON.stringify(listed.range) !== JSON.stringify(focus.range)) mismatched.push('range');
  if (mismatched.length > 0) {
    fail(
      'focus/index.json',
      `${mismatched.join(', ')} for "${focus.id}" disagree(s) with ${where}/focus.json`,
    );
  }
}

async function main(): Promise<void> {
  const present = presentDecimalYear();

  // --- entries.json ---------------------------------------------------------
  const parsed = entriesFileSchema.safeParse(await readJson(ENTRIES_FILE));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      fail(`entries.json at /${issue.path.join('/')}`, issue.message);
    }
    report();
    return;
  }

  const { entries } = parsed.data;

  // --- ids, dates, keywords -------------------------------------------------
  checkIdsAndKeywords(entries, present);

  // --- detail files ---------------------------------------------------------
  const detailCount = await checkDetailFiles(DETAILS_DIR, 'data/details', entries);

  // --- focused timelines ----------------------------------------------------
  const focusSummary = await checkFocuses(entries, present);

  report(entries.length, detailCount, focusSummary);
}

function report(entryCount = 0, detailCount = 0, focusSummary: string[] = []): void {
  if (errors.length > 0) {
    console.error(`\n✗ Data validation failed with ${errors.length} problem(s):\n`);
    for (const error of errors) console.error(`  • ${error}`);
    console.error('');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Data valid — ${entryCount} entries, ${detailCount} detail files.`);

  // What a selector actually caught is invisible in the data files themselves,
  // so it is reported rather than left to be discovered in the browser.
  if (focusSummary.length > 0) {
    console.log(`\n  Focused timelines:`);
    for (const line of focusSummary) console.log(line);
  }
}

await main();

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

import { detailSchema, entriesFileSchema } from '../src/lib/schema.ts';
import { isValidDate, presentDecimalYear, resolveEnd, toDecimalYear } from '../src/lib/time.ts';
import type { Entry } from '../src/lib/types.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(ROOT, 'public', 'data');
const DETAILS_DIR = join(DATA_DIR, 'details');
const ENTRIES_FILE = join(DATA_DIR, 'entries.json');

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

  // --- ids ------------------------------------------------------------------
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) fail(`entry "${entry.id}"`, 'duplicate id');
    seen.add(entry.id);
  }

  // --- dates ----------------------------------------------------------------
  for (const entry of entries) checkDates(entry, present);

  // --- keywords -------------------------------------------------------------
  for (const entry of entries) {
    const unique = new Set(entry.keywords);
    if (unique.size !== entry.keywords.length) {
      fail(`entry "${entry.id}"`, 'duplicate keywords');
    }
  }

  // --- detail files ---------------------------------------------------------
  let detailFiles: string[] = [];
  try {
    detailFiles = (await readdir(DETAILS_DIR)).filter((f: string) => f.endsWith('.json'));
  } catch {
    fail('data/details', 'directory is missing');
  }

  const detailIds = new Set(detailFiles.map((f) => f.replace(/\.json$/, '')));

  for (const entry of entries) {
    if (!detailIds.has(entry.id)) {
      fail(`entry "${entry.id}"`, `has no detail file at data/details/${entry.id}.json`);
      continue;
    }

    const path = join(DETAILS_DIR, `${entry.id}.json`);
    const detail = detailSchema.safeParse(await readJson(path));

    if (!detail.success) {
      for (const issue of detail.error.issues) {
        fail(`details/${entry.id}.json at /${issue.path.join('/')}`, issue.message);
      }
      continue;
    }

    if (detail.data.id !== entry.id) {
      fail(
        `details/${entry.id}.json`,
        `declares id "${detail.data.id}" but is named after "${entry.id}"`,
      );
    }
  }

  for (const id of detailIds) {
    if (!seen.has(id)) {
      fail(`details/${id}.json`, 'orphan — no entry in entries.json references this id');
    }
  }

  report(entries.length, detailIds.size);
}

function report(entryCount = 0, detailCount = 0): void {
  if (errors.length > 0) {
    console.error(`\n✗ Data validation failed with ${errors.length} problem(s):\n`);
    for (const error of errors) console.error(`  • ${error}`);
    console.error('');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Data valid — ${entryCount} entries, ${detailCount} detail files.`);
}

await main();

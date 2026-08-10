/**
 * Filtering and search.
 *
 * Pure functions over plain arrays. The one non-obvious rule is the
 * combination logic: keywords are OR'd against each other (a reader picking
 * "rome" and "medieval" wants both sets, not their intersection, which is
 * usually empty), while types and the text query are AND'd on top.
 */

import { TYPE_LABEL, type Entry, type EntryType } from './types.ts';

export interface Filters {
  query: string;
  /** Empty means "all types" rather than "no types". */
  types: EntryType[];
  /** Empty means "all keywords". */
  keywords: string[];
}

export const EMPTY_FILTERS: Filters = { query: '', types: [], keywords: [] };

export function isFilterActive(filters: Filters): boolean {
  return (
    filters.query.trim().length > 0 || filters.types.length > 0 || filters.keywords.length > 0
  );
}

export function matchesFilters(entry: Entry, filters: Filters): boolean {
  if (filters.types.length > 0 && !filters.types.includes(entry.type)) return false;

  if (filters.keywords.length > 0) {
    const hit = filters.keywords.some((keyword) => entry.keywords.includes(keyword));
    if (!hit) return false;
  }

  const query = filters.query.trim().toLowerCase();
  if (query.length > 0) {
    const haystack = [
      entry.title.toLowerCase(),
      TYPE_LABEL[entry.type].toLowerCase(),
      entry.keywords.join(' ').replace(/-/g, ' '),
    ].join(' ');
    if (!haystack.includes(query)) return false;
  }

  return true;
}

export function applyFilters(entries: readonly Entry[], filters: Filters): Entry[] {
  if (!isFilterActive(filters)) return [...entries];
  return entries.filter((entry) => matchesFilters(entry, filters));
}

export interface KeywordCount {
  keyword: string;
  count: number;
}

/** Keywords ordered by how much of the timeline they cover, then alphabetically. */
export function collectKeywords(entries: readonly Entry[]): KeywordCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const keyword of entry.keywords) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword));
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function humanKeyword(keyword: string): string {
  return keyword.replace(/-/g, ' ');
}

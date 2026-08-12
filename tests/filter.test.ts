import { describe, expect, it } from 'vitest';

import {
  activeHidden,
  applyFilters,
  applyHidden,
  collectKeywords,
  EMPTY_FILTERS,
  isFilterActive,
  matchesFilters,
  toggle,
} from '../src/lib/filter.ts';
import type { Entry } from '../src/lib/types.ts';

const entry = (over: Partial<Entry> & Pick<Entry, 'id'>): Entry => ({
  title: over.id,
  type: 'event',
  start: { year: 1000 },
  importance: 3,
  keywords: [],
  ...over,
});

const entries: Entry[] = [
  entry({ id: 'hastings', title: 'Battle of Hastings', type: 'battle', keywords: ['england', 'medieval'] }),
  entry({ id: 'ww2', title: 'Second World War', type: 'war', keywords: ['world-war-2', 'modern'] }),
  entry({ id: 'rome', title: 'Roman Empire', type: 'empire', keywords: ['rome', 'antiquity'] }),
  entry({ id: 'liz', title: 'Elizabeth I', type: 'ruler', keywords: ['england', 'tudor'] }),
];

describe('isFilterActive', () => {
  it('is false for the empty filter', () => {
    expect(isFilterActive(EMPTY_FILTERS)).toBe(false);
  });

  it('ignores a whitespace-only query', () => {
    expect(isFilterActive({ ...EMPTY_FILTERS, query: '   ' })).toBe(false);
  });

  it('is true once anything is set', () => {
    expect(isFilterActive({ ...EMPTY_FILTERS, query: 'rome' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, types: ['battle'] })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, keywords: ['england'] })).toBe(true);
  });
});

describe('matchesFilters', () => {
  it('treats an empty type list as "all types", not "none"', () => {
    expect(applyFilters(entries, EMPTY_FILTERS)).toHaveLength(4);
  });

  it('filters by type', () => {
    const result = applyFilters(entries, { ...EMPTY_FILTERS, types: ['battle', 'war'] });
    expect(result.map((e) => e.id)).toEqual(['hastings', 'ww2']);
  });

  it('ORs keywords against each other', () => {
    // "rome" and "medieval" share no entries; intersecting them would return
    // nothing, which is never what a reader picking both wants.
    const result = applyFilters(entries, { ...EMPTY_FILTERS, keywords: ['rome', 'medieval'] });
    expect(result.map((e) => e.id).sort()).toEqual(['hastings', 'rome']);
  });

  it('ANDs types against keywords', () => {
    const result = applyFilters(entries, {
      ...EMPTY_FILTERS,
      types: ['ruler'],
      keywords: ['england'],
    });
    expect(result.map((e) => e.id)).toEqual(['liz']);
  });

  it('searches title, type name and keywords', () => {
    expect(applyFilters(entries, { ...EMPTY_FILTERS, query: 'hastings' })).toHaveLength(1);
    expect(applyFilters(entries, { ...EMPTY_FILTERS, query: 'empire' })).toHaveLength(1);
    expect(applyFilters(entries, { ...EMPTY_FILTERS, query: 'england' })).toHaveLength(2);
  });

  it('is case-insensitive and matches hyphenated keywords as words', () => {
    expect(applyFilters(entries, { ...EMPTY_FILTERS, query: 'WORLD WAR 2' })).toHaveLength(1);
  });

  it('returns nothing when the query matches nothing', () => {
    expect(applyFilters(entries, { ...EMPTY_FILTERS, query: 'zzzz' })).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const copy = [...entries];
    applyFilters(entries, { ...EMPTY_FILTERS, types: ['war'] });
    expect(entries).toEqual(copy);
  });

  it('matches a single entry against filters directly', () => {
    expect(matchesFilters(entries[0]!, { ...EMPTY_FILTERS, types: ['battle'] })).toBe(true);
    expect(matchesFilters(entries[0]!, { ...EMPTY_FILTERS, types: ['war'] })).toBe(false);
  });
});

describe('collectKeywords', () => {
  it('counts keywords and orders by coverage then alphabetically', () => {
    const result = collectKeywords(entries);
    expect(result[0]).toEqual({ keyword: 'england', count: 2 });
    const rest = result.slice(1).map((k) => k.keyword);
    expect(rest).toEqual([...rest].sort());
  });

  it('handles entries with no keywords', () => {
    expect(collectKeywords([entry({ id: 'x' })])).toEqual([]);
  });
});

describe('toggle', () => {
  it('adds and removes without mutating', () => {
    const list = ['a'];
    expect(toggle(list, 'b')).toEqual(['a', 'b']);
    expect(toggle(list, 'a')).toEqual([]);
    expect(list).toEqual(['a']);
  });
});

describe('hidden tags', () => {
  const hidden = ['tank'];
  const tanks: Entry[] = [
    ...entries,
    entry({ id: 'mark-iv', title: 'Mark IV Tank', keywords: ['tank', 'world-war-1'] }),
    entry({ id: 'tiger', title: 'Tiger I', keywords: ['tank', 'world-war-2'] }),
  ];

  it('hides entries carrying a hidden tag when nothing is asked for', () => {
    const active = activeHidden(hidden, EMPTY_FILTERS);
    expect(active).toEqual(['tank']);
    expect(applyHidden(tanks, active).map((e) => e.id)).toEqual([
      'hastings',
      'ww2',
      'rome',
      'liz',
    ]);
  });

  it('steps aside when the tag is explicitly selected', () => {
    const active = activeHidden(hidden, { ...EMPTY_FILTERS, keywords: ['tank'] });
    expect(active).toEqual([]);
    expect(applyHidden(tanks, active)).toHaveLength(tanks.length);
  });

  it('steps aside when the query names the tag', () => {
    expect(activeHidden(hidden, { ...EMPTY_FILTERS, query: 'tank' })).toEqual([]);
    expect(activeHidden(hidden, { ...EMPTY_FILTERS, query: '  TANK ' })).toEqual([]);
  });

  it('stays hidden for a query that does not name the tag', () => {
    // The trap this guards: any active filter revealing everything hidden.
    expect(activeHidden(hidden, { ...EMPTY_FILTERS, query: 'battle' })).toEqual(['tank']);
    expect(activeHidden(hidden, { ...EMPTY_FILTERS, keywords: ['england'] })).toEqual(['tank']);
    expect(activeHidden(hidden, { ...EMPTY_FILTERS, types: ['battle'] })).toEqual(['tank']);
  });

  it('matches a hyphenated tag through its spaced form, as search does', () => {
    expect(activeHidden(['world-war-2'], { ...EMPTY_FILTERS, query: 'world war 2' })).toEqual([]);
    expect(activeHidden(['world-war-2'], { ...EMPTY_FILTERS, query: 'world-war-2' })).toEqual([]);
  });

  it('is a no-op with nothing hidden, and copies rather than aliases', () => {
    expect(activeHidden([], { ...EMPTY_FILTERS, query: 'tank' })).toEqual([]);
    const out = applyHidden(tanks, []);
    expect(out).toEqual(tanks);
    expect(out).not.toBe(tanks);
  });

  it('hides an entry that carries any one of several hidden tags', () => {
    expect(applyHidden(tanks, ['tank', 'rome']).map((e) => e.id)).toEqual([
      'hastings',
      'ww2',
      'liz',
    ]);
  });
});

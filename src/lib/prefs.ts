/**
 * Device-local preferences.
 *
 * Validation here is hand-written rather than zod, deliberately. zod is a
 * devDependency so it stays out of the browser bundle; pulling it in at
 * runtime to check a five-field object would cost more than the whole
 * preferences feature. The parser below is the same idea in a form that costs
 * nothing: unknown shapes never throw, and each field falls back
 * independently so one corrupt value cannot discard the rest.
 *
 * Everything that touches storage is wrapped: Safari in private mode throws on
 * setItem, and a preference failing to save must never break the app.
 */

import { EMPTY_FILTERS, type Filters } from './filter.ts';
import { ENTRY_TYPES, type EntryType } from './types.ts';

export const STORAGE_KEY = 'timeline.prefs.v1';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type MotionChoice = 'system' | 'reduced';

export interface DefaultView {
  startYear: number;
  endYear: number;
}

export interface Preferences {
  version: 1;
  /** null means "open fully zoomed out". */
  defaultView: DefaultView | null;
  filters: Filters;
  theme: ThemeChoice;
  motion: MotionChoice;
  /**
   * Dim and disable era-rail segments holding nothing under the current
   * filter. Rail order is spatial memory, so these are greyed in place rather
   * than removed — a rail that reflows on every chip toggle costs more than
   * the clutter it saves.
   */
  dimEmptyAges: boolean;
  /**
   * Tags kept out of the way by default. Not a ban — see `activeHidden` in
   * filter.ts; explicitly asking for a hidden tag brings it back for that
   * session without changing what is stored here.
   */
  hiddenKeywords: string[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  version: 1,
  defaultView: null,
  filters: EMPTY_FILTERS,
  theme: 'system',
  motion: 'system',
  dimEmptyAges: true,
  hiddenKeywords: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, allowed?: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (allowed && !allowed.includes(item)) continue;
    seen.add(item);
  }
  return [...seen];
}

function parseDefaultView(value: unknown): DefaultView | null {
  if (!isRecord(value)) return null;
  const { startYear, endYear } = value;
  if (typeof startYear !== 'number' || typeof endYear !== 'number') return null;
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  // A zero-width or inverted range would produce a degenerate transform.
  if (endYear <= startYear) return null;
  return { startYear, endYear };
}

function parseFilters(value: unknown): Filters {
  if (!isRecord(value)) return EMPTY_FILTERS;
  return {
    query: typeof value.query === 'string' ? value.query : '',
    types: stringArray(value.types, ENTRY_TYPES) as EntryType[],
    keywords: stringArray(value.keywords),
  };
}

function parseChoice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Never throws. Anything unrecognised falls back to the default for that field. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }

  if (!isRecord(parsed)) return DEFAULT_PREFERENCES;
  // A future version may mean anything; start clean rather than guess.
  if (parsed.version !== 1) return DEFAULT_PREFERENCES;

  return {
    version: 1,
    defaultView: parseDefaultView(parsed.defaultView),
    filters: parseFilters(parsed.filters),
    theme: parseChoice(parsed.theme, ['system', 'light', 'dark'] as const, 'system'),
    motion: parseChoice(parsed.motion, ['system', 'reduced'] as const, 'system'),
    // Absent in preferences saved before this field existed, which is the
    // common case on any returning device — fall back to the default rather
    // than treating a missing key as false.
    dimEmptyAges:
      typeof parsed.dimEmptyAges === 'boolean'
        ? parsed.dimEmptyAges
        : DEFAULT_PREFERENCES.dimEmptyAges,
    // Same de-duplicating, non-throwing parse the filter keywords get; an
    // unrecognised tag is harmless, it simply matches nothing.
    hiddenKeywords: stringArray(parsed.hiddenKeywords),
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Access itself can throw when cookies/storage are blocked.
    return null;
  }
}

export function loadPreferences(storage: StorageLike | null = defaultStorage()): Preferences {
  if (!storage) return DEFAULT_PREFERENCES;
  try {
    return parsePreferences(storage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Returns whether the write succeeded, so callers can surface a warning if they care. */
export function savePreferences(
  prefs: Preferences,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    // Safari private mode throws here, as does exceeding quota.
    return false;
  }
}

export function clearPreferences(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Filters change on every keystroke, so writes are coalesced. The trailing
 * call is the one that matters — it holds the settled state.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms = 250,
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

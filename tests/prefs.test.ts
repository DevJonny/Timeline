import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  parsePreferences,
  savePreferences,
  STORAGE_KEY,
  debounce,
  type Preferences,
} from '../src/lib/prefs.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

describe('parsePreferences', () => {
  it('returns defaults for missing or empty input', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('')).toEqual(DEFAULT_PREFERENCES);
  });

  it('survives malformed JSON instead of throwing', () => {
    expect(parsePreferences('{ not json')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('[]')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('"a string"')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('null')).toEqual(DEFAULT_PREFERENCES);
  });

  it('discards a payload from an unknown future version', () => {
    expect(parsePreferences(JSON.stringify({ version: 2, theme: 'dark' }))).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it('round-trips a full valid payload', () => {
    const prefs: Preferences = {
      version: 1,
      defaultView: { startYear: 1900, endYear: 2000 },
      filters: { query: 'rome', types: ['battle'], keywords: ['england'] },
      theme: 'dark',
      motion: 'reduced',
    };
    expect(parsePreferences(JSON.stringify(prefs))).toEqual(prefs);
  });

  it('falls back per field, so one bad value does not discard the rest', () => {
    const result = parsePreferences(
      JSON.stringify({
        version: 1,
        defaultView: 'nonsense',
        filters: { query: 'rome', types: ['battle'], keywords: ['x'] },
        theme: 'chartreuse',
        motion: 42,
      }),
    );
    expect(result.defaultView).toBeNull();
    expect(result.theme).toBe('system');
    expect(result.motion).toBe('system');
    // The valid part survived.
    expect(result.filters).toEqual({ query: 'rome', types: ['battle'], keywords: ['x'] });
  });

  it('rejects a degenerate or inverted default view', () => {
    const view = (startYear: number, endYear: number) =>
      parsePreferences(JSON.stringify({ version: 1, defaultView: { startYear, endYear } }))
        .defaultView;

    expect(view(1900, 1900)).toBeNull();
    expect(view(2000, 1900)).toBeNull();
    expect(view(1900, 2000)).toEqual({ startYear: 1900, endYear: 2000 });
  });

  it('rejects non-finite years that would produce an infinite transform', () => {
    const raw = '{"version":1,"defaultView":{"startYear":null,"endYear":2000}}';
    expect(parsePreferences(raw).defaultView).toBeNull();
  });

  it('drops unknown entry types and non-string keywords', () => {
    const result = parsePreferences(
      JSON.stringify({
        version: 1,
        filters: { query: 5, types: ['battle', 'dragon'], keywords: ['ok', 7, null] },
      }),
    );
    expect(result.filters.types).toEqual(['battle']);
    expect(result.filters.keywords).toEqual(['ok']);
    expect(result.filters.query).toBe('');
  });
});

describe('loadPreferences / savePreferences', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, theme: 'dark' };
    expect(savePreferences(prefs, storage)).toBe(true);
    expect(loadPreferences(storage)).toEqual(prefs);
  });

  it('returns defaults when there is no storage at all', () => {
    expect(loadPreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(savePreferences(DEFAULT_PREFERENCES, null)).toBe(false);
  });

  it('does not throw when setItem throws, as in Safari private mode', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(() => savePreferences(DEFAULT_PREFERENCES, throwing)).not.toThrow();
    expect(savePreferences(DEFAULT_PREFERENCES, throwing)).toBe(false);
  });

  it('does not throw when getItem throws', () => {
    const throwing = {
      getItem: () => {
        throw new DOMException('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadPreferences(throwing)).toEqual(DEFAULT_PREFERENCES);
  });

  it('recovers from a hand-corrupted stored value', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{{{ broken' });
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('debounce', () => {
  it('runs once with the last arguments', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('a');
    debounced('b');
    debounced('c');
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('c');
    vi.useRealTimers();
  });
});

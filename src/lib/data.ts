/**
 * Data loading.
 *
 * Every fetch goes through `import.meta.env.BASE_URL` because the site is
 * served from the `/Timeline/` subpath on GitHub Pages. A hardcoded absolute
 * path works in `npm run dev` and 404s in production — the failure mode this
 * indirection exists to prevent.
 */

import { orderFocuses } from './focus.ts';
import type {
  Detail,
  EntriesFile,
  Entry,
  Focus,
  FocusIndex,
  FocusSummary,
} from './types.ts';

function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`;
}

async function fetchJson<T>(path: string, what: string): Promise<T> {
  const response = await fetch(dataUrl(path));
  if (!response.ok) {
    throw new Error(`Could not load ${what} (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export async function loadEntries(): Promise<Entry[]> {
  const file = await fetchJson<EntriesFile>('entries.json', 'entries.json');
  return file.entries;
}

// --- focused timelines ------------------------------------------------------

/**
 * The menu's list of focuses, oldest period first.
 *
 * Never rejects. A focus index that is missing, malformed, or not yet
 * deployed costs the reader the menu button and nothing else — the main
 * timeline is the product, and it must not fail to load because a secondary
 * feature's data file did.
 */
export async function loadFocusIndex(): Promise<FocusSummary[]> {
  try {
    const file = await fetchJson<FocusIndex>('focus/index.json', 'the focus index');
    return Array.isArray(file?.focuses) ? orderFocuses(file.focuses) : [];
  } catch {
    return [];
  }
}

export interface FocusData {
  focus: Focus;
  /** The focus's own entries — not the ones it inherits. */
  entries: Entry[];
}

const focusCache = new Map<string, Promise<FocusData>>();

/**
 * A focus's metadata and entries, in one round trip pair, cached by id like
 * details are. Unlike the index this *does* reject: the reader asked for this
 * timeline specifically, so failing to load it has to be visible.
 */
export function loadFocus(id: string): Promise<FocusData> {
  const cached = focusCache.get(id);
  if (cached) return cached;

  const request = Promise.all([
    fetchJson<Focus>(`focus/${id}/focus.json`, `the "${id}" timeline`),
    fetchJson<EntriesFile>(`focus/${id}/entries.json`, `entries for "${id}"`),
  ])
    .then(([focus, file]) => ({ focus, entries: file.entries }))
    .catch((error: unknown) => {
      focusCache.delete(id);
      throw error;
    });

  focusCache.set(id, request);
  return request;
}

const detailCache = new Map<string, Promise<Detail>>();

/**
 * Fetch an entry's prose, cached by id.
 *
 * The cache holds the *promise*, so concurrent requests for the same id (a tap
 * arriving while a prefetch is still in flight) share one network call.
 * Failures are evicted so a transient error can be retried.
 *
 * `focusId` names the focus that *authored* the entry, not merely the timeline
 * being viewed: a focus shows inherited main-timeline entries alongside its
 * own, and their prose stays in the main `details/` directory. The caller
 * decides, because only it knows which set an id came from.
 */
export function loadDetail(id: string, focusId?: string): Promise<Detail> {
  const key = `${focusId ?? ''}:${id}`;
  const cached = detailCache.get(key);
  if (cached) return cached;

  const path = focusId === undefined ? `details/${id}.json` : `focus/${focusId}/details/${id}.json`;

  const request = fetch(dataUrl(path))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`No details available for "${id}" (HTTP ${response.status})`);
      }
      return response.json() as Promise<Detail>;
    })
    .catch((error: unknown) => {
      detailCache.delete(key);
      throw error;
    });

  detailCache.set(key, request);
  return request;
}

/** Warm the cache without caring about the result. */
export function prefetchDetail(id: string, focusId?: string): void {
  void loadDetail(id, focusId).catch(() => {
    /* prefetch failures are not user-visible; the real load will report them */
  });
}

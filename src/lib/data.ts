/**
 * Data loading.
 *
 * Every fetch goes through `import.meta.env.BASE_URL` because the site is
 * served from the `/Timeline/` subpath on GitHub Pages. A hardcoded absolute
 * path works in `npm run dev` and 404s in production — the failure mode this
 * indirection exists to prevent.
 */

import type { Detail, EntriesFile, Entry } from './types.ts';

function dataUrl(path: string): string {
  return `${import.meta.env.BASE_URL}data/${path}`;
}

export async function loadEntries(): Promise<Entry[]> {
  const response = await fetch(dataUrl('entries.json'));
  if (!response.ok) {
    throw new Error(`Could not load entries.json (HTTP ${response.status})`);
  }
  const file = (await response.json()) as EntriesFile;
  return file.entries;
}

const detailCache = new Map<string, Promise<Detail>>();

/**
 * Fetch an entry's prose, cached by id.
 *
 * The cache holds the *promise*, so concurrent requests for the same id (a tap
 * arriving while a prefetch is still in flight) share one network call.
 * Failures are evicted so a transient error can be retried.
 */
export function loadDetail(id: string): Promise<Detail> {
  const cached = detailCache.get(id);
  if (cached) return cached;

  const request = fetch(dataUrl(`details/${id}.json`))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`No details available for "${id}" (HTTP ${response.status})`);
      }
      return response.json() as Promise<Detail>;
    })
    .catch((error: unknown) => {
      detailCache.delete(id);
      throw error;
    });

  detailCache.set(id, request);
  return request;
}

/** Warm the cache without caring about the result. */
export function prefetchDetail(id: string): void {
  void loadDetail(id).catch(() => {
    /* prefetch failures are not user-visible; the real load will report them */
  });
}

/**
 * URL state.
 *
 * Two things live in the location hash: which focused timeline is open, and
 * which entry's detail sheet is showing. Both belong in the URL so a view is
 * linkable and the back button unwinds it — leaving a focus is Back, and so is
 * closing a sheet, with no history bookkeeping of our own.
 *
 * The hash is used rather than a real path because GitHub Pages serves static
 * files with no rewrite rule: a path would 404 on reload, and this app has no
 * router to justify a 404.html shim.
 *
 *   #/e/{entry}                 an entry on the main timeline
 *   #/f/{focus}                 a focused timeline
 *   #/f/{focus}/e/{entry}       an entry within one
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface Location {
  /** The open focused timeline, or null for the main timeline. */
  focus: string | null;
  /** The selected entry, or null. */
  entry: string | null;
}

export const NOWHERE: Location = { focus: null, entry: null };

function slugOrNull(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const value = decodeURIComponent(raw).trim();
  return SLUG.test(value) ? value : null;
}

/**
 * Anything unrecognised reads as "nowhere" rather than throwing, so a
 * hand-edited or truncated URL lands on the plain timeline instead of a blank
 * page.
 */
export function readLocation(hash: string = location.hash): Location {
  const entryOnly = /^#\/e\/([^/]+)$/.exec(hash);
  if (entryOnly) return { focus: null, entry: slugOrNull(entryOnly[1]) };

  const inFocus = /^#\/f\/([^/]+)(?:\/e\/([^/]+))?$/.exec(hash);
  if (inFocus) {
    const focus = slugOrNull(inFocus[1]);
    // An entry without a valid focus is not a location this app can restore.
    if (focus === null) return NOWHERE;
    return { focus, entry: slugOrNull(inFocus[2]) };
  }

  return NOWHERE;
}

export function buildHash({ focus, entry }: Location): string {
  if (focus !== null && entry !== null) return `#/f/${focus}/e/${entry}`;
  if (focus !== null) return `#/f/${focus}`;
  if (entry !== null) return `#/e/${entry}`;
  return '';
}

/**
 * `replace` avoids stacking history entries while panning between entries, but
 * the first open pushes so the back button closes the sheet. Entering a focus
 * always pushes, which is what makes Back the way out of one.
 */
export function writeLocation(next: Location, replace: boolean): void {
  const hash = buildHash(next);
  const url = hash === '' ? `${location.pathname}${location.search}` : hash;

  if (replace) {
    history.replaceState(null, '', url);
  } else {
    history.pushState(null, '', url);
  }
}

export function onLocationChange(handler: (next: Location) => void): () => void {
  const listener = () => handler(readLocation());
  addEventListener('hashchange', listener);
  addEventListener('popstate', listener);
  return () => {
    removeEventListener('hashchange', listener);
    removeEventListener('popstate', listener);
  };
}

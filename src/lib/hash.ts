/**
 * URL state.
 *
 * Selection lives in the location hash so a detail view is linkable and the
 * back button dismisses it. The hash is used rather than a path because
 * GitHub Pages serves static files with no rewrite rule — a real route would
 * 404 on reload, and this app has no router to justify a 404.html shim.
 */

const ENTRY_PREFIX = '#/e/';

export function readSelection(hash: string = location.hash): string | null {
  if (!hash.startsWith(ENTRY_PREFIX)) return null;
  const id = decodeURIComponent(hash.slice(ENTRY_PREFIX.length)).trim();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) ? id : null;
}

/**
 * `replace` avoids stacking history entries while panning between entries,
 * but the first open pushes so the back button closes the sheet.
 */
export function writeSelection(id: string | null, replace: boolean): void {
  const next = id === null ? `${location.pathname}${location.search}` : `${ENTRY_PREFIX}${id}`;

  if (replace) {
    history.replaceState(null, '', next);
  } else {
    history.pushState(null, '', next);
  }
}

export function onSelectionChange(handler: (id: string | null) => void): () => void {
  const listener = () => handler(readSelection());
  addEventListener('hashchange', listener);
  addEventListener('popstate', listener);
  return () => {
    removeEventListener('hashchange', listener);
    removeEventListener('popstate', listener);
  };
}

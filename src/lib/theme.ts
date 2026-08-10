/**
 * Theme and motion application.
 *
 * The CSS already responds to `prefers-color-scheme`; these overrides stamp
 * `data-theme` on the root so a stored choice can beat the OS setting in both
 * directions.
 *
 * Motion is a module-level flag rather than a parameter because the only
 * consumer is the zoom action, which is constructed once and would otherwise
 * need the preference threaded through every call site.
 */

import type { MotionChoice, ThemeChoice } from './prefs.ts';

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

let motionOverride: MotionChoice = 'system';

export function applyMotion(choice: MotionChoice): void {
  motionOverride = choice;
}

/** True when animation should be skipped, honouring the stored override. */
export function prefersReducedMotion(): boolean {
  if (motionOverride === 'reduced') return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Level of detail.
 *
 * At full zoom-out the last five thousand years occupy under a pixel, so
 * showing every entry is meaningless; zoomed into a decade there is room for
 * everything. The importance gate decides how much detail the current zoom
 * earns, and clustering absorbs whatever still will not fit.
 *
 * Both are pure functions — no DOM, no reactivity.
 */

import type { Extent } from './layout.ts';

/** Importance runs 1 (era-defining) to 5 (minor). */
export const MAX_IMPORTANCE = 5;

/**
 * The highest importance value visible at this zoom.
 *
 * k spans 1 to 1e7, so log10(k) runs 0 to 7 — mapped onto importance 1 to 5.
 * `relaxation` lets an active filter reveal more: with fewer entries competing
 * for space, the survivors should show *more* detail rather than the same
 * sparse set. Step 7 supplies it from how much the filter removed.
 */
export function importanceGate(k: number, relaxation = 0): number {
  const decades = Math.log10(Math.max(k, 1));
  const gate = 1 + Math.floor(decades / 1.75) + relaxation;
  return Math.min(MAX_IMPORTANCE, Math.max(1, gate));
}

/**
 * How much to relax the gate given how many entries a filter removed.
 *
 * Removing most of the timeline earns two extra levels; removing a little
 * earns none. Deliberately coarse — the gate is a small integer, so anything
 * finer would not change what is drawn.
 */
export function relaxationFor(visibleCount: number, totalCount: number): number {
  if (totalCount === 0 || visibleCount === totalCount) return 0;
  const remaining = visibleCount / totalCount;
  if (remaining <= 0.25) return 2;
  if (remaining <= 0.6) return 1;
  return 0;
}

export interface Cluster<T> {
  items: T[];
  /** Pixel centre of the group. */
  y: number;
  /** Axis-coordinate extent of the members, for zoom-to-fit. */
  t0: number;
  t1: number;
}

/**
 * Group leftovers into "+N more" markers.
 *
 * Items are grouped by proximity in pixels, so a cluster always represents
 * something a reader would perceive as one spot on the axis.
 */
export function clusterOverflow<T>(
  overflow: readonly T[],
  extentOf: (item: T) => Extent,
  timeOf: (item: T) => { t0: number; t1: number },
  bandHeight = 44,
): Cluster<T>[] {
  if (overflow.length === 0) return [];

  const sorted = [...overflow].sort((a, b) => centre(extentOf(a)) - centre(extentOf(b)));
  const clusters: Cluster<T>[] = [];

  let group: T[] = [];
  let anchor = centre(extentOf(sorted[0]!));

  const flush = () => {
    if (group.length === 0) return;
    const centres = group.map((item) => centre(extentOf(item)));
    const times = group.map(timeOf);
    clusters.push({
      items: group,
      y: centres.reduce((sum, c) => sum + c, 0) / centres.length,
      t0: Math.min(...times.map((t) => t.t0)),
      t1: Math.max(...times.map((t) => t.t1)),
    });
    group = [];
  };

  for (const item of sorted) {
    const c = centre(extentOf(item));
    if (group.length > 0 && c - anchor > bandHeight) {
      flush();
      anchor = c;
    }
    if (group.length === 0) anchor = c;
    group.push(item);
  }
  flush();

  return clusters;
}

function centre(extent: Extent): number {
  return (extent.y0 + extent.y1) / 2;
}

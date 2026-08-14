/**
 * Axis scale and zoom transform maths.
 *
 * The critical architectural rule: **never CSS-transform the timeline
 * content**. At the zoom levels this app reaches (k up to 1e7) the translate
 * offset would exceed 1e10 pixels and browsers lose sub-pixel fidelity, which
 * shows up as jitter and mispositioned marks. Instead the zoom transform is
 * kept in *data* space and positions are recomputed each frame from a rescaled
 * scale. All the numbers stay small; only the domain moves.
 */

import { scaleLinear } from 'd3-scale';
import { zoomIdentity, type ZoomTransform } from 'd3-zoom';

export type TimeScale = ReturnType<typeof createBaseScale>;

/** Maps the full timeline domain onto the viewport height at zoom 1. */
export function createBaseScale(domain: readonly [number, number], height: number) {
  return scaleLinear().domain([domain[0], domain[1]]).range([0, height]);
}

/**
 * The live scale for the current zoom transform.
 *
 * Equivalent to `view(t) = k * base(t) + transform.y`.
 */
export function rescale(base: TimeScale, transform: ZoomTransform): TimeScale {
  return transform.rescaleY(base);
}

/** The year range currently visible in the viewport. */
export function visibleDomain(
  base: TimeScale,
  transform: ZoomTransform,
  height: number,
): [number, number] {
  const view = transform.rescaleY(base);
  return [view.invert(0), view.invert(height)];
}

/**
 * The inverse of `rescale`: the transform that fits `[start, end]` exactly to
 * the viewport.
 *
 * This single function powers every navigational affordance in the app —
 * zoom-to-extent on an entry, the user's saved default view, era-rail jumps,
 * URL deep links, and preserving the visible range across a resize or device
 * rotation. Getting it wrong breaks all of them at once, so it is unit-tested
 * against `rescale` as a round trip.
 */
export function transformForDomain(
  base: TimeScale,
  start: number,
  end: number,
): ZoomTransform {
  const [d0, d1] = base.domain() as [number, number];
  const span = end - start;

  // Degenerate range (an instant, or inverted): fall back to identity rather
  // than dividing by zero and producing an Infinity transform.
  if (!(span > 0)) return zoomIdentity;

  const k = (d1 - d0) / span;
  const ty = -k * base(start);
  return zoomIdentity.translate(0, ty).scale(k);
}

/**
 * Fit a range with breathing room on each side, as a fraction of the span.
 * Used by zoom-to-extent so a war doesn't sit flush against the viewport edge.
 */
export function transformForDomainPadded(
  base: TimeScale,
  start: number,
  end: number,
  padding = 0.1,
): ZoomTransform {
  const span = end - start;
  if (!(span > 0)) {
    // An instant still deserves a sensible window rather than infinite zoom.
    const fallback = 1;
    return transformForDomain(base, start - fallback / 2, start + fallback / 2);
  }
  const pad = span * padding;
  return transformForDomain(base, start - pad, end + pad);
}

/** How many years one pixel covers at the current transform. */
export function yearsPerPixel(base: TimeScale, transform: ZoomTransform, height: number): number {
  const [t0, t1] = visibleDomain(base, transform, height);
  return (t1 - t0) / height;
}

/**
 * Combined time extent of a set of entries, for zoom-to-fit.
 *
 * `t1` is null for instantaneous entries, which contribute only their start.
 * Returns null for an empty set so callers do not zoom to Infinity.
 */
export function extentOf(
  items: readonly { t0: number; t1: number | null }[],
): [number, number] | null {
  if (items.length === 0) return null;

  let t0 = Infinity;
  let t1 = -Infinity;
  for (const item of items) {
    t0 = Math.min(t0, item.t0);
    t1 = Math.max(t1, item.t1 ?? item.t0);
  }
  return [t0, t1];
}

/**
 * Zoom bounds. k=1 always shows the whole domain, whatever that domain is.
 */
export const MIN_ZOOM = 1;

/**
 * The narrowest view the deepest zoom offers, in years — roughly one day per
 * pixel on a phone.
 *
 * This, not a fixed `k`, is what the upper zoom bound actually means. A focused
 * timeline spans centuries rather than megayears, so the same *physical* depth
 * is reached at a k three or four orders of magnitude smaller; expressing the
 * bound in years is what lets both timelines share one rule.
 */
export const FINEST_VISIBLE_SPAN = 1 / 3;

/** The upper zoom bound for a domain of `domainSpan` years. */
export function maxZoomFor(domainSpan: number): number {
  if (!(domainSpan > 0)) return MIN_ZOOM;
  return Math.max(MIN_ZOOM, domainSpan / FINEST_VISIBLE_SPAN);
}

/**
 * The main timeline's upper bound, retained as the reference point the
 * importance gate is calibrated against — `maxZoomFor` over the full
 * 3.3-Myr domain returns this to within a percent.
 */
export const MAX_ZOOM = 1e7;

/**
 * The span the importance gate's ladder is calibrated against, in years.
 *
 * A constant rather than "whatever the main timeline currently spans". The gate
 * reads `k`, where k=1 means "the whole domain is on screen" — so a gate value
 * only means a fixed number of visible years relative to some fixed span, and
 * every timeline is then scaled onto it by `gateScaleFor`.
 *
 * It used to be safe to take that reference from the main domain directly,
 * because the main domain *was* 3.3 Myr. Collapsing the empty ages took it to
 * around five and a half thousand, which would have quietly recalibrated the
 * gate for every timeline at once. Pinning it here is what keeps "the same
 * visible span earns the same detail" true across the change.
 */
export const GATE_REFERENCE_SPAN = MAX_ZOOM * FINEST_VISIBLE_SPAN;

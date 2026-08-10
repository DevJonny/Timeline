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
 * Zoom bounds. k=1 shows the whole 3.3-million-year span; the upper bound is
 * set so the deepest zoom approaches roughly one day per pixel.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 1e7;

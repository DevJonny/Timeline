/**
 * d3-zoom wrapped as a Svelte action.
 *
 * d3-zoom is selection-based and imperative, which does not mix with Svelte's
 * reactivity, so it is confined here: the action owns the behaviour and pushes
 * transforms out through a callback. Nothing else in the app touches d3-zoom.
 *
 * Mobile notes, all of which are load-bearing rather than defensive:
 *  - `touch-action: none` must be set on the node in CSS or the browser will
 *    steal the gesture for page scrolling before d3 ever sees it.
 *  - iOS Safari additionally fires non-standard `gesture*` events and will
 *    apply its own page zoom on top of ours unless they are cancelled.
 */

import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import 'd3-transition'; // side-effect import: gives selections .transition()

import { MAX_ZOOM, MIN_ZOOM } from './scale.ts';
import { prefersReducedMotion } from './theme.ts';

export interface ZoomController {
  /** Apply a transform, optionally animated. Honours reduced-motion. */
  zoomTo(transform: ZoomTransform, animate?: boolean): void;
  /** Reset to the full-span view. */
  reset(animate?: boolean): void;
  current(): ZoomTransform;
}

export interface ZoomableOptions {
  width: number;
  height: number;
  onTransform: (transform: ZoomTransform) => void;
  onReady?: (controller: ZoomController) => void;
  /** Initial transform, applied without animation. */
  initial?: ZoomTransform;
  scaleExtent?: [number, number];
  disabled?: boolean;
}

export function zoomable(node: HTMLElement, options: ZoomableOptions) {
  let current = options.initial ?? zoomIdentity;
  let opts = options;

  const behaviour = d3Zoom<HTMLElement, unknown>()
    .on('zoom', (event: D3ZoomEvent<HTMLElement, unknown>) => {
      current = event.transform;
      // Published synchronously and deliberately not coalesced.
      //
      // An earlier version batched these into a requestAnimationFrame with a
      // timeout fallback. It was both unnecessary and fragile: Svelte already
      // batches state changes into one render per microtask, so the only
      // per-event cost here is a single assignment, while the in-flight guard
      // could be left latched by a programmatic zoom arriving mid-mount —
      // after which no further transform ever reached the component and the
      // whole view silently froze while d3 kept updating underneath.
      opts.onTransform(event.transform);
    });

  const selection = select(node);

  function applyExtents(width: number, height: number): void {
    // Constraining translation to the viewport box pins horizontal panning at
    // zero and stops the timeline being dragged off-screen vertically.
    behaviour.extent([
      [0, 0],
      [width, height],
    ]);
    behaviour.translateExtent([
      [0, 0],
      [width, height],
    ]);
  }

  /**
   * Re-applied on update, not just at construction: the upper bound depends on
   * the domain span, so a focused timeline spanning centuries needs a
   * different one from the main timeline's megayears. Left set once, a focus
   * mounted into a reused node would keep bounds meant for another domain and
   * either refuse to zoom in or allow absurd depth.
   */
  function applyScaleExtent(extent: [number, number] | undefined): void {
    behaviour.scaleExtent(extent ?? [MIN_ZOOM, MAX_ZOOM]);
  }

  applyExtents(opts.width, opts.height);
  applyScaleExtent(opts.scaleExtent);
  selection.call(behaviour);

  if (opts.initial) {
    selection.call(behaviour.transform, opts.initial);
  }

  // iOS Safari page-zoom suppression. Scoped to this node only — never applied
  // document-wide, and never via user-scalable=no.
  const preventGesture = (event: Event) => event.preventDefault();
  node.addEventListener('gesturestart', preventGesture);
  node.addEventListener('gesturechange', preventGesture);
  node.addEventListener('gestureend', preventGesture);

  const controller: ZoomController = {
    zoomTo(transform, animate = true) {
      if (animate && !prefersReducedMotion()) {
        selection.transition().duration(450).call(behaviour.transform, transform);
      } else {
        selection.call(behaviour.transform, transform);
      }
    },
    reset(animate = true) {
      controller.zoomTo(zoomIdentity, animate);
    },
    current: () => current,
  };

  opts.onReady?.(controller);

  return {
    update(next: ZoomableOptions) {
      const previousExtent = opts.scaleExtent;
      opts = next;
      if (next.width !== options.width || next.height !== options.height) {
        applyExtents(next.width, next.height);
      }
      if (next.scaleExtent?.[0] !== previousExtent?.[0] || next.scaleExtent?.[1] !== previousExtent?.[1]) {
        applyScaleExtent(next.scaleExtent);
      }
      if (next.disabled) {
        selection.on('.zoom', null);
      }
    },
    destroy() {
      selection.on('.zoom', null);
      node.removeEventListener('gesturestart', preventGesture);
      node.removeEventListener('gesturechange', preventGesture);
      node.removeEventListener('gestureend', preventGesture);
    },
  };
}

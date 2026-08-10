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
 *  - Transform updates are coalesced to one animation frame. A pinch fires far
 *    more often than the display refreshes, and re-laying out the timeline per
 *    event drops frames on a phone.
 */

import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import 'd3-transition'; // side-effect import: gives selections .transition()

import { MAX_ZOOM, MIN_ZOOM } from './scale.ts';

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

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

export function zoomable(node: HTMLElement, options: ZoomableOptions) {
  let current = options.initial ?? zoomIdentity;
  let frame = 0;
  let pending: ZoomTransform | null = null;
  let opts = options;

  const behaviour = d3Zoom<HTMLElement, unknown>()
    .scaleExtent(opts.scaleExtent ?? [MIN_ZOOM, MAX_ZOOM])
    .on('zoom', (event: D3ZoomEvent<HTMLElement, unknown>) => {
      current = event.transform;
      pending = event.transform;
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (pending) opts.onTransform(pending);
        pending = null;
      });
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

  applyExtents(opts.width, opts.height);
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
      opts = next;
      if (next.width !== options.width || next.height !== options.height) {
        applyExtents(next.width, next.height);
      }
      if (next.disabled) {
        selection.on('.zoom', null);
      }
    },
    destroy() {
      if (frame !== 0) cancelAnimationFrame(frame);
      selection.on('.zoom', null);
      node.removeEventListener('gesturestart', preventGesture);
      node.removeEventListener('gesturechange', preventGesture);
      node.removeEventListener('gestureend', preventGesture);
    },
  };
}

<script lang="ts">
  import { zoomIdentity, type ZoomTransform } from 'd3-zoom';

  import {
    createBaseScale,
    transformForDomain,
    transformForDomainPadded,
    visibleDomain,
    yearsPerPixel,
  } from '../lib/scale.ts';
  import { chooseTickScale, generateTicks } from '../lib/ticks.ts';
  import { cullToViewport, labelExtent, packLanes, spanExtent } from '../lib/layout.ts';
  import { formatAxisYear, presentDecimalYear, resolveEnd, toDecimalYear } from '../lib/time.ts';
  import { prefetchDetail } from '../lib/data.ts';
  import { zoomable, type ZoomController } from '../lib/zoom.ts';
  import type { Entry } from '../lib/types.ts';
  import Axis from './Axis.svelte';
  import EntryMarker from './EntryMarker.svelte';
  import EraRail from './EraRail.svelte';
  import Legend from './Legend.svelte';
  import SpanBand from './SpanBand.svelte';

  interface Props {
    entries: Entry[];
  }

  let { entries }: Props = $props();

  /** Resolved once per load and injected, so "present" is consistent and testable. */
  const present = presentDecimalYear();

  const LABEL_HEIGHT = 42;
  const MIN_BAND_HEIGHT = 44; // touch target
  const BAND_PITCH = 11;
  const RAIL_WIDTH = 44;

  interface Resolved {
    entry: Entry;
    t0: number;
    /** null for an instantaneous entry. */
    t1: number | null;
  }

  const resolved: Resolved[] = $derived(
    entries
      .map((entry) => ({
        entry,
        t0: toDecimalYear(entry.start),
        t1: entry.end === undefined ? null : resolveEnd(entry.end, present),
      }))
      // Priority order for lane assignment: important first, then longer spans
      // (they carry more context), then chronological.
      .sort((a, b) => {
        if (a.entry.importance !== b.entry.importance) {
          return a.entry.importance - b.entry.importance;
        }
        const aLen = (a.t1 ?? a.t0) - a.t0;
        const bLen = (b.t1 ?? b.t0) - b.t0;
        if (aLen !== bLen) return bLen - aLen;
        return a.t0 - b.t0;
      }),
  );

  const domain: [number, number] = $derived.by(() => {
    let min = Infinity;
    let max = present;
    for (const item of resolved) {
      min = Math.min(min, item.t0);
      max = Math.max(max, item.t1 ?? item.t0);
    }
    return [Number.isFinite(min) ? min : -3_299_999, max];
  });

  let width = $state(0);
  let height = $state(0);
  let transform = $state<ZoomTransform>(zoomIdentity);
  let selectedId = $state<string | null>(null);

  let controller: ZoomController | undefined;

  /**
   * Visible range tracked outside the reactive graph, updated only on user
   * zoom. On resize we restore *this* rather than the pixel offset, so
   * rotating a phone does not teleport the view.
   */
  let userDomain: [number, number] | null = null;
  let lastHeight = 0;

  const safeHeight = $derived(Math.max(height, 1));
  const base = $derived(createBaseScale(domain, safeHeight));
  const view = $derived(transform.rescaleY(base));
  const visible = $derived(visibleDomain(base, transform, safeHeight));
  const ypp = $derived(yearsPerPixel(base, transform, safeHeight));
  const compact = $derived(width > 0 && width < 640);

  const tickScale = $derived(chooseTickScale(ypp, compact ? 44 : 56));
  const ticks = $derived(generateTicks(visible, tickScale, compact));

  /**
   * Precision hint for the visible-range readout. Without it, deep time
   * collapses to "1.7 Mya – 1.7 Mya" because a single decimal place spans
   * 100,000 years.
   */
  const readoutStep = $derived(Math.max((visible[1] - visible[0]) / 8, 1e-6));

  const maxBarLanes = $derived(compact ? 3 : 5);
  const maxLabelLanes = $derived(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
  const gutterPx = $derived(compact ? 72 : 96);

  // --- spans: coloured bars in the spine -------------------------------------

  interface Bar {
    item: Resolved;
    py0: number;
    py1: number;
  }

  const bars: Bar[] = $derived(
    resolved
      .filter((item) => item.t1 !== null)
      .map((item) => ({ item, py0: view(item.t0), py1: view(item.t1!) })),
  );

  const barPacking = $derived(
    packLanes(
      cullToViewport(bars, (b) => spanExtent(b.py0, b.py1, MIN_BAND_HEIGHT), safeHeight),
      (b) => spanExtent(b.py0, b.py1, MIN_BAND_HEIGHT),
      maxBarLanes,
      3,
    ),
  );

  const spinePx = $derived(Math.max(barPacking.lanes, 1) * BAND_PITCH + 6);
  const labelAreaPx = $derived(Math.max(140, width - gutterPx - spinePx - RAIL_WIDTH));
  const labelLaneWidth = $derived(labelAreaPx / maxLabelLanes);

  // --- labels: every entry competes for the same columns ---------------------

  interface Label {
    item: Resolved;
    /** Top of the label box. */
    top: number;
    /** True when a long span's label was held in view rather than left off-screen. */
    pinned: boolean;
  }

  const labels: Label[] = $derived(
    resolved.map((item) => {
      const py0 = view(item.t0);
      if (item.t1 === null) {
        return { item, top: py0 - LABEL_HEIGHT / 2, pinned: false };
      }
      const py1 = view(item.t1);
      // Hold a long span's label just inside the viewport so the Palaeolithic
      // stays identified while you are in the middle of it, but never push it
      // past the span's own end.
      const top = Math.min(Math.max(py0, 0), Math.max(py1 - LABEL_HEIGHT, py0));
      return { item, top, pinned: top > py0 + 0.5 };
    }),
  );

  const labelPacking = $derived(
    packLanes(
      cullToViewport(labels, (l) => labelExtent(l.top + LABEL_HEIGHT / 2, LABEL_HEIGHT), safeHeight, 60),
      (l) => labelExtent(l.top + LABEL_HEIGHT / 2, LABEL_HEIGHT),
      maxLabelLanes,
      4,
    ),
  );

  const hiddenCount = $derived(labelPacking.overflow.length);

  // --- era rail --------------------------------------------------------------

  const railAges = $derived(
    resolved
      .filter((item) => item.entry.type === 'age' && item.t1 !== null)
      .slice()
      .sort((a, b) => a.t0 - b.t0)
      .map((item) => ({ entry: item.entry, t0: item.t0, t1: item.t1! })),
  );

  const todayY = $derived(view(present));
  const todayVisible = $derived(todayY >= 0 && todayY <= height);

  function handleTransform(next: ZoomTransform): void {
    transform = next;
    if (height > 0) {
      userDomain = visibleDomain(createBaseScale(domain, height), next, height);
    }
  }

  function jumpTo(t0: number, t1: number): void {
    controller?.zoomTo(transformForDomainPadded(base, t0, t1));
  }

  function select(id: string): void {
    selectedId = selectedId === id ? null : id;
  }

  // Preserve the visible year range across viewport height changes.
  $effect(() => {
    const h = height;
    if (h <= 0) return;

    if (lastHeight === 0) {
      lastHeight = h;
      return;
    }
    if (h === lastHeight) return;

    const previous = userDomain;
    lastHeight = h;
    if (!previous || !controller) return;

    const rebased = createBaseScale(domain, h);
    controller.zoomTo(transformForDomain(rebased, previous[0], previous[1]), false);
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (!controller) return;
    const t = controller.current();

    switch (event.key) {
      case '+':
      case '=':
        controller.zoomTo(t.scale(2));
        break;
      case '-':
      case '_':
        controller.zoomTo(t.scale(0.5));
        break;
      case 'ArrowDown':
        controller.zoomTo(t.translate(0, -height / 8));
        break;
      case 'ArrowUp':
        controller.zoomTo(t.translate(0, height / 8));
        break;
      case 'Home':
        controller.reset();
        break;
      case 'Escape':
        selectedId = null;
        break;
      default:
        return;
    }
    event.preventDefault();
  }
</script>

<div
  class="frame"
  bind:clientWidth={width}
  bind:clientHeight={height}
  style="--gutter: {gutterPx}px; --spine: {spinePx}px; --band-pitch: {BAND_PITCH}px; --band-width: 8px; --label-lane-width: {labelLaneWidth}px"
>
  {#if height > 0}
    <!--
      role="application" because arrow keys and +/- are captured for
      navigation rather than page scrolling; the role tells assistive tech to
      pass those keys through instead of intercepting them. The list in the
      search panel is the accessible equivalent for screen-reader users, so
      nothing is only reachable through this element.

      The two rules below fire because svelte-check classifies `application`
      as non-interactive. Focusability and key handling are exactly the point
      of this element, so they are suppressed deliberately rather than worked
      around by weakening the semantics.
    -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="viewport"
      role="application"
      tabindex="0"
      aria-label="Timeline. Pinch or scroll to zoom, drag to pan. Plus and minus zoom, arrows pan, Home fits everything."
      onkeydown={handleKeydown}
      use:zoomable={{
        width,
        height,
        onTransform: handleTransform,
        onReady: (c) => (controller = c),
      }}
    >
      <Axis {ticks} y={view} />

      <div class="spine">
        {#each barPacking.placed as placement (placement.item.item.entry.id)}
          <SpanBand
            entry={placement.item.item.entry}
            lane={placement.lane}
            y0={placement.item.py0}
            y1={placement.item.py1}
            selected={selectedId === placement.item.item.entry.id}
            onselect={select}
          />
        {/each}
      </div>

      <div class="labels">
        {#each labelPacking.placed as placement (placement.item.item.entry.id)}
          <EntryMarker
            entry={placement.item.item.entry}
            lane={placement.lane}
            y={placement.item.top}
            pinned={placement.item.pinned}
            selected={selectedId === placement.item.item.entry.id}
            {compact}
            onselect={select}
            onprefetch={prefetchDetail}
          />
        {/each}
      </div>

      {#if todayVisible}
        <div class="today" style="--y: {todayY}px">
          <span class="today-label">Today</span>
        </div>
      {/if}
    </div>

    <EraRail ages={railAges} {visible} onjump={jumpTo} />
    <Legend />

    <div class="readout">
      {formatAxisYear(visible[0], false, readoutStep)} – {formatAxisYear(
        visible[1],
        false,
        readoutStep,
      )}
      {#if hiddenCount > 0}
        <span class="hidden-count">· {hiddenCount} hidden</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background: var(--surface-1);
  }

  .viewport {
    position: absolute;
    inset: 0;
    /*
      Essential, not cosmetic: without this the browser claims the gesture for
      page scrolling and pinch-zoom before d3-zoom ever sees a pointer event.
      Scoped to this element so the rest of the page still scrolls normally.
    */
    touch-action: none;
    cursor: grab;
    outline-offset: -2px;
  }

  .viewport:active {
    cursor: grabbing;
  }

  .spine {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--gutter);
    width: var(--spine);
  }

  .labels {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--gutter) + var(--spine));
    right: 0;
  }

  .today {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    translate: 0 var(--y);
    height: 0;
    border-top: 2px solid var(--text-primary);
    pointer-events: none;
    z-index: 1;
  }

  .today-label {
    position: absolute;
    left: max(0.5rem, env(safe-area-inset-left));
    top: 0.25rem;
    font-size: 0.625rem;
    font-weight: 700;
    color: var(--surface-1);
    background: var(--text-primary);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.25rem;
  }

  .readout {
    position: absolute;
    top: max(0.5rem, env(safe-area-inset-top));
    left: max(0.5rem, env(safe-area-inset-left));
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--surface-1) 88%, transparent);
    backdrop-filter: blur(6px);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    pointer-events: none;
    z-index: 2;
  }

  .hidden-count {
    color: var(--text-muted);
  }
</style>

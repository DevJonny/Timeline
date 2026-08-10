<script lang="ts">
  import { zoomIdentity, type ZoomTransform } from 'd3-zoom';

  import {
    createBaseScale,
    transformForDomain,
    visibleDomain,
    yearsPerPixel,
  } from '../lib/scale.ts';
  import { chooseTickScale, generateTicks } from '../lib/ticks.ts';
  import { formatAxisYear, presentDecimalYear, resolveEnd, toDecimalYear } from '../lib/time.ts';
  import { zoomable, type ZoomController } from '../lib/zoom.ts';
  import type { Entry } from '../lib/types.ts';
  import Axis from './Axis.svelte';

  interface Props {
    entries: Entry[];
  }

  let { entries }: Props = $props();

  /**
   * Resolved once per load, then injected everywhere. Nothing reads the clock
   * ad hoc, so "present" is consistent across the whole render and testable.
   */
  const present = presentDecimalYear();

  const domain: [number, number] = $derived.by(() => {
    let min = Infinity;
    let max = present;
    for (const entry of entries) {
      const start = toDecimalYear(entry.start);
      min = Math.min(min, start);
      max = Math.max(max, entry.end ? resolveEnd(entry.end, present) : start);
    }
    return [Number.isFinite(min) ? min : -3_299_999, max];
  });

  let width = $state(0);
  let height = $state(0);
  let transform = $state<ZoomTransform>(zoomIdentity);

  let controller: ZoomController | undefined;

  /**
   * The visible year range, tracked outside the reactive graph.
   *
   * It is updated only when the *user* zooms. On a resize or rotation the
   * viewport height changes, which would otherwise silently change the visible
   * range; instead we re-derive a transform that restores this range. Deriving
   * it reactively from `height` would defeat the purpose — it would already
   * have been corrupted by the time the resize effect ran.
   */
  let userDomain: [number, number] | null = null;
  let lastHeight = 0;

  const base = $derived(createBaseScale(domain, Math.max(height, 1)));
  const view = $derived(transform.rescaleY(base));
  const visible = $derived(visibleDomain(base, transform, Math.max(height, 1)));
  const ypp = $derived(yearsPerPixel(base, transform, Math.max(height, 1)));
  const compact = $derived(width > 0 && width < 640);
  const ticks = $derived(
    generateTicks(visible, chooseTickScale(ypp, compact ? 44 : 56), compact),
  );

  const todayY = $derived(view(present));
  const todayVisible = $derived(todayY >= 0 && todayY <= height);

  function handleTransform(next: ZoomTransform): void {
    transform = next;
    if (height > 0) {
      userDomain = visibleDomain(createBaseScale(domain, height), next, height);
    }
  }

  // Preserve the visible year range across viewport height changes, rather
  // than the pixel offset. Without this, rotating a phone teleports the user.
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
      default:
        return;
    }
    event.preventDefault();
  }
</script>

<div class="frame" bind:clientWidth={width} bind:clientHeight={height}>
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

      {#if todayVisible}
        <div class="today" style="--y: {todayY}px">
          <span class="today-label">Today · {formatAxisYear(present)}</span>
        </div>
      {/if}
    </div>

    <div class="readout" aria-live="off">
      {formatAxisYear(visible[0])} – {formatAxisYear(visible[1])}
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

  .today {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    translate: 0 var(--y);
    height: 0;
    border-top: 2px solid var(--text-primary);
    pointer-events: none;
  }

  .today-label {
    position: absolute;
    right: max(0.5rem, env(safe-area-inset-right));
    top: 0.25rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--surface-1);
    background: var(--text-primary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    white-space: nowrap;
  }

  .readout {
    position: absolute;
    top: max(0.5rem, env(safe-area-inset-top));
    right: max(0.5rem, env(safe-area-inset-right));
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--surface-1) 88%, transparent);
    backdrop-filter: blur(6px);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    pointer-events: none;
  }
</style>

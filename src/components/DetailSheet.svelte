<script lang="ts">
  import { loadDetail } from '../lib/data.ts';
  import { familyColour, TYPE_LABEL } from '../lib/palette.ts';
  import { formatRange } from '../lib/time.ts';
  import type { Detail, Entry } from '../lib/types.ts';
  import Glyph from './Glyph.svelte';

  interface Props {
    entry: Entry;
    /**
     * The focus that authored this entry, when one did. Inherited entries keep
     * their prose in the main details directory even while a focus is open, so
     * this is not simply "the timeline being viewed".
     */
    focusId?: string | null;
    /** Present only for ranged entries — instants have nothing to zoom to. */
    onzoom: (() => void) | null;
    onclose: () => void;
  }

  let { entry, focusId = null, onzoom, onclose }: Props = $props();

  let sheet = $state<HTMLElement | null>(null);
  let dragOffset = $state(0);
  let dragging = $state(false);

  const detail: Promise<Detail> = $derived(loadDetail(entry.id, focusId ?? undefined));
  const range = $derived(formatRange(entry.start, entry.end));

  // Move focus into the sheet when it opens so keyboard and screen-reader
  // users land on the content rather than being left on the timeline.
  $effect(() => {
    if (entry.id) sheet?.focus();
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onclose();
    }
  }

  // Drag-to-dismiss. Pointer events cover touch and mouse in one path.
  let startY = 0;

  function pointerDown(event: PointerEvent): void {
    dragging = true;
    startY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent): void {
    if (!dragging) return;
    dragOffset = Math.max(0, event.clientY - startY);
  }

  function pointerUp(): void {
    if (!dragging) return;
    dragging = false;
    if (dragOffset > 80) onclose();
    dragOffset = 0;
  }
</script>

<!--
  A plain div, not an <aside>: the sheet carries role="dialog", and a
  landmark element cannot take an interactive role. aria-modal is false
  because the timeline behind stays live and interactive by design — you can
  keep zooming with the sheet open.
-->
<div
  class="sheet"
  class:dragging
  style="--colour: {familyColour(entry.type)}; --drag: {dragOffset}px"
  bind:this={sheet}
  tabindex="-1"
  role="dialog"
  aria-modal="false"
  aria-label="{entry.title} details"
  onkeydown={handleKeydown}
>
  <!--
    Drag handle: touch-action none so the gesture is ours rather than the
    browser's scroll. Keyboard users get the close button instead, and Escape
    works anywhere in the sheet.
  -->
  <div
    class="grip"
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={pointerUp}
    aria-hidden="true"
  >
    <span></span>
  </div>

  <header>
    <p class="kind">
      <Glyph type={entry.type} size={12} />
      {TYPE_LABEL[entry.type]}
    </p>
    <h2>{entry.title}</h2>

    {#if onzoom}
      <button class="range action" onclick={onzoom}>
        <span class="range-text">{range}</span>
        <span class="zoom-hint">Zoom to this</span>
      </button>
    {:else}
      <p class="range">{range}</p>
    {/if}
  </header>

  <div class="body">
    {#await detail}
      <p class="skeleton-line"></p>
      <p class="skeleton-line short"></p>
      <p class="skeleton-line"></p>
    {:then loaded}
      <p class="short">{loaded.short}</p>
      {#each loaded.full.split('\n\n') as paragraph}
        <p>{paragraph}</p>
      {/each}
    {:catch}
      <p class="unavailable">
        Details for this entry could not be loaded. If you are offline, entries you
        have not opened before are not available.
      </p>
    {/await}

    <ul class="keywords">
      {#each entry.keywords as keyword}
        <li>{keyword.replace(/-/g, ' ')}</li>
      {/each}
    </ul>
  </div>

  <button class="close" onclick={onclose} aria-label="Close details">×</button>
</div>

<style>
  .sheet {
    position: fixed;
    z-index: 10;
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border: 1px solid var(--border);
    color: var(--text-primary);
    outline: none;
    box-shadow: 0 -8px 32px rgb(0 0 0 / 18%);

    /* Phone: bottom sheet. */
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 68dvh;
    border-radius: 1rem 1rem 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    translate: 0 var(--drag);
    transition: translate 180ms ease;
  }

  .sheet.dragging {
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet {
      transition: none;
    }
  }

  .grip {
    display: grid;
    place-items: center;
    padding: 0.5rem;
    /* The gesture belongs to the sheet, not the page. */
    touch-action: none;
    cursor: grab;
  }

  .grip span {
    display: block;
    width: 2.25rem;
    height: 0.25rem;
    border-radius: 0.125rem;
    background: var(--axis);
  }

  header {
    padding: 0 1rem 0.75rem;
    border-bottom: 1px solid var(--gridline);
  }

  .kind {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin: 0 0 0.25rem;
    color: var(--colour);
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  h2 {
    margin: 0 2rem 0.375rem 0;
    font-size: 1.25rem;
    line-height: 1.2;
    letter-spacing: -0.01em;
  }

  .range {
    margin: 0;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .action {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0.25rem 0.625rem 0.25rem 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
  }

  .action .range-text {
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .zoom-hint {
    flex: 0 0 auto;
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--colour);
  }

  .action:hover .zoom-hint,
  .action:focus-visible .zoom-hint {
    background: color-mix(in srgb, var(--colour) 14%, transparent);
  }

  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.75rem 1rem 1rem;
  }

  .body p {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .short {
    font-weight: 600;
    color: var(--text-primary) !important;
  }

  .skeleton-line {
    height: 0.75rem;
    border-radius: 0.25rem;
    background: var(--gridline);
  }

  .skeleton-line.short {
    width: 60%;
  }

  .unavailable {
    color: var(--text-primary) !important;
  }

  .keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
  }

  .keywords li {
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 0.6875rem;
    color: var(--text-muted);
  }

  .close {
    position: absolute;
    top: 0.75rem;
    right: 0.5rem;
    width: 44px;
    height: 44px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .close:focus-visible,
  .action:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: -2px;
    border-radius: 0.25rem;
  }

  /* Tablet and up: a side panel, so the timeline stays fully visible. */
  @media (min-width: 768px) {
    .sheet {
      left: auto;
      top: 0;
      bottom: 0;
      width: min(24rem, 40vw);
      max-height: none;
      border-radius: 0;
      border-inline-end: none;
      translate: none;
      box-shadow: -8px 0 32px rgb(0 0 0 / 12%);
    }

    .grip {
      display: none;
    }

    header {
      padding-top: max(1rem, env(safe-area-inset-top));
    }
  }
</style>

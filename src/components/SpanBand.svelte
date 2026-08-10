<script lang="ts">
  import { familyColour } from '../lib/palette.ts';
  import type { Entry } from '../lib/types.ts';

  interface Props {
    entry: Entry;
    lane: number;
    y0: number;
    y1: number;
    selected: boolean;
    onselect: (id: string) => void;
  }

  let { entry, lane, y0, y1, selected, onselect }: Props = $props();

  const top = $derived(Math.max(y0, -40));
  const height = $derived(Math.max(Math.min(y1, 100000) - top, 4));
</script>

<button
  class="band"
  class:selected
  style="--lane: {lane}; --top: {top}px; --height: {height}px; --colour: {familyColour(entry.type)}"
  onclick={() => onselect(entry.id)}
  aria-label={entry.title}
  aria-pressed={selected}
></button>

<style>
  .band {
    position: absolute;
    top: 0;
    left: calc(var(--lane) * var(--band-pitch));
    width: var(--band-width);
    translate: 0 var(--top);
    height: var(--height);
    padding: 0;
    border: none;
    border-radius: calc(var(--band-width) / 2);
    background: var(--colour);
    cursor: pointer;
    /* The bar itself is thin; the touch target is widened below. */
    -webkit-tap-highlight-color: transparent;
  }

  /* Expand the hit area to the 44px minimum without changing the visual width. */
  .band::after {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline: calc((44px - var(--band-width)) / -2);
  }

  .band.selected {
    outline: 2px solid var(--text-primary);
    outline-offset: 2px;
  }

  .band:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: 2px;
  }
</style>

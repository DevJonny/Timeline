<script lang="ts">
  import { familyColour } from '../lib/palette.ts';
  import { formatRange } from '../lib/time.ts';
  import type { Entry } from '../lib/types.ts';
  import Glyph from './Glyph.svelte';

  interface Props {
    entry: Entry;
    lane: number;
    /** Pixel position of the label box (already lane-packed and clamped). */
    y: number;
    /** True when the entry is a span whose label has been pinned into view. */
    pinned: boolean;
    selected: boolean;
    compact: boolean;
    onselect: (id: string) => void;
    onprefetch: (id: string) => void;
  }

  let { entry, lane, y, pinned, selected, compact, onselect, onprefetch }: Props = $props();

  const date = $derived(formatRange(entry.start, entry.end, true));
</script>

<button
  class="marker"
  class:selected
  class:pinned
  style="--lane: {lane}; --y: {y}px; --colour: {familyColour(entry.type)}"
  onclick={() => onselect(entry.id)}
  onfocus={() => onprefetch(entry.id)}
  aria-pressed={selected}
>
  <Glyph type={entry.type} size={compact ? 12 : 14} />
  <span class="text">
    <span class="title">{entry.title}</span>
    <!--
      The date is always visible, not a hover affordance: there is no hover on
      a phone, and the light-mode palette's sub-3:1 contrast on two families
      obliges a visible text label rather than colour alone.
    -->
    <span class="date">{date}</span>
  </span>
</button>

<style>
  .marker {
    position: absolute;
    top: 0;
    left: calc(var(--lane) * var(--label-lane-width));
    width: var(--label-lane-width);
    translate: 0 var(--y);
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-height: 44px; /* touch target */
    padding: 0.125rem 0.5rem 0.125rem 0.25rem;
    border: none;
    background: none;
    color: var(--colour);
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .marker :global(.glyph) {
    translate: 0 0.15em;
  }

  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .title {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pinned .title::before {
    /* Marks a label that has been held in view rather than sitting at the
       entry's true start, so the position is not misread. */
    content: '↑ ';
    color: var(--text-muted);
    font-weight: 400;
  }

  .marker.selected .title {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .marker:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: -2px;
    border-radius: 0.25rem;
  }

  @media (min-width: 640px) {
    .title {
      font-size: 0.875rem;
    }
  }
</style>

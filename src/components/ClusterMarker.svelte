<script lang="ts">
  import type { Entry } from '../lib/types.ts';

  interface Props {
    entries: Entry[];
    lane: number;
    y: number;
    onexpand: () => void;
  }

  let { entries, lane, y, onexpand }: Props = $props();

  const names = $derived(entries.map((e) => e.title).join(', '));
</script>

<!--
  Tapping zooms to fit the cluster's members rather than opening a popover.
  Zoom is the timeline's natural inspect gesture, it needs no anchored overlay
  to position correctly on a small screen, and it works whether the cluster
  holds two entries or twenty. The search panel covers the case where members
  share an identical date and cannot be separated by zooming.
-->
<button
  class="cluster"
  style="--lane: {lane}; --y: {y}px"
  onclick={onexpand}
  title={names}
  aria-label="{entries.length} more entries here: {names}. Zoom in to separate them."
>
  <span class="dots" aria-hidden="true"></span>
  <span class="count">+{entries.length}</span>
</button>

<style>
  .cluster {
    position: absolute;
    top: 0;
    left: calc(var(--lane) * var(--label-lane-width));
    translate: 0 var(--y);
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-height: 32px;
    padding: 0.125rem 0.5rem 0.125rem 0.25rem;
    border: none;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .cluster::after {
    /* Reach the 44px touch minimum without a 44px-tall visual. */
    content: '';
    position: absolute;
    inset-inline: 0;
    inset-block: -6px;
  }

  .dots {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px dashed var(--text-muted);
  }

  .count {
    font-size: 0.6875rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }

  .cluster:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: -2px;
    border-radius: 0.25rem;
  }
</style>

<script lang="ts">
  import type { Tick } from '../lib/ticks.ts';

  interface Props {
    ticks: Tick[];
    /** Maps an axis coordinate to a pixel offset in the viewport. */
    y: (t: number) => number;
  }

  let { ticks, y }: Props = $props();
</script>

<!--
  aria-hidden: the axis is decoration for sighted users. The accessible
  equivalent of the whole timeline is the entry list in the search panel,
  which is a real semantic list rather than absolutely-positioned rules.
-->
<div class="axis" aria-hidden="true">
  {#each ticks as tick (tick.t)}
    <div class="tick" class:major={tick.major} style="--y: {y(tick.t)}px">
      <span class="rule"></span>
      <span class="label">{tick.label}</span>
    </div>
  {/each}
</div>

<style>
  .axis {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .tick {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    translate: 0 var(--y);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Keeps the label visually centred on its rule. */
    margin-top: -0.5lh;
    height: 1lh;
  }

  .rule {
    flex: 1;
    order: 2;
    height: 1px;
    background: var(--gridline);
  }

  .label {
    order: 1;
    flex: 0 0 auto;
    min-width: 4.5rem;
    padding-inline-start: max(0.5rem, env(safe-area-inset-left));
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .tick.major .rule {
    background: var(--axis);
  }

  .tick.major .label {
    color: var(--text-secondary);
    font-weight: 600;
  }

  @media (min-width: 640px) {
    .label {
      min-width: 6rem;
      font-size: 0.75rem;
    }
  }
</style>

<script lang="ts">
  import type { Tick } from '../lib/ticks.ts';

  interface Props {
    ticks: Tick[];
    /** Pixel bands where the axis is compressed. Usually empty. */
    breaks: { y0: number; y1: number }[];
    /** Maps an axis coordinate to a pixel offset in the viewport. */
    y: (t: number) => number;
  }

  let { ticks, breaks, y }: Props = $props();
</script>

<!--
  aria-hidden: the axis is decoration for sighted users. The accessible
  equivalent of the whole timeline is the entry list in the search panel,
  which is a real semantic list rather than absolutely-positioned rules.
-->
<div class="axis" aria-hidden="true">
  <!--
    Keyed by index, not by position: these move every frame, and keying on a
    pixel offset would tear down and rebuild the element on each one.
  -->
  {#each breaks as band, index (index)}
    <div class="break" style="--y: {band.y0}px; --h: {Math.max(band.y1 - band.y0, 1)}px"></div>
  {/each}

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

  /*
    A stretch where the scale is broken, drawn with the conventional hatch. It
    carries no label of its own — the collapsed age still renders its own band
    and title in the spine, so naming it here would say the same thing twice.
  */
  .break {
    position: absolute;
    left: 0;
    right: 0;
    translate: 0 var(--y);
    height: var(--h);
    border-block: 1px dashed var(--axis);
    background: repeating-linear-gradient(
      -45deg,
      transparent 0 5px,
      var(--gridline) 5px 6px
    );
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

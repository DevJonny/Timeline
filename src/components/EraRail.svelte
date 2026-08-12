<script lang="ts">
  import { familyColour } from '../lib/palette.ts';
  import type { Entry } from '../lib/types.ts';

  export interface RailAge {
    entry: Entry;
    t0: number;
    t1: number;
    /** No entry survives the current filter inside this span. */
    empty: boolean;
  }

  interface Props {
    ages: RailAge[];
    visible: [number, number];
    /** When false, empty ages render as ordinary segments. */
    dimEmpty: boolean;
    onjump: (t0: number, t1: number) => void;
  }

  let { ages, visible, dimEmpty, onjump }: Props = $props();

  const dimmed = $derived(
    new Set(dimEmpty ? ages.filter((a) => a.empty).map((a) => a.entry.id) : []),
  );

  const active = $derived(
    new Set(ages.filter((a) => a.t0 < visible[1] && visible[0] < a.t1).map((a) => a.entry.id)),
  );

  /** "Classical Antiquity" → "CA"; "Bronze Age" → "BA". */
  function initials(title: string): string {
    return title
      .split(/[\s-]+/)
      .filter((w) => /^[A-Za-z]/.test(w))
      .map((w) => w[0]!.toUpperCase())
      .join('')
      .slice(0, 3);
  }
</script>

<!--
  Deliberately NOT a proportional minimap. At true scale the Palaeolithic is
  99.6% of the domain and every later age is sub-pixel, which is exactly the
  situation that makes the zoomed-out timeline unnavigable in the first place.
  Equal segments make this a table of contents instead, which is what the rail
  is actually for.
-->
<nav class="rail" aria-label="Jump to age">
  {#each ages as age (age.entry.id)}
    <button
      class="segment"
      class:active={active.has(age.entry.id) && !dimmed.has(age.entry.id)}
      class:empty={dimmed.has(age.entry.id)}
      style="--colour: {familyColour(age.entry.type)}"
      onclick={() => onjump(age.t0, age.t1)}
      disabled={dimmed.has(age.entry.id)}
      title={dimmed.has(age.entry.id)
        ? `${age.entry.title} — nothing matches the current filter`
        : age.entry.title}
      aria-label={dimmed.has(age.entry.id)
        ? `${age.entry.title}, nothing matches the current filter`
        : `Jump to ${age.entry.title}`}
      aria-current={active.has(age.entry.id) ? 'true' : undefined}
    >
      <span class="abbr" aria-hidden="true">{initials(age.entry.title)}</span>
    </button>
  {/each}
</nav>

<style>
  .rail {
    position: absolute;
    top: max(3rem, calc(env(safe-area-inset-top) + 3rem));
    bottom: max(3.5rem, calc(env(safe-area-inset-bottom) + 3.5rem));
    right: max(0.375rem, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 2;
  }

  .segment {
    flex: 1;
    display: grid;
    place-items: center;
    /* Thumb-reachable and at least a 28px-wide strip; the ::after below
       extends the hit area to the 44px minimum without widening the visual. */
    width: 1.75rem;
    min-height: 1.5rem;
    position: relative;
    padding: 0;
    border: none;
    border-radius: 0.25rem;
    background: color-mix(in srgb, var(--colour) 22%, transparent);
    color: transparent;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .segment::after {
    content: '';
    position: absolute;
    inset-block: -1px;
    inset-inline: calc((44px - 1.75rem) / -2);
  }

  .segment.active {
    background: var(--colour);
  }

  /*
   * Kept in place rather than removed. The rail is a table of contents and its
   * ordering is the only spatial cue it offers, so segments that drop out
   * under one filter and return under the next would move every other button
   * under the reader's thumb.
   */
  .segment.empty {
    background: color-mix(in srgb, var(--text-muted) 12%, transparent);
    cursor: default;
  }

  .segment.empty .abbr {
    color: var(--text-muted);
    opacity: 0.5;
  }

  .abbr {
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text-secondary);
  }

  .segment.active .abbr {
    color: var(--surface-1);
  }

  .segment:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: 1px;
  }
</style>

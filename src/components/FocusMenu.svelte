<script lang="ts">
  import { formatRange } from '../lib/time.ts';
  import type { FocusSummary } from '../lib/types.ts';

  interface Props {
    open: boolean;
    focuses: FocusSummary[];
    /** The focus currently being read, or null on the main timeline. */
    current: string | null;
    onopen: (id: string) => void;
    onexit: () => void;
    onclose: () => void;
  }

  let { open, focuses, current, onopen, onexit, onclose }: Props = $props();

  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      onclose();
    }
  }

  function choose(id: string): void {
    onclose();
    if (id !== current) onopen(id);
  }

  function leave(): void {
    onclose();
    if (current !== null) onexit();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <section class="panel" aria-label="Timelines">
    <header>
      <h2>Timelines</h2>
      <button class="icon" onclick={onclose} aria-label="Close timelines menu">×</button>
    </header>

    <div class="body">
      <p class="hint">
        A focused timeline covers one subject in far more detail than the whole of history has
        room for.
      </p>

      <ul class="list">
        <!--
          The main timeline is an item in this list rather than only a back
          button, so the menu always shows where you are and every destination
          is reachable the same way.
        -->
        <li>
          <button
            class="item"
            class:on={current === null}
            onclick={leave}
            aria-current={current === null ? 'true' : undefined}
          >
            <span class="title">All of history</span>
            <span class="range">3.3 Mya – today</span>
            <span class="blurb">Every entry, from the Palaeolithic to the present day.</span>
          </button>
        </li>

        {#each focuses as focus (focus.id)}
          <li>
            <button
              class="item"
              class:on={current === focus.id}
              onclick={() => choose(focus.id)}
              aria-current={current === focus.id ? 'true' : undefined}
            >
              <span class="title">{focus.title}</span>
              <span class="range">{formatRange(focus.range.start, focus.range.end)}</span>
              <span class="blurb">{focus.blurb}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}

<style>
  .panel {
    position: fixed;
    z-index: 20;
    display: flex;
    flex-direction: column;
    inset: auto 0 0 0;
    max-height: 80dvh;
    padding-bottom: env(safe-area-inset-bottom);
    border: 1px solid var(--border);
    border-radius: 1rem 1rem 0 0;
    background: var(--surface-1);
    box-shadow: 0 -8px 32px rgb(0 0 0 / 18%);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-bottom: 1px solid var(--gridline);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .icon {
    width: 44px;
    height: 44px;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.75rem 1rem 1rem;
  }

  .hint {
    margin: 0 0 0.75rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.125rem 0.5rem;
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--surface-2);
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .item.on {
    border-color: currentColor;
  }

  .title {
    font-size: 0.875rem;
    font-weight: 600;
  }

  .range {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .blurb {
    grid-column: 1 / -1;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .item:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: 1px;
  }
</style>

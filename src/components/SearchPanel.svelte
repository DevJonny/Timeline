<script lang="ts">
  import {
    collectKeywords,
    humanKeyword,
    isFilterActive,
    toggle,
    type Filters,
  } from '../lib/filter.ts';
  import { familyColour } from '../lib/palette.ts';
  import { formatRange } from '../lib/time.ts';
  import { ENTRY_TYPES, TYPE_LABEL, type Entry, type EntryType } from '../lib/types.ts';
  import Glyph from './Glyph.svelte';

  interface Props {
    open: boolean;
    filters: Filters;
    /** Entries surviving the current filters, in chronological order. */
    results: Entry[];
    total: number;
    selectedId: string | null;
    onchange: (filters: Filters) => void;
    onselect: (id: string) => void;
    onfit: () => void;
    onclose: () => void;
  }

  let {
    open,
    filters,
    results,
    total,
    selectedId,
    onchange,
    onselect,
    onfit,
    onclose,
  }: Props = $props();

  const keywords = $derived(collectKeywords(results).slice(0, 16));
  const active = $derived(isFilterActive(filters));

  let input = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (open) input?.focus();
  });

  function setQuery(value: string): void {
    onchange({ ...filters, query: value });
  }

  function toggleType(type: EntryType): void {
    onchange({ ...filters, types: toggle(filters.types, type) });
  }

  function toggleKeyword(keyword: string): void {
    onchange({ ...filters, keywords: toggle(filters.keywords, keyword) });
  }

  function clear(): void {
    onchange({ query: '', types: [], keywords: [] });
  }

  // Bound at the window rather than on the panel element: Escape should close
  // the drawer wherever focus happens to be, including the search input.
  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!--
    This panel is the accessible equivalent of the timeline. The zoomable
    viewport is a role="application" canvas that a screen reader cannot
    meaningfully traverse; this is a real list of every entry, reachable by
    keyboard, and selecting from it does exactly what tapping a marker does.
  -->
  <section class="panel" aria-label="Search and filter">
    <header>
      <input
        bind:this={input}
        class="search"
        type="search"
        placeholder="Search entries…"
        value={filters.query}
        oninput={(e) => setQuery(e.currentTarget.value)}
        aria-label="Search entries by title, type or keyword"
      />
      <button class="icon" onclick={onclose} aria-label="Close search">×</button>
    </header>

    <div class="controls">
      <fieldset>
        <legend>Types</legend>
        <div class="chips">
          {#each ENTRY_TYPES as type (type)}
            <button
              class="chip"
              class:on={filters.types.includes(type)}
              style="--colour: {familyColour(type)}"
              onclick={() => toggleType(type)}
              aria-pressed={filters.types.includes(type)}
            >
              <Glyph {type} size={11} />
              {TYPE_LABEL[type]}
            </button>
          {/each}
        </div>
      </fieldset>

      {#if keywords.length > 0}
        <fieldset>
          <legend>Keywords</legend>
          <div class="chips">
            {#each keywords as { keyword, count } (keyword)}
              <button
                class="chip"
                class:on={filters.keywords.includes(keyword)}
                onclick={() => toggleKeyword(keyword)}
                aria-pressed={filters.keywords.includes(keyword)}
              >
                {humanKeyword(keyword)}<span class="count">{count}</span>
              </button>
            {/each}
          </div>
        </fieldset>
      {/if}
    </div>

    <div class="summary">
      <span>{results.length} of {total}</span>
      <div class="summary-actions">
        {#if results.length > 0}
          <button class="link" onclick={onfit}>Fit results</button>
        {/if}
        {#if active}
          <button class="link" onclick={clear}>Clear</button>
        {/if}
      </div>
    </div>

    {#if results.length === 0}
      <p class="empty">Nothing matches these filters.</p>
    {:else}
      <ul class="results">
        {#each results as entry (entry.id)}
          <li>
            <button
              class="result"
              class:selected={selectedId === entry.id}
              style="--colour: {familyColour(entry.type)}"
              onclick={() => onselect(entry.id)}
              aria-current={selectedId === entry.id ? 'true' : undefined}
            >
              <Glyph type={entry.type} size={12} />
              <span class="result-text">
                <span class="result-title">{entry.title}</span>
                <span class="result-date">{formatRange(entry.start, entry.end, true)}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .panel {
    position: fixed;
    z-index: 20;
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgb(0 0 0 / 20%);

    /* Phone: a full drawer, because filters plus a result list need the room. */
    inset: 0;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }

  header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
    border-bottom: 1px solid var(--gridline);
  }

  .search {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--surface-2);
    color: var(--text-primary);
    font: inherit;
    font-size: 0.9375rem;
  }

  .icon {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }

  .controls {
    padding: 0.625rem 0.75rem 0;
    overflow-y: auto;
    max-height: 40dvh;
  }

  fieldset {
    margin: 0 0 0.625rem;
    padding: 0;
    border: none;
  }

  legend {
    padding: 0;
    margin-bottom: 0.3125rem;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3125rem;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    min-height: 32px;
    padding: 0.25rem 0.625rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--colour, var(--text-secondary));
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .chip.on {
    background: color-mix(in srgb, var(--colour, var(--text-primary)) 18%, transparent);
    border-color: currentColor;
    font-weight: 600;
  }

  .count {
    margin-left: 0.25rem;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border-block: 1px solid var(--gridline);
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .summary-actions {
    display: flex;
    gap: 0.75rem;
  }

  .link {
    min-height: 32px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-primary);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .results {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .result {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    min-height: 44px;
    padding: 0.4375rem 0.75rem;
    border: none;
    border-bottom: 1px solid var(--gridline);
    background: none;
    color: var(--colour);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .result-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .result-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .result-date {
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }

  .result.selected {
    background: color-mix(in srgb, var(--colour) 12%, transparent);
  }

  .empty {
    padding: 1.5rem 0.75rem;
    margin: 0;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .chip:focus-visible,
  .result:focus-visible,
  .link:focus-visible,
  .icon:focus-visible,
  .search:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: -2px;
  }

  /* Tablet and up: a side panel, leaving the timeline visible beside it. */
  @media (min-width: 768px) {
    .panel {
      inset: 0 auto 0 0;
      width: min(22rem, 38vw);
      border-inline-start: none;
    }

    .controls {
      max-height: 32dvh;
    }
  }
</style>

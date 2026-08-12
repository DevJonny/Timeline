<script lang="ts">
  /**
   * The shell. It owns one decision — which timeline is on screen — and holds
   * no view state of its own beyond that.
   *
   * Which focus is open lives in the URL rather than here, so a focused
   * timeline is linkable and Back is the way out of one. `pushState` does not
   * fire `popstate`, so navigations we initiate update `focusId` directly and
   * the listener catches only the ones the reader initiates.
   */
  import Timeline from './components/Timeline.svelte';
  import { loadEntries, loadFocus, loadFocusIndex } from './lib/data.ts';
  import { focusView } from './lib/focus.ts';
  import { NOWHERE, onLocationChange, readLocation, writeLocation } from './lib/hash.ts';
  import { presentDecimalYear } from './lib/time.ts';

  /** Resolved once per load and injected, so "present" is consistent. */
  const present = presentDecimalYear();

  /**
   * One await for both: the index is small, and resolving them together keeps
   * the menu button from appearing a beat after the timeline. `loadFocusIndex`
   * never rejects, so a missing index cannot take the timeline down with it.
   */
  const bootstrap = Promise.all([loadEntries(), loadFocusIndex()]);

  let focusId = $state<string | null>(readLocation().focus);

  $effect(() => onLocationChange((next) => (focusId = next.focus)));

  /**
   * Re-requested when `focusId` changes; `loadFocus` caches, so returning to a
   * focus already read costs nothing.
   */
  const focusRequest = $derived(focusId === null ? null : loadFocus(focusId));

  function openFocus(id: string): void {
    writeLocation({ focus: id, entry: null }, false);
    focusId = id;
  }

  function exitFocus(): void {
    writeLocation(NOWHERE, false);
    focusId = null;
  }
</script>

{#await bootstrap}
  <p class="status">Loading timeline…</p>
{:then [entries, focuses]}
  {#if focusRequest}
    {#await focusRequest}
      <p class="status">Loading timeline…</p>
    {:then { focus, entries: own }}
      <!--
        Keyed on the focus id so switching timelines builds a new component
        rather than reusing one. Zoom transform, restored-view latch and filter
        state all live in that instance, and every one of them means something
        different over a different domain.
      -->
      {#key focus.id}
        {@const view = focusView(focus, entries, own, present)}
        <Timeline
          entries={view.entries}
          focus={view}
          {focuses}
          onopenfocus={openFocus}
          onexit={exitFocus}
        />
      {/key}
    {:catch error}
      <p class="status error">
        Could not load that timeline: {error.message}
        <button onclick={exitFocus}>Back to all of history</button>
      </p>
    {/await}
  {:else}
    <Timeline {entries} {focuses} onopenfocus={openFocus} />
  {/if}
{:catch error}
  <p class="status error">Could not load the timeline: {error.message}</p>
{/await}

<style>
  .status {
    display: grid;
    place-content: center;
    gap: 1rem;
    height: 100dvh;
    margin: 0;
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .error {
    color: var(--text-primary);
  }

  button {
    justify-self: center;
    min-height: 44px;
    padding: 0 1rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: var(--surface-2);
    color: var(--text-primary);
    font: inherit;
    cursor: pointer;
  }
</style>

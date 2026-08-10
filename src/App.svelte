<script lang="ts">
  import { loadEntries } from './lib/data.ts';
  import Timeline from './components/Timeline.svelte';

  const entries = loadEntries();
</script>

{#await entries}
  <p class="status">Loading timeline…</p>
{:then loaded}
  <Timeline entries={loaded} />
{:catch error}
  <p class="status error">Could not load the timeline: {error.message}</p>
{/await}

<style>
  .status {
    display: grid;
    place-content: center;
    height: 100dvh;
    margin: 0;
    padding: 1rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .error {
    color: var(--text-primary);
  }
</style>

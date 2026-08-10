<script lang="ts">
  import { familyColour, legendEntries } from '../lib/palette.ts';
  import Glyph from './Glyph.svelte';

  const items = legendEntries();
</script>

<!--
  The legend is always present, never optional. With four hues carrying seven
  types, the glyph is what actually distinguishes a battle from a war and a
  ruler from a person, so the key has to show both channels together.
-->
<ul class="legend" aria-label="Key">
  {#each items as item (item.family)}
    <li style="--colour: {familyColour(item.type)}">
      <Glyph type={item.type} size={11} />
      <span>{item.title}</span>
    </li>
  {/each}
</ul>

<style>
  .legend {
    position: absolute;
    left: max(0.5rem, env(safe-area-inset-left));
    bottom: max(0.5rem, env(safe-area-inset-bottom));
    right: 3rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.625rem;
    margin: 0;
    padding: 0.375rem 0.5rem;
    list-style: none;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--surface-1) 90%, transparent);
    backdrop-filter: blur(6px);
    z-index: 2;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--colour);
    font-size: 0.625rem;
    white-space: nowrap;
  }

  li span {
    /* Text wears text tokens; the coloured glyph beside it carries identity. */
    color: var(--text-secondary);
  }
</style>

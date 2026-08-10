<script lang="ts">
  import { TYPE_GLYPH, type EntryType } from '../lib/types.ts';

  interface Props {
    type: EntryType;
    size?: number;
  }

  let { type, size = 14 }: Props = $props();

  const glyph = $derived(TYPE_GLYPH[type]);
</script>

<!--
  The glyph is a required encoding channel, not decoration. The validated
  palette carries a colourblind-separation warning between the conflict and age
  hues in dark mode, which is only permissible alongside a secondary channel.
  Never render a marker with colour alone.
-->
<svg
  class="glyph"
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="currentColor"
  aria-hidden="true"
  focusable="false"
>
  {#if glyph === 'dot'}
    <circle cx="8" cy="8" r="4.5" />
  {:else if glyph === 'diamond'}
    <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" />
  {:else if glyph === 'crown'}
    <path d="M2 13V4.2l3.3 3.2L8 2.4l2.7 5 3.3-3.2V13Z" />
  {:else if glyph === 'swords'}
    <path
      d="M3 3l10 10M13 3L3 13"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      fill="none"
    />
  {:else if glyph === 'banner'}
    <path d="M3.5 2h9v11.5L8 10.2 3.5 13.5Z" />
  {:else}
    <rect x="5.5" y="1.5" width="5" height="13" rx="2.5" />
  {/if}
</svg>

<style>
  .glyph {
    flex: 0 0 auto;
    display: block;
  }
</style>

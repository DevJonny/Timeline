<script lang="ts">
  import { untrack } from 'svelte';

  import { formatHistoricalYear } from '../lib/time.ts';
  import type { DefaultView, MotionChoice, Preferences, ThemeChoice } from '../lib/prefs.ts';

  interface Props {
    open: boolean;
    prefs: Preferences;
    /** The range currently on screen, offered as "use current view". */
    currentView: DefaultView;
    storageAvailable: boolean;
    onchange: (prefs: Preferences) => void;
    onclose: () => void;
  }

  let { open, prefs, currentView, storageAvailable, onchange, onclose }: Props = $props();

  /**
   * Typed as the binding actually behaves: `bind:value` on `<input
   * type="number">` assigns a number, or null once the field is empty or
   * mid-way through something the browser cannot parse (a lone "-"). Holding
   * these as strings and calling string methods on them threw inside the
   * derived below, which took `saveView` down with it and silently lost every
   * typed default view.
   */
  let startInput = $state<number | null>(null);
  let endInput = $state<number | null>(null);

  /**
   * Seed the inputs when the sheet opens — and only then. Reading
   * `prefs.defaultView` tracked would re-seed on every preference change,
   * which makes a two-field range impossible to enter: committing "From"
   * saves a null view (the range is still incomplete), and that null comes
   * straight back through here and erases what was just typed.
   */
  $effect(() => {
    if (!open) return;
    const view = untrack(() => prefs.defaultView);
    startInput = view?.startYear ?? null;
    endInput = view?.endYear ?? null;
  });

  const parsedView = $derived.by((): DefaultView | null => {
    if (startInput === null || endInput === null) return null;
    if (!Number.isFinite(startInput) || !Number.isFinite(endInput)) return null;
    if (endInput <= startInput) return null;
    return { startYear: startInput, endYear: endInput };
  });

  const inputsInvalid = $derived(
    startInput !== null && endInput !== null && parsedView === null,
  );

  function saveView(): void {
    onchange({ ...prefs, defaultView: parsedView });
  }

  function useCurrent(): void {
    startInput = Math.round(currentView.startYear);
    endInput = Math.round(currentView.endYear);
    onchange({ ...prefs, defaultView: { startYear: startInput, endYear: endInput } });
  }

  function clearView(): void {
    startInput = null;
    endInput = null;
    onchange({ ...prefs, defaultView: null });
  }

  function setTheme(theme: ThemeChoice): void {
    onchange({ ...prefs, theme });
  }

  function setMotion(motion: MotionChoice): void {
    onchange({ ...prefs, motion });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      onclose();
    }
  }

  const themes: ThemeChoice[] = ['system', 'light', 'dark'];
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <section class="panel" aria-label="Settings">
    <header>
      <h2>Settings</h2>
      <button class="icon" onclick={onclose} aria-label="Close settings">×</button>
    </header>

    <div class="body">
      <fieldset>
        <legend>Default view</legend>
        <p class="hint">
          Where the timeline opens. Leave empty to start fully zoomed out. Negative years are
          BCE.
        </p>

        <div class="years">
          <label>
            <span>From</span>
            <input
              type="number"
              inputmode="numeric"
              bind:value={startInput}
              onchange={saveView}
              placeholder="-3300"
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="number"
              inputmode="numeric"
              bind:value={endInput}
              onchange={saveView}
              placeholder="2026"
            />
          </label>
        </div>

        {#if inputsInvalid}
          <p class="warn" role="alert">The end year must be after the start year.</p>
        {:else if prefs.defaultView}
          <p class="hint">
            Opens at {formatHistoricalYear(prefs.defaultView.startYear)} – {formatHistoricalYear(
              prefs.defaultView.endYear,
            )}
          </p>
        {/if}

        <div class="row">
          <button class="link" onclick={useCurrent}>Use current view</button>
          {#if prefs.defaultView}
            <button class="link" onclick={clearView}>Reset</button>
          {/if}
        </div>
      </fieldset>

      <fieldset>
        <legend>Theme</legend>
        <div class="chips">
          {#each themes as theme (theme)}
            <button
              class="chip"
              class:on={prefs.theme === theme}
              onclick={() => setTheme(theme)}
              aria-pressed={prefs.theme === theme}
            >
              {theme}
            </button>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend>Motion</legend>
        <div class="chips">
          <button
            class="chip"
            class:on={prefs.motion === 'system'}
            onclick={() => setMotion('system')}
            aria-pressed={prefs.motion === 'system'}
          >
            follow system
          </button>
          <button
            class="chip"
            class:on={prefs.motion === 'reduced'}
            onclick={() => setMotion('reduced')}
            aria-pressed={prefs.motion === 'reduced'}
          >
            reduce
          </button>
        </div>
      </fieldset>

      {#if !storageAvailable}
        <!--
          Safari in private mode throws on setItem. Saying so is better than
          letting settings silently reset on every visit.
        -->
        <p class="warn" role="status">
          Settings can't be saved on this device — private browsing or blocked storage. They
          will apply until you close the tab.
        </p>
      {/if}
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

  fieldset {
    margin: 0 0 1rem;
    padding: 0;
    border: none;
  }

  legend {
    padding: 0;
    margin-bottom: 0.375rem;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .hint {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .warn {
    margin: 0.375rem 0 0.5rem;
    font-size: 0.75rem;
    line-height: 1.4;
    color: var(--text-primary);
  }

  .years {
    display: flex;
    gap: 0.5rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
    flex: 1;
    font-size: 0.6875rem;
    color: var(--text-muted);
  }

  input {
    min-height: 44px;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--surface-2);
    color: var(--text-primary);
    font: inherit;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .row {
    display: flex;
    gap: 1rem;
    margin-top: 0.5rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3125rem;
  }

  .chip {
    min-height: 36px;
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--text-secondary);
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .chip.on {
    border-color: currentColor;
    color: var(--text-primary);
    background: color-mix(in srgb, var(--text-primary) 10%, transparent);
    font-weight: 600;
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

  .chip:focus-visible,
  .link:focus-visible,
  .icon:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: -2px;
  }

  @media (min-width: 768px) {
    .panel {
      inset: auto auto 1rem 1rem;
      width: 22rem;
      border-radius: 0.75rem;
    }
  }
</style>

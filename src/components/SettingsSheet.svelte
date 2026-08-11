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

  const bothEmpty = $derived(startInput === null && endInput === null);
  const halfFilled = $derived(!bothEmpty && (startInput === null || endInput === null));

  const inputsInvalid = $derived(
    startInput !== null && endInput !== null && parsedView === null,
  );

  /**
   * A year range is one value spread over two fields, so it is saved
   * explicitly rather than on each field's change event. Committing per field
   * means committing a half-written range: the first field alone cannot form
   * a view, so it would persist "no default view" and wipe whatever was
   * already saved. Nothing here reaches storage until the whole range is
   * valid and the reader asks for it.
   */
  const canSave = $derived.by((): boolean => {
    if (halfFilled || inputsInvalid) return false;
    const saved = prefs.defaultView;
    // Both fields empty is a real edit — it means "clear the saved view".
    if (parsedView === null) return saved !== null;
    return (
      saved === null ||
      saved.startYear !== parsedView.startYear ||
      saved.endYear !== parsedView.endYear
    );
  });

  function save(): void {
    if (!canSave) return;
    onchange({ ...prefs, defaultView: parsedView });
  }

  /** Fills the fields only. `save` remains the one path to storage. */
  function useCurrent(): void {
    startInput = Math.round(currentView.startYear);
    endInput = Math.round(currentView.endYear);
  }

  function clearView(): void {
    startInput = null;
    endInput = null;
  }

  function handleInputKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    // Enter is the expected commit in a form; without it the only way to save
    // on a phone keyboard is to dismiss it and hunt for the button.
    event.preventDefault();
    save();
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
              onkeydown={handleInputKeydown}
              placeholder="-3300"
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="number"
              inputmode="numeric"
              bind:value={endInput}
              onkeydown={handleInputKeydown}
              placeholder="2026"
            />
          </label>
        </div>

        {#if inputsInvalid}
          <p class="warn" role="alert">The end year must be after the start year.</p>
        {:else if halfFilled}
          <p class="warn" role="alert">Enter both years.</p>
        {:else if prefs.defaultView}
          <p class="hint">
            Opens at {formatHistoricalYear(prefs.defaultView.startYear)} – {formatHistoricalYear(
              prefs.defaultView.endYear,
            )}
          </p>
        {:else}
          <p class="hint">No saved view — opens fully zoomed out.</p>
        {/if}

        <div class="row">
          <button class="save" onclick={save} disabled={!canSave}>Save</button>
          <button class="link" onclick={useCurrent}>Use current view</button>
          {#if !bothEmpty}
            <button class="link" onclick={clearView}>Clear</button>
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
    flex-wrap: wrap;
    align-items: center;
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

  /*
   * The default view is the one setting that is committed rather than applied
   * live, so it gets the only filled button in the sheet. Disabled until the
   * range is both complete and different from what is saved, which doubles as
   * the "unsaved changes" signal.
   */
  .save {
    min-height: 36px;
    padding: 0.25rem 1rem;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--text-primary);
    color: var(--surface-1);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .save:disabled {
    border-color: var(--border);
    background: none;
    color: var(--text-muted);
    cursor: default;
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
  .save:focus-visible,
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

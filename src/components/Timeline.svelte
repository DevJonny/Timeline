<script lang="ts">
  import { zoomIdentity, type ZoomTransform } from 'd3-zoom';

  import {
    createBaseScale,
    extentOf,
    transformForDomain,
    transformForDomainPadded,
    visibleDomain,
    yearsPerPixel,
  } from '../lib/scale.ts';
  import { chooseTickScale, generateTicks } from '../lib/ticks.ts';
  import { cullToViewport, labelExtent, packLanes, spanExtent } from '../lib/layout.ts';
  import { clusterOverflow, importanceGate, relaxationFor } from '../lib/lod.ts';
  import {
    activeHidden,
    applyFilters,
    applyHidden,
    collectKeywords,
    isFilterActive,
    type Filters,
  } from '../lib/filter.ts';
  import {
    formatAxisYear,
    presentDecimalYear,
    resolveEnd,
    toDecimalYear,
    toHistoricalYear,
  } from '../lib/time.ts';
  import { prefetchDetail } from '../lib/data.ts';
  import { onSelectionChange, readSelection, writeSelection } from '../lib/hash.ts';
  import {
    DEFAULT_PREFERENCES,
    debounce,
    loadPreferences,
    savePreferences,
    type Preferences,
  } from '../lib/prefs.ts';
  import { applyMotion, applyTheme } from '../lib/theme.ts';
  import { zoomable, type ZoomController } from '../lib/zoom.ts';
  import type { Entry } from '../lib/types.ts';
  import Axis from './Axis.svelte';
  import ClusterMarker from './ClusterMarker.svelte';
  import DetailSheet from './DetailSheet.svelte';
  import EntryMarker from './EntryMarker.svelte';
  import EraRail from './EraRail.svelte';
  import Legend from './Legend.svelte';
  import SearchPanel from './SearchPanel.svelte';
  import SettingsSheet from './SettingsSheet.svelte';
  import SpanBand from './SpanBand.svelte';

  interface Props {
    entries: Entry[];
  }

  let { entries }: Props = $props();

  /** Resolved once per load and injected, so "present" is consistent and testable. */
  const present = presentDecimalYear();

  const LABEL_HEIGHT = 42;
  const MIN_BAND_HEIGHT = 44; // touch target
  const BAND_PITCH = 11;
  const RAIL_WIDTH = 44;

  interface Resolved {
    entry: Entry;
    t0: number;
    /** null for an instantaneous entry. */
    t1: number | null;
  }

  let prefs = $state<Preferences>(DEFAULT_PREFERENCES);
  let storageAvailable = $state(true);
  let searchOpen = $state(false);
  let settingsOpen = $state(false);

  /**
   * Derived from `prefs`, never held separately. A second copy has to be
   * written back on every filter change, and the one write that forgets
   * leaves `prefs.filters` stale — after which the next settings change
   * spreads that stale copy over what was saved.
   */
  const filters = $derived(prefs.filters);

  const persist = debounce((next: Preferences) => {
    storageAvailable = savePreferences(next);
  });

  /** The single write path: every preference change goes through here. */
  function updatePrefs(next: Preferences): void {
    prefs = next;
    applyTheme(next.theme);
    applyMotion(next.motion);
    persist(next);
  }

  /**
   * Tags the reader hid, minus any they are currently asking for. Hiding is a
   * default, not a ban — see `activeHidden`.
   */
  const hidden = $derived(activeHidden(prefs.hiddenKeywords, filters));

  /**
   * The dataset as the reader has chosen to keep it. Everything downstream
   * measures against this rather than `entries`, so a hidden tag is absent
   * rather than perpetually "filtered out" — including the level-of-detail
   * gate, which would otherwise sit permanently relaxed against a dataset the
   * reader never sees.
   */
  const available = $derived(applyHidden(entries, hidden));
  const hiddenByPrefs = $derived(entries.length - available.length);

  /**
   * Every tag with its full count, from *all* entries — the settings list is
   * the only way back from a hidden tag, so it cannot be built from what is
   * currently visible the way the search panel's chips are. A tag hidden to
   * zero results would vanish from the very list that un-hides it.
   */
  const allKeywords = $derived(collectKeywords(entries));

  /** Excluded entries are removed outright rather than dimmed. */
  const filtered = $derived(applyFilters(available, filters));
  const filterActive = $derived(isFilterActive(filters));
  const hiddenByFilter = $derived(available.length - filtered.length);

  function resolve(entry: Entry): Resolved {
    return {
      entry,
      t0: toDecimalYear(entry.start),
      t1: entry.end === undefined ? null : resolveEnd(entry.end, present),
    };
  }

  /** Every entry, regardless of filters. */
  const allResolved: Resolved[] = $derived(entries.map(resolve));

  const resolved: Resolved[] = $derived(
    filtered
      .map(resolve)
      // Priority order for lane assignment: important first, then longer spans
      // (they carry more context), then chronological.
      .sort((a, b) => {
        if (a.entry.importance !== b.entry.importance) {
          return a.entry.importance - b.entry.importance;
        }
        const aLen = (a.t1 ?? a.t0) - a.t0;
        const bLen = (b.t1 ?? b.t0) - b.t0;
        if (aLen !== bLen) return bLen - aLen;
        return a.t0 - b.t0;
      }),
  );

  /**
   * Derived from *all* entries, never the filtered set. If the domain shrank
   * to fit the current filter the axis would rescale underneath the reader
   * every time they toggled a chip, and the zoom transform would mean
   * something different from one moment to the next.
   */
  const domain: [number, number] = $derived.by(() => {
    let min = Infinity;
    let max = present;
    for (const item of allResolved) {
      min = Math.min(min, item.t0);
      max = Math.max(max, item.t1 ?? item.t0);
    }
    return [Number.isFinite(min) ? min : -3_299_999, max];
  });

  let width = $state(0);
  let height = $state(0);
  let transform = $state<ZoomTransform>(zoomIdentity);
  let selectedId = $state<string | null>(null);

  /**
   * Reactive so effects that need it re-run once the zoom action is ready.
   * As a plain variable, the initial-view effect would run before mount
   * completed, find it undefined, and never fire again — silently ignoring a
   * saved default view.
   */
  let controller = $state<ZoomController | undefined>(undefined);

  /**
   * Visible range tracked outside the reactive graph, updated only on user
   * zoom. On resize we restore *this* rather than the pixel offset, so
   * rotating a phone does not teleport the view.
   */
  let userDomain: [number, number] | null = null;
  let lastHeight = 0;

  const safeHeight = $derived(Math.max(height, 1));
  const base = $derived(createBaseScale(domain, safeHeight));
  const view = $derived(transform.rescaleY(base));
  const visible = $derived(visibleDomain(base, transform, safeHeight));
  const ypp = $derived(yearsPerPixel(base, transform, safeHeight));
  const compact = $derived(width > 0 && width < 640);

  const tickScale = $derived(chooseTickScale(ypp, compact ? 44 : 56));
  const ticks = $derived(generateTicks(visible, tickScale, compact));

  /**
   * Precision hint for the visible-range readout. Without it, deep time
   * collapses to "1.7 Mya – 1.7 Mya" because a single decimal place spans
   * 100,000 years.
   */
  const readoutStep = $derived(Math.max((visible[1] - visible[0]) / 8, 1e-6));

  const maxBarLanes = $derived(compact ? 3 : 5);
  const maxLabelLanes = $derived(width >= 1024 ? 3 : width >= 640 ? 2 : 1);
  const gutterPx = $derived(compact ? 72 : 96);

  // --- spans: coloured bars in the spine -------------------------------------

  interface Bar {
    item: Resolved;
    py0: number;
    py1: number;
  }

  const bars: Bar[] = $derived(
    resolved
      .filter((item) => item.t1 !== null)
      .map((item) => ({ item, py0: view(item.t0), py1: view(item.t1!) })),
  );

  const barPacking = $derived(
    packLanes(
      cullToViewport(bars, (b) => spanExtent(b.py0, b.py1, MIN_BAND_HEIGHT), safeHeight),
      (b) => spanExtent(b.py0, b.py1, MIN_BAND_HEIGHT),
      maxBarLanes,
      3,
    ),
  );

  const spinePx = $derived(Math.max(barPacking.lanes, 1) * BAND_PITCH + 6);
  const labelAreaPx = $derived(Math.max(140, width - gutterPx - spinePx - RAIL_WIDTH));
  const labelLaneWidth = $derived(labelAreaPx / maxLabelLanes);

  // --- labels: every entry competes for the same columns ---------------------

  interface Label {
    item: Resolved;
    /** Top of the label box. */
    top: number;
    /** True when a long span's label was held in view rather than left off-screen. */
    pinned: boolean;
  }

  /**
   * The zoom earns a level of detail; anything less important is not a
   * candidate for a label at all. Without this, full zoom-out tries to draw
   * every entry in the last five thousand years inside a single pixel.
   */
  /**
   * With a filter active there is less competing for space, so the gate opens
   * further: filtering should drill *in* and reveal more of what survived,
   * not merely thin the page out.
   */
  const gate = $derived(
    importanceGate(transform.k, relaxationFor(filtered.length, available.length)),
  );

  /**
   * Spans that drew a band in the spine.
   *
   * Bars carry no importance gate, so without this a span could render as a
   * coloured band with no label attached to it at any zoom between the band
   * appearing and the gate reaching its importance — for the Akkadian Empire
   * that was every view from roughly a thousand years wide down to seventeen.
   * An anonymous bar is worse than no bar: the reader can see something is
   * there and has no way to find out what.
   *
   * Anything banded therefore competes for a label whatever the gate says. It
   * only competes — lane packing still decides, and what will not fit becomes
   * a "+N" cluster, which is at least a labelled thing that says what it hides.
   */
  const bandedIds = $derived(
    new Set(barPacking.placed.map((placement) => placement.item.item.entry.id)),
  );

  const labels: Label[] = $derived(
    resolved
      .filter((item) => item.entry.importance <= gate || bandedIds.has(item.entry.id))
      .map((item) => {
        const py0 = view(item.t0);
        if (item.t1 === null) {
          return { item, top: py0 - LABEL_HEIGHT / 2, pinned: false };
        }
        const py1 = view(item.t1);
        // Hold a long span's label just inside the viewport so the Palaeolithic
        // stays identified while you are in the middle of it, but never push it
        // past the span's own end.
        const top = Math.min(Math.max(py0, 0), Math.max(py1 - LABEL_HEIGHT, py0));
        return { item, top, pinned: top > py0 + 0.5 };
      }),
  );

  const labelBox = (l: Label) => labelExtent(l.top + LABEL_HEIGHT / 2, LABEL_HEIGHT);

  const labelPacking = $derived(
    packLanes(cullToViewport(labels, labelBox, safeHeight, 60), labelBox, maxLabelLanes, 4),
  );

  /**
   * Whatever survived the gate but still would not fit becomes a "+N" marker,
   * so a crowded stretch advertises that there is more here rather than
   * silently dropping entries.
   */
  const clusters = $derived(
    clusterOverflow(
      labelPacking.overflow,
      labelBox,
      (l) => ({ t0: l.item.t0, t1: l.item.t1 ?? l.item.t0 }),
      LABEL_HEIGHT,
    ),
  );

  const hiddenCount = $derived(labelPacking.overflow.length);

  function expandCluster(t0: number, t1: number): void {
    controller?.zoomTo(transformForDomainPadded(base, t0, t1));
  }

  // --- era rail --------------------------------------------------------------

  /**
   * Built from *all* ages, never the filtered set — the same rule the axis
   * domain follows, and for the same reason. Ages carry the keywords of an
   * age, so almost any subject filter excludes every one of them and the rail
   * used to vanish outright the moment a reader typed into search.
   *
   * Occupancy is what responds to the filter instead. An age counts as empty
   * when nothing surviving the filter overlaps its span; because a matching
   * age is itself in `resolved`, filtering to ages leaves the whole rail live
   * rather than dimming all of it.
   */
  const railAges = $derived.by(() => {
    const spans = allResolved
      .filter((item) => item.entry.type === 'age' && item.t1 !== null)
      .slice()
      .sort((a, b) => a.t0 - b.t0);

    return spans.map((item) => ({
      entry: item.entry,
      t0: item.t0,
      t1: item.t1!,
      empty: !resolved.some((other) => other.t0 <= item.t1! && item.t0 <= (other.t1 ?? other.t0)),
    }));
  });

  const todayY = $derived(view(present));
  const todayVisible = $derived(todayY >= 0 && todayY <= height);

  function handleTransform(next: ZoomTransform): void {
    transform = next;
    if (height > 0) {
      userDomain = visibleDomain(createBaseScale(domain, height), next, height);
    }
  }

  function jumpTo(t0: number, t1: number): void {
    controller?.zoomTo(transformForDomainPadded(base, t0, t1));
  }

  /**
   * Nothing is selected on load and the sheet stays closed — the timeline
   * reads as a clean axis until the user picks something. Selection is
   * mirrored into the URL so a detail view is linkable and Back dismisses it.
   */
  function select(id: string | null): void {
    // Clicking the open entry's own marker closes it.
    const next = id !== null && selectedId === id ? null : id;
    const opening = selectedId === null && next !== null;
    selectedId = next;
    writeSelection(next, !opening);
    if (next) prefetchDetail(next);
  }

  /**
   * URL-driven selection, deliberately *not* routed through `select`.
   *
   * `select` toggles, which is right for a marker — tapping the open entry
   * again closes it — and wrong for a URL, where `#/e/x` means "show x"
   * whatever is already open. Sharing one path meant any hash change between
   * two entries evaluated the toggle and closed the sheet instead of
   * switching, and it must not write the hash back either: it is reacting to
   * the hash, and re-writing it here would stack history against the reader.
   */
  function selectFromUrl(id: string | null): void {
    selectedId = id;
    if (id) prefetchDetail(id);
  }

  /**
   * Looked up across all entries, not just the filtered set: a deep link or a
   * filter change should not silently close an open detail sheet.
   */
  const selected: Resolved | null = $derived(
    allResolved.find((item) => item.entry.id === selectedId) ?? null,
  );

  /** Chronological, for the results list — not the lane-packing priority order. */
  const searchResults = $derived(
    [...filtered].sort((a, b) => toDecimalYear(a.start) - toDecimalYear(b.start)),
  );

  function fitResults(): void {
    const extent = extentOf(resolved);
    if (!extent) return;
    controller?.zoomTo(transformForDomainPadded(base, extent[0], extent[1]));
  }

  function zoomToSelected(): void {
    if (!selected || selected.t1 === null) return;
    controller?.zoomTo(transformForDomainPadded(base, selected.t0, selected.t1));
  }

  /**
   * Read once during initialisation rather than inside an effect.
   *
   * The initial-view effect needs to know whether the page was deep-linked,
   * and it must not depend on another effect having already run: effects fire
   * in creation order but only after mount, so the view effect could latch
   * "applied" while the selection was still null and then never re-run.
   */
  const initialSelectionId = readSelection();

  /**
   * Registers once. `selectFromUrl` assigns `selectedId` without reading it,
   * which is what keeps that true — the previous version called `select`,
   * whose toggle *reads* `selectedId`, so the effect took a dependency on the
   * state it writes and re-ran on every selection. That tore down and
   * re-registered the listener each time, and re-applied the deep-linked id
   * on top of whatever the reader had just chosen.
   */
  $effect(() => {
    if (initialSelectionId && entries.some((e) => e.id === initialSelectionId)) {
      selectFromUrl(initialSelectionId);
    }
    return onSelectionChange(selectFromUrl);
  });

  /**
   * Load stored preferences once, before the first view is chosen.
   * Filters ride along in `prefs`, so a filtered session survives a reload.
   */
  $effect(() => {
    const stored = loadPreferences();
    prefs = stored;
    applyTheme(stored.theme);
    applyMotion(stored.motion);
  });

  /**
   * Filter changes persist on the user action that causes them, not from an
   * effect watching `filters`.
   *
   * An effect cannot tell "the user changed this" from "we just restored it":
   * Svelte wraps $state objects in proxies, so the obvious reference check
   * against `prefs.filters` never matches and the effect fires on mount,
   * writing defaults over whatever was saved. Persisting at the call site has
   * no such ambiguity.
   */
  function updateFilters(next: Filters): void {
    updatePrefs({ ...prefs, filters: next });
  }

  /**
   * Initial view, applied once the viewport has a height.
   *
   * Precedence is deliberate: a deep-linked ranged entry wins, because
   * someone following a shared link wants to land on that thing; then the
   * user's saved default range; then the full span. Transient scroll position
   * is never restored — the default is the whole timeline unless configured.
   */
  let initialViewApplied = false;

  $effect(() => {
    if (initialViewApplied || height <= 0 || !controller) return;
    initialViewApplied = true;

    const linked = initialSelectionId
      ? allResolved.find((item) => item.entry.id === initialSelectionId)
      : undefined;

    if (linked) {
      // Instants included: someone following a link to the Battle of Hastings
      // wants to land on 1066, not on the full 3.3-million-year span where it
      // is invisible. transformForDomainPadded gives a zero-length range a
      // sensible window rather than infinite zoom.
      controller.zoomTo(transformForDomainPadded(base, linked.t0, linked.t1 ?? linked.t0), false);
      return;
    }

    const view = prefs.defaultView;
    if (!view) return;

    controller.zoomTo(
      transformForDomain(
        base,
        toDecimalYear({ year: view.startYear }),
        toDecimalYear({ year: view.endYear }),
      ),
      false,
    );
  });

  // Preserve the visible year range across viewport height changes.
  $effect(() => {
    const h = height;
    if (h <= 0) return;

    if (lastHeight === 0) {
      lastHeight = h;
      return;
    }
    if (h === lastHeight) return;

    const previous = userDomain;
    lastHeight = h;
    if (!previous || !controller) return;

    const rebased = createBaseScale(domain, h);
    controller.zoomTo(transformForDomain(rebased, previous[0], previous[1]), false);
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (!controller) return;
    const t = controller.current();

    switch (event.key) {
      case '+':
      case '=':
        controller.zoomTo(t.scale(2));
        break;
      case '-':
      case '_':
        controller.zoomTo(t.scale(0.5));
        break;
      case 'ArrowDown':
        controller.zoomTo(t.translate(0, -height / 8));
        break;
      case 'ArrowUp':
        controller.zoomTo(t.translate(0, height / 8));
        break;
      case 'Home':
        controller.reset();
        break;
      case 'Escape':
        select(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  }
</script>

<div
  class="frame"
  bind:clientWidth={width}
  bind:clientHeight={height}
  style="--gutter: {gutterPx}px; --spine: {spinePx}px; --band-pitch: {BAND_PITCH}px; --band-width: 8px; --label-lane-width: {labelLaneWidth}px"
>
  {#if height > 0}
    <!--
      The controls come first in the DOM even though they are positioned over
      the timeline. Keyboard users would otherwise have to tab through every
      marker on screen before reaching search — and the search list is the
      accessible route to the content, so it must be reachable immediately.
    -->
    <button
      class="search-toggle"
      class:active={filterActive}
      onclick={() => (searchOpen = true)}
      aria-label="Search and filter entries"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.8" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      {#if filterActive}
        <span class="badge">{filtered.length}</span>
      {/if}
    </button>

    <button class="settings-toggle" onclick={() => (settingsOpen = true)} aria-label="Settings">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="2.4" stroke="currentColor" stroke-width="1.7" />
        <path
          d="M8 1.4v1.7M8 12.9v1.7M14.6 8h-1.7M3.1 8H1.4M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2M12.7 12.7l-1.2-1.2M4.5 4.5 3.3 3.3"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <!--
      role="application" because arrow keys and +/- are captured for
      navigation rather than page scrolling; the role tells assistive tech to
      pass those keys through instead of intercepting them. The list in the
      search panel is the accessible equivalent for screen-reader users, so
      nothing is only reachable through this element.

      The two rules below fire because svelte-check classifies `application`
      as non-interactive. Focusability and key handling are exactly the point
      of this element, so they are suppressed deliberately rather than worked
      around by weakening the semantics.
    -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="viewport"
      role="application"
      tabindex="0"
      aria-label="Timeline. Pinch or scroll to zoom, drag to pan. Plus and minus zoom, arrows pan, Home fits everything."
      onkeydown={handleKeydown}
      use:zoomable={{
        width,
        height,
        onTransform: handleTransform,
        onReady: (c) => (controller = c),
      }}
    >
      <Axis {ticks} y={view} />

      <div class="spine">
        {#each barPacking.placed as placement (placement.item.item.entry.id)}
          <SpanBand
            entry={placement.item.item.entry}
            lane={placement.lane}
            y0={placement.item.py0}
            y1={placement.item.py1}
            selected={selectedId === placement.item.item.entry.id}
            onselect={(id) => select(id)}
          />
        {/each}
      </div>

      <div class="labels">
        {#each labelPacking.placed as placement (placement.item.item.entry.id)}
          <EntryMarker
            entry={placement.item.item.entry}
            lane={placement.lane}
            y={placement.item.top}
            pinned={placement.item.pinned}
            selected={selectedId === placement.item.item.entry.id}
            {compact}
            onselect={(id) => select(id)}
            onprefetch={prefetchDetail}
          />
        {/each}

        {#each clusters as cluster (cluster.items[0]!.item.entry.id)}
          <ClusterMarker
            entries={cluster.items.map((l) => l.item.entry)}
            lane={maxLabelLanes - 1}
            y={cluster.y - 16}
            onexpand={() => expandCluster(cluster.t0, cluster.t1)}
          />
        {/each}
      </div>

      {#if todayVisible}
        <div class="today" style="--y: {todayY}px">
          <span class="today-label">Today</span>
        </div>
      {/if}
    </div>

    <EraRail ages={railAges} {visible} dimEmpty={prefs.dimEmptyAges} onjump={jumpTo} />
    <Legend />

    <SearchPanel
      open={searchOpen}
      {filters}
      results={searchResults}
      total={entries.length}
      {selectedId}
      onchange={updateFilters}
      onselect={(id) => {
        select(id);
        if (compact) searchOpen = false;
      }}
      onfit={fitResults}
      onclose={() => (searchOpen = false)}
    />

    <SettingsSheet
      open={settingsOpen}
      {prefs}
      currentView={{
        startYear: toHistoricalYear(Math.floor(visible[0])),
        endYear: toHistoricalYear(Math.floor(visible[1])),
      }}
      {storageAvailable}
      {allKeywords}
      onchange={updatePrefs}
      onclose={() => (settingsOpen = false)}
    />

    {#if selected}
      <DetailSheet
        entry={selected.entry}
        onzoom={selected.t1 === null ? null : zoomToSelected}
        onclose={() => select(null)}
      />
    {/if}

    <div class="readout">
      {formatAxisYear(visible[0], false, readoutStep)} – {formatAxisYear(
        visible[1],
        false,
        readoutStep,
      )}
      {#if filterActive}
        <span class="hidden-count">· {hiddenByFilter} filtered out</span>
      {:else if hiddenCount > 0}
        <span class="hidden-count">· {hiddenCount} clustered</span>
      {/if}
      <!--
        Reported separately from the filter count and whenever it is non-zero.
        A hidden tag is a standing choice the reader made once and will not be
        holding in mind later; without this the timeline just looks short of
        content it actually has.
      -->
      {#if hiddenByPrefs > 0}
        <span class="hidden-count">· {hiddenByPrefs} hidden by settings</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    height: 100dvh;
    overflow: hidden;
    background: var(--surface-1);
  }

  .viewport {
    position: absolute;
    inset: 0;
    /*
      Essential, not cosmetic: without this the browser claims the gesture for
      page scrolling and pinch-zoom before d3-zoom ever sees a pointer event.
      Scoped to this element so the rest of the page still scrolls normally.
    */
    touch-action: none;
    cursor: grab;
    outline-offset: -2px;
  }

  .viewport:active {
    cursor: grabbing;
  }

  .spine {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--gutter);
    width: var(--spine);
  }

  .labels {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--gutter) + var(--spine));
    right: 0;
  }

  .today {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    translate: 0 var(--y);
    height: 0;
    border-top: 2px solid var(--text-primary);
    pointer-events: none;
    z-index: 1;
  }

  .today-label {
    position: absolute;
    left: max(0.5rem, env(safe-area-inset-left));
    top: 0.25rem;
    font-size: 0.625rem;
    font-weight: 700;
    color: var(--surface-1);
    background: var(--text-primary);
    padding: 0.0625rem 0.3125rem;
    border-radius: 0.25rem;
  }

  .readout {
    position: absolute;
    top: max(0.5rem, env(safe-area-inset-top));
    left: max(0.5rem, env(safe-area-inset-left));
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--surface-1) 88%, transparent);
    backdrop-filter: blur(6px);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    pointer-events: none;
    z-index: 2;
  }

  .hidden-count {
    color: var(--text-muted);
  }

  .search-toggle,
  .settings-toggle {
    position: absolute;
    top: max(0.5rem, env(safe-area-inset-top));
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: auto;
    min-width: 44px;
    height: 44px;
    padding: 0 0.5rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--surface-1) 88%, transparent);
    backdrop-filter: blur(6px);
    color: var(--text-secondary);
    cursor: pointer;
    z-index: 3;
  }

  .search-toggle {
    right: calc(max(0.375rem, env(safe-area-inset-right)) + 2.25rem + 3rem);
  }

  .settings-toggle {
    right: calc(max(0.375rem, env(safe-area-inset-right)) + 2.25rem);
    justify-content: center;
  }

  .search-toggle.active {
    color: var(--text-primary);
    border-color: currentColor;
  }

  .badge {
    font-size: 0.6875rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .search-toggle:focus-visible,
  .settings-toggle:focus-visible {
    outline: 2px solid var(--text-primary);
    outline-offset: 1px;
  }
</style>

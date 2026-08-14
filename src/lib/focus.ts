/**
 * Focused timelines.
 *
 * A focus is the same render pipeline pointed at a different dataset over a
 * different domain: one subject, at a grain the 3.3-million-year main timeline
 * could never show. Its own entries live in a sibling `entries.json`; the
 * entries it shares with the main timeline are *selected*, not copied, so
 * adding a Roman entry to the main data puts it in the Roman focus without
 * anyone having to remember to list it there too.
 *
 * Everything here is pure — no fetching, no reactivity. Loading lives in
 * `data.ts`, and this module is what `validate-data.ts` runs to report what a
 * selector actually caught.
 */

import { extentOf } from './scale.ts';
import { resolveEnd, toDecimalYear } from './time.ts';
import type { Entry, Focus, FocusRange, FocusSummary } from './types.ts';

export interface ResolvedFocus {
  /** Inherited and own together — what the timeline renders. */
  entries: Entry[];
  /** Main-timeline entries the selector caught. */
  inherited: Entry[];
  /** Entries authored for this focus alone. */
  own: Entry[];
  /**
   * The axis domain. Derived from *everything* in the focus, so it is stable
   * under filtering — the same rule the main timeline follows — and wide
   * enough to hold an `include` that reaches outside the declared period.
   */
  domain: [number, number];
  /** The declared period: what fills the screen on entry. */
  initialView: [number, number];
}

/**
 * The main timeline's axis domain.
 *
 * Lives here beside `resolveFocus` because the two are counterparts and the
 * difference between them is the point: the main timeline always runs to the
 * present, a focus runs to the end of its subject. Derived from *all* entries,
 * never a filtered set — an axis that rescaled under every chip toggle would
 * make the zoom transform mean something different from one moment to the next.
 */
export function mainDomain(entries: readonly Entry[], present: number): [number, number] {
  let min = Infinity;
  let max = present;

  for (const entry of entries) {
    const t0 = toDecimalYear(entry.start);
    min = Math.min(min, t0);
    max = Math.max(max, entry.end === undefined ? t0 : resolveEnd(entry.end, present));
  }

  // The fallback matters only for an empty dataset, which validation forbids.
  return [Number.isFinite(min) ? min : -3_299_999, max];
}

/** The declared period as axis coordinates. */
export function rangeExtent(range: FocusRange, present: number): [number, number] {
  return [toDecimalYear(range.start), resolveEnd(range.end, present)];
}

/**
 * The menu's reading order: chronological by the period each focus covers,
 * oldest first.
 *
 * Sorted here rather than maintained by hand in `focus/index.json`, so a focus
 * added to that file lands in the right place without anyone remembering to
 * move it. The key is the *decimal* year, because historical years have no year
 * 0 and comparing them raw puts 1 BCE and 1 CE the wrong way round. Title
 * breaks a tie so the order is total, and therefore stable across engines.
 */
export function orderFocuses(focuses: readonly FocusSummary[]): FocusSummary[] {
  return [...focuses].sort((a, b) => {
    const start = toDecimalYear(a.range.start) - toDecimalYear(b.range.start);
    return start !== 0 ? start : a.title.localeCompare(b.title);
  });
}

function overlaps(entry: Entry, present: number, from: number, to: number): boolean {
  const t0 = toDecimalYear(entry.start);
  const t1 = entry.end === undefined ? t0 : resolveEnd(entry.end, present);
  return t0 <= to && from <= t1;
}

/**
 * Which main entries this focus inherits.
 *
 * Exclusion beats everything; an explicit include beats the keyword and range
 * tests both, because naming an id is an unambiguous instruction and silently
 * dropping it for falling outside the period would be a trap. The domain
 * widens to hold it instead.
 */
export function inheritedEntries(
  focus: Focus,
  main: readonly Entry[],
  present: number,
): Entry[] {
  const { keywords, include, exclude } = focus.select;
  const excluded = new Set(exclude);
  const included = new Set(include);
  const [from, to] = rangeExtent(focus.range, present);

  return main.filter((entry) => {
    if (excluded.has(entry.id)) return false;
    if (included.has(entry.id)) return true;
    if (keywords.length === 0) return false;
    if (!keywords.some((keyword) => entry.keywords.includes(keyword))) return false;
    return overlaps(entry, present, from, to);
  });
}

/**
 * Everything a focused timeline needs to render.
 *
 * `own` wins an id collision with `inherited`, but that collision is a
 * validation error rather than a supported override — two entries answering to
 * one id make a deep link ambiguous. The precedence here only stops a bad data
 * file from rendering the same id twice.
 */
export function resolveFocus(
  focus: Focus,
  main: readonly Entry[],
  own: readonly Entry[],
  present: number,
): ResolvedFocus {
  const ownIds = new Set(own.map((entry) => entry.id));
  const inherited = inheritedEntries(focus, main, present).filter(
    (entry) => !ownIds.has(entry.id),
  );

  const entries = [...inherited, ...own];
  const initialView = rangeExtent(focus.range, present);

  const spread = extentOf(
    entries.map((entry) => ({
      t0: toDecimalYear(entry.start),
      t1: entry.end === undefined ? null : resolveEnd(entry.end, present),
    })),
  );

  const domain: [number, number] = spread
    ? [Math.min(initialView[0], spread[0]), Math.max(initialView[1], spread[1])]
    : initialView;

  return { entries, inherited, own: [...own], domain, initialView };
}

/**
 * How much to multiply a timeline's zoom by before asking `importanceGate`
 * what to show.
 *
 * The gate reads `k`, where k=1 means "the whole domain is on screen". That
 * makes it relative to the domain, which is right within one timeline and wrong
 * across two: entering a focus at k=1 would put the gate at 1 and open the
 * Roman Empire as a bare band, when 500 years on screen has earned far more
 * detail than that. Scaling by the ratio of the spans restores the absolute
 * reading — the same visible span earns the same detail wherever it is read.
 *
 * `referenceSpan` is `GATE_REFERENCE_SPAN`, and `span` is the timeline's *axis*
 * domain — after any empty ages have been collapsed out of it, because a
 * collapsed axis genuinely puts fewer years on screen at k=1 and has genuinely
 * earned the detail that goes with them. The main timeline is no longer the
 * unscaled case; nothing is.
 */
export function gateScaleFor(referenceSpan: number, span: number): number {
  if (!(referenceSpan > 0) || !(span > 0)) return 1;
  return referenceSpan / span;
}

/**
 * A resolved focus as the timeline component consumes it: the dataset, plus
 * the three things rendering needs that a raw `Focus` does not carry.
 */
export interface FocusView extends ResolvedFocus {
  id: string;
  title: string;
  /**
   * Ids this focus authored. The timeline uses it to decide which details
   * directory an entry's prose comes from — inherited entries keep theirs in
   * the main one.
   */
  ownIds: Set<string>;
}

/**
 * Resolve a focus and package it for rendering.
 *
 * Deliberately carries no gate scale. That is derived from the *axis* domain,
 * which is not known until the empty ages have been collapsed out of it, so the
 * timeline computes it for itself — by one rule, for both kinds of timeline.
 */
export function focusView(
  focus: Focus,
  main: readonly Entry[],
  own: readonly Entry[],
  present: number,
): FocusView {
  const resolved = resolveFocus(focus, main, own, present);

  return {
    ...resolved,
    id: focus.id,
    title: focus.title,
    ownIds: new Set(resolved.own.map((entry) => entry.id)),
  };
}

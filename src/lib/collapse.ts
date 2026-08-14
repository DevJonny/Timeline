/**
 * Collapsing empty ages.
 *
 * The main timeline's first three ages — Palaeolithic, Mesolithic, Neolithic —
 * hold no entries at all and cover 3,288,000 of the domain's 3,300,000 years.
 * On a linear axis that is 99.6% of the screen given to nothing, and the five
 * thousand years that *do* carry content are squeezed into the last half
 * percent. Every reader's first gesture is to zoom past it.
 *
 * So the axis is broken. An age with nothing in it compresses to a small fixed
 * stub, and the pieces either side keep their natural scale. This module owns
 * the mapping and nothing else.
 *
 * ## The third coordinate
 *
 * `time.ts` already distinguishes *historical* years (what data is authored in;
 * no year 0) from *astronomical decimal* years (continuous; what maths wants).
 * This adds a third: the **axis coordinate**, which is what the d3 scale and
 * the zoom transform see.
 *
 *     historical  --toDecimalYear-->  decimal year  --AxisMap.to-->  axis
 *     historical  <--format*-------   decimal year  <--AxisMap.from--  axis
 *
 * The rule from `time.ts` extends unchanged: nothing shown to a human is ever a
 * raw axis coordinate. It comes back through `from` first, then a formatter.
 *
 * When nothing is collapsed the map is the identity, so a focused timeline
 * whose chapters are all populated behaves exactly as it did before — see
 * `linear`.
 *
 * Emptiness is measured against *all* entries, never a filtered set. A
 * filter-driven collapse would rescale the axis under the reader on every chip
 * toggle, which is the same reason the domain ignores filters.
 */

/**
 * An entry reduced to what collapsing needs to know about it.
 *
 * Ages are the unit of collapse; everything else is an occupant. Keeping the
 * shape structural rather than importing `Entry` is what lets this module be
 * tested with four-field literals.
 */
export interface Occupant {
  /** True for `type: 'age'` — a candidate for collapse, never an occupant. */
  age: boolean;
  t0: number;
  /** null for an instantaneous entry. */
  t1: number | null;
}

/** One linear stretch of the axis. Pieces tile the domain, in order. */
export interface AxisPiece {
  /** Decimal-year bounds. */
  t0: number;
  t1: number;
  /** Axis-coordinate bounds. */
  a0: number;
  a1: number;
  /** True when this piece is compressed: more years than axis units. */
  collapsed: boolean;
}

export interface AxisMap {
  pieces: AxisPiece[];
  /** Decimal year → axis coordinate. */
  to(t: number): number;
  /** Axis coordinate → decimal year. */
  from(a: number): number;
  /** True when nothing collapsed, so both directions are the identity. */
  linear: boolean;
}

/**
 * How much of the *populated* span one collapsed age is allowed to occupy.
 *
 * Small enough to read as a break rather than a period, large enough to draw a
 * band and hold a tap. 2% of a 5,300-year populated span is a little over a
 * century of axis, which is roughly a finger's width when the whole domain is
 * on screen.
 */
export const COLLAPSED_SHARE = 0.02;

/**
 * Ceiling on the collapsed total, shared out when several ages qualify.
 *
 * Three empty ages at 2% each is 6% of the axis, which is fine. Twenty would be
 * 40%, which would be a worse problem than the one being solved — the stubs
 * shrink to fit instead.
 */
export const COLLAPSED_TOTAL_SHARE = 0.12;

/**
 * How much of the populated span an empty age must outweigh before it is worth
 * breaking the axis for.
 *
 * Being empty is not the complaint; *dominating* is. Ancient Greece has a
 * fifty-year chapter with nothing in it against nine hundred populated years,
 * and compressing that would trade a fifth of a screen of honest scale for a
 * hatched band — a break the reader has to decode, bought with nothing. The
 * Palaeolithic outweighs everything that ever happened by six hundred to one.
 * Only that kind of imbalance is worth the break.
 */
export const COLLAPSE_MIN_SHARE = 0.1;

/**
 * Whether an entry counts as content inside `[t0, t1]`.
 *
 * Spans are compared half-open so ages that merely touch — the Neolithic ends
 * the year the Bronze Age begins — do not fill each other. Instants are
 * compared closed, because an instant on a boundary belongs to something and
 * counting it for both neighbours errs toward *not* collapsing, which is the
 * safe direction: a stub over real content would hide it.
 */
function occupies(item: Occupant, t0: number, t1: number): boolean {
  const end = item.t1 ?? item.t0;
  if (end === item.t0) return item.t0 >= t0 && item.t0 <= t1;
  return end > t0 && item.t0 < t1;
}

/**
 * The age spans holding nothing, in order.
 *
 * Other ages are not occupants. An age that contains only another age is still
 * empty of anything a reader came here to see, and on the main timeline the
 * Palaeolithic would otherwise be "filled" by the Stone Age bracketing it.
 */
export function emptyAgeSpans(items: readonly Occupant[]): [number, number][] {
  const occupants = items.filter((item) => !item.age);

  return items
    .filter((item) => item.age && item.t1 !== null && item.t1 > item.t0)
    .filter((age) => !occupants.some((other) => occupies(other, age.t0, age.t1!)))
    .map((age): [number, number] => [age.t0, age.t1!])
    .sort((a, b) => a[0] - b[0]);
}

/** The identity map over a domain: one piece, nothing compressed. */
export function linearAxisMap(domain: readonly [number, number]): AxisMap {
  const pieces: AxisPiece[] = [
    { t0: domain[0], t1: domain[1], a0: domain[0], a1: domain[1], collapsed: false },
  ];
  return {
    pieces,
    to: (t) => t,
    from: (a) => a,
    linear: true,
  };
}

/**
 * Build the axis map for a dataset over a domain.
 *
 * The axis origin is the domain's start, so an uncollapsed timeline has axis
 * coordinates *identical* to decimal years. That is not a coincidence to rely
 * on lightly, but it does mean the collapsed case is the only one where the
 * distinction can bite, and the linear case stays trivially inspectable.
 */
export function buildAxisMap(
  items: readonly Occupant[],
  domain: readonly [number, number],
): AxisMap {
  const [d0, d1] = domain;
  if (!(d1 > d0)) return linearAxisMap(domain);

  // Clamped to the domain and de-overlapped. Ages tile rather than nest, so
  // the overlap guard is belt-and-braces against odd data rather than a case
  // the shipped dataset produces.
  const spans: [number, number][] = [];
  let edge = d0;
  for (const [t0, t1] of emptyAgeSpans(items)) {
    const from = Math.max(t0, edge);
    const to = Math.min(t1, d1);
    if (to > from) {
      spans.push([from, to]);
      edge = to;
    }
  }

  if (spans.length === 0) return linearAxisMap(domain);

  // The years carrying content: everything outside an empty age. Independent of
  // which of them end up collapsed, which is what stops the threshold below
  // from having to be solved for.
  const emptyTotal = spans.reduce((sum, [t0, t1]) => sum + (t1 - t0), 0);
  const populated = d1 - d0 - emptyTotal;

  // Everything is empty. There is no populated scale to preserve, so
  // compressing would only shuffle nothing around.
  if (!(populated > 0)) return linearAxisMap(domain);

  const worthBreaking = spans.filter(([t0, t1]) => t1 - t0 > populated * COLLAPSE_MIN_SHARE);
  if (worthBreaking.length === 0) return linearAxisMap(domain);

  const budget =
    populated * Math.min(COLLAPSED_SHARE, COLLAPSED_TOTAL_SHARE / worthBreaking.length);

  const pieces: AxisPiece[] = [];
  let t = d0;
  let a = d0;

  const push = (t0: number, t1: number, axisSpan: number, collapsed: boolean) => {
    if (!(t1 > t0)) return;
    pieces.push({ t0, t1, a0: a, a1: a + axisSpan, collapsed });
    t = t1;
    a += axisSpan;
  };

  for (const [t0, t1] of worthBreaking) {
    push(t, t0, t0 - t, false);
    // Always a compression, never an expansion: the threshold has established
    // this age is longer than a tenth of the populated span, and the budget is
    // at most a fiftieth of it.
    push(t0, t1, budget, true);
  }
  push(t, d1, d1 - t, false);

  return {
    pieces,
    to: (value) => project(pieces, value, 'to'),
    from: (value) => project(pieces, value, 'from'),
    linear: false,
  };
}

/**
 * Interpolate through the pieces in either direction.
 *
 * Outside the domain the nearest piece is extrapolated at scale 1 rather than
 * clamped. Clamping would collapse everything beyond the last age onto a single
 * pixel, and `transformForDomainPadded` routinely asks for coordinates a little
 * outside the domain on its way to a padded fit.
 */
function project(pieces: readonly AxisPiece[], value: number, direction: 'to' | 'from'): number {
  const forward = direction === 'to';
  const lo = (p: AxisPiece) => (forward ? p.t0 : p.a0);
  const hi = (p: AxisPiece) => (forward ? p.t1 : p.a1);
  const outLo = (p: AxisPiece) => (forward ? p.a0 : p.t0);
  const outHi = (p: AxisPiece) => (forward ? p.a1 : p.t1);

  const first = pieces[0]!;
  if (value <= lo(first)) return outLo(first) + (value - lo(first));

  const last = pieces[pieces.length - 1]!;
  if (value >= hi(last)) return outHi(last) + (value - hi(last));

  for (const piece of pieces) {
    if (value <= hi(piece)) {
      const span = hi(piece) - lo(piece);
      if (!(span > 0)) return outLo(piece);
      return outLo(piece) + ((value - lo(piece)) / span) * (outHi(piece) - outLo(piece));
    }
  }

  return outHi(last);
}

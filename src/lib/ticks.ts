/**
 * Adaptive tick generation.
 *
 * d3's `scale.ticks()` cannot cope with this axis: it spans seven orders of
 * magnitude, from a 3.3-million-year overview down to a single day. A fixed
 * strategy produces either three labels or three hundred thousand.
 *
 * The step is therefore chosen from explicit ladders based on how many years a
 * pixel currently covers. Below a year, ticks switch to *real calendar* months
 * and days rather than fractional years — and both of those need their own
 * step ladders. Without them there is a granularity hole between "every day"
 * and "every month": a viewport showing four weeks would get a single tick.
 */

import {
  daysInMonth,
  daysInYear,
  formatAxisYear,
  formatHistoricalYear,
  fromDecimalYear,
  partsToDecimalYear,
  toHistoricalYear,
} from './time.ts';

export type TickScale =
  | { kind: 'year'; step: number }
  | { kind: 'month'; step: number }
  | { kind: 'day'; step: number };

export interface Tick {
  /** Axis coordinate (astronomical decimal year). */
  t: number;
  label: string;
  /** Majors get a heavier rule and always keep their label. */
  major: boolean;
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const DAY_STEPS = [1, 2, 5, 10, 15] as const;
const MONTH_STEPS = [1, 2, 3, 6] as const;
const MEAN_YEAR_DAYS = 365.2425;

/** 1, 2, 5 × powers of ten. Generated rather than hand-listed so it never runs out. */
export function tickLadder(): number[] {
  const steps: number[] = [];
  for (let exp = 0; exp <= 7; exp++) {
    for (const mantissa of [1, 2, 5]) steps.push(mantissa * 10 ** exp);
  }
  return steps;
}

/**
 * Pick the finest granularity whose spacing still clears `minGapPx`.
 *
 * Ladders are tried finest-first — days, then months, then years — so the
 * chosen step is always the most detailed one that will not collide.
 */
export function chooseTickScale(yearsPerPixel: number, minGapPx = 56): TickScale {
  const target = yearsPerPixel * minGapPx; // minimum spacing, in years

  for (const step of DAY_STEPS) {
    if (step / MEAN_YEAR_DAYS >= target) return { kind: 'day', step };
  }
  for (const step of MONTH_STEPS) {
    if (step / 12 >= target) return { kind: 'month', step };
  }
  for (const step of tickLadder()) {
    if (step >= target) return { kind: 'year', step };
  }
  // Beyond the ladder, round up to the next power of ten.
  return { kind: 'year', step: 10 ** Math.ceil(Math.log10(target)) };
}

const MAX_TICKS = 400;

/**
 * Year ticks land on round *historical* years, not round astronomical ones.
 *
 * The two conventions are offset by one across the BCE boundary, so stepping
 * the astronomical coordinate by 500 produces ticks labelled "3501 BCE" and
 * "3001 BCE". Readers expect round numbers, so the iteration happens in
 * historical space and each value is converted back for positioning.
 */
function yearTicks(t0: number, t1: number, step: number, compact: boolean): Tick[] {
  const ticks: Tick[] = [];
  const from = toHistoricalYear(Math.floor(t0));
  const to = toHistoricalYear(Math.floor(t1)) + step;

  for (
    let h = Math.ceil(from / step) * step, guard = 0;
    h <= to && guard < MAX_TICKS * 2;
    h += step, guard++
  ) {
    let historical = h;
    if (historical === 0) {
      // Year zero does not exist. At step 1 the next iteration supplies 1 CE;
      // at coarser steps, pull the boundary tick onto 1 CE so the BCE/CE
      // transition still gets a rule.
      if (step === 1) continue;
      historical = 1;
    }

    const t = historical < 0 ? historical + 1 : historical;
    if (t < t0 || t > t1) continue;
    if (ticks.length >= MAX_TICKS) break;

    ticks.push({
      t,
      label: formatHistoricalYear(historical, compact, step),
      major: Math.round(historical / step) % 5 === 0,
    });
  }
  return ticks;
}

function monthTicks(t0: number, t1: number, step: number, compact: boolean): Tick[] {
  const ticks: Tick[] = [];

  for (let y = Math.floor(t0); y <= Math.floor(t1); y++) {
    for (let month = 1; month <= 12; month += step) {
      if (ticks.length >= MAX_TICKS) return ticks;
      const t = partsToDecimalYear(y, month, 1);
      if (t < t0 || t > t1) continue;
      const major = month === 1;
      ticks.push({
        t,
        label: major ? formatAxisYear(y, compact, 1) : MONTH_ABBR[month - 1]!,
        major,
      });
    }
  }
  return ticks;
}

function dayTicks(t0: number, t1: number, step: number): Tick[] {
  const ticks: Tick[] = [];
  const start = fromDecimalYear(t0);
  let year = start.astronomicalYear;
  let month = start.month;

  // Day steps restart each month, so gaps shorten slightly at month ends
  // (26 Feb → 1 Mar). That is the conventional calendar behaviour and keeps
  // the 1st of every month — the labelled major — always on a tick.
  for (let guard = 0; guard < MAX_TICKS * 12; guard++) {
    const monthStart = partsToDecimalYear(year, month, 1);
    if (monthStart > t1) break;

    const length = daysInMonth(year, month);

    for (let day = 1; day <= length; day += step) {
      // Drop a trailing step that sits too close to the 1st of the next month,
      // which is always emitted. Without this, step 15 yields 31 Jan and then
      // 1 Feb — a one-day gap and a guaranteed label collision. Step 1 is
      // exempt: every day is wanted and the spacing is already uniform.
      if (step > 1 && day > 1 && length - day < step / 2) break;

      const t = partsToDecimalYear(year, month, day);
      if (t < t0) continue;
      if (t > t1) return ticks;
      if (ticks.length >= MAX_TICKS) return ticks;

      const major = day === 1;
      ticks.push({
        t,
        label: major ? `${MONTH_ABBR[month - 1]} ${toHistoricalYear(year)}` : String(day),
        major,
      });
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return ticks;
}

export function generateTicks(
  domain: readonly [number, number],
  scale: TickScale,
  compact = false,
): Tick[] {
  const [t0, t1] = domain;
  if (!(t1 > t0)) return [];

  switch (scale.kind) {
    case 'year':
      return yearTicks(t0, t1, scale.step, compact);
    case 'month':
      return monthTicks(t0, t1, scale.step, compact);
    case 'day':
      return dayTicks(t0, t1, scale.step);
  }
}

/** Approximate spacing of a tick scale, in years. Used for layout budgeting. */
export function tickSpacingYears(scale: TickScale): number {
  switch (scale.kind) {
    case 'year':
      return scale.step;
    case 'month':
      return scale.step / 12;
    case 'day':
      return scale.step / MEAN_YEAR_DAYS;
  }
}

/** Exposed for tests: the exact day count of a year at the axis coordinate. */
export function daysInAxisYear(t: number): number {
  return daysInYear(Math.floor(t));
}

/**
 * Time model.
 *
 * Two year conventions exist here and conflating them is the main hazard:
 *
 *  - **Historical** — how data is authored and how dates are displayed.
 *    Signed, with NO year zero: -1 is 1 BCE, +1 is 1 CE.
 *  - **Astronomical** — the continuous coordinate the axis uses.
 *    1 BCE is 0, 2 BCE is -1. Continuous, so arithmetic and interpolation work.
 *
 * Everything crossing into the axis goes through `toDecimalYear`; everything
 * shown to a human goes back through a `format*` function. Never render a raw
 * astronomical value.
 *
 * float64 carries ~15 significant digits and 3.3e6 years at day resolution
 * needs ~9, so precision is a non-issue across the whole span.
 */

import type { EndPoint, TimePoint } from './types.ts';

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Proleptic Gregorian: the rule is projected backwards without limit. */
export function isLeapYear(astronomicalYear: number): boolean {
  const y = astronomicalYear;
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInYear(astronomicalYear: number): number {
  return isLeapYear(astronomicalYear) ? 366 : 365;
}

export function daysInMonth(astronomicalYear: number, month: number): number {
  if (month === 2 && isLeapYear(astronomicalYear)) return 29;
  return MONTH_DAYS[month - 1] ?? 0;
}

export function toAstronomicalYear(historicalYear: number): number {
  return historicalYear < 0 ? historicalYear + 1 : historicalYear;
}

export function toHistoricalYear(astronomicalYear: number): number {
  return astronomicalYear <= 0 ? astronomicalYear - 1 : astronomicalYear;
}

/** 1-based day within the year. */
export function dayOfYear(astronomicalYear: number, month: number, day: number): number {
  let total = day;
  for (let m = 0; m < month - 1; m++) {
    total += MONTH_DAYS[m]!;
    if (m === 1 && isLeapYear(astronomicalYear)) total += 1;
  }
  return total;
}

export function isValidDate(point: TimePoint): boolean {
  if (point.year === 0) return false;
  if (point.month === undefined) return point.day === undefined;
  if (point.month < 1 || point.month > 12) return false;
  if (point.day === undefined) return true;
  const a = toAstronomicalYear(point.year);
  return point.day >= 1 && point.day <= daysInMonth(a, point.month);
}

/**
 * The axis coordinate: an astronomical year with a fractional part for
 * sub-year precision. A bare year yields the start of that year.
 */
export function toDecimalYear(point: TimePoint): number {
  const a = toAstronomicalYear(point.year);
  if (point.month === undefined) return a;
  const doy = dayOfYear(a, point.month, point.day ?? 1);
  return a + (doy - 1) / daysInYear(a);
}

/** Today as an axis coordinate. Injectable so tests can pin the clock. */
export function presentDecimalYear(now: Date = new Date()): number {
  const a = now.getUTCFullYear();
  const doy = dayOfYear(a, now.getUTCMonth() + 1, now.getUTCDate());
  return a + (doy - 1) / daysInYear(a);
}

export function resolveEnd(end: EndPoint, present: number): number {
  return end === 'present' ? present : toDecimalYear(end);
}

// --- formatting -------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Format a historical year for display.
 *
 * Deep time uses "Mya"/"kya", which are strictly *before present* rather than
 * BCE. At that magnitude the ~2000-year difference is far below the rendered
 * precision, so the distinction is not worth surfacing to a reader.
 */
export function formatHistoricalYear(historicalYear: number, compact = false): string {
  const abs = Math.abs(historicalYear);

  if (abs >= 1_000_000) {
    const mya = abs / 1_000_000;
    return `${mya >= 10 ? Math.round(mya) : mya.toFixed(1)} Mya`;
  }
  if (abs >= 100_000) return `${Math.round(abs / 1000).toLocaleString('en-GB')} kya`;

  // Convention: no thousands separator below 10,000 ("3300 BCE"), but one
  // above it ("12,000 BCE"), where the digit count stops being scannable.
  const digits = abs >= 10_000 ? abs.toLocaleString('en-GB') : String(abs);
  if (historicalYear < 0) return `${digits} BCE`;
  return compact ? digits : `${digits} CE`;
}

/** Format an axis coordinate (astronomical) for display. */
export function formatAxisYear(astronomicalYear: number, compact = false): string {
  return formatHistoricalYear(toHistoricalYear(Math.round(astronomicalYear)), compact);
}

/** Full date of a `TimePoint`, honouring `circa` and available precision. */
export function formatTimePoint(point: TimePoint, compact = false): string {
  const year = formatHistoricalYear(point.year, compact);
  let text = year;

  if (point.month !== undefined) {
    const month = MONTH_NAMES[point.month - 1]!;
    text = point.day !== undefined ? `${point.day} ${month} ${year}` : `${month} ${year}`;
  }

  return point.circa ? `c. ${text}` : text;
}

export function formatEndPoint(end: EndPoint, compact = false): string {
  return end === 'present' ? 'present' : formatTimePoint(end, compact);
}

/** Human-readable span, e.g. "c. 3300 BCE – c. 1200 BCE" or "1066 CE". */
export function formatRange(start: TimePoint, end: EndPoint | undefined, compact = false): string {
  const from = formatTimePoint(start, compact);
  if (end === undefined) return from;
  return `${from} – ${formatEndPoint(end, compact)}`;
}

import { describe, expect, it } from 'vitest';

import {
  dayOfYear,
  daysInMonth,
  formatAxisYear,
  formatHistoricalYear,
  formatRange,
  formatTimePoint,
  isLeapYear,
  isValidDate,
  presentDecimalYear,
  resolveEnd,
  toAstronomicalYear,
  toDecimalYear,
  toHistoricalYear,
} from '../src/lib/time.ts';

describe('astronomical / historical year conversion', () => {
  it('collapses the missing year zero so the axis is continuous', () => {
    // 1 BCE and 1 CE are adjacent years, so their coordinates differ by exactly 1.
    expect(toDecimalYear({ year: -1 })).toBe(0);
    expect(toDecimalYear({ year: 1 })).toBe(1);
    expect(toDecimalYear({ year: 1 }) - toDecimalYear({ year: -1 })).toBe(1);
  });

  it('round-trips in both directions', () => {
    for (const year of [-3300000, -3300, -100, -2, -1, 1, 2, 1066, 2026]) {
      expect(toHistoricalYear(toAstronomicalYear(year))).toBe(year);
    }
  });

  it('never produces a historical year of zero', () => {
    for (let a = -5; a <= 5; a++) {
      expect(toHistoricalYear(a)).not.toBe(0);
    }
  });
});

describe('proleptic Gregorian calendar', () => {
  it('applies the 4/100/400 rule backwards without limit', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false); // divisible by 100
    expect(isLeapYear(1600)).toBe(true); // divisible by 400
    expect(isLeapYear(0)).toBe(true); // 1 BCE, astronomical 0
    expect(isLeapYear(-4)).toBe(true); // 5 BCE
  });

  it('reports month lengths, including February', () => {
    expect(daysInMonth(1500, 2)).toBe(28);
    expect(daysInMonth(1600, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('counts day-of-year across the leap boundary', () => {
    expect(dayOfYear(2026, 1, 1)).toBe(1);
    expect(dayOfYear(2026, 3, 1)).toBe(60); // 31 + 28 + 1
    expect(dayOfYear(2024, 3, 1)).toBe(61); // leap year
    expect(dayOfYear(2026, 12, 31)).toBe(365);
    expect(dayOfYear(2024, 12, 31)).toBe(366);
  });
});

describe('isValidDate', () => {
  it('rejects year zero', () => {
    expect(isValidDate({ year: 0 })).toBe(false);
  });

  it('rejects impossible days', () => {
    expect(isValidDate({ year: 1500, month: 2, day: 30 })).toBe(false);
    expect(isValidDate({ year: 1500, month: 2, day: 29 })).toBe(false); // 1500 not leap
    expect(isValidDate({ year: 1600, month: 2, day: 29 })).toBe(true); // 1600 is leap
  });

  it('rejects a day without a month', () => {
    expect(isValidDate({ year: 1066, day: 14 })).toBe(false);
  });

  it('accepts year-only and month-only precision', () => {
    expect(isValidDate({ year: -3300 })).toBe(true);
    expect(isValidDate({ year: 1939, month: 9 })).toBe(true);
  });
});

describe('toDecimalYear', () => {
  it('places a bare year at its start', () => {
    expect(toDecimalYear({ year: 1945 })).toBe(1945);
  });

  it('adds a sub-year fraction from month and day', () => {
    // 14 October 1066 is day 287 of a non-leap year.
    expect(toDecimalYear({ year: 1066, month: 10, day: 14 })).toBeCloseTo(1066 + 286 / 365, 6);
  });

  it('keeps day resolution across the full 3.3-million-year span', () => {
    const a = toDecimalYear({ year: -3300000, month: 1, day: 1 });
    const b = toDecimalYear({ year: -3300000, month: 1, day: 2 });
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeCloseTo(1 / 365, 9);
  });

  it('orders BCE dates correctly', () => {
    expect(toDecimalYear({ year: -3300 })).toBeLessThan(toDecimalYear({ year: -1200 }));
    expect(toDecimalYear({ year: -1 })).toBeLessThan(toDecimalYear({ year: 1 }));
  });
});

describe('presentDecimalYear', () => {
  it('is computed from an injectable clock', () => {
    const pinned = new Date(Date.UTC(2026, 7, 10)); // 10 August 2026
    expect(presentDecimalYear(pinned)).toBeCloseTo(2026 + 221 / 365, 6);
  });

  it('moves forward as the clock advances', () => {
    const earlier = presentDecimalYear(new Date(Date.UTC(2026, 0, 1)));
    const later = presentDecimalYear(new Date(Date.UTC(2027, 0, 1)));
    expect(later - earlier).toBeCloseTo(1, 6);
  });
});

describe('resolveEnd', () => {
  it("resolves 'present' against the supplied clock, not a baked-in constant", () => {
    const present = presentDecimalYear(new Date(Date.UTC(2026, 7, 10)));
    expect(resolveEnd('present', present)).toBe(present);
  });

  it('resolves a concrete end point', () => {
    expect(resolveEnd({ year: 1945 }, 2026)).toBe(1945);
  });
});

describe('formatting', () => {
  it('labels BCE and CE from historical years', () => {
    expect(formatHistoricalYear(-3300)).toBe('3300 BCE');
    expect(formatHistoricalYear(1066)).toBe('1066 CE');
    expect(formatHistoricalYear(1066, true)).toBe('1066');
  });

  it('uses deep-time units at scale', () => {
    expect(formatHistoricalYear(-3300000)).toBe('3.3 Mya');
    expect(formatHistoricalYear(-12000000)).toBe('12 Mya');
    expect(formatHistoricalYear(-100000)).toBe('100 kya');
    expect(formatHistoricalYear(-12000)).toBe('12,000 BCE');
  });

  it('formats axis coordinates back through the historical convention', () => {
    expect(formatAxisYear(toDecimalYear({ year: -3300 }))).toBe('3300 BCE');
    expect(formatAxisYear(toDecimalYear({ year: -1 }))).toBe('1 BCE');
    expect(formatAxisYear(toDecimalYear({ year: 1 }))).toBe('1 CE');
  });

  it('names the year an instant falls in, rather than the nearest year', () => {
    // Regression: rounding reported 10 August 2026 as "2027 CE" on the
    // today marker and the visible-range readout.
    const august2026 = presentDecimalYear(new Date(Date.UTC(2026, 7, 10)));
    expect(formatAxisYear(august2026)).toBe('2026 CE');

    expect(formatAxisYear(1939.99)).toBe('1939 CE');
    expect(formatAxisYear(toDecimalYear({ year: -3300, month: 12 }))).toBe('3300 BCE');
  });

  it('tolerates float error on tick coordinates', () => {
    expect(formatAxisYear(1939.9999999999)).toBe('1940 CE');
  });

  it('renders time points at the precision available', () => {
    expect(formatTimePoint({ year: -3300, circa: true })).toBe('c. 3300 BCE');
    expect(formatTimePoint({ year: 1939, month: 9 })).toBe('September 1939 CE');
    expect(formatTimePoint({ year: 1066, month: 10, day: 14 })).toBe('14 October 1066 CE');
  });

  it('renders ranges, and instants as a single date', () => {
    expect(formatRange({ year: -3300, circa: true }, { year: -1200, circa: true })).toBe(
      'c. 3300 BCE – c. 1200 BCE',
    );
    expect(formatRange({ year: 1945 }, 'present')).toBe('1945 CE – present');
    expect(formatRange({ year: 1066, month: 10, day: 14 }, undefined)).toBe('14 October 1066 CE');
  });
});

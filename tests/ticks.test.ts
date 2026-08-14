import { describe, expect, it } from 'vitest';

import { buildAxisMap, type Occupant } from '../src/lib/collapse.ts';
import {
  chooseTickScale,
  generateAxisTicks,
  generateTicks,
  tickLadder,
} from '../src/lib/ticks.ts';

describe('chooseTickScale', () => {
  it('climbs the ladder as the view zooms out', () => {
    // years-per-pixel at a 800px viewport, from deep time down to days.
    expect(chooseTickScale(4125).kind).toBe('year');
    expect((chooseTickScale(4125) as { step: number }).step).toBe(500_000);
    expect((chooseTickScale(15) as { step: number }).step).toBe(1000);
    expect((chooseTickScale(1) as { step: number }).step).toBe(100);
    expect((chooseTickScale(0.1) as { step: number }).step).toBe(10);
    expect((chooseTickScale(0.02) as { step: number }).step).toBe(2);
  });

  it('switches to calendar months and days below a year per step', () => {
    expect(chooseTickScale(0.003).kind).toBe('month');
    expect(chooseTickScale(0.0001).kind).toBe('day');
  });

  it('has no granularity hole between one day and one month', () => {
    // Regression: a ~4-week viewport once fell through to month ticks and got
    // a single tick, because day and month lacked their own step ladders.
    const height = 800;
    for (let ypp = 1 / 365 / 40; ypp < 0.5; ypp *= 1.25) {
      const span = ypp * height;
      const ticks = generateTicks([1939, 1939 + span], chooseTickScale(ypp));
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(60);
    }
  });

  it('only ever selects steps from the 1/2/5 ladder', () => {
    const ladder = new Set(tickLadder());
    for (let ypp = 0.02; ypp < 5000; ypp *= 1.3) {
      const scale = chooseTickScale(ypp);
      if (scale.kind === 'year') expect(ladder.has(scale.step)).toBe(true);
    }
  });

  it('keeps ticks at least the requested gap apart at every zoom level', () => {
    // The property that actually prevents label collisions.
    const minGap = 56;
    const height = 800;

    for (let ypp = 0.0005; ypp < 5000; ypp *= 1.7) {
      const scale = chooseTickScale(ypp, minGap);
      const span = ypp * height;
      const ticks = generateTicks([1000, 1000 + span], scale);
      if (ticks.length < 2) continue;

      for (let i = 1; i < ticks.length; i++) {
        const gapPx = (ticks[i]!.t - ticks[i - 1]!.t) / ypp;
        expect(gapPx).toBeGreaterThanOrEqual(minGap * 0.5);
      }
    }
  });
});

describe('generateTicks', () => {
  it('returns nothing for an empty or inverted domain', () => {
    expect(generateTicks([100, 100], { kind: 'year', step: 10 })).toEqual([]);
    expect(generateTicks([200, 100], { kind: 'year', step: 10 })).toEqual([]);
  });

  it('places year ticks on multiples of the step, inside the domain', () => {
    const ticks = generateTicks([1003, 1042], { kind: 'year', step: 10 });
    expect(ticks.map((t) => t.t)).toEqual([1010, 1020, 1030, 1040]);
    for (const tick of ticks) {
      expect(tick.t).toBeGreaterThanOrEqual(1003);
      expect(tick.t).toBeLessThanOrEqual(1042);
    }
  });

  it('marks every fifth step as major', () => {
    const ticks = generateTicks([0, 100], { kind: 'year', step: 10 });
    // 1 CE rather than 0: year zero does not exist, so the boundary tick is
    // pulled onto the first real year.
    expect(ticks.filter((t) => t.major).map((t) => t.t)).toEqual([1, 50, 100]);
  });

  it('lands on round historical years, not round astronomical ones', () => {
    // Regression: stepping the astronomical coordinate produced "3501 BCE".
    // The two conventions are offset by one across the BCE boundary.
    const ticks = generateTicks([-3300, -3250], { kind: 'year', step: 20 });
    expect(ticks.map((t) => t.label)).toEqual(['3300 BCE', '3280 BCE', '3260 BCE']);
  });

  it('produces round labels either side of the BCE/CE boundary', () => {
    const labels = generateTicks([-520, 520], { kind: 'year', step: 200 }).map((t) => t.label);
    expect(labels).toEqual(['400 BCE', '200 BCE', '1 CE', '200 CE', '400 CE']);
  });

  it('never emits a tick for the non-existent year zero', () => {
    for (const step of [1, 2, 5, 10, 100]) {
      const ticks = generateTicks([-50, 50], { kind: 'year', step });
      expect(ticks.some((t) => t.label === '0 CE' || t.label === '0 BCE')).toBe(false);
    }
  });

  it('labels deep time in Mya', () => {
    const ticks = generateTicks([-3_300_000, -2_800_000], { kind: 'year', step: 500_000 });
    expect(ticks.some((t) => t.label.endsWith('Mya'))).toBe(true);
  });

  it('generates real calendar months, with January carrying the year', () => {
    const ticks = generateTicks([1939.0, 1940.0], { kind: 'month', step: 1 });
    expect(ticks).toHaveLength(13);
    expect(ticks[0]!.label).toBe('1939 CE');
    expect(ticks[0]!.major).toBe(true);
    expect(ticks[1]!.label).toBe('Feb');
    expect(ticks[1]!.major).toBe(false);
  });

  it('never emits a day tick crowded against the start of the next month', () => {
    // Regression: step 15 produced 31 Jan immediately followed by 1 Feb.
    for (const step of [2, 5, 10, 15]) {
      const ticks = generateTicks([1939, 1940], { kind: 'day', step });
      for (let i = 1; i < ticks.length; i++) {
        const gapDays = (ticks[i]!.t - ticks[i - 1]!.t) * 365;
        expect(gapDays).toBeGreaterThanOrEqual(step / 2);
      }
    }
  });

  it('keeps every day when the step is one', () => {
    const ticks = generateTicks([1939 + 31 / 365, 1939 + 59 / 365], { kind: 'day', step: 1 });
    expect(ticks.map((t) => t.label).slice(0, 3)).toEqual(['Feb 1939', '2', '3']);
  });

  it('generates real calendar days, respecting month lengths', () => {
    // 1 Feb to 1 Mar 1939 (not a leap year) is 28 days.
    const feb = 1939 + 31 / 365;
    const mar = 1939 + 59 / 365;
    const ticks = generateTicks([feb, mar], { kind: 'day', step: 1 });
    expect(ticks).toHaveLength(29);
    expect(ticks[0]!.label).toBe('Feb 1939');
    expect(ticks[28]!.label).toBe('Mar 1939');
  });

  it('is bounded even when asked for an absurd number of ticks', () => {
    const ticks = generateTicks([-3_300_000, 2026], { kind: 'year', step: 1 });
    expect(ticks.length).toBeLessThanOrEqual(400);
  });

  it('ticks ascend monotonically', () => {
    for (const scale of [
      { kind: 'year', step: 100 } as const,
      { kind: 'month', step: 1 } as const,
      { kind: 'day', step: 1 } as const,
    ]) {
      const ticks = generateTicks([1939, 1941], scale);
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i]!.t).toBeGreaterThan(ticks[i - 1]!.t);
      }
    }
  });
});

describe('generateAxisTicks', () => {
  const DOMAIN: [number, number] = [-3_300_000, 2026];

  /** The shipped shape: three ages holding nothing, then five millennia. */
  const ITEMS: Occupant[] = [
    { age: true, t0: -3_300_000, t1: -12_000 },
    { age: true, t0: -12_000, t1: -10_000 },
    { age: true, t0: -10_000, t1: -3300 },
    { age: true, t0: -3300, t1: 2026 },
    { age: false, t0: 1066, t1: null },
  ];

  it('is exactly generateTicks when the axis is not broken', () => {
    const map = buildAxisMap([{ age: false, t0: 1000, t1: 2000 }], [1000, 2000]);
    const scale = { kind: 'year', step: 100 } as const;

    expect(generateAxisTicks(map.pieces, [1000, 2000], scale)).toEqual(
      generateTicks([1000, 2000], scale),
    );
  });

  it('rules nothing inside a break', () => {
    const map = buildAxisMap(ITEMS, DOMAIN);
    const stub = map.pieces.find((piece) => piece.collapsed)!;

    // A view sitting wholly inside the compressed Palaeolithic. At its real
    // scale that is tens of thousands of years between adjacent labels, which
    // would read as the spacing everywhere else on the axis.
    const inside: [number, number] = [stub.a0 + 1, stub.a1 - 1];
    expect(generateAxisTicks(map.pieces, inside, { kind: 'year', step: 500 })).toEqual([]);
  });

  it('labels a tick with its real year, not its axis coordinate', () => {
    const map = buildAxisMap(ITEMS, DOMAIN);
    const ticks = generateAxisTicks(map.pieces, [map.to(-2000), map.to(2026)], {
      kind: 'year',
      step: 1000,
    });

    const found = ticks.find((tick) => tick.label.includes('1000 CE'));
    expect(found).toBeDefined();
    // Positioned where 1000 CE actually sits on the axis — which, past three
    // collapsed ages, is nowhere near 1000.
    expect(found!.t).toBeCloseTo(map.to(1000), 6);
  });

  it('ticks ascend across a break, so the axis never doubles back', () => {
    const map = buildAxisMap(ITEMS, DOMAIN);
    const ticks = generateAxisTicks(map.pieces, [map.to(DOMAIN[0]), map.to(DOMAIN[1])], {
      kind: 'year',
      step: 1000,
    });

    expect(ticks.length).toBeGreaterThan(1);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!.t).toBeGreaterThan(ticks[i - 1]!.t);
    }
  });
});

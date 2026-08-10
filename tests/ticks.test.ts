import { describe, expect, it } from 'vitest';

import { chooseTickScale, generateTicks, tickLadder } from '../src/lib/ticks.ts';

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
    expect(ticks.filter((t) => t.major).map((t) => t.t)).toEqual([0, 50, 100]);
  });

  it('handles BCE domains and labels them historically', () => {
    const ticks = generateTicks([-3300, -3250], { kind: 'year', step: 20 });
    expect(ticks.map((t) => t.label)).toEqual(['3301 BCE', '3281 BCE', '3261 BCE']);
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

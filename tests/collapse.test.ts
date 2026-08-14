import { describe, expect, it } from 'vitest';

import {
  buildAxisMap,
  COLLAPSED_SHARE,
  COLLAPSED_TOTAL_SHARE,
  emptyAgeSpans,
  linearAxisMap,
  type Occupant,
} from '../src/lib/collapse.ts';

function age(t0: number, t1: number): Occupant {
  return { age: true, t0, t1 };
}

function span(t0: number, t1: number): Occupant {
  return { age: false, t0, t1 };
}

function instant(t0: number): Occupant {
  return { age: false, t0, t1: null };
}

/** The shape the shipped main timeline has: three empty ages, then content. */
const PREHISTORY: Occupant[] = [
  age(-3_300_000, -12_000),
  age(-12_000, -10_000),
  age(-10_000, -3300),
  age(-3300, -1200),
  age(-1200, 2026),
  span(-3000, -2900),
  instant(1066),
  instant(1969),
];

const DOMAIN: [number, number] = [-3_300_000, 2026];

describe('emptyAgeSpans', () => {
  it('finds the ages nothing overlaps', () => {
    expect(emptyAgeSpans(PREHISTORY)).toEqual([
      [-3_300_000, -12_000],
      [-12_000, -10_000],
      [-10_000, -3300],
    ]);
  });

  it('does not count an age as content inside another age', () => {
    // The Stone Age brackets the Palaeolithic. If ages filled each other,
    // nothing on the real timeline would ever qualify.
    const spans = emptyAgeSpans([age(-3_300_000, -3300), age(-3_300_000, -12_000), instant(1066)]);
    expect(spans).toHaveLength(2);
  });

  it('leaves an age holding a single instant alone', () => {
    expect(emptyAgeSpans([age(-10_000, -3300), instant(-5000)])).toEqual([]);
  });

  it('treats a touching neighbour as outside, not inside', () => {
    // The Neolithic ends the year the Bronze Age begins. A closed comparison
    // would call every age occupied by whatever starts where it stops.
    expect(emptyAgeSpans([age(-10_000, -3300), span(-3300, -1200)])).toEqual([[-10_000, -3300]]);
  });

  it('keeps an age alive when an instant lands exactly on its boundary', () => {
    // Ambiguous, so it counts for both neighbours: erring toward "occupied"
    // risks a wasted stub, erring the other way hides real content under one.
    expect(emptyAgeSpans([age(-10_000, -3300), age(-3300, -1200), instant(-3300)])).toEqual([]);
  });

  it('ignores an age with no end', () => {
    expect(emptyAgeSpans([{ age: true, t0: 1945, t1: null }])).toEqual([]);
  });
});

describe('buildAxisMap', () => {
  it('is the identity when there is nothing to collapse', () => {
    const map = buildAxisMap([age(-1200, 2026), instant(1066)], [-1200, 2026]);

    expect(map.linear).toBe(true);
    expect(map.to(1066)).toBe(1066);
    expect(map.from(1066)).toBe(1066);
    expect(map.pieces).toHaveLength(1);
  });

  it('starts the axis at the domain start, so the linear case needs no thought', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);
    expect(map.to(DOMAIN[0])).toBe(DOMAIN[0]);
  });

  it('gives 3.3 million empty years the same room as a couple of centuries', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);
    const populated = 2026 - -3300;

    expect(map.linear).toBe(false);
    const stub = map.to(-12_000) - map.to(-3_300_000);
    expect(stub).toBeCloseTo(populated * COLLAPSED_SHARE, 6);
  });

  it('leaves the populated stretch at its own scale', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);

    // A century after the break is a century of axis, wherever it sits.
    expect(map.to(1100) - map.to(1000)).toBeCloseTo(100, 9);
    expect(map.to(-1200) - map.to(-1300)).toBeCloseTo(100, 9);
  });

  it('shrinks the whole domain to something a screen can hold', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);
    const axisSpan = map.to(DOMAIN[1]) - map.to(DOMAIN[0]);

    expect(axisSpan).toBeLessThan(7000);
    // The populated stretch now owns almost all of it, which is the point.
    expect((map.to(2026) - map.to(-3300)) / axisSpan).toBeGreaterThan(0.9);
  });

  it('round-trips exactly through the stretches that carry content', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);

    for (const t of [-3300, -1200, 0, 1066, 1969, 2026]) {
      expect(map.from(map.to(t))).toBeCloseTo(t, 9);
    }
  });

  /**
   * Inside a stub the round trip runs a 3.3-million-year span through a
   * hundred-odd axis units and back, so it loses a few millionths of a year to
   * floating point. That is a couple of minutes, in a stretch of time whose
   * own boundaries are marked circa and are wrong by millennia.
   */
  it('round-trips a collapsed stretch to well under a year', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);

    for (const t of [-3_300_000, -2_000_000, -1_000_000, -12_000, -11_000, -10_000]) {
      expect(Math.abs(map.from(map.to(t)) - t)).toBeLessThan(0.001);
    }
  });

  it('is monotonic, so nothing can render out of order', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);
    let previous = -Infinity;

    for (let t = -3_300_000; t <= 2026; t += 977) {
      const a = map.to(t);
      expect(a).toBeGreaterThan(previous);
      previous = a;
    }
  });

  it('extrapolates outside the domain rather than clamping', () => {
    // transformForDomainPadded routinely asks for a little beyond each end.
    const map = buildAxisMap(PREHISTORY, DOMAIN);

    expect(map.to(2126) - map.to(2026)).toBeCloseTo(100, 9);
    expect(map.to(-3_300_000) - map.to(-3_300_100)).toBeCloseTo(100, 9);
  });

  it('leaves an empty age that is merely empty, not dominant', () => {
    // Twenty barren years against nearly two thousand populated ones. Breaking
    // the axis to save 1% of it would cost more to read than it returns.
    const map = buildAxisMap([age(1000, 1020), age(1020, 3000), instant(2000)], [1000, 3000]);
    expect(map.linear).toBe(true);
  });

  it('breaks once the same age outweighs what is around it', () => {
    // The same shape with the proportions reversed.
    const map = buildAxisMap([age(1000, 2800), age(2800, 3000), instant(2900)], [1000, 3000]);
    expect(map.linear).toBe(false);
  });

  it('shares one budget out when many ages qualify', () => {
    // Twenty empty ages of 200 years against 1000 populated ones: every one of
    // them clears the threshold, so without a ceiling the stubs alone would be
    // 40% of the axis.
    const items: Occupant[] = [instant(1000)];
    for (let i = 0; i < 20; i++) items.push(age(2000 + i * 200, 2200 + i * 200));

    const map = buildAxisMap(items, [1000, 6000]);
    const collapsed = map.pieces.filter((piece) => piece.collapsed);
    const axisTaken = collapsed.reduce((sum, piece) => sum + (piece.a1 - piece.a0), 0);
    const populated = 5000 - collapsed.reduce((sum, p) => sum + (p.t1 - p.t0), 0);

    expect(collapsed).toHaveLength(20);
    expect(axisTaken).toBeLessThanOrEqual(populated * COLLAPSED_TOTAL_SHARE + 1e-9);
  });

  it('stays linear when everything is empty and there is no scale to preserve', () => {
    expect(buildAxisMap([age(0, 1000)], [0, 1000]).linear).toBe(true);
  });

  it('survives a degenerate domain', () => {
    expect(buildAxisMap(PREHISTORY, [5, 5]).linear).toBe(true);
    expect(buildAxisMap(PREHISTORY, [10, 5]).linear).toBe(true);
  });

  it('tiles the domain with no gap or overlap between pieces', () => {
    const map = buildAxisMap(PREHISTORY, DOMAIN);

    expect(map.pieces[0]!.t0).toBe(DOMAIN[0]);
    expect(map.pieces[map.pieces.length - 1]!.t1).toBe(DOMAIN[1]);
    for (let i = 1; i < map.pieces.length; i++) {
      expect(map.pieces[i]!.t0).toBe(map.pieces[i - 1]!.t1);
      expect(map.pieces[i]!.a0).toBeCloseTo(map.pieces[i - 1]!.a1, 9);
    }
  });
});

describe('linearAxisMap', () => {
  it('reports itself as linear and maps both ways unchanged', () => {
    const map = linearAxisMap([-100, 100]);

    expect(map.linear).toBe(true);
    expect(map.to(42)).toBe(42);
    expect(map.from(42)).toBe(42);
    expect(map.pieces[0]!.collapsed).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { clusterOverflow, importanceGate, relaxationFor } from '../src/lib/lod.ts';

describe('importanceGate', () => {
  it('shows only era-defining entries at full zoom-out', () => {
    expect(importanceGate(1)).toBe(1);
  });

  it('reveals everything at deepest zoom', () => {
    expect(importanceGate(1e7)).toBe(5);
  });

  it('rises monotonically with zoom', () => {
    let previous = 0;
    for (let k = 1; k <= 1e7; k *= 2) {
      const gate = importanceGate(k);
      expect(gate).toBeGreaterThanOrEqual(previous);
      previous = gate;
    }
  });

  it('stays within the importance range whatever it is given', () => {
    for (const k of [0, 0.001, 1, 1e3, 1e7, 1e12, Number.MAX_SAFE_INTEGER]) {
      const gate = importanceGate(k);
      expect(gate).toBeGreaterThanOrEqual(1);
      expect(gate).toBeLessThanOrEqual(5);
    }
  });

  it('relaxation reveals more detail without exceeding the range', () => {
    expect(importanceGate(1, 2)).toBe(3);
    expect(importanceGate(1e7, 2)).toBe(5);
  });
});

describe('relaxationFor', () => {
  it('does nothing when no filter is active', () => {
    expect(relaxationFor(30, 30)).toBe(0);
  });

  it('relaxes further the more a filter removes', () => {
    expect(relaxationFor(24, 30)).toBe(0); // 80% left
    expect(relaxationFor(15, 30)).toBe(1); // 50% left
    expect(relaxationFor(5, 30)).toBe(2); // 17% left
  });

  it('handles an empty timeline', () => {
    expect(relaxationFor(0, 0)).toBe(0);
  });
});

describe('clusterOverflow', () => {
  interface Item {
    y: number;
    t: number;
  }

  const extentOf = (i: Item) => ({ y0: i.y - 20, y1: i.y + 20 });
  const timeOf = (i: Item) => ({ t0: i.t, t1: i.t });

  it('returns nothing for no overflow', () => {
    expect(clusterOverflow<Item>([], extentOf, timeOf)).toEqual([]);
  });

  it('groups items that sit within a band of each other', () => {
    const items = [
      { y: 100, t: 1939 },
      { y: 110, t: 1940 },
      { y: 120, t: 1941 },
    ];
    const clusters = clusterOverflow(items, extentOf, timeOf, 44);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.items).toHaveLength(3);
    expect(clusters[0]!.y).toBeCloseTo(110, 6);
  });

  it('splits items that are far apart', () => {
    const items = [
      { y: 100, t: 1939 },
      { y: 500, t: 1969 },
    ];
    expect(clusterOverflow(items, extentOf, timeOf, 44)).toHaveLength(2);
  });

  it('records the time extent of its members so it can be zoomed to', () => {
    const items = [
      { y: 100, t: 1939 },
      { y: 120, t: 1945 },
    ];
    const [cluster] = clusterOverflow(items, extentOf, timeOf, 44);
    expect(cluster!.t0).toBe(1939);
    expect(cluster!.t1).toBe(1945);
  });

  it('loses nothing — every overflow item lands in exactly one cluster', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ y: (i * 53) % 900, t: 1900 + i }));
    const clusters = clusterOverflow(items, extentOf, timeOf, 44);
    const total = clusters.reduce((sum, c) => sum + c.items.length, 0);
    expect(total).toBe(items.length);

    const seen = new Set(clusters.flatMap((c) => c.items.map((i) => i.t)));
    expect(seen.size).toBe(items.length);
  });

  it('produces clusters in ascending position order', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ y: (i * 137) % 800, t: 1900 + i }));
    const clusters = clusterOverflow(items, extentOf, timeOf, 44);
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i]!.y).toBeGreaterThan(clusters[i - 1]!.y);
    }
  });
});

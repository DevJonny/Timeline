import { describe, expect, it } from 'vitest';

import { cullToViewport, labelExtent, packLanes, spanExtent } from '../src/lib/layout.ts';

const extent = (item: { y0: number; y1: number }) => item;

describe('packLanes', () => {
  it('keeps non-overlapping items in a single lane', () => {
    const items = [
      { id: 'a', y0: 0, y1: 10 },
      { id: 'b', y0: 20, y1: 30 },
      { id: 'c', y0: 40, y1: 50 },
    ];
    const result = packLanes(items, extent, 4);
    expect(result.lanes).toBe(1);
    expect(result.placed.every((p) => p.lane === 0)).toBe(true);
    expect(result.overflow).toEqual([]);
  });

  it('splits overlapping items into separate lanes', () => {
    // Iron Age and Classical Antiquity genuinely overlap.
    const items = [
      { id: 'iron-age', y0: 0, y1: 100 },
      { id: 'classical', y0: 50, y1: 200 },
    ];
    const result = packLanes(items, extent, 4);
    expect(result.lanes).toBe(2);
    expect(result.placed.map((p) => p.lane)).toEqual([0, 1]);
  });

  it('never places two overlapping items in the same lane', () => {
    // The property that actually matters, checked exhaustively.
    const items = Array.from({ length: 60 }, (_, i) => ({
      id: `e${i}`,
      y0: (i * 37) % 400,
      y1: ((i * 37) % 400) + 30,
    }));
    const result = packLanes(items, extent, 8);

    const byLane = new Map<number, typeof items>();
    for (const p of result.placed) {
      const list = byLane.get(p.lane) ?? [];
      list.push(p.item);
      byLane.set(p.lane, list);
    }

    for (const list of byLane.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          const overlaps = a.y0 < b.y1 && b.y0 < a.y1;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  it('reuses a lane once an earlier item has ended', () => {
    const items = [
      { id: 'a', y0: 0, y1: 50 },
      { id: 'b', y0: 10, y1: 60 },
      { id: 'c', y0: 70, y1: 90 },
    ];
    const result = packLanes(items, extent, 4);
    expect(result.lanes).toBe(2);
    expect(result.placed[2]!.lane).toBe(0);
  });

  it('honours the gap so adjacent labels do not touch', () => {
    const items = [
      { id: 'a', y0: 0, y1: 20 },
      { id: 'b', y0: 21, y1: 40 },
    ];
    expect(packLanes(items, extent, 4, 4).lanes).toBe(2);
    expect(packLanes(items, extent, 4, 0).lanes).toBe(1);
  });

  it('overflows rather than drawing on top of something', () => {
    const items = [
      { id: 'a', y0: 0, y1: 100 },
      { id: 'b', y0: 0, y1: 100 },
      { id: 'c', y0: 0, y1: 100 },
    ];
    const result = packLanes(items, extent, 2);
    expect(result.lanes).toBe(2);
    expect(result.placed).toHaveLength(2);
    expect(result.overflow.map((i) => i.id)).toEqual(['c']);
  });

  it('gives earlier items in the input priority when lanes run out', () => {
    // Callers pass items most-important-first, so priority is input order.
    const items = [
      { id: 'important', y0: 0, y1: 100 },
      { id: 'minor', y0: 10, y1: 90 },
    ];
    const result = packLanes(items, extent, 1);
    expect(result.placed.map((p) => p.item.id)).toEqual(['important']);
    expect(result.overflow.map((i) => i.id)).toEqual(['minor']);
  });

  it('handles an empty input', () => {
    const result = packLanes([], extent, 4);
    expect(result).toEqual({ placed: [], lanes: 0, overflow: [] });
  });
});

describe('labelExtent', () => {
  it('centres a box of the given height on the position', () => {
    expect(labelExtent(100, 20)).toEqual({ y0: 90, y1: 110 });
  });
});

describe('spanExtent', () => {
  it('leaves a tall span untouched', () => {
    expect(spanExtent(10, 200, 24)).toEqual({ y0: 10, y1: 200 });
  });

  it('grows a sub-minimum span around its centre so it stays tappable', () => {
    // A battle lasting four months is sub-pixel at century zoom, but must
    // still present a 44px touch target.
    const result = spanExtent(100, 102, 44);
    expect(result.y1 - result.y0).toBe(44);
    expect((result.y0 + result.y1) / 2).toBe(101);
  });
});

describe('cullToViewport', () => {
  it('keeps what is on screen and drops what is far away', () => {
    const items = [
      { id: 'above', y0: -5000, y1: -4000 },
      { id: 'visible', y0: 100, y1: 200 },
      { id: 'below', y0: 9000, y1: 9500 },
    ];
    const kept = cullToViewport(items, extent, 800).map((i) => i.id);
    expect(kept).toEqual(['visible']);
  });

  it('keeps items just outside the viewport so panning stays smooth', () => {
    const items = [{ id: 'just-above', y0: -150, y1: -100 }];
    expect(cullToViewport(items, extent, 800, 200)).toHaveLength(1);
  });

  it('keeps a span that straddles the whole viewport', () => {
    // The Palaeolithic covers the entire screen at most zoom levels; its
    // endpoints are both off-screen but it must still render.
    const items = [{ id: 'palaeolithic', y0: -10_000, y1: 10_000 }];
    expect(cullToViewport(items, extent, 800)).toHaveLength(1);
  });
});

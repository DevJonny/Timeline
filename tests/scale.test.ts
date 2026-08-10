import { describe, expect, it } from 'vitest';
import { zoomIdentity } from 'd3-zoom';

import {
  createBaseScale,
  rescale,
  transformForDomain,
  transformForDomainPadded,
  visibleDomain,
  yearsPerPixel,
} from '../src/lib/scale.ts';

const T_MIN = -3_299_999; // 3.3 Mya in astronomical years
const T_MAX = 2026;
const HEIGHT = 800;
const DOMAIN = [T_MIN, T_MAX] as const;

const base = () => createBaseScale(DOMAIN, HEIGHT);

describe('base scale', () => {
  it('maps the full span onto the viewport', () => {
    const b = base();
    expect(b(T_MIN)).toBeCloseTo(0, 6);
    expect(b(T_MAX)).toBeCloseTo(HEIGHT, 6);
  });

  it('shows the whole timeline at identity', () => {
    const [t0, t1] = visibleDomain(base(), zoomIdentity, HEIGHT);
    expect(t0).toBeCloseTo(T_MIN, 6);
    expect(t1).toBeCloseTo(T_MAX, 6);
  });
});

describe('transformForDomain', () => {
  it('round-trips against rescale across seven orders of magnitude', () => {
    const b = base();
    const ranges: Array<[number, number]> = [
      [T_MIN, T_MAX], // whole span
      [-10_000, 2026], // recorded history
      [-3300, -1200], // Bronze Age
      [1939, 1945], // WWII
      [1066, 1067], // a single year
      [1066.78, 1066.79], // a few days
    ];

    for (const [start, end] of ranges) {
      const transform = transformForDomain(b, start, end);
      const [t0, t1] = visibleDomain(b, transform, HEIGHT);
      expect(t0).toBeCloseTo(start, 6);
      expect(t1).toBeCloseTo(end, 6);
    }
  });

  it('produces a k equal to the ratio of full span to visible span', () => {
    const b = base();
    const transform = transformForDomain(b, 1939, 1945);
    expect(transform.k).toBeCloseTo((T_MAX - T_MIN) / 6, 4);
  });

  it('reaches WWII at a zoom level within the supported extent', () => {
    // Guards the MAX_ZOOM ceiling: if this exceeds it, zoom-to-extent would be
    // silently clamped and land on the wrong range.
    const transform = transformForDomain(base(), 1939, 1945);
    expect(transform.k).toBeLessThan(1e7);
  });

  it('falls back to identity on a degenerate range rather than dividing by zero', () => {
    const b = base();
    expect(transformForDomain(b, 1066, 1066)).toBe(zoomIdentity);
    expect(transformForDomain(b, 1945, 1939).k).toBe(1);
  });

  it('is the exact inverse of rescale', () => {
    const b = base();
    const transform = transformForDomain(b, -3300, -1200);
    const view = rescale(b, transform);
    expect(view(-3300)).toBeCloseTo(0, 6);
    expect(view(-1200)).toBeCloseTo(HEIGHT, 6);
  });
});

describe('transformForDomainPadded', () => {
  it('leaves breathing room on both sides', () => {
    const b = base();
    const [t0, t1] = visibleDomain(b, transformForDomainPadded(b, 1939, 1945, 0.1), HEIGHT);
    expect(t0).toBeCloseTo(1938.4, 4);
    expect(t1).toBeCloseTo(1945.6, 4);
  });

  it('gives an instant a finite window instead of infinite zoom', () => {
    const b = base();
    const transform = transformForDomainPadded(b, 1066, 1066);
    expect(Number.isFinite(transform.k)).toBe(true);
    const [t0, t1] = visibleDomain(b, transform, HEIGHT);
    expect(t1 - t0).toBeCloseTo(1, 6);
  });
});

describe('resize behaviour', () => {
  it('preserves the visible year range across a viewport height change', () => {
    // Rotating a device must not teleport the user. The fix is to recapture the
    // domain and re-derive the transform, not to keep the pixel offset.
    const portrait = createBaseScale(DOMAIN, 800);
    const before = visibleDomain(portrait, transformForDomain(portrait, 1939, 1945), 800);

    const landscape = createBaseScale(DOMAIN, 380);
    const after = visibleDomain(landscape, transformForDomain(landscape, before[0], before[1]), 380);

    expect(after[0]).toBeCloseTo(before[0], 6);
    expect(after[1]).toBeCloseTo(before[1], 6);
  });
});

describe('yearsPerPixel', () => {
  it('reports the full-span density at identity', () => {
    expect(yearsPerPixel(base(), zoomIdentity, HEIGHT)).toBeCloseTo((T_MAX - T_MIN) / HEIGHT, 6);
  });

  it('approaches day resolution at maximum zoom', () => {
    const b = base();
    const transform = transformForDomain(b, 1945, 1945 + 1 / 365);
    expect(yearsPerPixel(b, transform, HEIGHT)).toBeLessThan(1 / 365);
  });
});

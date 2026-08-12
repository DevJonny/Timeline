import { describe, expect, it } from 'vitest';

import {
  focusView,
  gateScaleFor,
  inheritedEntries,
  mainDomain,
  rangeExtent,
  resolveFocus,
} from '../src/lib/focus.ts';
import { importanceGate } from '../src/lib/lod.ts';
import { maxZoomFor } from '../src/lib/scale.ts';
import type { Entry, Focus } from '../src/lib/types.ts';

/** 2026-01-01, so "present" never drifts under the tests. */
const PRESENT = 2026;

function entry(id: string, start: number, end?: number, extra: Partial<Entry> = {}): Entry {
  return {
    id,
    title: id,
    type: 'event',
    start: { year: start },
    ...(end === undefined ? {} : { end: { year: end } }),
    importance: 3,
    keywords: ['rome'],
    ...extra,
  };
}

const romanEmpire = entry('roman-empire', -27, 476, { type: 'empire', importance: 1 });
const hannibal = entry('hannibal', -247, -183, { keywords: ['rome', 'carthage'] });
const holyRoman = entry('holy-roman-empire', 962, 1806, { keywords: ['rome', 'medieval'] });
const hastings = entry('battle-of-hastings', 1066, undefined, { keywords: ['england'] });

const MAIN = [romanEmpire, hannibal, holyRoman, hastings];

function focusOf(select: Partial<Focus['select']> = {}): Focus {
  return {
    schemaVersion: 1,
    id: 'roman-empire-focus',
    title: 'The Roman Empire',
    blurb: 'Augustus to the fall of the west.',
    range: { start: { year: -27 }, end: { year: 476 } },
    select: { keywords: [], include: [], exclude: [], ...select },
  };
}

describe('inheritedEntries', () => {
  it('takes main entries that match a keyword and overlap the period', () => {
    const inherited = inheritedEntries(focusOf({ keywords: ['rome'] }), MAIN, PRESENT);
    expect(inherited.map((e) => e.id)).toEqual(['roman-empire']);
  });

  it('leaves out entries whose keywords match but whose dates do not', () => {
    // Both carry "rome"; neither overlaps 27 BCE – 476 CE.
    const inherited = inheritedEntries(focusOf({ keywords: ['rome'] }), MAIN, PRESENT);
    expect(inherited.map((e) => e.id)).not.toContain('hannibal');
    expect(inherited.map((e) => e.id)).not.toContain('holy-roman-empire');
  });

  it('inherits nothing when no keyword is declared', () => {
    expect(inheritedEntries(focusOf(), MAIN, PRESENT)).toEqual([]);
  });

  it('an explicit include overrides both the keyword and the date test', () => {
    const inherited = inheritedEntries(focusOf({ include: ['hannibal'] }), MAIN, PRESENT);
    expect(inherited.map((e) => e.id)).toEqual(['hannibal']);
  });

  it('exclude beats a keyword match', () => {
    const inherited = inheritedEntries(
      focusOf({ keywords: ['rome'], exclude: ['roman-empire'] }),
      MAIN,
      PRESENT,
    );
    expect(inherited).toEqual([]);
  });

  it('exclude beats an explicit include, so one rule always wins', () => {
    const inherited = inheritedEntries(
      focusOf({ include: ['hannibal'], exclude: ['hannibal'] }),
      MAIN,
      PRESENT,
    );
    expect(inherited).toEqual([]);
  });

  it('counts an entry that merely overlaps an edge of the period', () => {
    const straddling = entry('punic-aftermath', -100, 14);
    const inherited = inheritedEntries(
      focusOf({ keywords: ['rome'] }),
      [...MAIN, straddling],
      PRESENT,
    );
    expect(inherited.map((e) => e.id)).toContain('punic-aftermath');
  });
});

describe('resolveFocus', () => {
  const own = [
    entry('battle-of-actium', -31),
    entry('year-of-the-four-emperors', 69),
    entry('principate', -27, 284, { type: 'age', importance: 1 }),
  ];

  it('renders inherited and own entries together', () => {
    const resolved = resolveFocus(focusOf({ keywords: ['rome'] }), MAIN, own, PRESENT);
    expect(resolved.entries).toHaveLength(4);
    expect(resolved.inherited.map((e) => e.id)).toEqual(['roman-empire']);
    expect(resolved.own).toHaveLength(3);
  });

  it('opens on the declared period', () => {
    const resolved = resolveFocus(focusOf({ keywords: ['rome'] }), MAIN, own, PRESENT);
    expect(resolved.initialView).toEqual(rangeExtent(focusOf().range, PRESENT));
  });

  it('does not stretch the domain to the present day', () => {
    const resolved = resolveFocus(focusOf({ keywords: ['rome'] }), MAIN, own, PRESENT);
    expect(resolved.domain[1]).toBeLessThan(500);
  });

  it('widens the domain to hold an entry that starts before the period', () => {
    // Actium is 31 BCE, four years before the declared start.
    const resolved = resolveFocus(focusOf({ keywords: ['rome'] }), MAIN, own, PRESENT);
    expect(resolved.domain[0]).toBeLessThan(resolved.initialView[0]);
  });

  it('widens the domain to hold an out-of-period include rather than dropping it', () => {
    const resolved = resolveFocus(focusOf({ include: ['hannibal'] }), MAIN, own, PRESENT);
    expect(resolved.entries.map((e) => e.id)).toContain('hannibal');
    // 247 BCE is astronomical -246.
    expect(resolved.domain[0]).toBeLessThan(-200);
  });

  it('never renders one id twice when a focus entry shadows a main one', () => {
    const shadow = entry('roman-empire', 100, 200);
    const resolved = resolveFocus(focusOf({ keywords: ['rome'] }), MAIN, [shadow], PRESENT);
    const ids = resolved.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(resolved.inherited).toEqual([]);
  });

  it('falls back to the declared period when the focus is empty', () => {
    const resolved = resolveFocus(focusOf(), MAIN, [], PRESENT);
    expect(resolved.domain).toEqual(resolved.initialView);
  });
});

describe('mainDomain', () => {
  it('always runs to the present, whatever the data ends at', () => {
    expect(mainDomain([entry('x', 1000, 1100)], PRESENT)[1]).toBe(PRESENT);
  });

  it('starts at the earliest entry', () => {
    expect(mainDomain(MAIN, PRESENT)[0]).toBeCloseTo(-246, 6);
  });
});

describe('gate calibration across the two timelines', () => {
  const main = mainDomain(
    [entry('palaeolithic', -3_300_000, -12_000), entry('now', 2000)],
    PRESENT,
  );
  const mainSpan = main[1] - main[0];

  it('leaves the main timeline unscaled', () => {
    expect(gateScaleFor(mainSpan, mainSpan)).toBe(1);
  });

  it('opens a focus on real detail rather than a bare band', () => {
    // Five centuries on screen: the main timeline would call that gate 3, and
    // so must the focus, or entering it would show nothing but its chapters.
    const focusSpan = 503;
    const scale = gateScaleFor(mainSpan, focusSpan);
    expect(importanceGate(1 * scale)).toBe(importanceGate(mainSpan / focusSpan));
    expect(importanceGate(1 * scale)).toBeGreaterThanOrEqual(3);
  });

  /**
   * The property the whole calibration rests on: because the zoom ceiling and
   * the gate scale are both the domain span over a constant, they cancel. A
   * focus's zoom range therefore maps onto *exactly* the main timeline's gate
   * progression — the same visible span earns the same detail, wherever you
   * are reading it.
   */
  it('gives a focus the same gate progression as the main timeline', () => {
    for (const span of [mainSpan, 503, 80, 5000]) {
      const scale = gateScaleFor(mainSpan, span);

      for (let step = 0; step <= 20; step++) {
        const k = Math.min(maxZoomFor(span), 1 * Math.pow(maxZoomFor(span), step / 20));
        const equivalent = k * scale;
        // The main timeline showing the same number of years on screen.
        const mainK = mainSpan / (span / k);
        expect(importanceGate(equivalent)).toBe(importanceGate(mainK));
      }
    }
  });

  it('bottoms out at the same detail level as the main timeline does', () => {
    const deepest = importanceGate(maxZoomFor(mainSpan));
    for (const span of [503, 80, 5000]) {
      const scale = gateScaleFor(mainSpan, span);
      expect(importanceGate(maxZoomFor(span) * scale)).toBe(deepest);
    }
  });

  it('is a no-op for a degenerate span rather than an Infinity', () => {
    expect(gateScaleFor(mainSpan, 0)).toBe(1);
    expect(gateScaleFor(0, 100)).toBe(1);
  });
});

describe('focusView', () => {
  it('names the ids whose prose lives in the focus, and only those', () => {
    const own = [entry('battle-of-actium', -31)];
    const view = focusView(focusOf({ keywords: ['rome'] }), MAIN, own, PRESENT);

    expect(view.ownIds.has('battle-of-actium')).toBe(true);
    expect(view.ownIds.has('roman-empire')).toBe(false);
    expect(view.id).toBe('roman-empire-focus');
    expect(view.gateScale).toBeGreaterThan(1);
  });
});

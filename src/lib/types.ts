/**
 * Domain types and runtime constants.
 *
 * This module MUST NOT import zod. The app imports `TYPE_FAMILY` and friends as
 * real runtime values, so anything imported here lands in the browser bundle.
 * Validation lives in `schema.ts`, which is script/test-only.
 */

export const ENTRY_TYPES = [
  'age',
  'empire',
  'ruler',
  'person',
  'war',
  'battle',
  'event',
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];

/**
 * Colour families. Four validated hues carry seven types.
 *
 * The palette was chosen by measurement, not taste: timeline markers of
 * different types sit adjacent arbitrarily, so the palette must clear the
 * *all-pairs* colourblind test. Every subset of the reference palette larger
 * than four fails it. Types therefore share hues and are separated by glyph.
 *
 * Do not add a fifth hue without re-running the palette validator.
 */
export const FAMILIES = ['age', 'empire', 'people', 'conflict', 'event'] as const;
export type Family = (typeof FAMILIES)[number];

export const TYPE_FAMILY: Record<EntryType, Family> = {
  age: 'age',
  empire: 'empire',
  ruler: 'people',
  person: 'people',
  war: 'conflict',
  battle: 'conflict',
  event: 'event',
};

/**
 * Glyphs are MANDATORY, not decorative: the validated palette carries a
 * colourblind-separation warning in dark mode that is only permissible with a
 * secondary encoding channel. Colour alone must never distinguish a type.
 */
export const TYPE_GLYPH: Record<EntryType, string> = {
  age: 'band',
  empire: 'band',
  ruler: 'crown',
  person: 'dot',
  war: 'banner',
  battle: 'swords',
  event: 'diamond',
};

export const TYPE_LABEL: Record<EntryType, string> = {
  age: 'Age',
  empire: 'Empire',
  ruler: 'Ruler',
  person: 'Person',
  war: 'War',
  battle: 'Battle',
  event: 'Event',
};

/**
 * A point in time.
 *
 * `year` is signed and uses the *historical* convention the data is authored
 * in: -3300 means 3300 BCE, 1066 means 1066 CE. There is no year 0 — the
 * schema rejects it. Conversion to the continuous astronomical coordinate used
 * by the axis happens in `time.ts`.
 */
export interface TimePoint {
  year: number;
  month?: number;
  day?: number;
  /** Renders as "c. 3300 BCE" and signals the date is approximate. */
  circa?: boolean;
}

/** `'present'` resolves to today's date at load time, recomputed every load. */
export type EndPoint = TimePoint | 'present';

export interface Entry {
  id: string;
  title: string;
  type: EntryType;
  start: TimePoint;
  /** Absent for instantaneous entries (a battle, a signing). */
  end?: EndPoint;
  /** 1 = era-defining, 5 = minor. Drives the level-of-detail gate. */
  importance: number;
  keywords: string[];
}

export interface EntriesFile {
  schemaVersion: 1;
  entries: Entry[];
}

/** Stored separately at /data/details/{id}.json and fetched lazily. */
export interface Detail {
  id: string;
  short: string;
  full: string;
}

// --- focused timelines ------------------------------------------------------

/**
 * Which main-timeline entries a focus inherits.
 *
 * A selector rather than a list of ids, so a focus keeps up with the main
 * timeline: adding a Roman entry to `entries.json` puts it in the Roman focus
 * without anyone remembering to also list it there. `include` and `exclude`
 * are the escape hatches for what keywords get wrong in either direction.
 */
export interface FocusSelector {
  /** A main entry carrying any of these, and overlapping the range, joins. */
  keywords: string[];
  /** Ids pulled in whatever their keywords say. */
  include: string[];
  /** Ids kept out whatever else says. Beats both of the above. */
  exclude: string[];
}

/** The period a focus covers. `end` may be `'present'` for an open subject. */
export interface FocusRange {
  start: TimePoint;
  end: EndPoint;
}

/**
 * A focused timeline: the same render pipeline over one subject's dataset.
 *
 * Its entries live in a sibling `entries.json` and are authored at a finer
 * grain than the main timeline could ever show. Note that `range` is the
 * *opening view*, not the axis domain — see `resolveFocus` in focus.ts, which
 * widens the domain to hold anything the selector drags in from outside.
 */
export interface Focus {
  schemaVersion: 1;
  id: string;
  title: string;
  /** One sentence, shown in the menu. */
  blurb: string;
  /** The main-timeline entry this focus expands, when there is one. */
  subject?: string;
  range: FocusRange;
  select: FocusSelector;
}

/**
 * A focus as the menu needs it, without fetching every focus file.
 *
 * These fields are duplicated from `focus.json` deliberately: one small
 * request renders the whole menu. Validation asserts the copies match, so the
 * duplication cannot drift.
 */
export interface FocusSummary {
  id: string;
  title: string;
  blurb: string;
  range: FocusRange;
}

export interface FocusIndex {
  schemaVersion: 1;
  focuses: FocusSummary[];
}

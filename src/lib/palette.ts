/**
 * Presentation mapping for the validated colour system.
 *
 * The hues themselves live in `app.css` as custom properties. Four hues carry
 * seven types because every larger subset of the reference palette fails the
 * all-pairs colourblind test — markers of different types sit adjacent
 * arbitrarily on a timeline, so the easier adjacent-pairs test does not apply.
 *
 * Two rules fall out of the validation report and are not negotiable:
 *  - dark mode carries a CVD warning on conflict-vs-age, legal only with a
 *    secondary encoding, so every marker also renders a glyph;
 *  - light mode puts people and conflict under 3:1 contrast, which triggers
 *    the relief rule, so every marker also renders a visible text label.
 */

import { FAMILIES, TYPE_FAMILY, TYPE_LABEL, type EntryType, type Family } from './types.ts';

export function familyColour(type: EntryType): string {
  return `var(--family-${TYPE_FAMILY[type]})`;
}

export const FAMILY_TITLE: Record<Family, string> = {
  age: 'Ages',
  empire: 'Empires',
  people: 'Rulers & people',
  conflict: 'Wars & battles',
  event: 'Events',
};

/** One representative type per family, for the legend's glyph. */
export const FAMILY_EXEMPLAR: Record<Family, EntryType> = {
  age: 'age',
  empire: 'empire',
  people: 'ruler',
  conflict: 'war',
  event: 'event',
};

export function legendEntries(): Array<{ family: Family; title: string; type: EntryType }> {
  return FAMILIES.map((family) => ({
    family,
    title: FAMILY_TITLE[family],
    type: FAMILY_EXEMPLAR[family],
  }));
}

export { TYPE_LABEL };

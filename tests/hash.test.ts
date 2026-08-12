import { describe, expect, it } from 'vitest';

import { buildHash, NOWHERE, readLocation } from '../src/lib/hash.ts';

describe('readLocation', () => {
  it('reads an entry on the main timeline', () => {
    expect(readLocation('#/e/battle-of-hastings')).toEqual({
      focus: null,
      entry: 'battle-of-hastings',
    });
  });

  it('reads a focused timeline', () => {
    expect(readLocation('#/f/roman-empire')).toEqual({ focus: 'roman-empire', entry: null });
  });

  it('reads an entry within a focused timeline', () => {
    expect(readLocation('#/f/roman-empire/e/battle-of-actium')).toEqual({
      focus: 'roman-empire',
      entry: 'battle-of-actium',
    });
  });

  it('still reads links shared before focuses existed', () => {
    // The #/e/ form is the only one that has ever been published; changing its
    // meaning would break every link already in the wild.
    expect(readLocation('#/e/hms-victory').entry).toBe('hms-victory');
  });

  it('lands nowhere rather than throwing on anything unrecognised', () => {
    for (const hash of [
      '',
      '#',
      '#/',
      '#/x/y',
      '#/e/',
      '#/e/Not A Slug',
      '#/e/two/segments',
      '#/f/',
      '#/f//e/x',
      '#/f/rome/e/',
      '#/f/rome/x/thing',
    ]) {
      expect(readLocation(hash), hash).toEqual(NOWHERE);
    }
  });

  it('drops an entry it cannot trust but keeps a focus it can', () => {
    expect(readLocation('#/f/roman-empire/e/NOT VALID')).toEqual({
      focus: 'roman-empire',
      entry: null,
    });
  });

  it('decodes percent-encoding before validating', () => {
    expect(readLocation('#/e/battle-of-hastings%20').entry).toBe('battle-of-hastings');
  });
});

describe('buildHash', () => {
  it('round-trips every location it can express', () => {
    const locations = [
      { focus: null, entry: 'hms-victory' },
      { focus: 'roman-empire', entry: null },
      { focus: 'roman-empire', entry: 'battle-of-actium' },
    ];
    for (const location of locations) {
      expect(readLocation(buildHash(location))).toEqual(location);
    }
  });

  it('has an empty form for nowhere, so leaving clears the hash', () => {
    expect(buildHash(NOWHERE)).toBe('');
  });
});

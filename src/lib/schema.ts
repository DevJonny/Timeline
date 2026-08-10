/**
 * Runtime validation for the data files.
 *
 * zod is a devDependency and this module is imported ONLY by
 * `scripts/validate-data.ts` and tests — never by app code — so it costs
 * nothing in the browser bundle. The app consumes `types.ts` instead.
 *
 * The `Assert<Eq<...>>` checks at the bottom make `tsc` fail if these schemas
 * ever drift from the hand-written types.
 */

import { z } from 'zod';
import { ENTRY_TYPES } from './types.ts';
import type { Detail, EntriesFile, Entry, TimePoint } from './types.ts';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const timePointSchema = z
  .strictObject({
    year: z
      .number()
      .int()
      .refine((y) => y !== 0, {
        message: 'year 0 does not exist: 1 BCE is followed directly by 1 CE',
      }),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    circa: z.boolean().optional(),
  })
  .refine((p) => p.day === undefined || p.month !== undefined, {
    message: 'day requires month',
  });

export const endPointSchema = z.union([timePointSchema, z.literal('present')]);

export const entrySchema = z.strictObject({
  id: z.string().regex(SLUG, 'id must be a lowercase hyphenated slug'),
  title: z.string().min(1),
  type: z.enum(ENTRY_TYPES),
  start: timePointSchema,
  end: endPointSchema.optional(),
  importance: z.number().int().min(1).max(5),
  keywords: z
    .array(z.string().regex(SLUG, 'keywords must be lowercase hyphenated slugs'))
    .min(1),
});

export const entriesFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  entries: z.array(entrySchema).min(1),
});

export const detailSchema = z.strictObject({
  id: z.string().regex(SLUG),
  short: z.string().min(1),
  full: z.string().min(1),
});

// --- drift guards: these fail compilation if schema and types diverge -------

type Assert<T extends true> = T;
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type _TimePointMatches = Assert<Eq<z.infer<typeof timePointSchema>, TimePoint>>;
export type _EntryMatches = Assert<Eq<z.infer<typeof entrySchema>, Entry>>;
export type _EntriesFileMatches = Assert<Eq<z.infer<typeof entriesFileSchema>, EntriesFile>>;
export type _DetailMatches = Assert<Eq<z.infer<typeof detailSchema>, Detail>>;

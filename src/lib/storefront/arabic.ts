/**
 * Amira Store — Arabic-aware text normalization for search (PHASE-05 tasks 6–8).
 *
 * MASTER_PLAN §19: search must be Arabic-aware — exact/prefix matches on
 * normalized text plus typo-tolerant (fuzzy) matching where practical.
 *
 * Arabic shoppers type with or without tashkeel (diacritics), with any alef
 * form (أ/إ/آ/ٱ), and may mix ى/ي and ة/ه. Matching therefore happens on a
 * NORMALIZED form of both the indexed columns and the query:
 *
 *   - delete tashkeel (U+064B–U+0652), superscript alef (U+0670), tatweel (U+0640)
 *   - unify alef forms  → ا
 *   - ى → ي  (alef maqsura → ya)
 *   - ة → ه  (taa marbuta → haa)
 *   - ؤ → و  ، ئ → ي  (hamza carriers → base letter)
 *   - Latin lowercased; whitespace collapsed + trimmed
 *
 * SINGLE SOURCE OF TRUTH: the TypeScript map object below programmatically
 * DERIVES both matching implementations —
 *   1. `normalizeArabic()` (TypeScript: query side, ranking, tests)
 *   2. `normalizeSqlExpr()` (PostgreSQL translate() over the same pairs)
 * Hand-typed RTL string literals are FORBIDDEN here on purpose: their visual
 * order is not their codepoint order, which silently scrambled the original
 * hand-written translate() pair (caught by verify-storefront [1]). The two
 * outputs are proven byte-equivalent by verify-storefront [1] on a corpus.
 */

import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/** One-to-one character map (applied in the same order on both sides). */
const ARABIC_CHAR_MAP: ReadonlyArray<readonly [from: string, to: string]> = [
  ['\u0623', '\u0627'], // أ → ا
  ['\u0625', '\u0627'], // إ → ا
  ['\u0622', '\u0627'], // آ → ا
  ['\u0671', '\u0627'], // ٱ → ا
  ['\u0649', '\u064A'], // ى → ي
  ['\u0629', '\u0647'], // ة → ه
  ['\u0624', '\u0648'], // ؤ → و
  ['\u0626', '\u064A'], // ئ → ي
];

/** Characters deleted outright (tatweel, the 8 tashkeel marks, superscript alef). */
const ARABIC_DELETE_CHARS =
  '\u0640' + // tatweel
  '\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652' + // tashkeel U+064B..U+0652
  '\u0670'; // superscript alef

const FROM_SQL = ARABIC_CHAR_MAP.map(([from]) => from).join('') + ARABIC_DELETE_CHARS;
const TO_SQL = ARABIC_CHAR_MAP.map(([, to]) => to).join('');

const MAP_LOOKUP = new Map(ARABIC_CHAR_MAP);
const MAP_TEST_RE = new RegExp([...MAP_LOOKUP.keys()].join('|'), 'g');
const DELETE_RE = new RegExp(`[${ARABIC_DELETE_CHARS}]`, 'g');

/** Normalize one text value for matching (TypeScript side). */
export function normalizeArabic(input: string): string {
  return input
    .toLowerCase()
    .replace(DELETE_RE, '')
    .replace(MAP_TEST_RE, (ch) => MAP_LOOKUP.get(ch) ?? ch)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * SQL expression that normalizes a column exactly like `normalizeArabic()`.
 * translate() applies the map + deletes the tail characters (TO shorter than
 * FROM); regexp_replace + btrim mirror the query-side whitespace handling so
 * the two implementations are byte-equivalent on every input.
 */
export function normalizeSqlExpr(column: SQLWrapper): SQL {
  return sql`btrim(regexp_replace(translate(lower(${column}), ${FROM_SQL}, ${TO_SQL}), '\\s+', ' ', 'g'))`;
}

/** Escape LIKE wildcards in a normalized query before embedding in a pattern. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

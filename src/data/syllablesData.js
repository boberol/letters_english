// Words split into syllables, for the syllable builder.
//
// The words, their pictures and their syllables all live in wordsData.js; this
// is the part of that bank with something to build - two syllables or more.

import { wordsData } from './wordsData';

export const syllablesData = wordsData.filter((word) => word.syllables.length >= 2);

// An open syllable is a vowel with at most one consonant in front of it: BA,
// NA, U. Words made only of those (BA-NA-NA, U-FO, RA-DI-O) are the easiest to
// put together, so they come before anything with a consonant cluster.
const OPEN_SYLLABLE = /^[^AEIOUY]?[AEIOUY]$/;

/**
 * How hard a word is to build, for ordering: fewer syllables first, and among
 * words of the same length the all-open ones before the rest.
 */
export const syllableTier = (word) =>
  word.syllables.length * 2 + (word.syllables.every((s) => OPEN_SYLLABLE.test(s)) ? 0 : 1);

// Decoys look like pieces of real English words, so a wrong tile does not
// stand out as obvious filler.
const COMMON_SYLLABLES = [
  'BA', 'DA', 'LA', 'MA', 'NA', 'PA', 'TA',
  'BO', 'GO', 'LO', 'MO', 'NO', 'PO', 'SO', 'TO',
  'BI', 'DI', 'LI', 'MI', 'PI', 'TI',
  'BU', 'DU', 'LU', 'MU', 'PU',
  'ER', 'IN', 'UN', 'ET', 'OP', 'EN',
  'TER', 'PER', 'DER', 'LER', 'BLE', 'TLE', 'KET', 'LOW', 'POT', 'SUN'
];

/**
 * Shuffled syllable tiles for one word, plus a few decoys.
 * Mirrors generateScramble in wordsData.js so the two tools behave alike.
 *
 * @param syllables the word's own syllables, in order
 * @param extraCount how many decoy syllables to mix in
 */
export function generateSyllableTiles(syllables, extraCount = 2) {
  const own = syllables.map((syllable, index) => ({
    id: `syl-w-${index}-${syllable}-${Math.random().toString(36).slice(2, 6)}`,
    text: syllable,
    isExtra: false
  }));

  // Never offer a decoy that is already part of the word: it would be a second
  // correct-looking copy of a tile the child needs, which is unfair rather than
  // difficult.
  const available = COMMON_SYLLABLES.filter((s) => !syllables.includes(s));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  const extras = available.slice(0, Math.max(0, extraCount)).map((syllable, index) => ({
    id: `syl-e-${index}-${syllable}-${Math.random().toString(36).slice(2, 6)}`,
    text: syllable,
    isExtra: true
  }));

  const tiles = [...own, ...extras];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

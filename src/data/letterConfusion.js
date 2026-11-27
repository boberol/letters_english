// Which letters a child is likely to mix up with which.
//
// Used to pick distractors that are worth thinking about. A grid of "a" against
// w, j and z teaches nothing, because the answer can be spotted without reading
// anything; "a" against o, e and c makes the child actually look at the shape.

// Letters that look alike: round bodies, tall stems, the same shape flipped.
// Only letters of the Polish alphabet: Q and V are not in it, and a game must
// never offer a letter the child is not learning.
const SHAPE_LOOKALIKES = {
  a: ['o', 'e', 'c', 'g', 'd'],
  b: ['d', 'p', 'h', 'k'],
  c: ['e', 'o', 'a', 's'],
  d: ['b', 'p', 'a', 'g'],
  e: ['c', 'a', 'o', 's'],
  f: ['t', 'l', 'j'],
  g: ['y', 'a', 'j', 'p'],
  h: ['n', 'b', 'k', 'm'],
  i: ['j', 'l', 't'],
  j: ['i', 'g', 'y'],
  k: ['h', 'b', 'r'],
  l: ['i', 't', 'j', 'f'],
  m: ['n', 'w', 'h'],
  n: ['m', 'h', 'u', 'r'],
  o: ['a', 'c', 'e', 'u'],
  p: ['b', 'd', 'g', 'r'],
  r: ['n', 'p', 'k'],
  s: ['c', 'e', 'z'],
  t: ['f', 'l', 'i'],
  u: ['n', 'o', 'w'],
  w: ['m', 'u', 'n'],
  y: ['g', 'j', 'w'],
  z: ['s', 'n', 'w']
};

// Polish letters that differ from their base only by a diacritic. Telling these
// apart is its own skill, so they are held back for the hardest setting.
export const DIACRITIC_PAIRS = [
  ['a', 'ą'],
  ['c', 'ć'],
  ['e', 'ę'],
  ['l', 'ł'],
  ['n', 'ń'],
  ['o', 'ó'],
  ['s', 'ś'],
  ['z', 'ż'],
  ['z', 'ź']
];

// The accented partner of a letter, if it has one.
export const diacriticPartners = (letter) => {
  const base = letter.toLowerCase();
  const found = [];
  for (const [plain, accented] of DIACRITIC_PAIRS) {
    if (plain === base) found.push(accented);
    if (accented === base) found.push(plain);
  }
  return found;
};

// Whether two letters are on each other's look-alike lists.
const looksLike = (a, b) =>
  (SHAPE_LOOKALIKES[a] || []).includes(b) || (SHAPE_LOOKALIKES[b] || []).includes(a);

/**
 * Distractor letters for a round, hardest-to-tell-apart first.
 *
 * @param letter          the answer
 * @param count           how many distractors are needed
 * @param includeDiacritics let accented look-alikes in (hardest setting only)
 * @param lookalikes      false for the easiest setting: every distractor is a
 *                        clearly different shape, never one that looks alike
 * @param pool            the alphabet to fall back on once look-alikes run out;
 *                        look-alikes outside it are skipped
 */
export const confusableLetters = (
  letter,
  count,
  { includeDiacritics = false, lookalikes = true, pool = [] } = {}
) => {
  const base = letter.toLowerCase();
  const seen = new Set([base]);
  const picked = [];
  const inPool = (c) => pool.length === 0 || pool.some((l) => l.toLowerCase() === c);

  const take = (candidate) => {
    const c = candidate.toLowerCase();
    if (seen.has(c) || picked.length >= count) return;
    seen.add(c);
    picked.push(c);
  };

  if (lookalikes) {
    if (includeDiacritics) diacriticPartners(base).forEach(take);
    (SHAPE_LOOKALIKES[base] || []).filter(inPool).forEach(take);
  }

  // Not enough near-misses for this letter: top up from the rest of the
  // alphabet so a round always has a full grid.
  if (picked.length < count) {
    const rest = pool.filter((l) => {
      const c = l.toLowerCase();
      return !seen.has(c) && (lookalikes || !looksLike(base, c));
    });
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    rest.forEach(take);
  }

  return picked.slice(0, count);
};

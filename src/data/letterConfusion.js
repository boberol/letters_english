// Which letters a child is likely to mix up with which.
//
// Used to pick distractors that are worth thinking about. A grid of "a" against
// w, j and z teaches nothing, because the answer can be spotted without reading
// anything; "a" against o, e and c makes the child actually look at the shape.

// Letters that look alike: round bodies, tall stems, the same shape flipped.
const SHAPE_LOOKALIKES = {
  a: ['o', 'e', 'c', 'g', 'd', 'q'],
  b: ['d', 'p', 'q', 'h', 'k'],
  c: ['e', 'o', 'a', 's'],
  d: ['b', 'q', 'p', 'a', 'g'],
  e: ['c', 'a', 'o', 's'],
  f: ['t', 'l', 'j'],
  g: ['q', 'y', 'a', 'j', 'p'],
  h: ['n', 'b', 'k', 'm'],
  i: ['j', 'l', 't'],
  j: ['i', 'g', 'y'],
  k: ['h', 'b', 'r', 'x'],
  l: ['i', 't', 'j', 'f'],
  m: ['n', 'w', 'h'],
  n: ['m', 'h', 'u', 'r'],
  o: ['a', 'c', 'e', 'u'],
  p: ['q', 'b', 'd', 'g', 'r'],
  q: ['p', 'g', 'd', 'b', 'a'],
  r: ['n', 'p', 'k'],
  s: ['c', 'e', 'z'],
  t: ['f', 'l', 'i'],
  u: ['n', 'v', 'o', 'w'],
  v: ['w', 'y', 'u', 'x'],
  w: ['m', 'v', 'u', 'n'],
  x: ['k', 'y', 'v', 'z'],
  y: ['v', 'g', 'j', 'x'],
  z: ['s', 'x', 'n']
};

// Letters that are one shape turned or flipped: b d p q, and m w, n u. Every
// young writer reverses these, so the hardest setting puts them first among the
// distractors rather than leaving them to the look-alike lists below.
export const MIRROR_PAIRS = [
  ['b', 'd'],
  ['b', 'p'],
  ['d', 'q'],
  ['p', 'q'],
  ['m', 'w'],
  ['n', 'u']
];

// The mirror partners of a letter, if it has any.
export const mirrorPartners = (letter) => {
  const base = letter.toLowerCase();
  const found = [];
  for (const [one, other] of MIRROR_PAIRS) {
    if (one === base) found.push(other);
    if (other === base) found.push(one);
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
 * @param includeMirrors  put the mirror-image letters first (hardest setting only)
 * @param lookalikes      false for the easiest setting: every distractor is a
 *                        clearly different shape, never one that looks alike
 * @param pool            the alphabet to fall back on once look-alikes run out;
 *                        look-alikes outside it are skipped
 */
export const confusableLetters = (
  letter,
  count,
  { includeMirrors = false, lookalikes = true, pool = [] } = {}
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
    if (includeMirrors) mirrorPartners(base).filter(inPool).forEach(take);
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

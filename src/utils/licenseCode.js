// The shape of the activation code a parent types in - nothing about what it
// unlocks, and nothing that talks to the network. Both the app and the batch
// generator (`license_codes.mjs`) import this, so a code minted on your machine
// and a code typed on a tablet are checked by the same rules.
//
// Crockford Base32: the digits and the capitals minus I, L, O and U. A code is
// read off a card and typed on a tablet keyboard, so the alphabet must not hold
// two characters that look alike. `normaliseCode` then folds the substitutions
// a person actually makes - I and L for one, O for zero - instead of rejecting
// them, and drops the grouping dashes, so "7k4m 92xq b3tp" and "7K4M-92XQ-B3TP"
// are the same code.
//
// The Cloudflare Worker carries its own copy of `normaliseCode` rather than
// importing this: it is a separate deployable, and it must not take the
// client's word for what the canonical form of a code is.

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// 11 random characters is 55 bits. The check character catches the typo before
// it costs a network round trip and before it counts against the rate limit -
// it is a convenience, never the authority. Only the server decides whether a
// code exists.
export const CODE_DATA_LENGTH = 11;
export const CODE_LENGTH = CODE_DATA_LENGTH + 1;
export const CODE_GROUP = 4;

// I and L are read as one, O as zero. U is not in the alphabet and is not
// mapped to anything: it is dropped, the length check then fails, and the
// parent is told to look at the code again rather than being sent to the
// server with a corrupted guess.
const LOOKALIKES = { I: '1', L: '1', O: '0' };

/**
 * Fold whatever was typed into the one canonical form the server hashes.
 * Returns '' for anything that is not a string.
 */
export const normaliseCode = (input) => {
  if (typeof input !== 'string') return '';
  let out = '';
  for (const typed of input.toUpperCase()) {
    const ch = LOOKALIKES[typed] ?? typed;
    if (CODE_ALPHABET.includes(ch)) out += ch;
  }
  return out;
};

/**
 * The check character for a run of data characters, or null if any of them is
 * not in the alphabet. Weighted by position, so a transposition changes it.
 */
export const codeChecksum = (data) => {
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const value = CODE_ALPHABET.indexOf(data[i]);
    if (value < 0) return null;
    sum += value * (i + 1);
  }
  return CODE_ALPHABET[sum % CODE_ALPHABET.length];
};

/** Does this canonical code have the right length and check character? */
export const isWellFormedCode = (canonical) =>
  typeof canonical === 'string' &&
  canonical.length === CODE_LENGTH &&
  codeChecksum(canonical.slice(0, CODE_DATA_LENGTH)) === canonical[CODE_DATA_LENGTH];

/** Canonical form to the grouped form printed on a card: 7K4M-92XQ-B3TP. */
export const formatCode = (canonical) =>
  (canonical.match(new RegExp(`.{1,${CODE_GROUP}}`, 'g')) || []).join('-');

/**
 * Mint one code.
 *
 * @param randomBytes (n) => Uint8Array of n cryptographically random bytes,
 *        so this works unchanged in Node and in a browser.
 */
export const makeCode = (randomBytes) => {
  // 256 is a whole number of alphabets, so the remainder is unbiased.
  const bytes = randomBytes(CODE_DATA_LENGTH);
  let data = '';
  for (let i = 0; i < CODE_DATA_LENGTH; i += 1) {
    data += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return data + codeChecksum(data);
};

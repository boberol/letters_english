// Rewards for collecting stars. Ordered by cost, so the next one to unlock is
// simply the first locked entry in this list.
//
// A sticker is something to *do* something with: every one the child owns can be
// stuck onto the pictures in the sticker book (see StickerBook and
// utils/stickerScene.js), as many times as they like. So the set is chosen for
// those pictures - things that live on a meadow, in the sea or in space - and
// the order mixes the three, so whichever picture a child likes best gets
// something new every few stickers.
//
// The gaps widen deliberately: the first few arrive every three or four stars
// so a child sees the point of the sticker book on their first sitting, and
// later ones ask for a few sessions' work. Not every two: a success pays up to
// three stars, so at two the announcement came after almost every success. The last is at 200: every letter traced
// cleanly is 96 stars, and the picture games hold several hundred more.
//
// `emoji` is the lookup key for the bundled Noto drawing in assets/pictures/
// (named by codepoint) and the fallback glyph if one is missing.
export const stickers = [
  { id: 'bee', emoji: '🐝', label: 'Pszczółka', atStars: 3 },
  { id: 'flower', emoji: '🌸', label: 'Kwiatek', atStars: 6 },
  { id: 'star', emoji: '⭐', label: 'Gwiazdka', atStars: 10 },
  { id: 'fish', emoji: '🐠', label: 'Rybka', atStars: 14 },
  { id: 'cat', emoji: '🐱', label: 'Kotek', atStars: 18 },
  { id: 'ladybug', emoji: '🐞', label: 'Biedronka', atStars: 22 },
  { id: 'moon', emoji: '🌙', label: 'Księżyc', atStars: 26 },
  { id: 'rainbow', emoji: '🌈', label: 'Tęcza', atStars: 30 },
  { id: 'butterfly', emoji: '🦋', label: 'Motylek', atStars: 34 },
  { id: 'dolphin', emoji: '🐬', label: 'Delfin', atStars: 38 },
  { id: 'rabbit', emoji: '🐰', label: 'Króliczek', atStars: 42 },
  { id: 'rocket', emoji: '🚀', label: 'Rakieta', atStars: 46 },
  { id: 'octopus', emoji: '🐙', label: 'Ośmiornica', atStars: 50 },
  { id: 'frog', emoji: '🐸', label: 'Żabka', atStars: 54 },
  { id: 'planet', emoji: '🪐', label: 'Planeta', atStars: 58 },
  { id: 'unicorn', emoji: '🦄', label: 'Jednorożec', atStars: 62 },
  { id: 'crab', emoji: '🦀', label: 'Krab', atStars: 66 },
  { id: 'hedgehog', emoji: '🦔', label: 'Jeżyk', atStars: 70 },
  { id: 'alien', emoji: '👽', label: 'Kosmita', atStars: 74 },
  { id: 'giraffe', emoji: '🦒', label: 'Żyrafa', atStars: 78 },
  { id: 'turtle', emoji: '🐢', label: 'Żółw', atStars: 82 },
  { id: 'sunflower', emoji: '🌻', label: 'Słonecznik', atStars: 87 },
  { id: 'ufo', emoji: '🛸', label: 'Talerz UFO', atStars: 94 },
  { id: 'dragon', emoji: '🐉', label: 'Smok', atStars: 101 },
  { id: 'boat', emoji: '⛵', label: 'Żaglówka', atStars: 109 },
  { id: 'dog', emoji: '🐶', label: 'Piesek', atStars: 117 },
  { id: 'whale', emoji: '🐳', label: 'Wieloryb', atStars: 125 },
  { id: 'crown', emoji: '👑', label: 'Korona', atStars: 134 },
  { id: 'mushroom', emoji: '🍄', label: 'Grzybek', atStars: 143 },
  { id: 'shell', emoji: '🐚', label: 'Muszelka', atStars: 152 },
  { id: 'comet', emoji: '☄️', label: 'Kometa', atStars: 162 },
  { id: 'tree', emoji: '🌳', label: 'Drzewo', atStars: 172 },
  { id: 'trophy', emoji: '🏆', label: 'Puchar', atStars: 185 },
  { id: 'castle', emoji: '🏰', label: 'Zamek', atStars: 200 }
];

export const getSticker = (id) => stickers.find((s) => s.id === id) || null;

// Everything the child has earned at this star total.
export const stickersEarnedAt = (totalStars) =>
  stickers.filter((s) => s.atStars <= totalStars).map((s) => s.id);

// The next one to aim for, or null once they are all collected.
export const nextSticker = (totalStars) =>
  stickers.find((s) => s.atStars > totalStars) || null;

// Length of the progress ring's circle (r = 19 in a 44 box), for its dash. Set
// from the radius rather than with pathLength="100": Chrome does not always
// apply a pathLength given at creation to the dash (see PatternsTool).
export const RING_LENGTH = 2 * Math.PI * 19;

/**
 * How far along the way to the next sticker the child is, for drawing it as a
 * ring that fills up - a pre-reader cannot read "12 of 15", but can see a ring
 * three quarters full.
 *
 * Measured from the previous sticker's price, not from zero, so the ring empties
 * when a sticker is won and every sticker fills it once.
 *
 * @returns { next, fraction } - next is null and fraction 1 once all are won
 */
export const stickerProgress = (totalStars) => {
  const index = stickers.findIndex((s) => s.atStars > totalStars);
  if (index === -1) return { next: null, fraction: 1 };
  const from = index === 0 ? 0 : stickers[index - 1].atStars;
  const to = stickers[index].atStars;
  return { next: stickers[index], fraction: Math.max(0, Math.min(1, (totalStars - from) / (to - from))) };
};

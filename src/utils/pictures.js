// Bundled artwork for the pictures a child has to recognise.
//
// Two sets. The words of the picture games have their own illustrations in
// assets/pictures/words/, one per word and named by the word's id (zolw.webp) -
// see wordPictureFor at the end. Everything else that is still an emoji in the
// data files (stickers) goes through pictureFor:
//
// The games used to render the emoji character itself, which meant the picture
// changed shape on every device - flat on one Android, glossy 3D on Windows,
// something else again on an iPad - and at the sizes we show them, several were
// hard to identify at all. These are Noto's drawings, shipped with the app, so
// every child sees the same clear silhouette and it works offline.
//
// Files are named by codepoint (1f431.svg) and matched to the emoji in the data
// files, so adding a word only means dropping in the matching SVG.

const files = import.meta.glob('../assets/pictures/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
});

// Noto drops the FE0F variation selector from its filenames, so the key has to
// as well or half the symbols (sun, cloud, umbrella) would never match.
const codepointKey = (emoji) =>
  [...(emoji || '')]
    .map((char) => char.codePointAt(0))
    .filter((code) => code !== 0xfe0f)
    .map((code) => code.toString(16))
    .join('_');

const byKey = new Map();
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop().replace('.svg', '');
  byKey.set(name, url);
}

/**
 * The bundled drawing for an emoji, or null if we do not ship one.
 * Callers fall back to rendering the emoji character itself.
 */
export const pictureFor = (emoji) => byKey.get(codepointKey(emoji)) || null;

export const hasPicture = (emoji) => byKey.has(codepointKey(emoji));

// --- Word illustrations ------------------------------------------------------
//
// One per entry in data/wordsData.js, written by build_pictures.cjs. Each is a
// white disc with the drawing on it and transparent corners, so it is shown
// filling a round frame rather than sitting inside one.
const wordFiles = import.meta.glob('../assets/pictures/words/*.webp', {
  eager: true,
  query: '?url',
  import: 'default'
});

const byWord = new Map();
for (const [path, url] of Object.entries(wordFiles)) {
  byWord.set(path.split('/').pop().replace('.webp', ''), url);
}

/** The illustration for a word id, or null if none is shipped. */
export const wordPictureFor = (id) => byWord.get(id) || null;

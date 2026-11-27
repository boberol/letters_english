import React from 'react';
import { pictureFor, wordPictureFor } from '../utils/pictures';

/**
 * A picture a child has to recognise.
 *
 * Give it `word` - an entry's id from wordsData - for one of the word
 * illustrations, or `emoji` for a bundled Noto drawing (stickers). An emoji
 * without a drawing falls back to the character itself, and a word without an
 * illustration to its emoji if it has one, so a missing file shows something
 * rather than a broken image.
 *
 * @param word   id of a word in wordsData
 * @param emoji  a character from the data files: lookup key and fallback
 * @param label  what the picture shows, for screen readers. Pass null when a
 *               caption already names it, so it is not read out twice.
 * @param size   any CSS length; drives both the image and the fallback glyph
 */
export default function Picture({ word, emoji, label, size = '1em', className = '' }) {
  const wordSrc = word ? wordPictureFor(word) : null;
  const src = wordSrc || pictureFor(emoji);

  if (!src) {
    return (
      <span
        className={`picture picture-glyph ${className}`}
        style={{ fontSize: size, lineHeight: 1 }}
        role={label ? 'img' : undefined}
        aria-label={label || undefined}
        aria-hidden={label ? undefined : true}
      >
        {emoji}
      </span>
    );
  }

  return (
    <img
      className={`picture ${wordSrc ? 'picture-word' : ''} ${className}`}
      src={src}
      alt={label || ''}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      draggable="false"
      // These are decorative-to-the-layout drawings; letting them load lazily
      // would flash empty boxes as a child flips between rounds.
      decoding="async"
    />
  );
}

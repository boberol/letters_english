import { randomFrom } from './random';

// Picking the next card for the flashcard tools (arrows, numbers).
//
// Repeats are allowed. Ruling out the previous card entirely, as the arrows
// first did, turned two choices into a strict alternation - with two colours
// and two directions the child saw the same pair in the same order forever -
// so a card may come up again, and the tool animates every new card so a
// repeat is visibly a new one. A run is capped so one card cannot hog the
// screen.
export const MAX_RUN = 2;

/**
 * @param items   everything that can come up
 * @param history ids of the cards shown so far, latest last
 * @param idOf    how to read an item's id
 */
export const nextInSequence = (items, history = [], idOf = (item) => item.id) => {
  if (items.length <= 1) return items[0];
  const recent = history.slice(-MAX_RUN);
  const capped =
    recent.length === MAX_RUN && recent.every((id) => id === recent[0]) ? recent[0] : null;
  const pool = capped == null ? items : items.filter((item) => idOf(item) !== capped);
  return randomFrom(pool);
};

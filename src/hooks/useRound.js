import { useRef, useEffect, useCallback, useMemo } from 'react';
import { progress } from '../utils/progress';

// One round of a game - one letter, word, shape or board - from the first try
// to "Brawo", and the pause before the next one.
//
// Every tool used to keep these pieces itself, and the copies drifted apart:
// a second tap on Sprawdź during the celebration recorded a second clean
// success (three stars for one word), some tools called every success clean
// however many wrong answers came first, and "next word" timers were left
// running after the child had moved on or left. Here a round can be won once,
// a mistake anywhere in it costs the clean stars, and every timer belongs to
// the round and is cleared with it.
//
// Reads of the refs are for event handlers only, never for rendering.
export function useRound(tool) {
  const timersRef = useRef([]);
  const missedRef = useRef(false);
  const wonRef = useRef(false);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Run `fn` after `ms`, unless the round is reset or the tool closes first.
  const after = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // A new item: its own timers, its own mistakes. `keepMistakes` is for the
  // next step of the same item - a letter's three stages - where a slip in the
  // first still costs the clean stars in the last.
  const reset = useCallback(
    ({ keepMistakes = false } = {}) => {
      clearTimers();
      if (!keepMistakes) missedRef.current = false;
      wonRef.current = false;
    },
    [clearTimers]
  );

  const miss = useCallback(() => {
    missedRef.current = true;
  }, []);

  // Records the success and returns true - or returns false, and records
  // nothing, if this round was already won.
  const win = useCallback(
    (itemId) => {
      if (wonRef.current) return false;
      wonRef.current = true;
      progress.recordResult({ tool, itemId, success: true, clean: !missedRef.current });
      return true;
    },
    [tool]
  );

  const isWon = useCallback(() => wonRef.current, []);

  return useMemo(
    () => ({ after, clearTimers, reset, miss, win, isWon }),
    [after, clearTimers, reset, miss, win, isWon]
  );
}

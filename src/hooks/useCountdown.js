import { useState, useRef, useEffect, useCallback } from 'react';
import { sounds } from '../utils/audio';
import { COUNTDOWN_FROM, COUNTDOWN_STEP_MS } from '../utils/repetitions';

// 3, 2, 1, then `onDone`. `count` is the number on screen, or null when no
// countdown is running. Timers are kept and cleared on unmount and on cancel,
// so a countdown cannot start a tool the child has already left or stopped.
export function useCountdown() {
  const [count, setCount] = useState(null);
  const timersRef = useRef([]);

  const cancel = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setCount(null);
  }, []);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(
    (onDone) => {
      cancel();
      for (let i = 0; i < COUNTDOWN_FROM; i++) {
        const n = COUNTDOWN_FROM - i;
        timersRef.current.push(
          setTimeout(() => {
            setCount(n);
            sounds.playCountdown(false);
          }, i * COUNTDOWN_STEP_MS)
        );
      }
      timersRef.current.push(
        setTimeout(() => {
          timersRef.current = [];
          setCount(null);
          sounds.playCountdown(true);
          onDone();
        }, COUNTDOWN_FROM * COUNTDOWN_STEP_MS)
      );
    },
    [cancel]
  );

  return { count, start, cancel, running: count !== null };
}

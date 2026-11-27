import { useEffect } from 'react';

// Keeps the screen on while `active`. The metronome and the auto-slides run
// with nobody touching the tablet - the child is drawing on paper - and the
// screen used to dim and lock on its normal timer halfway through a run.
//
// The browser drops the lock whenever the page is hidden, so it is asked for
// again when the page comes back. Where the API is missing (older Safari,
// Firefox) this does nothing, which is what happened before.
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return undefined;
    let lock = null;
    let cancelled = false;

    const request = async () => {
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) next.release().catch(() => {});
        else lock = next;
      } catch (e) {
        // Refused (battery saver, no user gesture yet): carry on without it.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

import { useSyncExternalStore } from 'react';
import { progress } from '../utils/progress';

// Read the progress store from a component. No provider and no tree changes:
// the store lives outside React and this just subscribes to it.
//
// Returns the raw state object ({ stars, stickers, totalStars, ... }), which is
// referentially stable until a star is actually earned.
export const useProgress = () =>
  useSyncExternalStore(
    (listener) => progress.subscribe(listener),
    () => progress.getSnapshot(),
    () => progress.getSnapshot()
  );

export default useProgress;

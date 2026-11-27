import { useSyncExternalStore } from 'react';
import { stickerScene } from '../utils/stickerScene';

// Read the sticker pictures from a component - same pattern as useProgress.
export const useStickerScene = () =>
  useSyncExternalStore(
    (listener) => stickerScene.subscribe(listener),
    () => stickerScene.getSnapshot(),
    () => stickerScene.getSnapshot()
  );

export default useStickerScene;

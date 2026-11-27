import React, { useEffect, useRef, useState } from 'react';
import { getSticker } from '../data/stickers';
import { sounds } from '../utils/audio';
import { celebrate } from '../utils/celebrate';
import { stickerScene } from '../utils/stickerScene';
import { useProgress } from '../hooks/useProgress';
import Picture from './Picture';
import FeedbackModal from './FeedbackModal';

// Long enough for a game's success card (about two seconds) to come and go.
const ANNOUNCE_DELAY_MS = 2200;

// Announces a newly earned sticker, wherever it was earned.
//
// Mounted once at the top of the app and driven by the progress store, so no
// individual game has to know about stickers: any tool that records a star gets
// the celebration for free.
export default function StickerUnlock({ onOpenBook }) {
  const { stickers: owned } = useProgress();
  // Seeded with what the child already had, so opening the app does not
  // re-announce every sticker they own.
  const seenRef = useRef(null);
  const [pending, setPending] = useState([]);
  // Shown once the game's own "Brawo" card has had its moment. Straight away,
  // the two cards stacked up and the bigger one hid the child's success.
  const [ready, setReady] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Set(owned);
      return;
    }
    const fresh = owned.filter((id) => !seenRef.current.has(id));
    if (fresh.length === 0) return;

    fresh.forEach((id) => seenRef.current.add(id));
    setPending((queue) => [...queue, ...fresh]);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setReady(true);
      sounds.playSuccess();
      celebrate({ particleCount: 90, spread: 100 });
    }, ANNOUNCE_DELAY_MS);
  }, [owned]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (pending.length === 0 || !ready) return null;

  const sticker = getSticker(pending[0]);
  if (!sticker) return null;

  const dismiss = () => {
    sounds.playClick();
    if (pending.length <= 1) setReady(false);
    setPending((queue) => queue.slice(1));
  };

  // A dialog with two buttons rather than a card that goes away by itself: it
  // waits for the child, takes focus, and Esc means "Super!".
  return (
    <FeedbackModal
      color="#B45309"
      title="New sticker!"
      onDismiss={dismiss}
      actions={
        <>
          <button className="action-btn btn-next" onClick={dismiss}>
            Super!
          </button>
          {/* Straight onto the picture in the sticker book, where it pops in:
              the reward is something to play with, not just something to see. */}
          <button
            className="action-btn btn-start"
            onClick={() => {
              dismiss();
              stickerScene.add(sticker.id);
              onOpenBook?.();
            }}
          >
            Stick it!
          </button>
        </>
      }
    >
      <Picture emoji={sticker.emoji} label={sticker.label} className="sticker-unlock-emoji" />
      <span className="sticker-unlock-name">{sticker.label}</span>
    </FeedbackModal>
  );
}

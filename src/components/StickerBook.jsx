import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { stickers, getSticker, stickerProgress, RING_LENGTH } from '../data/stickers';
import { sounds } from '../utils/audio';
import { stickerScene, SCENES, SCENE_INFO } from '../utils/stickerScene';
import { useProgress } from '../hooks/useProgress';
import { useStickerScene } from '../hooks/useStickerScene';
import Picture from './Picture';
import StickerSceneArt from './StickerSceneArt';

// The sticker book: a picture to stick stickers on.
//
// It used to be a shelf of twelve cards, which a child looked at once - nothing
// could be done with a sticker after winning it. Now every owned sticker can be
// put onto one of three pictures (a meadow, the sea, space), moved around,
// tapped to make it dance, and dropped in the bin. Nothing here needs reading:
//
//   - tap a sticker in the tray and it pops onto the picture somewhere free, or
//     drag it out of the tray and drop it where it should go
//   - drag a sticker on the picture to move it; drop it on the bin, or off the
//     picture, to take it off
//   - tap a sticker on the picture and it dances
//   - the round pictures in the header switch pictures; each keeps its own
//     stickers
//
// Stickers still to be won sit at the end of the tray as dark silhouettes, and
// the ring at the start fills up as stars are earned towards the next one - a
// pre-reader cannot read "12 of 15", but can see a ring nearly full.

// A sticker on the picture is this share of the picture's width, before its own
// small random scale. Kept here and in the CSS (.placed-sticker) together.
const STICKER_SHARE = 0.15;
// How far a finger may wander before a tap becomes a drag, in CSS pixels.
const DRAG_SLOP = 8;
const DANCES = ['dance-hop', 'dance-spin', 'dance-wiggle'];

const danceFor = (uid) => DANCES[[...uid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % DANCES.length];

const inside = (rect, x, y) => rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

export default function StickerBook({ onBack }) {
  const { totalStars, stickers: owned } = useProgress();
  const { scene, placed: placedByScene, lastAdded } = useStickerScene();
  const placed = placedByScene[scene] || [];
  const { next, fraction } = stickerProgress(totalStars);

  const sceneRef = useRef(null);
  const binRef = useRef(null);
  const dragRef = useRef(null);
  const timersRef = useRef([]);
  // What is being dragged, for drawing it under the finger. The ref holds the
  // same thing for the event handlers, which must not wait for a render.
  const [drag, setDrag] = useState(null);
  // A counter per sticker, so tapping one that is already dancing starts the
  // dance again instead of being ignored.
  const [dancing, setDancing] = useState({});
  const [shaking, setShaking] = useState({});

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const ownedSet = new Set(owned);
  const ownedList = stickers.filter((s) => ownedSet.has(s.id));
  const lockedList = stickers.filter((s) => !ownedSet.has(s.id));

  const bump = (setter, key, ms) => {
    setter((m) => ({ ...m, [key]: (m[key] || 0) + 1 }));
    timersRef.current.push(
      setTimeout(() => {
        setter((m) => {
          const rest = { ...m };
          delete rest[key];
          return rest;
        });
      }, ms)
    );
  };

  const pickScene = (id) => {
    if (id === scene) return;
    sounds.playClick();
    stickerScene.setScene(id);
  };

  const sceneFraction = (clientX, clientY) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  const updateDrag = (patch) => {
    dragRef.current = { ...dragRef.current, ...patch };
    setDrag(dragRef.current);
  };

  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  // --- Stickers already on the picture -------------------------------------

  const onPlacedDown = (e, p) => {
    if (dragRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const box = e.currentTarget.getBoundingClientRect();
    const sceneRect = sceneRef.current.getBoundingClientRect();
    dragRef.current = {
      source: 'scene',
      pointerId: e.pointerId,
      uid: p.uid,
      sticker: p.sticker,
      scale: p.scale,
      tilt: p.tilt,
      size: sceneRect.width * STICKER_SHARE * p.scale,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      // Where in the sticker the finger landed, so it does not jump to centre
      // itself under the finger when the drag starts.
      offsetX: e.clientX - (box.left + box.width / 2),
      offsetY: e.clientY - (box.top + box.height / 2),
      active: false,
      overBin: false
    };
  };

  // --- Stickers in the tray -------------------------------------------------

  const onTrayDown = (e, sticker) => {
    if (dragRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Captured straight away so the move events follow the finger off the
    // button. Capturing does not stop the tray scrolling: touch-action decides
    // that, and the browser cancels this pointer if it starts a scroll.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const list = e.currentTarget.closest('.sticker-tray-list');
    const sceneRect = sceneRef.current?.getBoundingClientRect();
    dragRef.current = {
      source: 'tray',
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      sticker: sticker.id,
      scale: 1.05,
      tilt: 0,
      size: (sceneRect?.width || 400) * STICKER_SHARE * 1.05,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: 0,
      offsetY: 0,
      // The tray scrolls one way, so only a movement the other way - out of the
      // tray, towards the picture - picks a sticker up.
      scrollsSideways: list ? getComputedStyle(list).overflowX === 'auto' : true,
      active: false,
      overBin: false
    };
  };

  const startsDrag = (d, dx, dy) => {
    if (Math.hypot(dx, dy) < DRAG_SLOP) return false;
    if (d.source === 'scene' || d.pointerType === 'mouse') return true;
    return d.scrollsSideways ? Math.abs(dy) > Math.abs(dx) : Math.abs(dx) > Math.abs(dy);
  };

  const onMove = (e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active && !startsDrag(d, dx, dy)) return;
    const overBin = d.source === 'scene' && inside(binRef.current?.getBoundingClientRect(), e.clientX, e.clientY);
    updateDrag({ active: true, x: e.clientX, y: e.clientY, overBin });
  };

  const onUp = (e) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    endDrag();

    const centreX = e.clientX - d.offsetX;
    const centreY = e.clientY - d.offsetY;
    const sceneRect = sceneRef.current?.getBoundingClientRect();

    if (d.source === 'tray') {
      if (!d.active) {
        sounds.playClick();
        stickerScene.add(d.sticker);
      } else if (inside(sceneRect, e.clientX, e.clientY)) {
        sounds.playClick();
        stickerScene.add(d.sticker, sceneFraction(centreX, centreY));
      }
      return;
    }

    if (!d.active) {
      // A tap: dance.
      sounds.playBoing();
      stickerScene.bringToFront(d.uid);
      bump(setDancing, d.uid, 900);
      return;
    }

    if (inside(binRef.current?.getBoundingClientRect(), e.clientX, e.clientY) || !inside(sceneRect, e.clientX, e.clientY)) {
      sounds.playWhoosh();
      stickerScene.remove(d.uid);
      return;
    }

    const at = sceneFraction(centreX, centreY);
    if (at) stickerScene.move(d.uid, at.x, at.y);
  };

  const onCancel = (e) => {
    const d = dragRef.current;
    if (d && e.pointerId === d.pointerId) endDrag();
  };

  const pointerHandlers = { onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onCancel };

  const draggingUid = drag?.active && drag.source === 'scene' ? drag.uid : null;
  const ghost = drag?.active ? getSticker(drag.sticker) : null;

  return (
    <div className="stage-container sticker-book-container" style={{ backgroundColor: '#FEFCE8' }}>
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Wróć do wyboru zabaw"
        >
          <ChevronLeft color="#B45309" size={28} />
        </button>

        <div className="tool-header-title-badge sticker-book-title">
          <span className="shape-icon-badge">🏅</span>
          <span className="stage-title" style={{ color: '#B45309' }}>
            Moje naklejki
          </span>
        </div>

        <div className="sticker-scene-picker" role="group" aria-label="Wybierz obrazek">
          {SCENES.map((id) => (
            <button
              key={id}
              className={`sticker-scene-btn ${id === scene ? 'is-active' : ''}`}
              style={{ '--frame': SCENE_INFO[id].frame }}
              onClick={() => pickScene(id)}
              aria-label={SCENE_INFO[id].label}
              aria-pressed={id === scene}
              title={SCENE_INFO[id].label}
            >
              <StickerSceneArt scene={id} />
            </button>
          ))}
        </div>
      </div>

      <div
        ref={sceneRef}
        className={`sticker-scene ${drag?.active ? 'is-dragging' : ''}`}
        style={{ '--frame': SCENE_INFO[scene].frame }}
      >
        <StickerSceneArt scene={scene} className="sticker-scene-art" />

        {placed.map((p) => {
          const sticker = getSticker(p.sticker);
          const danceKey = dancing[p.uid];
          return (
            <div
              key={p.uid}
              className={`placed-sticker ${p.uid === lastAdded ? 'is-new' : ''} ${p.uid === draggingUid ? 'is-lifted' : ''}`}
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                '--scale': p.scale,
                '--tilt': `${p.tilt}deg`
              }}
              onPointerDown={(e) => onPlacedDown(e, p)}
              {...pointerHandlers}
            >
              <span key={danceKey || 0} className={`placed-sticker-inner ${danceKey ? danceFor(p.uid) : ''}`}>
                <Picture emoji={sticker.emoji} label={sticker.label} size="100%" />
              </span>
            </div>
          );
        })}

        {placed.length === 0 && ownedList.length > 0 && (
          <span className="sticker-scene-hint" aria-hidden="true">
            👇
          </span>
        )}

        <div
          ref={binRef}
          className={`sticker-bin ${drag?.active && drag.source === 'scene' ? 'is-ready' : ''} ${drag?.overBin ? 'is-hot' : ''}`}
          aria-hidden="true"
        >
          <Trash2 size={24} />
        </div>
      </div>

      <div className="sticker-tray glass-panel">
        <div
          className="sticker-next"
          style={{ '--fill': fraction }}
          role="img"
          aria-label={next ? `Następna naklejka: ${next.label}` : 'Masz wszystkie naklejki!'}
          title={next ? `${totalStars} / ${next.atStars} ⭐` : undefined}
        >
          <svg className="sticker-next-ring" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="19" className="sticker-next-track" />
            <circle
              cx="22"
              cy="22"
              r="19"
              className="sticker-next-fill"
              // A zero-length dash with round caps would still draw a dot.
              opacity={fraction > 0 ? 1 : 0}
              strokeDasharray={`${fraction * RING_LENGTH} ${RING_LENGTH}`}
            />
          </svg>
          {next ? (
            <Picture emoji={next.emoji} label={null} className="sticker-next-picture sticker-silhouette" />
          ) : (
            <span className="sticker-next-done" aria-hidden="true">⭐</span>
          )}
        </div>

        <div className="sticker-tray-list">
          {ownedList.map((s) => (
            <button
              key={s.id}
              className="sticker-tray-item"
              onPointerDown={(e) => onTrayDown(e, s)}
              {...pointerHandlers}
              onKeyDown={(e) => {
                // Keyboard and switch access: Enter or Space sticks it on.
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  sounds.playClick();
                  stickerScene.add(s.id);
                }
              }}
              aria-label={`Przyklej: ${s.label}`}
              title={s.label}
            >
              <Picture emoji={s.emoji} label={null} className="sticker-tray-picture" />
            </button>
          ))}
          {lockedList.map((s) => (
            <button
              key={s.id}
              className="sticker-tray-item is-locked"
              onClick={() => {
                sounds.playClick();
                bump(setShaking, s.id, 500);
              }}
              aria-label={`${s.label} - za ${s.atStars} gwiazdek`}
              title={`${s.atStars} ⭐`}
            >
              <span key={shaking[s.id] || 0} className={shaking[s.id] ? 'sticker-shake' : ''}>
                <Picture emoji={s.emoji} label={null} className="sticker-tray-picture sticker-silhouette" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {ghost && (
        <div
          className="sticker-ghost"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.size,
            height: drag.size,
            '--tilt': `${drag.tilt}deg`
          }}
          aria-hidden="true"
        >
          <Picture emoji={ghost.emoji} label={null} size="100%" />
        </div>
      )}
    </div>
  );
}

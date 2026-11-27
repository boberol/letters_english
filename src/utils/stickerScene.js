// Where the child has stuck their stickers.
//
// The sticker book is three pictures - a meadow, the sea, space - and each keeps
// its own stickers. A store shaped like `progress`: one instance, every
// localStorage touch wrapped, subscribe/getSnapshot for useSyncExternalStore,
// and a snapshot that keeps its identity until something changes.
//
// Positions are fractions of the picture (0..1 across and down), so the same
// arrangement survives the picture being drawn at another size - turning the
// tablet, or opening the app on a phone.
//
// Stickers are not used up. An owned sticker can go on as many times as the
// child likes, which is what makes owning more of them worth something: more
// kinds to make pictures with. MAX_PER_SCENE only stops a picture turning into a
// solid wall that nothing more can be dragged through; past it the oldest one
// quietly comes off.

import { getSticker } from '../data/stickers';

const STORAGE_KEY = 'letter_app_sticker_scene_v1';

export const SCENES = ['meadow', 'sea', 'space'];
// The name read out for each picture's button, and the colour of its frame.
// The pictures themselves are drawn in components/StickerSceneArt.jsx.
export const SCENE_INFO = {
  meadow: { label: 'Meadow', frame: '#16A34A' },
  sea: { label: 'Sea', frame: '#0E7490' },
  space: { label: 'Space', frame: '#4338CA' }
};
export const MAX_PER_SCENE = 40;

const emptyState = () => ({
  version: 1,
  scene: SCENES[0],
  placed: Object.fromEntries(SCENES.map((id) => [id, []])),
  // Not saved: the sticker that has just been put on, so the picture can pop it
  // in when it next draws. Lives here rather than in the component because the
  // "Przyklej!" button on the unlock announcement adds it from outside the book.
  lastAdded: null
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

const sanitisePlacement = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.uid !== 'string' || !getSticker(raw.sticker)) return null;
  if (!isNum(raw.x) || !isNum(raw.y)) return null;
  return {
    uid: raw.uid,
    sticker: raw.sticker,
    x: clamp(raw.x, 0, 1),
    y: clamp(raw.y, 0, 1),
    scale: isNum(raw.scale) ? clamp(raw.scale, 0.6, 1.5) : 1,
    tilt: isNum(raw.tilt) ? clamp(raw.tilt, -30, 30) : 0
  };
};

// Anything unexpected is dropped rather than allowed to break the picture.
const sanitise = (raw) => {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  if (SCENES.includes(raw.scene)) state.scene = raw.scene;
  if (raw.placed && typeof raw.placed === 'object') {
    for (const id of SCENES) {
      if (Array.isArray(raw.placed[id])) {
        state.placed[id] = raw.placed[id].map(sanitisePlacement).filter(Boolean).slice(-MAX_PER_SCENE);
      }
    }
  }
  return state;
};

const load = () => {
  // Inside the try: with site data blocked, even naming localStorage throws,
  // and this runs at import time, before any ErrorBoundary exists.
  try {
    if (typeof localStorage === 'undefined') return emptyState();
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? sanitise(JSON.parse(saved)) : emptyState();
  } catch (e) {
    return emptyState();
  }
};

let uidCounter = 0;
const newUid = () => `${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

// A spot for a sticker that was tapped rather than dragged on: the most open of
// a dozen random tries, so a new sticker lands somewhere it can be seen instead
// of on top of the last one. Kept off the edges, where it would be half hidden,
// and out of the bottom-right corner, where the bin is.
const openSpot = (placed) => {
  let best = null;
  let bestGap = -1;
  for (let i = 0; i < 12; i++) {
    const x = 0.14 + Math.random() * 0.72;
    const y = 0.16 + Math.random() * 0.66;
    if (x > 0.72 && y > 0.68) continue;
    const gap = placed.reduce((min, p) => Math.min(min, Math.hypot(p.x - x, (p.y - y) * 0.75)), Infinity);
    if (gap > bestGap) {
      best = { x, y };
      bestGap = gap;
    }
  }
  return best || { x: 0.5, y: 0.45 };
};

class StickerSceneStore {
  constructor() {
    this.state = load();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return this.state;
  }

  commit(next) {
    this.state = next;
    try {
      const { lastAdded, ...saved } = next; // eslint-disable-line no-unused-vars
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (e) {
      // Storage full or switched off: the picture still works for this visit.
    }
    this.listeners.forEach((listener) => listener());
  }

  // Everything off every picture: used when a parent starts the progress over.
  reset() {
    this.commit(emptyState());
  }

  setScene(scene) {
    if (!SCENES.includes(scene) || scene === this.state.scene) return;
    this.commit({ ...this.state, scene });
  }

  updateScene(scene, fn) {
    const list = this.state.placed[scene] || [];
    return { ...this.state.placed, [scene]: fn(list) };
  }

  /**
   * Stick a sticker onto the current picture.
   * @param at  { x, y } as fractions of the picture; omitted, an open spot is found
   * @returns the new placement's uid
   */
  add(stickerId, at = null) {
    if (!getSticker(stickerId)) return null;
    const { scene } = this.state;
    const list = this.state.placed[scene];
    const spot = at || openSpot(list);
    const placement = {
      uid: newUid(),
      sticker: stickerId,
      x: clamp(spot.x, 0.03, 0.97),
      y: clamp(spot.y, 0.03, 0.97),
      // A little variety, so a row of the same sticker looks stuck on by hand
      // rather than printed.
      scale: 0.9 + Math.random() * 0.25,
      tilt: Math.round((Math.random() - 0.5) * 24)
    };
    this.commit({
      ...this.state,
      placed: this.updateScene(scene, (l) => [...l, placement].slice(-MAX_PER_SCENE)),
      lastAdded: placement.uid
    });
    return placement.uid;
  }

  // Moving a sticker also brings it to the front: the one a child just touched
  // is the one they are looking at.
  move(uid, x, y) {
    const { scene } = this.state;
    const list = this.state.placed[scene];
    const item = list.find((p) => p.uid === uid);
    if (!item) return;
    const moved = { ...item, x: clamp(x, 0.03, 0.97), y: clamp(y, 0.03, 0.97) };
    this.commit({
      ...this.state,
      placed: this.updateScene(scene, (l) => [...l.filter((p) => p.uid !== uid), moved])
    });
  }

  bringToFront(uid) {
    const { scene } = this.state;
    const list = this.state.placed[scene];
    const item = list.find((p) => p.uid === uid);
    if (!item || list[list.length - 1] === item) return;
    this.commit({
      ...this.state,
      placed: this.updateScene(scene, (l) => [...l.filter((p) => p.uid !== uid), item])
    });
  }

  remove(uid) {
    const { scene } = this.state;
    this.commit({
      ...this.state,
      placed: this.updateScene(scene, (l) => l.filter((p) => p.uid !== uid))
    });
  }
}

export const stickerScene = new StickerSceneStore();

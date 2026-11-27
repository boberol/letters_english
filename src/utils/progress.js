// Stars earned per activity, and the stickers they add up to.
//
// A singleton with the same shape as `sounds` in audio.js: one instance, every
// localStorage touch wrapped so a private-mode browser or a cleared store can
// never throw. On top of that it exposes subscribe/getSnapshot so components
// can read it through useSyncExternalStore without a provider.
//
// The saved shape is deliberately one level deeper than it needs to be today:
// wrapping this map under profiles[activeId] later is an additive change, not a
// migration.

import { stickersEarnedAt } from '../data/stickers';

const STORAGE_KEY = 'letter_app_progress_v1';

// Stars per item, out of three. The first success always earns one, so a child
// who finds something hard still sees a reward; the rest are for doing it
// cleanly - first try, no hints, no mistakes.
export const MAX_STARS = 3;

const emptyState = () => ({
  version: 1,
  stars: {},
  stickers: [],
  totalStars: 0,
  lastPlayedISO: null
});

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Anything unexpected in storage is treated as "no progress yet" rather than
// allowed to crash the app on boot. Losing stars is bad; a white screen on a
// child's tablet is worse.
const sanitise = (raw) => {
  if (!isPlainObject(raw)) return emptyState();

  const stars = {};
  if (isPlainObject(raw.stars)) {
    for (const [key, value] of Object.entries(raw.stars)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        stars[key] = Math.min(MAX_STARS, Math.floor(n));
      }
    }
  }

  const earned = Object.values(stars).reduce((sum, n) => sum + n, 0);

  // Stickers already owned stay owned, and anything the star total now pays for
  // is added. The second half matters when the sticker list changes: new
  // stickers priced below what a child already has are theirs on the next
  // launch, quietly, instead of arriving as a queue of announcements the next
  // time they earn a single star.
  const saved = Array.isArray(raw.stickers) ? raw.stickers.filter((s) => typeof s === 'string') : [];
  const owned = [...saved, ...stickersEarnedAt(earned).filter((id) => !saved.includes(id))];

  return {
    version: 1,
    stars,
    stickers: owned,
    // Recomputed rather than trusted, so a tampered or truncated total cannot
    // drift away from the stars actually recorded.
    totalStars: earned,
    lastPlayedISO: typeof raw.lastPlayedISO === 'string' ? raw.lastPlayedISO : null
  };
};

const load = () => {
  // Inside the try: with site data blocked, Chrome throws a SecurityError on
  // merely naming `localStorage`, even under typeof - and this runs as the
  // module loads, before any error boundary exists, so it blanked the app.
  try {
    if (typeof localStorage === 'undefined') return emptyState();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState();
    return sanitise(JSON.parse(saved));
  } catch (e) {
    return emptyState();
  }
};

class ProgressStore {
  constructor() {
    this.state = load();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // useSyncExternalStore compares snapshots by identity, so this must stay the
  // same object until something actually changes - returning a fresh one every
  // call would loop forever.
  getSnapshot() {
    return this.state;
  }

  commit(next) {
    this.state = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      // Out of quota or storage disabled: the session still works, it just
      // will not be remembered.
    }
    this.listeners.forEach((listener) => listener());
  }

  starsFor(tool, itemId) {
    return this.state.stars[`${tool}:${itemId}`] || 0;
  }

  getTotalStars() {
    return this.state.totalStars;
  }

  getStickers() {
    return this.state.stickers;
  }

  hasSticker(id) {
    return this.state.stickers.includes(id);
  }

  /**
   * Record one attempt.
   *
   * @param tool    activity id, e.g. 'letters' or 'find-letter'
   * @param itemId  what was practised inside it, e.g. the letter or word id
   * @param success whether the child got it right
   * @param clean   right first time, with no hints and no wrong turns
   * @returns { gained, stars, unlocked } - unlocked is the sticker objects that
   *          this attempt paid for, for the caller to celebrate
   */
  recordResult({ tool, itemId, success, clean = false }) {
    if (!tool || !itemId || !success) return { gained: 0, stars: this.starsFor(tool, itemId), unlocked: [] };

    const key = `${tool}:${itemId}`;
    const current = this.state.stars[key] || 0;
    // One star for getting there at all; the second and third are earned by
    // coming back and doing it cleanly.
    const next = clean ? Math.min(MAX_STARS, current + 1) : Math.max(current, 1);
    const gained = next - current;

    if (gained === 0) {
      return { gained: 0, stars: current, unlocked: [] };
    }

    const totalStars = this.state.totalStars + gained;
    const earnedIds = stickersEarnedAt(totalStars);
    const unlockedIds = earnedIds.filter((id) => !this.state.stickers.includes(id));

    this.commit({
      ...this.state,
      stars: { ...this.state.stars, [key]: next },
      stickers: unlockedIds.length ? [...this.state.stickers, ...unlockedIds] : this.state.stickers,
      totalStars,
      lastPlayedISO: new Date().toISOString().slice(0, 10)
    });

    return { gained, stars: next, unlocked: unlockedIds };
  }

  reset() {
    this.commit(emptyState());
  }
}

export const progress = new ProgressStore();

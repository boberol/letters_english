// Shared settings for the tools that run on their own once started - the
// arrows' and numbers' auto-slides and the metronome: how many to show before
// stopping, and whether to count down 3-2-1 first so the child is ready.

// 0 means "until stopped".
export const REPETITION_OPTIONS = [0, 5, 10, 15, 20];

export const repetitionLabel = (count) => (count === 0 ? '∞' : String(count));

export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_STEP_MS = 900;

// The wrapped localStorage helpers moved to utils/storage.js; re-exported so
// the tools that import them from here keep working.
export { loadSetting, saveSetting } from './storage';

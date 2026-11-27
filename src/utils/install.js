// Installing the app on a computer, and taking a classroom board full screen.
//
// A store shaped like `progress` and `license`: subscribe/getSnapshot, read
// through hooks/useInstall.js. It lives outside React because Chrome and Edge
// fire `beforeinstallprompt` once, early, and only to whoever is listening at
// that moment - main.jsx imports this module before the first render so the
// event is never missed, and the button can ask for it whenever it is shown.
//
// On Windows the installed app is the same site in its own window: same
// origin, same storage, so a board activated in the browser stays activated
// once installed, and installing after activating costs no licence slot.

const listeners = new Set();
let deferredPrompt = null;

const matches = (query) =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches;

const isStandalone = () =>
  matches('(display-mode: standalone)') ||
  matches('(display-mode: fullscreen)') ||
  // iOS home-screen apps report this instead of the media query.
  (typeof navigator !== 'undefined' && navigator.standalone === true);

const read = () => ({
  // True only while the browser has handed us an install prompt to show.
  canInstall: !!deferredPrompt && !isStandalone(),
  installed: isStandalone(),
  fullscreenAvailable: typeof document !== 'undefined' && !!document.fullscreenEnabled,
  fullscreen: typeof document !== 'undefined' && !!document.fullscreenElement
});

let snapshot = read();

const emit = () => {
  const next = read();
  // Same object until something changes, or useSyncExternalStore loops.
  if (Object.keys(next).every((k) => next[k] === snapshot[k])) return;
  snapshot = next;
  listeners.forEach((l) => l());
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's own mini-infobar from appearing over a child's game;
    // the button on the activation and home screens asks instead.
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
  document.addEventListener('fullscreenchange', emit);
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);
}

export const install = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot: () => snapshot,

  // Shows the browser's install dialog. Resolves true if it was accepted.
  async prompt() {
    const e = deferredPrompt;
    if (!e) return false;
    // A prompt can be shown once; the browser fires a fresh event if it is
    // still installable after a refusal.
    deferredPrompt = null;
    emit();
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      return outcome === 'accepted';
    } catch {
      return false;
    }
  },

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {}
    emit();
  }
};

export default install;

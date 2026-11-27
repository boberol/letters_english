import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import ToolsMenu from './components/ToolsMenu';
import StickerUnlock from './components/StickerUnlock';
import { stickerProgress, RING_LENGTH } from './data/stickers';
import { Volume2, VolumeX, Maximize, Minimize, Download } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import { sounds } from './utils/audio';
import { useProgress } from './hooks/useProgress';
import { useInstall } from './hooks/useInstall';
import { useMediaQuery } from './hooks/useMediaQuery';
import { install } from './utils/install';
import starIcon from './assets/menu-icons/wyniki.webp';

// Every screen but the home grid is loaded when it is first opened. As one
// file the app was 574 KB of JavaScript (every letter's artwork inside it)
// before the home screen could draw. The service worker still precaches
// every piece, so nothing here needs a network once installed.
const MenuScreen = lazy(() => import('./components/MenuScreen'));
const LearningStage = lazy(() => import('./components/LearningStage'));
const ShapesTool = lazy(() => import('./components/ShapesTool'));
const PatternFamiliesMenu = lazy(() => import('./components/PatternFamiliesMenu'));
const PatternsTool = lazy(() => import('./components/PatternsTool'));
const ArrowsTool = lazy(() => import('./components/ArrowsTool'));
const NumbersTool = lazy(() => import('./components/NumbersTool'));
const MetronomeTool = lazy(() => import('./components/MetronomeTool'));
const WordScrambleTool = lazy(() => import('./components/WordScrambleTool'));
const FindLetterTool = lazy(() => import('./components/FindLetterTool'));
const LetterPairsTool = lazy(() => import('./components/LetterPairsTool'));
const FirstSoundTool = lazy(() => import('./components/FirstSoundTool'));
const SyllablesTool = lazy(() => import('./components/SyllablesTool'));
const StickerBook = lazy(() => import('./components/StickerBook'));

// Which tool a card on the home screen opens.
const TOOL_VIEWS = {
  letters: 'letters-menu',
  shapes: 'shapes',
  patterns: 'patterns-menu',
  arrows: 'arrows',
  numbers: 'numbers',
  metronome: 'metronome',
  'word-scramble': 'word-scramble',
  'find-letter': 'find-letter',
  'letter-pairs': 'letter-pairs',
  'first-sound': 'first-sound',
  syllables: 'syllables',
  'sticker-book': 'sticker-book'
};

// Every tool takes the same props, so they live in a map rather than a growing
// ladder of `view === 'x' && <XTool/>`. The two-screen tools are not here:
// letters and pattern families carry a selection between their screens and are
// handled separately below.
const VIEW_REGISTRY = {
  shapes: ShapesTool,
  arrows: ArrowsTool,
  numbers: NumbersTool,
  metronome: MetronomeTool,
  'word-scramble': WordScrambleTool,
  'find-letter': FindLetterTool,
  'letter-pairs': LetterPairsTool,
  'first-sound': FirstSoundTool,
  syllables: SyllablesTool,
  'sticker-book': StickerBook
};

// The screen each one goes back to. Everything not listed goes back home.
const PARENT_VIEW = { 'letters-stage': 'letters-menu', 'patterns-stage': 'patterns-menu' };

// The screen the history entry we are on names, if it is one we can open. A
// reload inside a tool used to drop the child on the home screen, on top of
// the entry for that tool, which then needed an extra Back press to leave.
const restoredScreen = () => {
  if (typeof window === 'undefined') return null;
  const state = window.history.state;
  if (!state?.view || !(state.depth > 0)) return null;
  const known = state.view in VIEW_REGISTRY || ['letters-menu', 'patterns-menu'].includes(state.view);
  const needsItem = state.view in PARENT_VIEW;
  if (needsItem ? state.item == null : !known) return null;
  return state;
};

export default function App() {
  // The tool grid is the first thing a child sees - there is no landing page in
  // front of it, so picking an activity is one tap from opening the app.
  const [view, setView] = useState(() => restoredScreen()?.view ?? 'tools');
  // What the previous screen picked - a letter, or a pattern family. Only the
  // two-screen tools use it.
  const [selection, setSelection] = useState(() => restoredScreen()?.item ?? null);
  const [isMuted, setIsMuted] = useState(() => sounds.getMuted());
  const { totalStars } = useProgress();
  const stickerFraction = stickerProgress(totalStars).fraction;
  const { canInstall, fullscreenAvailable, fullscreen } = useInstall();
  // A classroom board or a computer with a mouse, not a tablet: on a tablet the
  // fullscreen button would only be one more thing for a child to tap by mistake.
  const isBigScreen = useMediaQuery('(min-width: 1400px), (hover: hover) and (pointer: fine)');

  // Mirror the view into browser history so the device's Back button (and the
  // Android back gesture) steps back a screen instead of leaving the app.
  // Opening a screen pushes an entry; every back arrow goes through `back`,
  // which steps back through history rather than pushing the parent screen as
  // a new entry. Pushing it is what the back arrows used to do, so the stack
  // only grew: after home, Litery, back arrow, the system Back button reopened
  // Litery instead of leaving the app. `depth` is how many screens deep an
  // entry is, so `back` knows when there is nothing of ours left to go back to.
  const backPendingRef = useRef(false);

  const go = useCallback((nextView, item = null) => {
    setView(nextView);
    setSelection(item);
    if (typeof window !== 'undefined') {
      const depth = (window.history.state?.depth ?? 0) + 1;
      window.history.pushState({ view: nextView, item, depth }, '');
    }
  }, []);

  const back = useCallback((fallback = 'tools') => {
    if (typeof window === 'undefined') return;
    // history.back() is asynchronous. A second tap before it lands would read
    // the old depth and step back twice - out of the app, on a tablet.
    if (backPendingRef.current) return;
    if ((window.history.state?.depth ?? 0) > 0) {
      backPendingRef.current = true;
      window.history.back();
      return;
    }
    setView(fallback);
    setSelection(null);
    window.history.replaceState({ view: fallback, item: null, depth: 0 }, '');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Seed the stack so the first Back press has somewhere to land - unless
    // this is a reload of a screen we restored, whose entry is already right.
    if (!restoredScreen()) window.history.replaceState({ view: 'tools', item: null, depth: 0 }, '');
    const onPop = (e) => {
      backPendingRef.current = false;
      const state = e.state || { view: 'tools', item: null };
      setView(state.view || 'tools');
      setSelection(state.item ?? null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Esc steps back a screen everywhere, as the back arrow does. Several tools
  // did this themselves and the rest (Sylaby among them) did nothing; a tool's
  // own handler and this one both landing is harmless, since `back` ignores a
  // second call while the first is in flight. An open dialog takes Esc first
  // (useDialog stops it in the capture phase), so this never closes a screen
  // under a panel.
  useEffect(() => {
    if (view === 'tools') return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      back(PARENT_VIEW[view] || 'tools');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, back]);

  const toggleSound = () => {
    const newState = sounds.toggleMute();
    setIsMuted(newState);
    if (!newState) {
      sounds.playClick();
    }
  };

  // No click sound in these: the card, tile or back arrow that calls them
  // plays its own, and every one of them used to be heard twice.
  const handleSelectTool = (toolId) => {
    const next = TOOL_VIEWS[toolId];
    if (next) go(next);
  };

  const handleSelectLetter = (letter) => {
    go('letters-stage', letter);
  };

  const handleSelectFamily = (familyId) => {
    go('patterns-stage', familyId);
  };

  const backToTools = () => {
    back('tools');
  };

  const openStickerBook = () => {
    sounds.playClick();
    go('sticker-book');
  };

  const toggleFullscreen = () => {
    sounds.playClick();
    install.toggleFullscreen();
  };

  const Tool = VIEW_REGISTRY[view];

  return (
    <div className="app-container">
      {/* No separate home button: every screen has its own back arrow in its
          header, and on most of them the two went to the same place - two
          buttons that look different and do the same thing. */}
      <div className="global-nav-right">
        {/* For the teacher or parent, so it only appears on the home screen and
            only while the browser is offering to install. */}
        {view === 'tools' && canInstall && (
          <button
            className="install-btn glass-panel"
            onClick={() => install.prompt()}
            title="Install PlayGoo on this computer"
            id="btn-install"
          >
            <Download size={18} aria-hidden="true" />
            <span>Install</span>
          </button>
        )}

        {fullscreenAvailable && (isBigScreen || fullscreen) && (
          <button
            className="sound-toggle-btn glass-panel"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            title={fullscreen ? 'Exit full screen' : 'Full screen'}
            id="btn-fullscreen"
          >
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        )}

        {/* Star total, and the way into the sticker book */}
        {view !== 'sticker-book' && (
          <button
            className="star-counter-btn glass-panel"
            onClick={openStickerBook}
            aria-label={`You have ${totalStars} stars. See your stickers`}
            title="My stickers"
            id="btn-star-counter"
          >
            {/* The ring round the star fills towards the next sticker, so a
                child can see from any game that another one is close. */}
            <span className="star-counter-icon" aria-hidden="true">
              <svg className="star-counter-ring" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="19" className="sticker-next-track" />
                <circle
                  cx="22"
                  cy="22"
                  r="19"
                  className="sticker-next-fill"
                  // A zero-length dash with round caps would still draw a dot.
                  opacity={stickerFraction > 0 ? 1 : 0}
                  strokeDasharray={`${stickerFraction * RING_LENGTH} ${RING_LENGTH}`}
                />
              </svg>
              <img className="star-counter-star" src={starIcon} alt="" width="25" height="25" draggable="false" />
            </span>
            <span className="star-counter-value">{totalStars}</span>
          </button>
        )}

        <button
          className="sound-toggle-btn glass-panel"
          onClick={toggleSound}
          aria-label={isMuted ? 'Turn sound on' : 'Mute sound'}
          title={isMuted ? 'Turn sound on' : 'Mute sound'}
          id="btn-toggle-sound"
        >
          {isMuted ? <VolumeX size={20} color="#94a3b8" /> : <Volume2 size={20} color="#6366f1" />}
        </button>
      </div>

      {/* A crash in one activity shows a way home instead of a blank page.
          Keyed by the view, so the next screen starts with a clean slate. */}
      <ErrorBoundary key={view} onReset={() => back('tools')}>
        <Suspense fallback={null}>
          {/* Activity picker - the app's home screen */}
          {view === 'tools' && <ToolsMenu onSelectTool={handleSelectTool} />}

          {/* Letter tracing keeps its own two views: they carry the chosen letter */}
          {view === 'letters-menu' && (
            <MenuScreen onSelectLetter={handleSelectLetter} onBack={backToTools} />
          )}

          {view === 'letters-stage' && (
            <LearningStage
              letter={selection}
              onBack={() => back('letters-menu')}
            />
          )}

          {/* Pattern families work the same way: pick the animal, then trace its
              szlaczki. Both screens are views, so Back steps between them. */}
          {view === 'patterns-menu' && (
            <PatternFamiliesMenu onSelectFamily={handleSelectFamily} onBack={backToTools} />
          )}

          {view === 'patterns-stage' && (
            <PatternsTool
              familyId={selection}
              onBack={() => back('patterns-menu')}
            />
          )}

          {/* Everything else takes { onBack } and comes from the registry */}
          {Tool && <Tool onBack={backToTools} />}
        </Suspense>
      </ErrorBoundary>

      {/* Sticker unlocks are announced here rather than inside each game, so
          every tool that awards a star gets the celebration without knowing
          stickers exist. */}
      <StickerUnlock onOpenBook={() => go('sticker-book')} />
    </div>
  );
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { celebrate } from '../utils/celebrate';
import { ChevronLeft, Shuffle, Sliders, Play, Pause, Grid, Square, Check, HelpCircle } from 'lucide-react';
import { sounds } from '../utils/audio';
import { ALL_COLORS } from '../data/colors';
import { useRound } from '../hooks/useRound';
import { useWakeLock } from '../hooks/useWakeLock';
import SettingsModal from './SettingsModal';
import { nextInSequence } from '../utils/sequence';
import { loadSetting, saveSetting, REPETITION_OPTIONS } from '../utils/repetitions';
import { useCountdown } from '../hooks/useCountdown';
import Countdown from './Countdown';
import RunSettings from './RunSettings';

const ALL_DIRECTIONS = [
  { id: 'up', label: 'W górę', icon: '⬆️', angle: 0, key: 'ArrowUp' },
  { id: 'right', label: 'W prawo', icon: '➡️', angle: 90, key: 'ArrowRight' },
  { id: 'down', label: 'W dół', icon: '⬇️', angle: 180, key: 'ArrowDown' },
  { id: 'left', label: 'W lewo', icon: '⬅️', angle: 270, key: 'ArrowLeft' },
  { id: 'up-right', label: 'Góra-Prawo', icon: '↗️', angle: 45, diagonal: true },
  { id: 'down-right', label: 'Dół-Prawo', icon: '↘️', angle: 135, diagonal: true },
  { id: 'down-left', label: 'Dół-Lewo', icon: '↙️', angle: 225, diagonal: true },
  { id: 'up-left', label: 'Góra-Lewo', icon: '↖️', angle: 315, diagonal: true }
];

// Where each answer sits in the quiz's 3x3 grid: [row, column].
const COMPASS = {
  'up-left': [1, 1], up: [1, 2], 'up-right': [1, 3],
  left: [2, 1], right: [2, 3],
  'down-left': [3, 1], down: [3, 2], 'down-right': [3, 3]
};


// Auto-slide pace. Fixed for now - there is no UI to change it.
const AUTOPLAY_INTERVAL_MS = 2500;

const REPS_KEY = 'letter_app_arrow_reps';
const COUNTDOWN_KEY = 'letter_app_arrow_countdown';
const DIRS_KEY = 'letter_app_arrow_directions';
const COLORS_KEY = 'letter_app_arrow_colors';
const GRID_KEY = 'letter_app_arrow_grid';
const LABELS_KEY = 'letter_app_arrow_labels';
const GRID_SIZES = [4, 6, 8, 9, 12, 16];

// A saved list of ids, kept only if every id still exists.
const idsFrom = (all) => (v) =>
  Array.isArray(v) && v.length > 0 && v.every((id) => all.some((x) => x.id === id));

// Every direction in every colour: one card each. Picking a card rather than a
// direction and a colour separately is what lets the same arrow come up twice.
const cardId = (card) => `${card.dir.id}|${card.col.id}`;
const allCards = (directions, colors) =>
  directions.flatMap((dir) => colors.map((col) => ({ dir, col })));

// Board geometry, kept in step with .arrows-matrix-grid in index.css.
const GRID_GAP = 12;
const GRID_PADDING = 18;
// Everything stacked around the board: page padding, header, tabs, the size
// picker and the regenerate button.
const GRID_CHROME = 374;

export default function ArrowsTool({ onBack }) {
  const [selectedDirectionIds, setSelectedDirectionIds] = useState(() =>
    loadSetting(DIRS_KEY, ['up', 'right', 'down', 'left'], idsFrom(ALL_DIRECTIONS))
  );

  const [selectedColorIds, setSelectedColorIds] = useState(() =>
    loadSetting(COLORS_KEY, ['red', 'blue', 'green', 'yellow', 'purple', 'orange'], idsFrom(ALL_COLORS))
  );

  const [toolMode, setToolMode] = useState('card');
  const [gridSize, setGridSize] = useState(() => loadSetting(GRID_KEY, 4, (v) => GRID_SIZES.includes(v)));
  const [showLabels, setShowLabels] = useState(() =>
    loadSetting(LABELS_KEY, true, (v) => typeof v === 'boolean')
  );
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [repetitions, setRepetitions] = useState(() =>
    loadSetting(REPS_KEY, 0, (v) => REPETITION_OPTIONS.includes(v))
  );
  const [useCountdownSetting, setUseCountdownSetting] = useState(() =>
    loadSetting(COUNTDOWN_KEY, true, (v) => typeof v === 'boolean')
  );
  // How many arrows the current auto-slide run has shown, and whether it ran
  // to the end - the "Koniec" card.
  const [shownCount, setShownCount] = useState(0);
  const [runFinished, setRunFinished] = useState(false);
  const countdown = useCountdown();
  // One quiz arrow is one round: a wrong guess first costs the clean stars.
  const quiz = useRound('arrows');
  // A run of auto-slides is watched, not touched - keep the screen awake.
  useWakeLock(isAutoPlaying || countdown.running);

  const [activeArrow, setActiveArrow] = useState(() => ({
    dir: ALL_DIRECTIONS[0],
    col: ALL_COLORS[0],
    // Bumped on every new arrow, so the pop animation replays even when the
    // new arrow is the same as the last one.
    roll: 0,
    repeat: false
  }));
  const historyRef = useRef([]);
  const shownRef = useRef(0);

  const [gridItems, setGridItems] = useState([]);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });
  const [quizFeedback, setQuizFeedback] = useState(null);

  const autoPlayTimerRef = useRef(null);

  const activeDirections = useMemo(() => {
    const list = ALL_DIRECTIONS.filter(d => selectedDirectionIds.includes(d.id));
    return list.length > 0 ? list : [ALL_DIRECTIONS[0]];
  }, [selectedDirectionIds]);

  // Every size fills its rectangle: 8 is two rows of four, not three of three
  // with a hole.
  const gridColumns = gridSize <= 4 ? 2 : gridSize === 8 ? 4 : gridSize <= 9 ? 3 : 4;
  const gridRows = Math.ceil(gridSize / gridColumns);

  const activeColors = useMemo(() => {
    const list = ALL_COLORS.filter(c => selectedColorIds.includes(c.id));
    return list.length > 0 ? list : [ALL_COLORS[0]];
  }, [selectedColorIds]);

  useEffect(() => {
    saveSetting(DIRS_KEY, selectedDirectionIds);
    saveSetting(COLORS_KEY, selectedColorIds);
    saveSetting(GRID_KEY, gridSize);
    saveSetting(LABELS_KEY, showLabels);
  }, [selectedDirectionIds, selectedColorIds, gridSize, showLabels]);

  useEffect(() => saveSetting(REPS_KEY, repetitions), [repetitions]);
  useEffect(() => saveSetting(COUNTDOWN_KEY, useCountdownSetting), [useCountdownSetting]);

  const rollNewArrow = (playFx = true) => {
    if (playFx) sounds.playRandom();
    const card = nextInSequence(allCards(activeDirections, activeColors), historyRef.current, cardId);
    const id = cardId(card);
    const repeat = historyRef.current[historyRef.current.length - 1] === id;
    historyRef.current = [...historyRef.current.slice(-5), id];
    setActiveArrow((prev) => ({ ...card, roll: (prev?.roll || 0) + 1, repeat }));
    setQuizFeedback(null);
    quiz.reset();
  };

  const rollNewGrid = () => {
    sounds.playRandom();
    const cards = allCards(activeDirections, activeColors);
    const history = [];
    const newItems = [];

    for (let i = 0; i < gridSize; i++) {
      const card = nextInSequence(cards, history, cardId);
      history.push(cardId(card));
      newItems.push({ id: `${Date.now()}-${i}`, ...card });
    }
    setGridItems(newItems);
  };

  const stopAutoPlay = () => {
    countdown.cancel();
    setIsAutoPlaying(false);
  };

  // Auto-slides: optionally 3-2-1 first, then a new arrow every interval
  // until the chosen number has been shown.
  const startAutoPlay = () => {
    setRunFinished(false);
    const begin = () => {
      shownRef.current = 1;
      setShownCount(1);
      rollNewArrow(true);
      setIsAutoPlaying(true);
    };
    if (useCountdownSetting) countdown.start(begin);
    else begin();
  };

  useEffect(() => {
    rollNewArrow(false);
    // The roll functions are remade every render and read only what is listed
    // here, so listing them would re-roll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDirections, activeColors]);

  useEffect(() => {
    if (toolMode === 'grid') {
      rollNewGrid();
    }
    // The roll functions are remade every render and read only what is listed
    // here, so listing them would re-roll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolMode, gridSize, activeDirections, activeColors]);

  useEffect(() => {
    if (isAutoPlaying && toolMode === 'card') {
      autoPlayTimerRef.current = setInterval(() => {
        if (repetitions > 0 && shownRef.current >= repetitions) {
          // The last arrow has had its full time on screen: stop there.
          setIsAutoPlaying(false);
          setRunFinished(true);
          sounds.playSuccess();
          return;
        }
        rollNewArrow(true);
        shownRef.current += 1;
        setShownCount(shownRef.current);
      }, AUTOPLAY_INTERVAL_MS);
    } else {
      clearInterval(autoPlayTimerRef.current);
    }
    return () => clearInterval(autoPlayTimerRef.current);
    // The roll functions are remade every render and read only what is listed
    // here, so listing them would re-roll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoPlaying, toolMode, activeDirections, activeColors, repetitions]);

  const setDirectionPreset = (count) => {
    sounds.playClick();
    if (count === 2) {
      setSelectedDirectionIds(['left', 'right']);
    } else if (count === 4) {
      setSelectedDirectionIds(['up', 'right', 'down', 'left']);
    } else if (count === 8) {
      setSelectedDirectionIds(ALL_DIRECTIONS.map(d => d.id));
    }
  };

  const toggleDirection = (id) => {
    sounds.playClick();
    setSelectedDirectionIds(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  const toggleColor = (id) => {
    sounds.playClick();
    setSelectedColorIds(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  const selectAllColors = () => {
    sounds.playClick();
    setSelectedColorIds(ALL_COLORS.map(c => c.id));
  };

  // A wrong guess used to be forgotten by the time the right one landed (the
  // check read the feedback state the guard had just ruled out), so every
  // arrow paid out as clean - three stars however many guesses it took.
  const handleQuizGuess = (dirId) => {
    if (quizFeedback) return;
    const isCorrect = dirId === activeArrow.dir.id;
    if (isCorrect) {
      if (!quiz.win(activeArrow.dir.id)) return;
      sounds.playSuccess();
      setQuizFeedback('correct');
      setQuizScore(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      celebrate({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.6 },
        colors: [activeArrow.col.color, '#FACC15']
      });
      quiz.after(() => rollNewArrow(false), 1400);
    } else {
      sounds.playError();
      quiz.miss();
      setQuizFeedback('wrong');
      setQuizScore(prev => ({ ...prev, total: prev.total + 1 }));
      quiz.after(() => setQuizFeedback(null), 1200);
    }
  };

  // Keyboard shortcuts. Subscribed afresh each render so they see the current
  // arrow and mode.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showSettings || e.repeat) return;
      // Space on a focused button is that button's click; do not also roll.
      if (e.target instanceof HTMLElement && e.target.closest('button, input') && e.key === ' ') return;

      if (e.key === 'Escape') {
        onBack();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (toolMode === 'card' && !countdown.running) rollNewArrow(true);
        if (toolMode === 'grid') rollNewGrid();
      } else if (toolMode === 'quiz') {
        // Allow Arrow keys to answer directly
        const matched = activeDirections.find(d => d.key === e.key);
        if (matched) {
          handleQuizGuess(matched.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });


  return (
    <div className="stage-container arrows-tool-container" style={{ backgroundColor: activeArrow.col.bgColor }}>
      {/* Top Header */}
      <div className="stage-header">
        <button className="back-btn" onClick={() => { sounds.playClick(); onBack(); }} aria-label="Wróć do wyboru zabaw">
          <ChevronLeft color={activeArrow.col.text} size={28} aria-hidden="true" />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🧭</span>
          <span className="stage-title" style={{ color: activeArrow.col.text }}>
            Kolorowe Strzałki
          </span>
        </div>

        <button 
          className="settings-toggle-btn"
          onClick={() => { sounds.playClick(); setShowSettings(true); }}
          title="Ustawienia kierunków i kolorów"
          aria-label="Ustawienia kierunków i kolorów"
        >
          <Sliders size={20} color="#334155" aria-hidden="true" />
        </button>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="shapes-mode-tabs glass-panel">
        <button 
          className={`shapes-tab-btn ${toolMode === 'card' ? 'active' : ''}`}
          onClick={() => { sounds.playClick(); setToolMode('card'); stopAutoPlay(); }}
        >
          <Square size={16} /> Duża Strzałka
        </button>
        <button 
          className={`shapes-tab-btn ${toolMode === 'grid' ? 'active' : ''}`}
          onClick={() => { sounds.playClick(); setToolMode('grid'); stopAutoPlay(); }}
        >
          <Grid size={16} /> Siatka / Kodowanie
        </button>
        <button 
          className={`shapes-tab-btn ${toolMode === 'quiz' ? 'active' : ''}`}
          onClick={() => { sounds.playClick(); setToolMode('quiz'); stopAutoPlay(); }}
        >
          <HelpCircle size={16} /> Zgadnij Kierunek
        </button>
      </div>

      {/* MODE 1: Single Large Flashcard */}
      {toolMode === 'card' && (
        <div className="arrow-card-view">
          <div 
            className="arrow-hero-card glass-panel"
            style={{ borderColor: activeArrow.col.color }}
          >
            {(isAutoPlaying || runFinished) && repetitions > 0 && (
              <span className="run-counter-badge" style={{ color: activeArrow.col.text }}>
                {Math.min(shownCount, repetitions)} / {repetitions}
              </span>
            )}
            <div 
              className="arrow-graphic-wrapper"
              style={{ transform: `rotate(${activeArrow.dir.angle}deg)` }}
            >
              <svg
                key={activeArrow.roll}
                viewBox="0 0 100 100"
                className={`arrow-svg-element card-pop ${activeArrow.repeat ? 'is-repeat' : ''}`}
              >
                <path
                  d="M 50,15 L 82,48 L 62,48 L 62,85 L 38,85 L 38,48 L 18,48 Z"
                  fill={activeArrow.col.color}
                  stroke="#FFFFFF"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {showLabels && (
              <div className="arrow-labels-container">
                <span className="arrow-dir-label" style={{ color: activeArrow.col.text }}>
                  {activeArrow.dir.label}
                </span>
                <span className="arrow-col-label">
                  Kolor: <strong>{activeArrow.col.label}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="arrow-controls-row">
            <button
              className="action-btn btn-random-shape"
              onClick={() => { setRunFinished(false); rollNewArrow(true); }}
              disabled={countdown.running}
              title="Losuj kolejną (Spacja)"
            >
              <Shuffle size={18} style={{ marginRight: '6px' }} />
              Losuj kolejną
            </button>

            <button 
              className={`action-btn ${isAutoPlaying || countdown.running ? 'btn-clear' : 'btn-replay'}`}
              onClick={() => {
                sounds.playClick();
                if (isAutoPlaying || countdown.running) stopAutoPlay();
                else startAutoPlay();
              }}
            >
              {isAutoPlaying || countdown.running ? (
                <><Pause size={18} style={{ marginRight: '6px' }} /> Zatrzymaj</>
              ) : (
                <><Play size={18} style={{ marginRight: '6px' }} /> Auto-slajdy</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MODE 2: Grid / Matrix Coding */}
      {toolMode === 'grid' && (
        <div className="arrow-grid-view">
          <div className="grid-size-selector glass-panel">
            <span>Rozmiar siatki:</span>
            {GRID_SIZES.map(sz => (
              <button
                key={sz}
                className={`grid-size-btn ${gridSize === sz ? 'active' : ''}`}
                aria-pressed={gridSize === sz}
                onClick={() => { sounds.playClick(); setGridSize(sz); }}
              >
                {sz}
              </button>
            ))}
          </div>

          <div
            className="arrows-matrix-grid glass-panel"
            style={{
              gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
              // Cells are square, so the number of rows decides how tall the
              // board wants to be. Derive the width from the height left over
              // and the board always fits the screen.
              maxWidth: `min(520px, calc((100dvh - ${GRID_CHROME}px - ${
                (gridRows - 1) * GRID_GAP + GRID_PADDING * 2
              }px) / ${gridRows} * ${gridColumns} + ${
                (gridColumns - 1) * GRID_GAP + GRID_PADDING * 2
              }px))`
            }}
          >
            {gridItems.map((item, idx) => (
              <div 
                key={item.id} 
                className="matrix-arrow-cell"
                style={{ backgroundColor: item.col.bgColor, borderColor: item.col.color }}
              >
                <span className="cell-number" style={{ color: item.col.text }}>{idx + 1}</span>
                <div 
                  className="matrix-arrow-rotator"
                  style={{ transform: `rotate(${item.dir.angle}deg)` }}
                >
                  <svg viewBox="0 0 100 100" className="matrix-arrow-svg">
                    <path
                      d="M 50,15 L 82,48 L 62,48 L 62,85 L 38,85 L 38,48 L 18,48 Z"
                      fill={item.col.color}
                      stroke="#FFFFFF"
                      strokeWidth="4"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          <button className="action-btn btn-random-shape" onClick={rollNewGrid} title="Generuj nową planszę (Spacja)">
            <Shuffle size={18} style={{ marginRight: '6px' }} />
            Generuj nową planszę
          </button>
        </div>
      )}

      {/* MODE 3: Direction Guessing Quiz */}
      {toolMode === 'quiz' && (
        <div className="arrow-quiz-view">
          <div className="quiz-score-badge glass-panel">
            🎯 Punkty: <strong>{quizScore.correct}</strong> / {quizScore.total}
          </div>

          <div 
            className="arrow-quiz-card glass-panel"
            style={{ borderColor: activeArrow.col.color }}
          >
            <div 
              className="arrow-graphic-wrapper"
              style={{ transform: `rotate(${activeArrow.dir.angle}deg)` }}
            >
              <svg
              key={activeArrow.roll}
              viewBox="0 0 100 100"
              className={`arrow-svg-element quiz-size card-pop ${activeArrow.repeat ? 'is-repeat' : ''}`}
            >
                <path
                  d="M 50,15 L 82,48 L 62,48 L 62,85 L 38,85 L 38,48 L 18,48 Z"
                  fill={activeArrow.col.color}
                  stroke="#FFFFFF"
                  strokeWidth="5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="quiz-instruction">W którą stronę wskazuje strzałka?</h3>
          </div>

          {/* The answers sit where they point, round the child in the middle:
              the answer for "up" is the top button. They used to carry the
              arrow itself, so the quiz was matching a picture to the same
              picture; now it asks which way, and the labels are for the adult. */}
          <div className="quiz-options-grid quiz-compass">
            {activeDirections.map((dir) => (
              <button
                key={dir.id}
                className="quiz-dir-btn glass-panel"
                style={{ gridRow: COMPASS[dir.id][0], gridColumn: COMPASS[dir.id][1] }}
                onClick={() => handleQuizGuess(dir.id)}
                disabled={!!quizFeedback}
                aria-label={dir.label}
              >
                <span className="quiz-btn-label">{dir.label}</span>
              </button>
            ))}
            <span className="quiz-compass-centre" aria-hidden="true">🧒</span>
          </div>

          {/* Always there, empty until an answer, so the answer appearing does
              not grow the screen by a row. */}
          <div className="quiz-feedback-slot" aria-live="polite">
            {quizFeedback === 'correct' && (
              <div className="quiz-feedback-toast correct">
                🎉 Brawo! To jest {activeArrow.dir.label}!
              </div>
            )}
            {quizFeedback === 'wrong' && (
              <div className="quiz-feedback-toast wrong">
                ❌ Ups! Spróbuj jeszcze raz!
              </div>
            )}
          </div>
        </div>
      )}

      <Countdown count={countdown.count} color={activeArrow.col.color} />

      {showSettings && (
        <SettingsModal title="Ustawienia strzałek" doneLabel="Zastosuj i zamknij" onClose={() => setShowSettings(false)}>
          <div className="settings-section">
            <h3>1. Liczba kierunków ({selectedDirectionIds.length} aktywnych):</h3>
            <div className="settings-quick-actions">
              <button 
                className={`quick-chip-btn ${selectedDirectionIds.length === 2 ? 'active' : ''}`}
                aria-pressed={selectedDirectionIds.length === 2}
                onClick={() => setDirectionPreset(2)}
              >
                ↔️ 2 Kierunki (Lewo / Prawo)
              </button>
              <button 
                className={`quick-chip-btn ${selectedDirectionIds.length === 4 ? 'active' : ''}`}
                aria-pressed={selectedDirectionIds.length === 4}
                onClick={() => setDirectionPreset(4)}
              >
                🧭 4 Kierunki (Krzyżowe)
              </button>
              <button 
                className={`quick-chip-btn ${selectedDirectionIds.length === 8 ? 'active' : ''}`}
                aria-pressed={selectedDirectionIds.length === 8}
                onClick={() => setDirectionPreset(8)}
              >
                ⭐ 8 Kierunków (Ze skosami)
              </button>
            </div>

            <div className="directions-selection-grid">
              {ALL_DIRECTIONS.map(dir => {
                const isSel = selectedDirectionIds.includes(dir.id);
                return (
                  <button
                    key={dir.id}
                    className={`dir-select-pill ${isSel ? 'selected' : ''}`}
                    aria-pressed={isSel}
                    onClick={() => toggleDirection(dir.id)}
                  >
                    <span className="dir-icon">{dir.icon}</span>
                    <span className="dir-name">{dir.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>2. Kolory strzałek ({selectedColorIds.length} aktywnych):</h3>
              <button className="text-link-btn" onClick={selectAllColors}>Wszystkie</button>
            </div>
            <div className="colors-selection-grid">
              {ALL_COLORS.map(c => {
                const isSel = selectedColorIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    className={`color-select-pill ${isSel ? 'selected' : ''}`}
                    aria-pressed={isSel}
                    style={{ 
                      borderColor: isSel ? c.color : 'rgba(0,0,0,0.1)',
                      backgroundColor: isSel ? c.bgColor : '#FFFFFF'
                    }}
                    onClick={() => toggleColor(c.id)}
                  >
                    <span className="color-swatch-dot" style={{ backgroundColor: c.color }} />
                    <span className="color-name-label">{c.label}</span>
                    {isSel && <Check size={14} color={c.color} />}
                  </button>
                );
              })}
            </div>
          </div>

          <RunSettings
            title="3. Auto-slajdy - ile strzałek:"
            unit="strzałkach"
            repetitions={repetitions}
            onRepetitions={setRepetitions}
            countdown={useCountdownSetting}
            onCountdown={setUseCountdownSetting}
          />

          <div className="settings-section">
            <h3>4. Opcje wyświetlania:</h3>
            <div className="settings-options-list">
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
                <span>Pokazuj napisy z nazwą kierunku i koloru</span>
              </label>
            </div>
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

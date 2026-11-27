import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, Shuffle, Sliders, Play, Pause, Grid, Square, Check, HelpCircle } from 'lucide-react';
import { sounds } from '../utils/audio';
import { celebrate } from '../utils/celebrate';
import { useRound } from '../hooks/useRound';
import { useWakeLock } from '../hooks/useWakeLock';
import SettingsModal from './SettingsModal';
import { ALL_COLORS } from '../data/colors';
import { nextInSequence } from '../utils/sequence';
import { loadSetting, saveSetting, REPETITION_OPTIONS } from '../utils/repetitions';
import { useCountdown } from '../hooks/useCountdown';
import Countdown from './Countdown';
import RunSettings from './RunSettings';

// Coloured numbers: the arrows tool's twin, with digits instead of directions.
// The adult picks which numbers and which colours can come up; the child names
// the number and its colour, or counts the dots in the quiz.

const ALL_NUMBERS = Array.from({ length: 21 }, (_, i) => i);

const NUMBER_WORDS = [
  'zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć',
  'dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście',
  'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście', 'dwadzieścia'
];

const NUMBER_PRESETS = [
  { id: '1-5', label: '1-5', from: 1, to: 5 },
  { id: '1-10', label: '1-10', from: 1, to: 10 },
  { id: '0-10', label: '0-10', from: 0, to: 10 },
  { id: '11-20', label: '11-20', from: 11, to: 20 },
  { id: '0-20', label: '0-20', from: 0, to: 20 }
];

const range = (from, to) => ALL_NUMBERS.filter((n) => n >= from && n <= to);

const NUMBERS_KEY = 'letter_app_numbers_values';
const COLORS_KEY = 'letter_app_numbers_colors';
const REPS_KEY = 'letter_app_numbers_reps';
const COUNTDOWN_KEY = 'letter_app_numbers_countdown';
const DOTS_KEY = 'letter_app_numbers_dots';
const GRID_KEY = 'letter_app_numbers_grid';
const GRID_SIZES = [4, 6, 8, 9, 12, 16];

const AUTOPLAY_INTERVAL_MS = 2500;
const QUIZ_CHOICES = 4;

// Same board geometry as the arrows grid, so it fits the screen the same way.
const GRID_GAP = 12;
const GRID_PADDING = 18;
const GRID_CHROME = 374;

const cardId = (card) => `${card.num}|${card.col.id}`;
const allCards = (numbers, colors) => numbers.flatMap((num) => colors.map((col) => ({ num, col })));

const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const isList = (v) => Array.isArray(v) && v.length > 0;

// Dots in rows of five, the way fingers and an abacus group them, so a child
// can see 7 as five and two rather than counting from scratch.
function Dots({ count, color }) {
  if (count === 0) return <div className="number-dots is-empty" aria-hidden="true" />;
  return (
    <div className="number-dots" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="number-dot" style={{ backgroundColor: color }} />
      ))}
    </div>
  );
}

export default function NumbersTool({ onBack }) {
  const [selectedNumbers, setSelectedNumbers] = useState(() =>
    loadSetting(NUMBERS_KEY, range(1, 10), (v) => isList(v) && v.every((n) => ALL_NUMBERS.includes(n)))
  );
  const [selectedColorIds, setSelectedColorIds] = useState(() =>
    loadSetting(COLORS_KEY, ['red', 'blue', 'green', 'yellow'], (v) => isList(v))
  );
  const [repetitions, setRepetitions] = useState(() =>
    loadSetting(REPS_KEY, 0, (v) => REPETITION_OPTIONS.includes(v))
  );
  const [useCountdownSetting, setUseCountdownSetting] = useState(() =>
    loadSetting(COUNTDOWN_KEY, true, (v) => typeof v === 'boolean')
  );
  const [showDots, setShowDots] = useState(() => loadSetting(DOTS_KEY, true, (v) => typeof v === 'boolean'));

  const [toolMode, setToolMode] = useState('card');
  const [gridSize, setGridSize] = useState(() => loadSetting(GRID_KEY, 6, (v) => GRID_SIZES.includes(v)));
  const [showSettings, setShowSettings] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [shownCount, setShownCount] = useState(0);
  const [runFinished, setRunFinished] = useState(false);
  const countdown = useCountdown();
  // One quiz card is one round: a wrong count first costs the clean stars.
  const quiz = useRound('numbers');
  useWakeLock(isAutoPlaying || countdown.running);

  const [active, setActive] = useState(() => ({ num: 1, col: ALL_COLORS[0], roll: 0, repeat: false }));
  const [gridItems, setGridItems] = useState([]);
  const [quizOptions, setQuizOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });

  const historyRef = useRef([]);
  const shownRef = useRef(0);
  const timerRef = useRef(null);

  const activeNumbers = useMemo(() => {
    const list = ALL_NUMBERS.filter((n) => selectedNumbers.includes(n));
    return list.length > 0 ? list : [1];
  }, [selectedNumbers]);

  const activeColors = useMemo(() => {
    const list = ALL_COLORS.filter((c) => selectedColorIds.includes(c.id));
    return list.length > 0 ? list : [ALL_COLORS[0]];
  }, [selectedColorIds]);

  // Every size fills its rectangle: 8 is two rows of four, not three of three
  // with a hole.
  const gridColumns = gridSize <= 4 ? 2 : gridSize === 8 ? 4 : gridSize <= 9 ? 3 : 4;
  const gridRows = Math.ceil(gridSize / gridColumns);

  useEffect(() => saveSetting(NUMBERS_KEY, selectedNumbers), [selectedNumbers]);
  useEffect(() => saveSetting(COLORS_KEY, selectedColorIds), [selectedColorIds]);
  useEffect(() => saveSetting(REPS_KEY, repetitions), [repetitions]);
  useEffect(() => saveSetting(COUNTDOWN_KEY, useCountdownSetting), [useCountdownSetting]);
  useEffect(() => saveSetting(DOTS_KEY, showDots), [showDots]);
  useEffect(() => saveSetting(GRID_KEY, gridSize), [gridSize]);

  // The quiz offers the right number and up to three others from the chosen set.
  const quizOptionsFor = (num) =>
    shuffle([num, ...shuffle(activeNumbers.filter((n) => n !== num)).slice(0, QUIZ_CHOICES - 1)]).sort(
      (a, b) => a - b
    );

  const rollNew = (playFx = true) => {
    if (playFx) sounds.playRandom();
    const card = nextInSequence(allCards(activeNumbers, activeColors), historyRef.current, cardId);
    const id = cardId(card);
    const repeat = historyRef.current[historyRef.current.length - 1] === id;
    historyRef.current = [...historyRef.current.slice(-5), id];
    setActive((prev) => ({ ...card, roll: prev.roll + 1, repeat }));
    setQuizOptions(quizOptionsFor(card.num));
    setQuizFeedback(null);
    quiz.reset();
  };

  const rollNewGrid = () => {
    sounds.playRandom();
    const cards = allCards(activeNumbers, activeColors);
    const history = [];
    const items = [];
    for (let i = 0; i < gridSize; i++) {
      const card = nextInSequence(cards, history, cardId);
      history.push(cardId(card));
      items.push({ id: `${Date.now()}-${i}`, ...card });
    }
    setGridItems(items);
  };

  useEffect(() => {
    rollNew(false);
    // The roll functions are remade every render and read only what is listed
    // here, so listing them would re-roll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNumbers, activeColors]);

  useEffect(() => {
    if (toolMode === 'grid') rollNewGrid();
    // The roll functions are remade every render and read only what is listed
    // here, so listing them would re-roll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolMode, gridSize, activeNumbers, activeColors]);

  useEffect(() => {
    if (isAutoPlaying && toolMode === 'card') {
      timerRef.current = setInterval(() => {
        if (repetitions > 0 && shownRef.current >= repetitions) {
          setIsAutoPlaying(false);
          setRunFinished(true);
          sounds.playSuccess();
          return;
        }
        rollNew(true);
        shownRef.current += 1;
        setShownCount(shownRef.current);
      }, AUTOPLAY_INTERVAL_MS);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
    // The roll functions are remade every render and read only what is listed
    // here, so listing them would re-roll on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoPlaying, toolMode, activeNumbers, activeColors, repetitions]);

  const stopAutoPlay = () => {
    countdown.cancel();
    setIsAutoPlaying(false);
  };

  const startAutoPlay = () => {
    setRunFinished(false);
    const begin = () => {
      shownRef.current = 1;
      setShownCount(1);
      rollNew(true);
      setIsAutoPlaying(true);
    };
    if (useCountdownSetting) countdown.start(begin);
    else begin();
  };

  const switchMode = (mode) => {
    sounds.playClick();
    stopAutoPlay();
    setToolMode(mode);
    if (mode === 'quiz') setQuizOptions(quizOptionsFor(active.num));
  };

  // Every right answer used to be recorded as clean, so a child who tapped
  // through the options got three stars per number.
  const handleQuizGuess = (num) => {
    if (quizFeedback) return;
    if (num === active.num) {
      if (!quiz.win(String(active.num))) return;
      sounds.playSuccess();
      setQuizFeedback('correct');
      setQuizScore((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      celebrate({ particleCount: 40, spread: 60, origin: { y: 0.6 }, colors: [active.col.color, '#FACC15'] });
      quiz.after(() => rollNew(false), 1400);
    } else {
      sounds.playError();
      quiz.miss();
      setQuizFeedback('wrong');
      setQuizScore((prev) => ({ ...prev, total: prev.total + 1 }));
      quiz.after(() => setQuizFeedback(null), 1200);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (showSettings || e.repeat) return;
      // Space on a focused button is that button's click; do not also roll.
      if (e.target instanceof HTMLElement && e.target.closest('button, input') && e.key === ' ') return;
      if (e.key === 'Escape') onBack();
      else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (toolMode === 'card' && !countdown.running) rollNew(true);
        if (toolMode === 'grid') rollNewGrid();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleNumber = (n) => {
    sounds.playClick();
    setSelectedNumbers((prev) => {
      if (prev.includes(n)) return prev.length <= 1 ? prev : prev.filter((x) => x !== n);
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const toggleColor = (id) => {
    sounds.playClick();
    setSelectedColorIds((prev) => {
      if (prev.includes(id)) return prev.length <= 1 ? prev : prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const presetActive = (p) => {
    const want = range(p.from, p.to);
    return want.length === selectedNumbers.length && want.every((n) => selectedNumbers.includes(n));
  };

  // Dots stay readable up to twenty; past ten they wrap to a second block.
  const dotsVisible = showDots;
  const autoRunning = isAutoPlaying || countdown.running;

  return (
    <div className="stage-container arrows-tool-container numbers-tool" style={{ backgroundColor: active.col.bgColor }}>
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Wróć do wyboru zabaw"
        >
          <ChevronLeft color={active.col.text} size={28} aria-hidden="true" />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🔢</span>
          <span className="stage-title" style={{ color: active.col.text }}>
            Kolorowe Liczby
          </span>
        </div>

        <button
          className="settings-toggle-btn"
          onClick={() => {
            sounds.playClick();
            setShowSettings(true);
          }}
          title="Ustawienia liczb i kolorów"
          aria-label="Ustawienia liczb i kolorów"
        >
          <Sliders size={20} color="#334155" aria-hidden="true" />
        </button>
      </div>

      <div className="shapes-mode-tabs glass-panel">
        <button className={`shapes-tab-btn ${toolMode === 'card' ? 'active' : ''}`} onClick={() => switchMode('card')}>
          <Square size={16} /> Duża Liczba
        </button>
        <button className={`shapes-tab-btn ${toolMode === 'grid' ? 'active' : ''}`} onClick={() => switchMode('grid')}>
          <Grid size={16} /> Siatka
        </button>
        <button className={`shapes-tab-btn ${toolMode === 'quiz' ? 'active' : ''}`} onClick={() => switchMode('quiz')}>
          <HelpCircle size={16} /> Ile kropek?
        </button>
      </div>

      {toolMode === 'card' && (
        <div className="arrow-card-view">
          <div className="arrow-hero-card glass-panel number-hero-card" style={{ borderColor: active.col.color }}>
            {(isAutoPlaying || runFinished) && repetitions > 0 && (
              <span className="run-counter-badge" style={{ color: active.col.text }}>
                {Math.min(shownCount, repetitions)} / {repetitions}
              </span>
            )}
            <span
              key={active.roll}
              className={`number-hero-digit card-pop ${active.repeat ? 'is-repeat' : ''}`}
              style={{ color: active.col.color, '--digit-edge': active.col.text }}
            >
              {active.num}
            </span>
            {dotsVisible && <Dots count={active.num} color={active.col.color} />}
          </div>

          <div className="arrow-controls-row">
            <button
              className="action-btn btn-random-shape"
              onClick={() => {
                setRunFinished(false);
                rollNew(true);
              }}
              disabled={countdown.running}
              title="Losuj kolejną (Spacja)"
            >
              <Shuffle size={18} style={{ marginRight: '6px' }} />
              Losuj kolejną
            </button>
            <button
              className={`action-btn ${autoRunning ? 'btn-clear' : 'btn-replay'}`}
              onClick={() => {
                sounds.playClick();
                if (autoRunning) stopAutoPlay();
                else startAutoPlay();
              }}
            >
              {autoRunning ? (
                <>
                  <Pause size={18} style={{ marginRight: '6px' }} /> Zatrzymaj
                </>
              ) : (
                <>
                  <Play size={18} style={{ marginRight: '6px' }} /> Auto-slajdy
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {toolMode === 'grid' && (
        <div className="arrow-grid-view">
          <div className="grid-size-selector glass-panel">
            <span>Rozmiar siatki:</span>
            {GRID_SIZES.map((sz) => (
              <button
                key={sz}
                className={`grid-size-btn ${gridSize === sz ? 'active' : ''}`}
                aria-pressed={gridSize === sz}
                onClick={() => {
                  sounds.playClick();
                  setGridSize(sz);
                }}
              >
                {sz}
              </button>
            ))}
          </div>

          <div
            className="arrows-matrix-grid glass-panel"
            style={{
              gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
              maxWidth: `min(520px, calc((100dvh - ${GRID_CHROME}px - ${
                (gridRows - 1) * GRID_GAP + GRID_PADDING * 2
              }px) / ${gridRows} * ${gridColumns} + ${(gridColumns - 1) * GRID_GAP + GRID_PADDING * 2}px))`
            }}
          >
            {gridItems.map((item) => (
              <div
                key={item.id}
                className="matrix-arrow-cell number-cell"
                style={{ backgroundColor: item.col.bgColor, borderColor: item.col.color }}
              >
                <span className="number-cell-digit" style={{ color: item.col.color, '--digit-edge': item.col.text }}>
                  {item.num}
                </span>
              </div>
            ))}
          </div>

          <button className="action-btn btn-random-shape" onClick={rollNewGrid} title="Generuj nową planszę (Spacja)">
            <Shuffle size={18} style={{ marginRight: '6px' }} />
            Generuj nową planszę
          </button>
        </div>
      )}

      {toolMode === 'quiz' && (
        <div className="arrow-quiz-view">
          <div className="quiz-score-badge glass-panel">
            🎯 Punkty: <strong>{quizScore.correct}</strong> / {quizScore.total}
          </div>

          {/* The dots take as many rows as the biggest number that can come
              up, so a 3 after a 9 does not shrink the card and pull the
              answers up under the finger. */}
          <div
            className="arrow-quiz-card glass-panel number-quiz-card"
            style={{
              borderColor: active.col.color,
              '--dot-rows': Math.max(1, Math.ceil(Math.max(...activeNumbers) / 5))
            }}
          >
            <div key={active.roll} className={`card-pop ${active.repeat ? 'is-repeat' : ''}`}>
              <Dots count={active.num} color={active.col.color} />
              {active.num === 0 && <span className="number-zero-hint">pusto</span>}
            </div>
            <h3 className="quiz-instruction">Ile jest kropek?</h3>
          </div>

          <div className="quiz-options-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: '380px' }}>
            {quizOptions.map((num) => (
              <button
                key={num}
                className="quiz-dir-btn glass-panel"
                onClick={() => handleQuizGuess(num)}
                disabled={!!quizFeedback}
                aria-label={NUMBER_WORDS[num]}
              >
                <span className="quiz-btn-icon number-quiz-option">{num}</span>
              </button>
            ))}
          </div>

          {/* Always there, empty until an answer, so the answer appearing does
              not grow the screen by a row. */}
          <div className="quiz-feedback-slot" aria-live="polite">
            {quizFeedback === 'correct' && (
              <div className="quiz-feedback-toast correct">🎉 Brawo! To jest {NUMBER_WORDS[active.num]}!</div>
            )}
            {quizFeedback === 'wrong' && <div className="quiz-feedback-toast wrong">❌ Ups! Policz jeszcze raz!</div>}
          </div>
        </div>
      )}

      <Countdown count={countdown.count} color={active.col.color} />

      {showSettings && (
        <SettingsModal title="Ustawienia liczb" doneLabel="Zastosuj i zamknij" onClose={() => setShowSettings(false)}>
          <div className="settings-section">
            <h3>1. Które liczby ({activeNumbers.length} aktywnych):</h3>
            <div className="settings-quick-actions">
              {NUMBER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`quick-chip-btn ${presetActive(p) ? 'active' : ''}`}
                  aria-pressed={presetActive(p)}
                  onClick={() => {
                    sounds.playClick();
                    setSelectedNumbers(range(p.from, p.to));
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="numbers-selection-grid">
              {ALL_NUMBERS.map((n) => {
                const isSel = selectedNumbers.includes(n);
                return (
                  <button
                    key={n}
                    className={`number-select-pill ${isSel ? 'selected' : ''}`}
                    onClick={() => toggleNumber(n)}
                    aria-pressed={isSel}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>2. Kolory ({selectedColorIds.length} aktywnych):</h3>
              <button
                className="text-link-btn"
                onClick={() => {
                  sounds.playClick();
                  setSelectedColorIds(ALL_COLORS.map((c) => c.id));
                }}
              >
                Wszystkie
              </button>
            </div>
            <div className="colors-selection-grid">
              {ALL_COLORS.map((c) => {
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
            title="3. Auto-slajdy - ile liczb:"
            unit="liczbach"
            repetitions={repetitions}
            onRepetitions={setRepetitions}
            countdown={useCountdownSetting}
            onCountdown={setUseCountdownSetting}
          />

          <div className="settings-section">
            <h3>4. Opcje wyświetlania:</h3>
            <div className="settings-options-list">
              <label className="settings-checkbox-label">
                <input type="checkbox" checked={showDots} onChange={(e) => setShowDots(e.target.checked)} />
                <span>Pokazuj kropki pod liczbą</span>
              </label>
            </div>
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

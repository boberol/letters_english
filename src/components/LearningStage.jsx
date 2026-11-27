import React, { useState, useRef, useEffect, useMemo } from 'react';
import { celebrate } from '../utils/celebrate';
import { ChevronLeft, Check, RotateCcw, ArrowRight, Play, Edit3, Sparkles, Eraser } from 'lucide-react';
import { getThemeForLetter } from '../data/themes';
import { getLetterPaths, TRACING_ALPHABET } from '../data/lettersData';
import { validateDrawing } from '../utils/validation';
import { sounds } from '../utils/audio';
import { useRound } from '../hooks/useRound';
import LetterCanvas from './LetterCanvas';
import ButtonSwap from './ButtonSwap';
import FeedbackModal from './FeedbackModal';

const STAGES = ['animation', 'guided', 'independent'];

// How long a feedback card stays before the canvas is handed back blank.
const FEEDBACK_MS = 2400;
const SUCCESS_MS = 2500;

// What each miss shows on the canvas. The child cannot read the card, so the
// card is for the adult and the canvas does the explaining: the right strokes
// replayed over the child's own from their start dots, or the place the letter
// belongs outlined.
const SHOWS = {
  reversed: 'demo',
  'wrong-shape': 'demo',
  'wrong-letter': 'demo',
  'extra-marks': 'demo',
  'too-small': 'highlight',
  'too-big': 'highlight',
  'off-line': 'highlight',
  'off-guide': 'highlight'
};

export default function LearningStage({ letter, onBack }) {
  const [stageIndex, setStageIndex] = useState(0);
  // 'success' | 'reversed' | 'too-small' | 'too-big' | 'off-line' |
  // 'extra-marks' | 'wrong-letter' | 'wrong-shape' | 'off-guide'
  const [feedback, setFeedback] = useState(null);
  const [matchedLetter, setMatchedLetter] = useState(null);
  const [offLineDirection, setOffLineDirection] = useState('up');
  // Counters that replay the canvas's picture feedback (see LetterCanvas).
  const [demo, setDemo] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [pulse, setPulse] = useState(0);
  const canvasRef = useRef(null);
  // The letter's three stages are one round: a check that failed in the first
  // still holds back the clean stars in the last, and each stage can be won
  // once - Enter pressed again under "Wonderful!" used to add a star a time.
  const round = useRound('letters');

  const theme = getThemeForLetter(letter);
  const paths = getLetterPaths(letter);
  const currentMode = STAGES[stageIndex];

  // Every other letter, so the check can tell "this is really a k" apart from
  // "this is a messy h". Parsed paths are cached, so this is cheap.
  //
  // Same case only. A capital is drawn twice the height of a lowercase letter,
  // so mixing the two in would let "O" beat "o" on a large drawing and turn a
  // right answer into "you drew a different letter". The accented letters are
  // in, though: they are exactly the near-misses this check exists for.
  const alternatives = useMemo(() => {
    const capital = letter !== letter.toLowerCase();
    return TRACING_ALPHABET.map((l) => (capital ? l.toUpperCase() : l))
      .filter((l) => l !== letter)
      .map((l) => ({ id: l, data: getLetterPaths(l) }));
  }, [letter]);

  // Back to a blank canvas with nothing showing over it.
  const resetSheet = () => {
    canvasRef.current?.clearCanvas();
    setFeedback(null);
    setDemo(0);
    setHighlight(0);
  };

  const goToStage = (index) => {
    round.reset({ keepMistakes: true });
    setStageIndex(index);
    resetSheet();
  };

  const handleNextStage = () => {
    sounds.playClick();
    if (stageIndex < 2) goToStage(stageIndex + 1);
    else onBack(); // Done with all stages
  };

  const handleClear = () => {
    if (feedback) return;
    sounds.playClick();
    resetSheet();
  };

  const handleCheck = () => {
    // A card is up: this drawing has had its answer.
    if (feedback || round.isWon()) return;

    const userStrokes = canvasRef.current?.getStrokes();
    const { isCorrect, reason, matchedLetter, direction } = validateDrawing(
      userStrokes,
      paths,
      currentMode,
      { alternatives }
    );

    if (isCorrect) {
      if (!round.win(letter)) return;
      sounds.playSuccess();
      setFeedback('success');
      celebrate({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: [theme.color, '#FACC15', '#3B82F6', '#EC4899']
      });
      round.after(handleNextStage, SUCCESS_MS);
      return;
    }

    // Nothing drawn is not a mistake: the canvas and its start dots pulse to
    // say "here", and there is no card to dismiss.
    if (reason === 'empty') {
      sounds.playClick();
      setPulse((n) => n + 1);
      return;
    }

    sounds.playError();
    round.miss();
    setMatchedLetter(matchedLetter || null);
    if (direction) setOffLineDirection(direction);
    setFeedback(reason);

    let wait = FEEDBACK_MS;
    if (SHOWS[reason] === 'demo') {
      setDemo((n) => n + 1);
      // Long enough to watch the whole letter drawn over their own.
      wait = Math.max(FEEDBACK_MS, (canvasRef.current?.demoMs() || 0) + 600);
    } else if (SHOWS[reason] === 'highlight') {
      setHighlight((n) => n + 1);
    }
    round.after(resetSheet, wait);
  };

  // Keyboard shortcuts for whoever sits with the child at a laptop or board.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onBack();
      } else if (e.key === 'c' || e.key === 'C') {
        if (currentMode !== 'animation') handleClear();
      } else if (e.key === 'Enter') {
        if (currentMode === 'animation') handleNextStage();
        else handleCheck();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const stageTab = (index, Icon, label) => (
    <button
      className={`shapes-tab-btn ${stageIndex === index ? 'active' : ''}`}
      onClick={() => {
        sounds.playClick();
        goToStage(index);
      }}
    >
      <Icon size={16} aria-hidden="true" /> {label}
    </button>
  );

  return (
    <div className="stage-container" style={{ backgroundColor: theme.bgColor }}>
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Back to letters"
        >
          <ChevronLeft color={theme.color} size={28} />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge" aria-hidden="true">{theme.icon}</span>
          <span className="stage-title" style={{ color: theme.color }}>
            Letter {letter.toUpperCase()} {letter.toLowerCase()}
          </span>
        </div>

        <div className="stage-header-spacer" />
      </div>

      <div className="shapes-mode-tabs glass-panel">
        {stageTab(0, Play, '1. Watch')}
        {stageTab(1, Edit3, '2. Trace')}
        {stageTab(2, Sparkles, '3. On my own')}
      </div>

      <LetterCanvas
        ref={canvasRef}
        paths={paths}
        mode={currentMode}
        themeColor={theme.color}
        demo={demo}
        highlight={highlight}
        pulse={pulse}
      />

      <div className="controls">
        <ButtonSwap
          active={currentMode === 'animation' ? 'animation' : 'drawing'}
          options={{
            animation: (
              <>
                <button
                  className="action-btn btn-replay"
                  onClick={() => {
                    sounds.playRandom();
                    canvasRef.current?.replayAnimation();
                  }}
                >
                  <RotateCcw size={18} style={{ marginRight: '6px' }} aria-hidden="true" />
                  Replay
                </button>
                <button className="action-btn btn-next" onClick={handleNextStage}>
                  Next <ArrowRight size={18} style={{ marginLeft: '6px' }} aria-hidden="true" />
                </button>
              </>
            ),
            drawing: (
              <>
                <button
                  className="action-btn btn-clear"
                  aria-label="Clear"
                  onClick={handleClear}
                  disabled={!!feedback}
                >
                  <Eraser size={18} style={{ marginRight: '6px' }} aria-hidden="true" />
                  <span className="btn-label-optional">Clear</span>
                </button>
                <button className="action-btn btn-check" onClick={handleCheck} disabled={!!feedback}>
                  <Check size={18} style={{ marginRight: '6px' }} aria-hidden="true" />
                  Check!
                </button>
              </>
            )
          }}
        />
      </div>

      {/* The cards sit clear of the canvas, so the child sees their own letter
          and what the canvas is showing them about it. The words are for the
          adult; the picture on the canvas is for the child. */}
      {feedback === 'success' && (
        <FeedbackModal peek color={theme.color} title="Wonderful!" icon={theme.icon}>
          Great job!
        </FeedbackModal>
      )}

      {feedback === 'reversed' && (
        <FeedbackModal peek title="Good shape!" icon="🔄">
          Start on the dot and draw the way the screen shows.
        </FeedbackModal>
      )}

      {feedback === 'too-small' && (
        <FeedbackModal peek title="A little too small!" icon="🔍">
          Fill the whole marked space.
        </FeedbackModal>
      )}

      {feedback === 'too-big' && (
        <FeedbackModal peek title="A little too big!" icon="📏">
          Keep inside the marked space.
        </FeedbackModal>
      )}

      {feedback === 'off-line' && (
        <FeedbackModal peek title="Good letter!" icon={offLineDirection === 'up' ? '⬇️' : '⬆️'}>
          {offLineDirection === 'up' ? 'A little too high' : 'A little too low'} - put it on the thick
          line.
        </FeedbackModal>
      )}

      {feedback === 'off-guide' && (
        <FeedbackModal peek title="Good letter!" icon="✏️">
          Now draw it on the grey guide.
        </FeedbackModal>
      )}

      {feedback === 'extra-marks' && (
        <FeedbackModal peek title="Almost!" icon="✨">
          Draw just the letter, without extra lines.
        </FeedbackModal>
      )}

      {feedback === 'wrong-letter' && (
        <FeedbackModal peek color="#ef4444" title="That's a different letter!" icon="🔤">
          That looks like <strong>{matchedLetter}</strong>. Watch how to write <strong>{letter}</strong>.
        </FeedbackModal>
      )}

      {feedback === 'wrong-shape' && (
        <FeedbackModal peek color="#ef4444" title="Oops!" icon="✏️">
          Watch how it is written, and try again.
        </FeedbackModal>
      )}
    </div>
  );
}

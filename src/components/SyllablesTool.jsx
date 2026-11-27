import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Sliders, Check, Hash, Blocks } from 'lucide-react';
import { syllablesData, syllableTier, generateSyllableTiles } from '../data/syllablesData';
import { shuffledByTier } from '../data/wordsData';
import { sounds } from '../utils/audio';
import Picture from './Picture';
import { celebrate } from '../utils/celebrate';
import { progress } from '../utils/progress';
import StarBadge from './StarBadge';
import ButtonSwap from './ButtonSwap';
import SettingsModal from './SettingsModal';
import { useRound } from '../hooks/useRound';
import { loadChoice, saveChoice } from '../utils/storage';

// Difficulty is the length of the words in the pool plus how many decoy
// syllables get mixed in. Two-syllable words are where a child
// starts, so that is the easy setting rather than a shorter time limit.
const LEVELS = {
  two: { id: 'two', label: '🟢 Two syllables', maxSyllables: 2, extras: 0 },
  three: { id: 'three', label: '🟡 Up to three syllables', maxSyllables: 3, extras: 1 },
  decoys: { id: 'decoys', label: '🔴 Longer + decoys', maxSyllables: 9, extras: 2 }
};

const DIFF_KEY = 'letter_app_syll_diff';
const MODE_KEY = 'letter_app_syll_mode';

export default function SyllablesTool({ onBack }) {
  const [levelId, setLevelId] = useState(() => loadChoice(DIFF_KEY, Object.keys(LEVELS), 'two'));
  const [mode, setMode] = useState(() => loadChoice(MODE_KEY, ['build', 'count'], 'build'));

  const level = LEVELS[levelId];

  // Easiest words first, in a different order every time the game is opened,
  // so ◀ ▶ walk from easy to hard without always starting on the same word.
  const [orderedWords] = useState(() => shuffledByTier(syllablesData, syllableTier));

  const words = useMemo(() => {
    const pool = orderedWords.filter((w) => w.syllables.length <= level.maxSyllables);
    return pool.length > 0 ? pool : orderedWords;
  }, [orderedWords, level.maxSyllables]);

  const [wordIdx, setWordIdx] = useState(0);
  const safeIdx = words.length ? ((wordIdx % words.length) + words.length) % words.length : 0;
  const currentWord = words[safeIdx];

  const [tiles, setTiles] = useState([]);
  const [placed, setPlaced] = useState([]);
  const [feedback, setFeedback] = useState(null); // 'success' | 'wrong' | null
  const [shake, setShake] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const game = useRound('syllables');

  const stars = progress.starsFor('syllables', currentWord?.id || 'none');

  useEffect(() => {
    saveChoice(DIFF_KEY, levelId);
    saveChoice(MODE_KEY, mode);
  }, [levelId, mode]);

  // Deal a fresh set of tiles whenever the word or the decoy count changes.
  // Set while rendering, when the key changes, rather than from an effect.
  const roundKey = currentWord ? `${currentWord.id}|${level.extras}` : '';
  const [dealtFor, setDealtFor] = useState('');
  if (roundKey && dealtFor !== roundKey) {
    setDealtFor(roundKey);
    setTiles(generateSyllableTiles(currentWord.syllables, level.extras));
    setPlaced(new Array(currentWord.syllables.length).fill(null));
    setFeedback(null);
    setShake(false);
  }

  useEffect(() => {
    game.reset();
  }, [roundKey, game]);

  const goToWord = (next) => {
    game.clearTimers();
    setWordIdx(next);
  };

  const handleNext = () => {
    sounds.playClick();
    goToWord(safeIdx + 1);
  };

  const handlePrev = () => {
    sounds.playClick();
    goToWord(safeIdx - 1);
  };

  // A second Sprawdź during the celebration used to record the word again and
  // queue a second "next word", skipping one.
  const succeed = () => {
    if (!game.win(currentWord.id)) return;
    sounds.playSuccess();
    setFeedback('success');
    celebrate({ particleCount: 60, spread: 80 });
    game.after(() => goToWord(safeIdx + 1), 2400);
  };

  const fail = () => {
    sounds.playError();
    game.miss();
    setFeedback('wrong');
    setShake(true);
    game.after(() => setShake(false), 700);
  };

  // --- Build mode: tap syllables into the slots, in order ---

  const validate = (candidate = placed) => {
    if (feedback === 'success' || candidate.some((t) => t === null)) return;
    const entered = candidate.map((t) => t.text).join('');
    if (entered === currentWord.syllables.join('')) {
      succeed();
      return;
    }
    fail();
  };

  const handleTile = (tile) => {
    if (feedback === 'success') return;
    if (placed.some((t) => t && t.id === tile.id)) return;
    const slot = placed.findIndex((t) => t === null);
    if (slot === -1) return;

    sounds.playClick();
    const next = [...placed];
    next[slot] = tile;
    setPlaced(next);
    setFeedback(null);

    // Only celebrate on its own. A wrong answer waits for "Check!", so the
    // child gets a moment to look at what they built before being told.
    if (next.every((t) => t !== null) && next.map((t) => t.text).join('') === currentWord.syllables.join('')) {
      validate(next);
    }
  };

  const handleSlot = (index) => {
    if (!placed[index] || feedback === 'success') return;
    sounds.playClick();
    const next = [...placed];
    next[index] = null;
    setPlaced(next);
    setFeedback(null);
  };

  // --- Count mode: just how many syllables the word has ---

  const countOptions = useMemo(() => {
    const answer = currentWord?.syllables.length || 2;
    const set = new Set([answer, answer + 1, Math.max(2, answer - 1)]);
    return [...set].sort((a, b) => a - b);
  }, [currentWord]);

  const handleCount = (value) => {
    if (feedback === 'success') return;
    if (value === currentWord.syllables.length) {
      succeed();
      return;
    }
    fail();
  };

  if (!currentWord) return null;

  // The answer takes the place of the instruction line rather than appearing
  // under the card, so the card keeps its height and the buttons below it do
  // not jump down and back up with every answer.
  let banner = null;
  if (feedback === 'wrong') {
    banner = <div className="scramble-feedback-banner error">Not quite 🤔 Try again!</div>;
  } else if (feedback === 'success') {
    banner = (
      <div className="scramble-feedback-banner success">
        Well done! 🌟 <strong>{currentWord.syllables.join(' - ')}</strong>
      </div>
    );
  }

  return (
    <div
      className="stage-container syllables-stage"
      style={{ backgroundColor: currentWord.bgColor || '#FFEDD5' }}
    >
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Back to activities"
        >
          <ChevronLeft color={currentWord.color} size={28} />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🧩</span>
          <span className="stage-title" style={{ color: currentWord.color }}>
            Syllables
          </span>
        </div>

        <button
          className="settings-toggle-btn"
          onClick={() => {
            sounds.playClick();
            setShowSettings(true);
          }}
          title="Difficulty"
          aria-label="Difficulty"
        >
          <Sliders size={20} color="#334155" aria-hidden="true" />
        </button>
      </div>

      <div className="shapes-mode-tabs glass-panel">
        <button
          className={`shapes-tab-btn ${mode === 'build' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setMode('build');
          }}
        >
          <Blocks size={16} /> Build the word
        </button>
        <button
          className={`shapes-tab-btn ${mode === 'count' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setMode('count');
          }}
        >
          <Hash size={16} /> Count syllables
        </button>
      </div>

      <div className="scramble-play-card glass-panel">
        <div className="scramble-image-wrapper">
          <div
            className="scramble-illustration-circle"
            style={{ borderColor: currentWord.color, backgroundColor: `${currentWord.color}15` }}
          >
            <Picture
              word={currentWord.id}
              label={currentWord.name}
              className="scramble-emoji-display"
              size="100%"
            />
          </div>
        </div>

        <StarBadge count={stars} />

        {mode === 'build' ? (
          <>
            <div className={`scramble-slots-row ${shake ? 'shake' : ''}`}>
              {placed.map((tile, idx) => (
                <button
                  key={`slot-${idx}`}
                  type="button"
                  className={`syllable-slot ${tile ? 'filled' : 'empty'}`}
                  onClick={() => handleSlot(idx)}
                  disabled={!tile}
                  style={{
                    borderColor: tile ? currentWord.color : '#CBD5E1',
                    backgroundColor: tile ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'
                  }}
                  aria-label={
                    tile ? `Syllable ${tile.text} - tap to take it back` : `Empty space ${idx + 1}`
                  }
                >
                  {tile ? (
                    <span style={{ color: currentWord.color }}>{tile.text}</span>
                  ) : (
                    <span className="scramble-slot-placeholder">—</span>
                  )}
                </button>
              ))}
            </div>

            <div className="scramble-tiles-section">
              <div className="scramble-message-row" aria-live="polite">
                {banner || <div className="scramble-pool-title">Pick the syllables in order:</div>}
              </div>
              <div className="scramble-tiles-grid">
                {tiles.map((tile) => {
                  const used = placed.some((t) => t && t.id === tile.id);
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      className={`syllable-tile ${used ? 'used' : ''}`}
                      onClick={() => handleTile(tile)}
                      disabled={used}
                      aria-label={`Syllable ${tile.text}`}
                    >
                      {tile.text}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="scramble-message-row" aria-live="polite">
              {banner || <p className="scramble-pool-title">How many syllables does this word have?</p>}
            </div>
            <div className={`count-options ${shake ? 'shake' : ''}`}>
              {countOptions.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="count-option-btn"
                  style={{ borderColor: currentWord.color, color: currentWord.color }}
                  onClick={() => handleCount(value)}
                  disabled={feedback === 'success'}
                  aria-label={`${value} syllables`}
                >
                  {value}
                </button>
              ))}
            </div>
          </>
        )}

      </div>

      <div className="shapes-controls">
        <button
          className="action-btn btn-secondary-round"
          onClick={handlePrev}
          title="Previous word"
          aria-label="Previous word"
        >
          ◀
        </button>

        {/* Tapping a filled slot already hands its syllable back, so there is
            no separate clear button; count mode answers on tap and needs no
            Sprawdź. The slot is kept so ◀ and ▶ stay where they are. */}
        <ButtonSwap
          active={mode}
          options={{
            build: (
              <button className="action-btn btn-check" onClick={() => validate()} title="Check">
                <Check size={18} style={{ marginRight: '6px' }} />
                Check!
              </button>
            ),
            count: null
          }}
        />

        <button
          className="action-btn btn-secondary-round"
          onClick={handleNext}
          title="Next word"
          aria-label="Next word"
        >
          ▶
        </button>
      </div>

      <div className="shape-tracker-pill">
        Word {safeIdx + 1} of {words.length}
      </div>

      {showSettings && (
        <SettingsModal
          title="Syllable settings"
          onClose={() => setShowSettings(false)}
          summary={
            <>
              Words in the pool: <strong>{words.length}</strong>
            </>
          }
        >
          <div className="settings-section">
            <span className="settings-label">Difficulty:</span>
            <div className="settings-quick-actions">
              {Object.values(LEVELS).map((option) => (
                <button
                  key={option.id}
                  className={`quick-chip-btn ${levelId === option.id ? 'active' : ''}`}
                  aria-pressed={levelId === option.id}
                  onClick={() => {
                    sounds.playClick();
                    setLevelId(option.id);
                    setWordIdx(0);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

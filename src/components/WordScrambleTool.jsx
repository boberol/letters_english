import React, { useState, useEffect, useMemo } from 'react';
import { celebrate } from '../utils/celebrate';
import { ChevronLeft, Check, Lightbulb, Sliders } from 'lucide-react';
import { wordsData, wordsCategories, generateScramble, shuffledByTier } from '../data/wordsData';
import { sounds } from '../utils/audio';
import Picture from './Picture';
import SettingsModal from './SettingsModal';
import { useRound } from '../hooks/useRound';
import { loadChoice, saveChoice, loadSetting, saveSetting } from '../utils/storage';

// Word length is the difficulty. The bands are what the settings offer.
const LENGTHS = {
  all: { id: 'all', label: 'All', fits: () => true },
  short: { id: 'short', label: '🟢 Short (2-4 letters)', fits: (w) => w.length <= 4 },
  medium: { id: 'medium', label: '🟡 Medium (5-6 letters)', fits: (w) => w.length >= 5 && w.length <= 6 },
  long: { id: 'long', label: '🔴 Long (7 or more)', fits: (w) => w.length >= 7 }
};

const CAT_KEY = 'letter_app_scramble_cat';
const DIFF_KEY = 'letter_app_scramble_diff';
const CASE_KEY = 'letter_app_scramble_case';
const EXTRA_KEY = 'letter_app_scramble_extra';
const RIDDLE_KEY = 'letter_app_scramble_riddle';

export default function WordScrambleTool({ onBack }) {
  // --- Persistent Settings ---
  // Every read goes through the storage helpers: with site data blocked the
  // bare localStorage reads here threw during the first render and left a
  // blank page.
  const [selectedCategory, setSelectedCategory] = useState(() =>
    loadChoice(CAT_KEY, wordsCategories.map((c) => c.id), 'all')
  );
  const [difficulty, setDifficulty] = useState(() => loadChoice(DIFF_KEY, Object.keys(LENGTHS), 'all'));
  const [letterCase, setLetterCase] = useState(() => loadChoice(CASE_KEY, ['upper', 'lower'], 'upper'));
  const [extraLettersCount, setExtraLettersCount] = useState(() =>
    Number(loadChoice(EXTRA_KEY, ['1', '2', '3'], '2'))
  );
  const [showHintText, setShowHintText] = useState(() =>
    loadSetting(RIDDLE_KEY, true, (v) => typeof v === 'boolean')
  );

  // --- Game State ---
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [scrambleTiles, setScrambleTiles] = useState([]);
  const [placedTiles, setPlacedTiles] = useState([]); // Array of tile objects or null for each slot
  const [feedback, setFeedback] = useState(null); // 'success' | 'wrong' | null
  const [shakeSlots, setShakeSlots] = useState(false);
  // Hints and wrong guesses both mean this word was not solved cleanly, so the
  // extra stars are held back until it is done unaided (`game.miss`).
  const game = useRound('word-scramble');

  useEffect(() => {
    saveChoice(CAT_KEY, selectedCategory);
    saveChoice(DIFF_KEY, difficulty);
    saveChoice(CASE_KEY, letterCase);
    saveChoice(EXTRA_KEY, extraLettersCount);
    saveSetting(RIDDLE_KEY, showHintText);
  }, [selectedCategory, difficulty, letterCase, extraLettersCount, showHintText]);

  // Shortest words first, in a different order every time the game is opened,
  // so ◀ ▶ walk from easy to hard without always starting on the same word.
  // UL is the only two-letter word, so it is mixed in with the threes.
  const [orderedWords] = useState(() => shuffledByTier(wordsData, (w) => Math.max(3, w.length)));

  // Filter words by category and difficulty
  const filteredWords = useMemo(() => {
    const length = LENGTHS[difficulty] || LENGTHS.all;
    return orderedWords.filter(w => {
      const matchCat = selectedCategory === 'all' || w.category === selectedCategory;
      return matchCat && length.fits(w);
    });
  }, [orderedWords, selectedCategory, difficulty]);

  const activeWords = filteredWords.length > 0 ? filteredWords : orderedWords;

  // Wrapped once so the displayed counter can never run past the pool size
  // after the category or difficulty filter shrinks it.
  const safeIdx = useMemo(() => {
    if (activeWords.length === 0) return 0;
    return ((currentWordIdx % activeWords.length) + activeWords.length) % activeWords.length;
  }, [activeWords.length, currentWordIdx]);

  const currentWord = activeWords[safeIdx];

  // A fresh deal of tiles for each word, decoy count, or reshuffle (`deal`).
  // Set while rendering, when the key changes, rather than from an effect: an
  // effect painted the previous word's tiles for a frame and rendered twice.
  const [deal, setDeal] = useState(0);
  const roundKey = currentWord ? `${currentWord.id}|${extraLettersCount}|${deal}` : '';
  const [dealtFor, setDealtFor] = useState('');
  if (roundKey && dealtFor !== roundKey) {
    setDealtFor(roundKey);
    setScrambleTiles(generateScramble(currentWord.word, extraLettersCount));
    setPlacedTiles(new Array(currentWord.word.length).fill(null));
    setFeedback(null);
    setShakeSlots(false);
  }

  // Each deal is a new round: its timers and its miss start over.
  useEffect(() => {
    game.reset();
  }, [roundKey, game]);

  // Transform letter display by case
  const formatChar = (char) => {
    if (!char) return '';
    return letterCase === 'lower' ? char.toLowerCase() : char.toUpperCase();
  };

  // Click on a scrambled tile: place it into the first empty slot
  const handleTileClick = (tile) => {
    if (feedback === 'success') return;
    // Check if tile is already placed
    if (placedTiles.some(t => t && t.id === tile.id)) return;

    // Find first empty slot
    const firstEmptyIndex = placedTiles.findIndex(t => t === null);
    if (firstEmptyIndex === -1) return; // All slots filled

    sounds.playClick();
    const newPlaced = [...placedTiles];
    newPlaced[firstEmptyIndex] = tile;
    setPlacedTiles(newPlaced);
    setFeedback(null);

    // Only celebrate on its own. A wrong word waits for "Check!", so the
    // child gets a moment to look at what they built before being told.
    if (newPlaced.every(t => t !== null)) {
      const entered = newPlaced.map(t => t.char).join('');
      if (entered === currentWord.word.toUpperCase()) {
        validateWord(newPlaced);
      }
    }
  };

  // Click on a placed tile in slot: remove it back to pool
  const handleSlotClick = (index) => {
    if (!placedTiles[index] || feedback === 'success') return;
    sounds.playClick();
    const newPlaced = [...placedTiles];
    newPlaced[index] = null;
    setPlacedTiles(newPlaced);
    setFeedback(null);
  };

  // Hint: automatically place the next correct letter in its slot
  // The next letter the child got wrong or has not placed yet goes in. The
  // tile may already be on the board in the wrong slot - a child stuck on TOK
  // for KOT has placed every tile - so it is taken from there; it used to be
  // looked for only among the unplaced tiles, and the hint did nothing while
  // still costing the star.
  const handleHint = () => {
    if (feedback === 'success') return;
    const targetWord = currentWord.word.toUpperCase();
    const isRight = (i) => placedTiles[i] && placedTiles[i].char === targetWord[i];

    let targetSlotIdx = -1;
    for (let i = 0; i < targetWord.length; i++) {
      if (!isRight(i)) {
        targetSlotIdx = i;
        break;
      }
    }
    if (targetSlotIdx === -1) return; // Already completely correct!

    const neededChar = targetWord[targetSlotIdx];
    const slotOf = (tile) => placedTiles.findIndex((p) => p && p.id === tile.id);
    const candidates = scrambleTiles.filter((t) => t.char === neededChar && !isRight(slotOf(t)));
    // An unplaced tile first, so nothing the child put down moves needlessly.
    const tile = candidates.find((t) => slotOf(t) === -1) || candidates[0];
    if (!tile) return;

    sounds.playClick();
    game.miss();
    const newPlaced = [...placedTiles];
    const from = slotOf(tile);
    if (from !== -1) newPlaced[from] = null;
    newPlaced[targetSlotIdx] = tile;
    setPlacedTiles(newPlaced);

    if (newPlaced.every((t) => t !== null)) {
      validateWord(newPlaced);
    }
  };

  // Validate word
  // A second Sprawdź during the celebration used to record the word again
  // (three stars at once) and queue a second "next word", skipping one.
  const validateWord = (placed = placedTiles) => {
    if (feedback === 'success') return;
    const entered = placed.map(t => (t ? t.char : '')).join('');
    const target = currentWord.word.toUpperCase();

    if (entered === target) {
      if (!game.win(currentWord.id)) return;
      sounds.playSuccess();
      setFeedback('success');
      celebrate({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.6 },
        colors: [currentWord.color, '#FACC15', '#EC4899', '#3B82F6', '#10B981']
      });

      game.after(() => setCurrentWordIdx((prev) => prev + 1), 2400);
    } else {
      // An empty or half-built row is not a wrong answer yet.
      if (placed.some((t) => t === null)) return;
      game.miss();
      sounds.playError();
      setFeedback('wrong');
      setShakeSlots(true);
      game.after(() => setShakeSlots(false), 700);
    }
  };

  // The index is wrapped where it is read (`safeIdx`), so these only count.
  const handleNext = () => {
    sounds.playClick();
    game.clearTimers();
    setCurrentWordIdx((prev) => prev + 1);
  };

  const handlePrev = () => {
    sounds.playClick();
    game.clearTimers();
    setCurrentWordIdx((prev) => prev - 1);
  };

  const handleRandom = () => {
    sounds.playRandom();
    if (activeWords.length <= 1) {
      setDeal((n) => n + 1);
      return;
    }
    let nextIdx = safeIdx;
    while (nextIdx === safeIdx) {
      nextIdx = Math.floor(Math.random() * activeWords.length);
    }
    game.clearTimers();
    setCurrentWordIdx(nextIdx);
  };

  // Keyboard navigation & typing. Subscribed afresh on every render, so the
  // handlers always see the current tiles (the dependency list it had left
  // out the handlers and the case setting). The settings dialog keeps keys to
  // itself, so nothing here fires behind it.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (showSettings || e.repeat) return;
      if (e.target instanceof HTMLElement && e.target.closest('button, input') && (e.key === 'Enter' || e.key === ' ')) return;

      if (e.key === 'Escape') {
        onBack();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        handleRandom();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Backspace') {
        // Remove last placed letter
        for (let i = placedTiles.length - 1; i >= 0; i--) {
          if (placedTiles[i] !== null) {
            handleSlotClick(i);
            break;
          }
        }
      } else if (e.key === 'Enter') {
        validateWord();
      } else if (/^[a-zA-Z]$/.test(e.key)) {
        // Typing a letter
        const charUpper = e.key.toUpperCase();
        // Find unplaced tile with this character
        const availableTile = scrambleTiles.find(t => 
          t.char === charUpper && !placedTiles.some(p => p && p.id === t.id)
        );
        if (availableTile) {
          handleTileClick(availableTile);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="stage-container" style={{ backgroundColor: currentWord.bgColor || '#FFF7ED' }}>
      {/* Header Bar */}
      <div className="stage-header">
        <button 
          className="back-btn" 
          onClick={() => { sounds.playClick(); onBack(); }}
          aria-label="Back to activities"
        >
          <ChevronLeft color={currentWord.color} size={28} aria-hidden="true" />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🔤</span>
          <span className="stage-title" style={{ color: currentWord.color }}>
            Letter Jumble
          </span>
        </div>

        <button 
          className="settings-toggle-btn"
          onClick={() => { sounds.playClick(); setShowSettings(true); }}
          title="Word settings"
          aria-label="Word settings"
        >
          <Sliders size={20} color="#334155" aria-hidden="true" />
        </button>
      </div>

      {/* Main Play Card */}
      <div className="scramble-play-card glass-panel">
        {/* Word Illustration */}
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

        {/* Friendly Clue / Hint */}
        {showHintText && currentWord.hint && (
          <p className="scramble-hint-text">
            💡 <em>{currentWord.hint}</em>
          </p>
        )}

        {/* Target Word Slots Area */}
        <div
          className={`scramble-slots-row ${shakeSlots ? 'shake' : ''}`}
          style={{ '--slots': placedTiles.length }}
        >
          {placedTiles.map((tile, idx) => (
            <button
              key={`slot-${idx}`}
              type="button"
              className={`scramble-slot ${tile ? 'filled' : 'empty'}`}
              onClick={() => handleSlotClick(idx)}
              disabled={!tile}
              style={{
                borderColor: tile ? currentWord.color : '#CBD5E1',
                backgroundColor: tile ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'
              }}
              title={tile ? 'Tap to take the letter back' : 'Empty space for a letter'}
              aria-label={
                tile
                  ? `Space ${idx + 1}: ${formatChar(tile.char)} - tap to take it back`
                  : `Empty space ${idx + 1}`
              }
            >
              {tile ? (
                <span className="scramble-slot-char" style={{ color: currentWord.color }}>
                  {formatChar(tile.char)}
                </span>
              ) : (
                <span className="scramble-slot-placeholder">_</span>
              )}
            </button>
          ))}
        </div>

        {/* Scrambled Letter Tiles Pool */}
        <div className="scramble-tiles-section">
          {/* The answer takes the place of the instruction line rather than
              appearing under the card, so the card keeps its height and the
              buttons below it do not jump with every answer. */}
          <div className="scramble-message-row" aria-live="polite">
            {feedback === 'wrong' ? (
              <div className="scramble-feedback-banner error">Not quite 🤔 Try again!</div>
            ) : feedback === 'success' ? (
              <div className="scramble-feedback-banner success">
                Well done! 🌟 <strong>{formatChar(currentWord.word)}</strong>
              </div>
            ) : (
              <div className="scramble-pool-title">Pick letters to spell the word:</div>
            )}
          </div>

          <div className="scramble-tiles-grid">
            {scrambleTiles.map((tile) => {
              const isUsed = placedTiles.some(p => p && p.id === tile.id);
              return (
                <button
                  key={tile.id}
                  className={`scramble-letter-tile ${isUsed ? 'used' : ''}`}
                  onClick={() => handleTileClick(tile)}
                  disabled={isUsed || feedback === 'success'}
                  aria-label={`Letter ${formatChar(tile.char)}`}
                  style={{
                    color: isUsed ? '#94A3B8' : '#1E293B',
                    borderColor: isUsed ? 'transparent' : '#E2E8F0'
                  }}
                >
                  {formatChar(tile.char)}
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Bottom Action Controls: only the two a child needs mid-task are given
          full-size buttons; navigation and undo stay small and quiet. */}
      <div className="shapes-controls">
        <button className="action-btn btn-secondary-round" onClick={handlePrev} title="Previous word (←)" aria-label="Previous word">
          ◀
        </button>

        <button className="action-btn btn-hint" onClick={handleHint} disabled={feedback === 'success'} title="Letter hint" aria-label="Hint">
          <Lightbulb size={18} style={{ marginRight: '6px' }} />
          <span className="btn-label-optional">Hint</span>
        </button>

        <button className="action-btn btn-check" onClick={() => validateWord()} title="Check the word (Enter)">
          <Check size={18} style={{ marginRight: '6px' }} />
          Check!
        </button>

        <button className="action-btn btn-secondary-round" onClick={handleNext} title="Next word (→)" aria-label="Next word">
          ▶
        </button>
      </div>

      {/* Word Tracker Pill */}
      <div className="shape-tracker-pill">
        Word {safeIdx + 1} of {activeWords.length}
      </div>

      {showSettings && (
        <SettingsModal
          title="Word settings"
          doneLabel="Save and play"
          onClose={() => setShowSettings(false)}
          summary={
            <>
              Words in the pool: <strong>{activeWords.length}</strong>
            </>
          }
        >
          <div className="settings-section">
            <span className="settings-label">Word category:</span>
            <div className="settings-quick-actions">
              {wordsCategories.map(cat => (
                <button
                  key={cat.id}
                  className={`quick-chip-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                  aria-pressed={selectedCategory === cat.id}
                  onClick={() => {
                    sounds.playClick();
                    setSelectedCategory(cat.id);
                    setCurrentWordIdx(0);
                  }}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <span className="settings-label">Word length (difficulty):</span>
            <div className="settings-quick-actions">
              {Object.values(LENGTHS).map((option) => (
                <button
                  key={option.id}
                  className={`quick-chip-btn ${difficulty === option.id ? 'active' : ''}`}
                  aria-pressed={difficulty === option.id}
                  onClick={() => { sounds.playClick(); setDifficulty(option.id); setCurrentWordIdx(0); }}
                >
                  {option.label} ({wordsData.filter(option.fits).length})
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <span className="settings-label">Number of extra decoy letters:</span>
            <div className="settings-quick-actions">
                <button
                  className={`quick-chip-btn ${extraLettersCount === 1 ? 'active' : ''}`}
                  aria-pressed={extraLettersCount === 1}
                  onClick={() => { sounds.playClick(); setExtraLettersCount(1); }}
                >
                  +1 letter
                </button>
                <button
                  className={`quick-chip-btn ${extraLettersCount === 2 ? 'active' : ''}`}
                  aria-pressed={extraLettersCount === 2}
                  onClick={() => { sounds.playClick(); setExtraLettersCount(2); }}
                >
                  +2 letters (Default) ⭐
                </button>
                <button
                  className={`quick-chip-btn ${extraLettersCount === 3 ? 'active' : ''}`}
                  aria-pressed={extraLettersCount === 3}
                  onClick={() => { sounds.playClick(); setExtraLettersCount(3); }}
                >
                  +3 letters (Harder)
                </button>
            </div>
          </div>

          <div className="settings-section">
            <span className="settings-label">Letters on the tiles:</span>
            <div className="settings-quick-actions">
                <button
                  className={`quick-chip-btn ${letterCase === 'upper' ? 'active' : ''}`}
                  aria-pressed={letterCase === 'upper'}
                  onClick={() => { sounds.playClick(); setLetterCase('upper'); }}
                >
                  🔤 CAPITALS (C A T)
                </button>
                <button
                  className={`quick-chip-btn ${letterCase === 'lower' ? 'active' : ''}`}
                  aria-pressed={letterCase === 'lower'}
                  onClick={() => { sounds.playClick(); setLetterCase('lower'); }}
                >
                  🔡 small (c a t)
                </button>
            </div>
          </div>

          <div className="settings-section">
            <span className="settings-label">Extra help:</span>
            <div className="settings-toggle-row">
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={showHintText}
                  onChange={(e) => {
                    sounds.playClick();
                    setShowHintText(e.target.checked);
                  }}
                />
                <span>Show the riddle (a text hint)</span>
              </label>
            </div>
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

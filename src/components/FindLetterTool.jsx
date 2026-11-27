import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Sliders, Shuffle } from 'lucide-react';
import { ALPHABET } from '../data/lettersData';
import { confusableLetters } from '../data/letterConfusion';
import { sounds } from '../utils/audio';
import { celebrate } from '../utils/celebrate';
import { progress } from '../utils/progress';
import { randomFrom, shuffle } from '../utils/random';
import { loadChoice, saveChoice } from '../utils/storage';
import { useRound } from '../hooks/useRound';
import StarBadge from './StarBadge';
import FeedbackModal from './FeedbackModal';
import SettingsModal from './SettingsModal';

// Grid size, how many of the tiles are the answer, and how mean the distractors
// are allowed to be. The easy setting deliberately keeps every distractor a
// clearly different shape, so a three-year-old can succeed by matching outlines
// before they can name letters.
const LEVELS = {
  easy: { id: 'easy', label: '🟢 Łatwy', tiles: 6, matches: 2, columns: 3, diacritics: false, mixedCase: false, lookalikes: false },
  medium: { id: 'medium', label: '🟡 Średni', tiles: 9, matches: 3, columns: 3, diacritics: false, mixedCase: false, lookalikes: true },
  hard: { id: 'hard', label: '🔴 Trudny', tiles: 12, matches: 3, columns: 4, diacritics: true, mixedCase: true, lookalikes: true }
};

const STORAGE_KEY = 'letter_app_find_diff';


const buildRound = (level, previousTarget) => {
  let target = randomFrom(ALPHABET);
  // Two rounds of the same letter back to back feels like the game froze.
  let guard = 0;
  while (target === previousTarget && ALPHABET.length > 1 && guard++ < 10) {
    target = randomFrom(ALPHABET);
  }

  const distractorCount = level.tiles - level.matches;
  const distractors = confusableLetters(target, distractorCount, {
    includeDiacritics: level.diacritics,
    lookalikes: level.lookalikes,
    pool: ALPHABET
  });

  // On the hard setting a tile may show either case, and both still count:
  // recognising "A" and "a" as one letter is the skill being practised.
  const casing = (char) => (level.mixedCase && Math.random() < 0.5 ? char.toUpperCase() : char);

  const tiles = shuffle([
    ...Array.from({ length: level.matches }, (_, i) => ({
      id: `m-${i}`,
      char: casing(target),
      isMatch: true
    })),
    ...distractors.map((char, i) => ({
      id: `d-${i}`,
      char: casing(char),
      isMatch: false
    }))
  ]);

  return { target, tiles };
};

export default function FindLetterTool({ onBack }) {
  const [levelId, setLevelId] = useState(() => loadChoice(STORAGE_KEY, Object.keys(LEVELS), 'easy'));

  const level = LEVELS[levelId];

  const [board, setBoard] = useState(() => buildRound(LEVELS[levelId], null));
  const [found, setFound] = useState([]);
  const [wrongId, setWrongId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // A round counts as clean only if the child never tapped a wrong tile, which
  // is what the second and third star are for.
  const round = useRound('find-letter');

  const stars = progress.starsFor('find-letter', board.target);
  const gridRows = Math.ceil(level.tiles / level.columns);

  useEffect(() => saveChoice(STORAGE_KEY, levelId), [levelId]);

  const nextRound = useCallback(
    (levelOverride) => {
      const nextLevel = levelOverride || level;
      setBoard((prev) => buildRound(nextLevel, prev?.target));
      setFound([]);
      setWrongId(null);
      setShowSuccess(false);
      round.reset();
    },
    [level, round]
  );

  const handleTile = (tile) => {
    if (showSuccess || found.includes(tile.id)) return;

    if (!tile.isMatch) {
      sounds.playError();
      round.miss();
      setWrongId(tile.id);
      round.after(() => setWrongId((current) => (current === tile.id ? null : current)), 600);
      return;
    }

    sounds.playClick();
    const nextFound = [...found, tile.id];
    setFound(nextFound);

    if (nextFound.length < level.matches) return;

    // Every match found: that is the round.
    if (!round.win(board.target)) return;
    sounds.playSuccess();
    setShowSuccess(true);
    celebrate();
    round.after(() => nextRound(), 1800);
  };

  const chooseLevel = (id) => {
    sounds.playClick();
    setLevelId(id);
    nextRound(LEVELS[id]);
  };

  return (
    <div className="stage-container" style={{ backgroundColor: '#ECFEFF' }}>
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Wróć do wyboru zabaw"
        >
          <ChevronLeft color="#0E7490" size={28} />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🔍</span>
          <span className="stage-title" style={{ color: '#0E7490' }}>
            Znajdź literę
          </span>
        </div>

        <button
          className="settings-toggle-btn"
          onClick={() => {
            sounds.playClick();
            setShowSettings(true);
          }}
          title="Poziom trudności"
          aria-label="Poziom trudności"
        >
          <Sliders size={20} color="#334155" />
        </button>
      </div>

      {/* What to look for */}
      <div className="find-target glass-panel">
        <span className="find-target-label">Znajdź wszystkie:</span>
        <div className="find-target-letter" aria-label={`Litera ${board.target}`}>
          {board.target}
        </div>
        <StarBadge count={stars} />
      </div>

      <div className="find-progress-pill">
        {found.length} z {level.matches}
      </div>

      {/* The tiles to search */}
      <div
        className="find-grid"
        style={{
          gridTemplateColumns: `repeat(${level.columns}, 1fr)`,
          '--grid-rows': gridRows,
          '--grid-cols': level.columns
        }}
      >
        {board.tiles.map((tile) => {
          const isFound = found.includes(tile.id);
          return (
            <button
              key={tile.id}
              type="button"
              className={`find-tile ${isFound ? 'found' : ''} ${wrongId === tile.id ? 'wrong' : ''}`}
              onClick={() => handleTile(tile)}
              disabled={isFound || showSuccess}
              aria-label={`Litera ${tile.char}`}
            >
              <span className="find-tile-letter">{tile.char}</span>
            </button>
          );
        })}
      </div>

      <button
        className="action-btn btn-random-shape"
        onClick={() => {
          sounds.playRandom();
          nextRound();
        }}
      >
        <Shuffle size={18} style={{ marginRight: '6px' }} />
        Inna litera
      </button>

      {showSuccess && (
        <FeedbackModal color="#0E7490" title="Brawo!" icon="🔍">
          Znalezione wszystkie litery <strong className="letter-face">{board.target}</strong>!
        </FeedbackModal>
      )}

      {showSettings && (
        <SettingsModal title="Poziom trudności" onClose={() => setShowSettings(false)}>
          <div className="settings-section">
            <div className="settings-quick-actions">
              {Object.values(LEVELS).map((option) => (
                <button
                  key={option.id}
                  className={`quick-chip-btn ${levelId === option.id ? 'active' : ''}`}
                  aria-pressed={levelId === option.id}
                  onClick={() => chooseLevel(option.id)}
                >
                  {option.label} — {option.tiles} liter
                </button>
              ))}
            </div>
            <p className="settings-hint-text">
              Na trudnym poziomie pojawiają się litery z ogonkami (ą, ę, ł) oraz wielkie i małe litery razem.
            </p>
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

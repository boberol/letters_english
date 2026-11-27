import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Sliders, Shuffle } from 'lucide-react';
import { ALPHABET } from '../data/lettersData';
import { wordsData, picturesClash } from '../data/wordsData';
import { sounds } from '../utils/audio';
import { celebrate } from '../utils/celebrate';
import { shuffle } from '../utils/random';
import { loadChoice, saveChoice } from '../utils/storage';
import { useRound } from '../hooks/useRound';
import Picture from './Picture';
import FeedbackModal from './FeedbackModal';
import SettingsModal from './SettingsModal';

const MATCH_MODES = {
  same: { id: 'same', label: '🔤 The same (A – A)' },
  case: { id: 'case', label: '🔠 Capital and small (A – a)' },
  picture: { id: 'picture', label: '🖼️ Letter and picture (c – 🐈)' }
};

const BOARD_SIZES = {
  small: { id: 'small', label: 'Small (2 × 3)', pairs: 3, columns: 3 },
  medium: { id: 'medium', label: 'Medium (3 × 4)', pairs: 6, columns: 4 },
  large: { id: 'large', label: 'Large (4 × 4)', pairs: 8, columns: 4 }
};

const MODE_KEY = 'letter_app_pairs_mode';
const SIZE_KEY = 'letter_app_pairs_size';

// How long a mismatched pair stays face up before flipping back.
const PEEK_MS = 900;


// Words whose first letter is in the alphabet we teach, so a picture card
// always has a letter card it can legitimately pair with.
// Words a child may not be able to name from the picture are left out.
const picturePool = wordsData.filter(
  (word) =>
    !word.hard && word.firstSound && !word.digraph && ALPHABET.includes(word.firstSound.toLowerCase())
);

const buildBoard = (mode, size) => {
  if (mode === 'picture') {
    // One word per starting letter, otherwise two different pictures could both
    // legitimately match the same letter card and the game becomes ambiguous.
    const byLetter = new Map();
    for (const word of shuffle(picturePool)) {
      const letter = word.firstSound.toLowerCase();
      if (byLetter.has(letter)) continue;
      // Nor two pictures that could be taken for each other (NOGA and BUTY).
      if ([...byLetter.values()].some((other) => picturesClash(other, word))) continue;
      byLetter.set(letter, word);
    }
    const chosen = shuffle([...byLetter.values()]).slice(0, size.pairs);

    return shuffle(
      chosen.flatMap((word) => {
        const letter = word.firstSound.toLowerCase();
        return [
          { id: `l-${word.id}`, pairId: word.id, face: letter.toUpperCase(), kind: 'letter' },
          { id: `p-${word.id}`, pairId: word.id, face: word.id, label: word.name, kind: 'picture' }
        ];
      })
    );
  }

  const letters = shuffle(ALPHABET).slice(0, size.pairs);

  return shuffle(
    letters.flatMap((letter) => {
      const [a, b] =
        mode === 'case' ? [letter.toUpperCase(), letter] : [letter.toUpperCase(), letter.toUpperCase()];
      return [
        { id: `a-${letter}`, pairId: letter, face: a, kind: 'letter' },
        { id: `b-${letter}`, pairId: letter, face: b, kind: 'letter' }
      ];
    })
  );
};

export default function LetterPairsTool({ onBack }) {
  const [mode, setMode] = useState(() => loadChoice(MODE_KEY, Object.keys(MATCH_MODES), 'same'));
  const [sizeId, setSizeId] = useState(() => loadChoice(SIZE_KEY, Object.keys(BOARD_SIZES), 'small'));

  const size = BOARD_SIZES[sizeId];

  const [cards, setCards] = useState(() => buildBoard(mode, BOARD_SIZES[sizeId]));
  const [flipped, setFlipped] = useState([]); // card ids currently face up
  const [matched, setMatched] = useState([]); // pairIds already won
  const [showSettings, setShowSettings] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // Every card that has been face up, so a miss can be told apart from a slip
  // of memory - see handleCard.
  const seenRef = useRef(new Set());
  const busyRef = useRef(false);
  const game = useRound('letter-pairs');

  const gridRows = Math.ceil((size.pairs * 2) / size.columns);

  useEffect(() => {
    saveChoice(MODE_KEY, mode);
    saveChoice(SIZE_KEY, sizeId);
  }, [mode, sizeId]);

  const deal = useCallback(
    (nextMode = mode, nextSize = size) => {
      game.reset();
      busyRef.current = false;
      seenRef.current = new Set();
      setCards(buildBoard(nextMode, nextSize));
      setFlipped([]);
      setMatched([]);
      setShowSuccess(false);
    },
    [mode, size, game]
  );

  const handleCard = (card) => {
    if (busyRef.current || showSuccess) return;
    if (flipped.includes(card.id) || matched.includes(card.pairId)) return;

    sounds.playClick();
    const nextFlipped = [...flipped, card.id];
    setFlipped(nextFlipped);

    if (nextFlipped.length < 2) return;

    const [firstId, secondId] = nextFlipped;
    const first = cards.find((c) => c.id === firstId);
    const second = cards.find((c) => c.id === secondId);

    // The clean stars are for memory, not luck. A perfect game used to mean
    // never turning a wrong pair at all - one chance in 15 on the small board,
    // about one in 10,000 on the medium one, however good the child's memory.
    // Now a miss only counts when it could have been avoided: the first card's
    // partner had already been seen, so the child could have found it.
    const partnerSeen = cards.some(
      (c) => c.pairId === first.pairId && c.id !== first.id && seenRef.current.has(c.id)
    );
    seenRef.current.add(firstId);
    seenRef.current.add(secondId);

    if (first.pairId === second.pairId) {
      const nextMatched = [...matched, first.pairId];
      setMatched(nextMatched);
      setFlipped([]);

      if (nextMatched.length === size.pairs) {
        busyRef.current = true;
        game.after(() => {
          if (!game.win(`${mode}-${sizeId}`)) return;
          sounds.playSuccess();
          setShowSuccess(true);
          celebrate();
        }, 450);
      }
      return;
    }

    if (partnerSeen) game.miss();

    // No match: hold both face up long enough to be seen, then turn them back.
    busyRef.current = true;
    sounds.playError();
    game.after(() => {
      setFlipped([]);
      busyRef.current = false;
    }, PEEK_MS);
  };

  return (
    <div className="stage-container" style={{ backgroundColor: '#F3E8FF' }}>
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Back to activities"
        >
          <ChevronLeft color="#7E22CE" size={28} />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🃏</span>
          <span className="stage-title" style={{ color: '#7E22CE' }}>
            Letter pairs
          </span>
        </div>

        <button
          className="settings-toggle-btn"
          onClick={() => {
            sounds.playClick();
            setShowSettings(true);
          }}
          title="Settings"
          aria-label="Settings"
        >
          <Sliders size={20} color="#334155" />
        </button>
      </div>

      <div className="pairs-progress-pill">
        Pairs found: {matched.length} of {size.pairs}
      </div>

      <div
        className="pairs-grid"
        style={{
          gridTemplateColumns: `repeat(${size.columns}, 1fr)`,
          '--grid-rows': gridRows,
          '--grid-cols': size.columns
        }}
      >
        {cards.map((card) => {
          const isUp = flipped.includes(card.id) || matched.includes(card.pairId);
          const isDone = matched.includes(card.pairId);
          return (
            <button
              key={card.id}
              type="button"
              className={`pair-card ${isUp ? 'flipped' : ''} ${isDone ? 'matched' : ''}`}
              onClick={() => handleCard(card)}
              disabled={isDone || showSuccess}
              aria-label={isUp ? `Card ${card.label || card.face}` : 'Face-down card'}
            >
              <span className="pair-card-inner">
                <span className="pair-card-face pair-card-back" aria-hidden="true">
                  ?
                </span>
                <span
                  className={`pair-card-face pair-card-front ${card.kind === 'picture' ? 'is-picture' : ''}`}
                  aria-hidden="true"
                >
                  {card.kind === 'picture' ? (
                    <Picture word={card.face} size="88%" />
                  ) : (
                    card.face
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        className="action-btn btn-random-shape"
        onClick={() => {
          sounds.playRandom();
          deal();
        }}
      >
        <Shuffle size={18} style={{ marginRight: '6px' }} />
        New game
      </button>

      {showSuccess && (
        <FeedbackModal
          color="#7E22CE"
          title="All the pairs!"
          icon="🎉"
          onDismiss={() => deal()}
          actions={
            <button
              className="action-btn btn-next"
              onClick={() => {
                sounds.playClick();
                deal();
              }}
            >
              Play again
            </button>
          }
        >
          Great memory!
        </FeedbackModal>
      )}

      {showSettings && (
        <SettingsModal title="Game settings" onClose={() => setShowSettings(false)}>
          <div className="settings-section">
            <label className="settings-label">What to match:</label>
            <div className="settings-quick-actions">
              {Object.values(MATCH_MODES).map((option) => (
                <button
                  key={option.id}
                  className={`quick-chip-btn ${mode === option.id ? 'active' : ''}`}
                  onClick={() => {
                    sounds.playClick();
                    setMode(option.id);
                    deal(option.id, size);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label">Board size:</label>
            <div className="settings-quick-actions">
              {Object.values(BOARD_SIZES).map((option) => (
                <button
                  key={option.id}
                  className={`quick-chip-btn ${sizeId === option.id ? 'active' : ''}`}
                  onClick={() => {
                    sounds.playClick();
                    setSizeId(option.id);
                    deal(mode, option);
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

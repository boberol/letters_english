import React, { useState } from 'react';
import { getThemeForLetter } from '../data/themes';
import { TRACING_ALPHABET } from '../data/lettersData';
import { sounds } from '../utils/audio';
import { progress } from '../utils/progress';
import { useProgress } from '../hooks/useProgress';
import StarBadge from './StarBadge';
import { ChevronLeft } from 'lucide-react';
import { loadChoice, saveChoice } from '../utils/storage';

const alphabet = TRACING_ALPHABET;

const CASE_KEY = 'letter_app_letter_case';

export default function MenuScreen({ onSelectLetter, onBack }) {
  // Which case is being practised. Remembered because a child working through
  // the capitals should not have to re-pick them on every visit.
  const [letterCase, setLetterCase] = useState(() => loadChoice(CASE_KEY, ['lower', 'upper'], 'lower'));
  // Subscribed so the badges refresh the moment a star is earned and the child
  // comes back to this screen.
  useProgress();

  const chooseCase = (next) => {
    sounds.playClick();
    setLetterCase(next);
    saveChoice(CASE_KEY, next);
  };

  // The two cases are separate artwork and separate practice, so a tile stands
  // for one of them - the other is shown small beside it, since recognising the
  // pair as one letter is part of the point.
  const cased = (letter) => (letterCase === 'upper' ? letter.toUpperCase() : letter);
  const partner = (letter) => (letterCase === 'upper' ? letter : letter.toUpperCase());

  return (
    <div className="menu-screen-container">
      {/* Top Header */}
      <div className="stage-header" style={{ width: '100%', maxWidth: '960px' }}>
        {onBack ? (
          <button 
            className="back-btn" 
            onClick={() => { sounds.playClick(); onBack(); }}
            aria-label="Back to activities"
          >
            <ChevronLeft color="#4F46E5" size={28} aria-hidden="true" />
          </button>
        ) : (
          <div className="stage-header-spacer" />
        )}

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">🔤</span>
          <span className="stage-title" style={{ color: '#4F46E5' }}>
            Choose a Letter
          </span>
        </div>

        <div className="stage-header-spacer" />
      </div>

      {/* Małe or wielkie: which case the tiles below hand to the tracing screen */}
      <div className="settings-quick-actions glass-panel menu-case-picker">
        <button
          className={`quick-chip-btn ${letterCase === 'lower' ? 'active' : ''}`}
          onClick={() => chooseCase('lower')}
          aria-pressed={letterCase === 'lower'}
        >
          small a
        </button>
        <button
          className={`quick-chip-btn ${letterCase === 'upper' ? 'active' : ''}`}
          onClick={() => chooseCase('upper')}
          aria-pressed={letterCase === 'upper'}
        >
          CAPITAL A
        </button>
      </div>

      {/* There used to be a row of animal filters here as well. They hid
          letters rather than teaching anything, and every tap reflowed the
          grid below, so the grid now always shows the whole alphabet. */}

      {/* Letter Grid */}
      <div className="menu-grid">
        {alphabet.map((letter) => {
          const theme = getThemeForLetter(letter);
          const chosen = cased(letter);
          return (
            <button
              key={letter}
              className="letter-btn glass-panel"
              style={{ backgroundColor: theme.bgColor, borderColor: theme.color }}
              onClick={() => {
                sounds.playClick();
                onSelectLetter(chosen);
              }}
              aria-label={`Letter ${chosen}`}
            >
              {/* A class, not `span:first-child`: that selector also caught the
                  small partner letter (the first element inside this span) and
                  the star badge's spans, drawing all of them at full size. */}
              <span className="letter-face" style={{ color: theme.color }}>
                {chosen}
                <span className="letter-btn-other">{partner(letter)}</span>
              </span>
              <span className="icon" aria-hidden="true">{theme.icon}</span>
              <StarBadge count={progress.starsFor('letters', chosen)} size="xs" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

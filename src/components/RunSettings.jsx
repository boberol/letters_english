import React from 'react';
import { REPETITION_OPTIONS, repetitionLabel } from '../utils/repetitions';
import { sounds } from '../utils/audio';

// The two settings every self-running tool shares: how many before it stops,
// and the 3-2-1 before it starts. Rendered inside a tool's settings modal.
export default function RunSettings({
  title = 'Powtórzenia:',
  unit = '',
  options = REPETITION_OPTIONS,
  repetitions,
  onRepetitions,
  countdown,
  onCountdown
}) {
  return (
    <div className="settings-section">
      <h3>{title}</h3>
      <div className="settings-quick-actions repetitions-row">
        {options.map((count) => (
          <button
            key={count}
            className={`quick-chip-btn ${repetitions === count ? 'active' : ''}`}
            onClick={() => {
              sounds.playClick();
              onRepetitions(count);
            }}
            aria-label={count === 0 ? 'Bez końca' : `${count} ${unit}`.trim()}
          >
            {repetitionLabel(count)}
          </button>
        ))}
      </div>
      <p className="settings-hint-text">
        {repetitions === 0 ? 'Bez końca - aż do zatrzymania.' : `Zatrzyma się po ${repetitions} ${unit}.`.trim()}
      </p>
      <div className="settings-options-list">
        <label className="settings-checkbox-label">
          <input type="checkbox" checked={countdown} onChange={(e) => onCountdown(e.target.checked)} />
          <span>Odliczanie 3, 2, 1 przed startem</span>
        </label>
      </div>
    </div>
  );
}

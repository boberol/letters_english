import React from 'react';
import { REPETITION_OPTIONS, repetitionLabel } from '../utils/repetitions';
import { sounds } from '../utils/audio';

// The two settings every self-running tool shares: how many before it stops,
// and the 3-2-1 before it starts. Rendered inside a tool's settings modal.
export default function RunSettings({
  title = 'Repetitions:',
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
            aria-label={count === 0 ? 'Endless' : `${count} ${unit}`.trim()}
          >
            {repetitionLabel(count)}
          </button>
        ))}
      </div>
      <p className="settings-hint-text">
        {repetitions === 0 ? 'Endless - until you stop it.' : `Stops after ${repetitions} ${unit}.`.trim()}
      </p>
      <div className="settings-options-list">
        <label className="settings-checkbox-label">
          <input type="checkbox" checked={countdown} onChange={(e) => onCountdown(e.target.checked)} />
          <span>Count down 3, 2, 1 before starting</span>
        </label>
      </div>
    </div>
  );
}

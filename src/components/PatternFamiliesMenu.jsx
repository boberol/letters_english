import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { patternFamilies, getPatternsForFamily } from '../data/patternsData';
import { sounds } from '../utils/audio';
import { progress, MAX_STARS } from '../utils/progress';
import { useProgress } from '../hooks/useProgress';
import { FAMILY_ICONS } from '../data/familyIcons';
import szlaczkiIcon from '../assets/menu-icons/szlaczki.webp';
import starIcon from '../assets/menu-icons/wyniki.webp';

// Picking a family is one tap, and the card leads with the animal: a child who
// cannot read "Rodzina żyrafy" still remembers that the giraffe is the one with
// the square corners.
export default function PatternFamiliesMenu({ onSelectFamily, onBack }) {
  // Subscribed so the progress bars refresh the moment a star is earned and the
  // child comes back to this screen.
  useProgress();

  return (
    <div className="menu-screen-container">
      <div className="stage-header" style={{ width: '100%', maxWidth: '960px' }}>
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Back to activities"
        >
          <ChevronLeft color="#0369A1" size={28} />
        </button>

        <div className="tool-header-title-badge">
          <img className="shape-icon-badge shape-icon-img" src={szlaczkiIcon} alt="" width="256" height="256" draggable="false" />
          <span className="stage-title" style={{ color: '#0369A1' }}>
            Choose a family
          </span>
        </div>

        <div className="stage-header-spacer" />
      </div>

      <div className="family-grid">
        {patternFamilies.map((family) => {
          const patterns = getPatternsForFamily(family.id);
          const earned = patterns.reduce((sum, p) => sum + progress.starsFor('patterns', p.id), 0);
          const max = patterns.length * MAX_STARS;
          const done = patterns.filter((p) => progress.starsFor('patterns', p.id) > 0).length;

          return (
            <button
              key={family.id}
              type="button"
              className="family-card"
              style={{ backgroundColor: family.bgColor, borderColor: family.color }}
              onClick={() => {
                sounds.playClick();
                onSelectFamily(family.id);
              }}
            >
              <img className="family-card-emoji" src={FAMILY_ICONS[family.id]} alt="" width="256" height="256" draggable="false" />
              <span className="family-card-title" style={{ color: family.color }}>
                {family.name}
              </span>
              <span className="family-card-subtitle">{family.subtitle}</span>

              {/* Small previews of what is inside, so the card promises
                  something concrete rather than a word. */}
              <span className="family-card-previews" aria-hidden="true">
                {patterns.slice(0, 3).map((p) => (
                  <svg key={p.id} viewBox={p.viewBox} className="family-preview-svg">
                    {p.strokes.map((stroke, i) => (
                      <path
                        key={i}
                        d={stroke.path}
                        fill="none"
                        stroke={family.color}
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.65"
                      />
                    ))}
                  </svg>
                ))}
              </span>

              <span className="family-card-progress">
                <span
                  className="family-progress-bar"
                  role="img"
                  aria-label={`${earned} of ${max} stars`}
                >
                  <span
                    className="family-progress-fill"
                    style={{ width: `${max ? (earned / max) * 100 : 0}%`, backgroundColor: family.color }}
                  />
                </span>
                <span className="family-progress-text">
                  <img className="family-progress-star" src={starIcon} alt="" width="16" height="16" draggable="false" />
                  {earned} / {max} · {done} of {patterns.length} patterns
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

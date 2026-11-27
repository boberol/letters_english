import React from 'react';
import { MAX_STARS } from '../utils/progress';

// Three stars, filled up to `count`. Shown on pickers so a child can see at a
// glance what they have already done well and what is still waiting.
//
// Empty stars stay visible rather than being hidden: the row is a goal, and a
// card that shows nothing until the first success gives no hint there is one.
export default function StarBadge({ count = 0, total = MAX_STARS, size = 'sm' }) {
  const earned = Math.max(0, Math.min(total, count));

  return (
    <span
      className={`star-badge star-badge-${size}`}
      role="img"
      aria-label={`${earned} z ${total} gwiazdek`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`star-badge-star ${i < earned ? 'earned' : 'empty'}`} aria-hidden="true">
          {i < earned ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

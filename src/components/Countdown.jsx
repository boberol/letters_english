import React from 'react';
import { createPortal } from 'react-dom';

// The big 3-2-1 over a tool that is about to start. Keyed by the number so the
// pop animation plays again for each one. Tapping it is ignored rather than
// passed through to the tool underneath.
//
// Rendered into <body>, not inside the tool: on a phone held sideways the
// stage is a grid whose side-column rule caught the overlay as one more item
// and shrank the shade to a strip down the middle of the screen. The digit
// sits in its own span so CSS can trim it to its ink (see .countdown-digit).
export default function Countdown({ count, color = '#4338CA' }) {
  if (count === null || count === undefined) return null;
  return createPortal(
    <div className="countdown-overlay" role="status" aria-live="assertive">
      <span key={count} className="countdown-number" style={{ color, borderColor: color }}>
        <span className="countdown-digit">{count}</span>
      </span>
    </div>,
    document.body
  );
}

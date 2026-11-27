import React, { useRef } from 'react';
import { useDialog, stopKeys } from '../hooks/useDialog';
import { readable } from '../utils/color';

// The card a game shows after an answer: "Brawo!", "Prawie!" and so on.
//
// Most of them go away by themselves and need nothing from the child, so they
// are announced (role="status") rather than taking focus. One with buttons
// (`actions`) waits for an answer, so it is a real dialog: focus moves to its
// button, Esc runs `onDismiss`.
//
// `peek` is for the drawing tools. The card used to blur the whole screen,
// canvas included, so a child never saw their own letter next to the guide
// while being told what was wrong with it. A peeking card sits clear of the
// canvas over a see-through shade that still stops a new stroke from starting
// before the canvas is reset.
export default function FeedbackModal({ color = '#F59E0B', icon, title, children, actions, onDismiss, peek = false }) {
  const className = `feedback-modal${peek ? ' is-peek' : ''}`;
  const body = (
    <>
      {/* h2: the screen behind has its own heading, and a card is not the page's. */}
      <h2 style={{ color: readable(color) }}>
        {title}
        {icon && (
          <span className="feedback-icon" aria-hidden="true">
            {' '}
            {icon}
          </span>
        )}
      </h2>
      {children && <p>{children}</p>}
    </>
  );

  if (actions) {
    return (
      <AlertCard className={className} color={color} onDismiss={onDismiss} actions={actions}>
        {body}
      </AlertCard>
    );
  }

  return (
    <div className={className}>
      <div className="feedback-content" style={{ borderColor: color }} role="status" aria-live="polite">
        {body}
      </div>
    </div>
  );
}

function AlertCard({ className, color, onDismiss, actions, children }) {
  const ref = useRef(null);
  useDialog(ref, onDismiss);
  return (
    <div className={className}>
      <div
        ref={ref}
        className="feedback-content"
        style={{ borderColor: color }}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        onKeyDown={stopKeys}
      >
        {children}
        <div className="feedback-actions">{actions}</div>
      </div>
    </div>
  );
}

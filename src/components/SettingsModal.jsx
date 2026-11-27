import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { sounds } from '../utils/audio';
import { useDialog, stopKeys } from '../hooks/useDialog';

// The settings panel behind every tool's gear. It is for the adult, so it may
// use words; it is one component so every panel closes the same way (X, the
// button at the bottom, Esc) and behaves as a dialog for keyboard and screen
// reader users. Ten tools used to carry their own copy of this markup.
export default function SettingsModal({ title, onClose, doneLabel = 'Gotowe', summary = null, children }) {
  const ref = useRef(null);
  const close = () => {
    sounds.playClick();
    onClose();
  };
  useDialog(ref, close);

  return (
    <div className="shapes-settings-modal-overlay">
      <div
        ref={ref}
        className="shapes-settings-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        onKeyDown={stopKeys}
      >
        <div className="settings-modal-header">
          <h2 id="settings-modal-title">{title}</h2>
          <button className="close-modal-btn" onClick={close} aria-label="Zamknij">
            <X size={24} aria-hidden="true" />
          </button>
        </div>

        {children}

        <div className="settings-modal-footer">
          {summary && <span className="selected-summary-text">{summary}</span>}
          <button className="action-btn btn-start" onClick={close}>
            {doneLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

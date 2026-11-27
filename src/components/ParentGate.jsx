import React, { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { sounds } from '../utils/audio';
import { useDialog, stopKeys } from '../hooks/useDialog';

// The grown-ups' door. Google Play's Families policy wants a gate a child cannot
// get through in front of purchases and links out of the app, and everything
// behind "For grown-ups" is one or the other. A pre-reader cannot read "seven
// times six", and an older child guessing two-digit numbers rarely gets in; a
// wrong answer brings a new question rather than another go at the same one.
const WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const newQuestion = () => {
  const a = 3 + Math.floor(Math.random() * 7);
  const b = 3 + Math.floor(Math.random() * 7);
  return { text: `${WORDS[a]} times ${WORDS[b]}`, answer: a * b };
};

export default function ParentGate({ onPass, onClose }) {
  const ref = useRef(null);
  const [question, setQuestion] = useState(newQuestion);
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const close = () => {
    sounds.playClick();
    onClose();
  };
  useDialog(ref, close);

  const submit = (e) => {
    e.preventDefault();
    sounds.playClick();
    if (Number(value) === question.answer) {
      onPass();
      return;
    }
    setWrong(true);
    setValue('');
    setQuestion(newQuestion());
  };

  return (
    <div className="shapes-settings-modal-overlay">
      <div
        ref={ref}
        className="shapes-settings-modal glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="parent-gate-title"
        tabIndex={-1}
        onKeyDown={stopKeys}
      >
        <div className="settings-modal-header">
          <h2 id="parent-gate-title">For grown-ups</h2>
          <button className="close-modal-btn" onClick={close} aria-label="Close">
            <X size={24} aria-hidden="true" />
          </button>
        </div>

        <form className="settings-section parent-gate" onSubmit={submit}>
          <label className="parent-panel-text" htmlFor="parent-gate-answer">
            {wrong ? 'Not quite. Try this one: ' : 'To carry on, type the answer to '}
            <strong>{question.text}</strong>.
          </label>
          <input
            id="parent-gate-answer"
            className="parent-gate-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={3}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          />
          <div className="settings-modal-footer">
            <button type="submit" className="action-btn btn-start" disabled={!value}>
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

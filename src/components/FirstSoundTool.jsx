import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Sliders, Shuffle, Repeat, Type } from 'lucide-react';
import { wordsData, soundsClash, picturesClash } from '../data/wordsData';
import { ALPHABET } from '../data/lettersData';
import { confusableLetters } from '../data/letterConfusion';
import { sounds } from '../utils/audio';
import { celebrate } from '../utils/celebrate';
import { progress } from '../utils/progress';
import { randomFrom, shuffle } from '../utils/random';
import { loadChoice, saveChoice } from '../utils/storage';
import { useRound } from '../hooks/useRound';
import StarBadge from './StarBadge';
import FeedbackModal from './FeedbackModal';
import SettingsModal from './SettingsModal';
import Picture from './Picture';

// Words whose first sound is a digraph (CH, SZ, CZ...) are a genuinely harder
// idea - two letters, one sound - so they are held back for the last setting,
// with the words a child may not be able to name (HARD_WORDS in wordsData).
// The easiest setting has three answers, not two: with two, half of all
// answers were a coin toss.
const LEVELS = {
  easy: { id: 'easy', label: '🟢 Easy', choices: 3, digraphs: false },
  medium: { id: 'medium', label: '🟡 Medium', choices: 4, digraphs: false },
  hard: { id: 'hard', label: '🔴 Hard', choices: 4, digraphs: true, hardWords: true }
};

const STORAGE_KEY = 'letter_app_firstsound_diff';
const MODE_KEY = 'letter_app_firstsound_mode';
const POSITION_KEY = 'letter_app_firstsound_position';

// Which letter of the word the round asks about. The first one is a sound (CH
// in "chleb" counts as one); the last and the random one are letters, because
// a word's last letter is not always the sound heard there ("chleb" ends on a
// B but sounds like P), and a random one is shown in its place in the word.
const POSITIONS = {
  first: { id: 'first', label: '⬅️ First', title: 'First sound' },
  last: { id: 'last', label: '➡️ Last', title: 'Last letter' },
  random: { id: 'random', label: '🎲 Random', title: 'Hidden letter' }
};

// Two kinds of word are held back, and only when the round is about the first
// sound: digraph words until the hardest level, and words whose first sound
// has no letter of its own (firstSound is null - SIEĆ, DZIK, see wordsData).
// Asked for the last letter of "chleb", the CH does not come into it.
const wordsForLevel = (level, position) =>
  wordsData.filter(
    (word) =>
      (level.hardWords || !word.hard) &&
      (position !== 'first' || (word.firstSound && (level.digraphs || !word.digraph)))
  );

const lettersOf = (word) => Array.from(word.word);

const pickWord = (pool, previousId) => {
  let word = randomFrom(pool);
  let guard = 0;
  while (word.id === previousId && pool.length > 1 && guard++ < 10) word = randomFrom(pool);
  return word;
};

// Where in the word the round points, and what the answer there is.
const target = (word, position) => {
  const letters = lettersOf(word);
  if (position === 'last') return { index: letters.length - 1, answer: letters[letters.length - 1] };
  if (position === 'random') {
    const index = Math.floor(Math.random() * letters.length);
    return { index, answer: letters[index] };
  }
  return { index: 0, answer: word.firstSound };
};

// Stars are kept per word and per position, so finding the last letter of a
// word the child already knows the start of still earns its own.
const itemIdFor = (word, position) => (position === 'first' ? word.id : `${word.id}-${position}`);

// Round where the picture is given and the child picks the letter.
//
// The wrong tiles have to look like the right one could. Drawn only from the
// plain alphabet, an Ł or an SZ was the one accented or two-letter tile in the
// row, and a child could answer without looking at the picture at all. So an
// accented answer comes with at least one other accented letter, a digraph
// with other digraphs, and a plain answer now and then with one of either -
// otherwise "the odd tile is never right" would be just as easy a rule.
const ACCENTED = { first: 'ĆŁÓŚŹŻ', other: 'ĄĆĘŁŃÓŚŹŻ' };
const DIGRAPHS = ['CH', 'CZ', 'DZ', 'DŻ', 'DŹ', 'RZ', 'SZ'];
const PLAIN_OF = { Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z' };
const plainOf = (letter) => PLAIN_OF[letter] || letter;

const letterDistractors = (answer, level, position) => {
  const need = level.choices - 1;
  const accented = Array.from(position === 'first' ? ACCENTED.first : ACCENTED.other);
  const base = plainOf(answer[0]);
  // A wrong letter must not be another way of writing the right sound: U next
  // to ÓSEMKA or H next to CHLEB would be a correct answer marked wrong. Below
  // the hardest setting a letter and its accented twin (L and Ł, Ż and Ź) are
  // not put side by side either - telling those apart is its own skill.
  const fits = (letter) =>
    letter !== answer &&
    !(position === 'first' && soundsClash(letter, answer)) &&
    (level.digraphs || plainOf(letter[0]) !== base);

  const picked = [];
  const add = (list, howMany) => {
    for (const letter of shuffle(list)) {
      if (picked.length >= need || howMany <= 0) return;
      if (picked.includes(letter) || !fits(letter)) continue;
      picked.push(letter);
      howMany -= 1;
    }
  };

  if (answer.length > 1) add(DIGRAPHS, Math.ceil(need / 2));
  else if (PLAIN_OF[answer]) add(accented, Math.max(1, Math.floor(need / 2)));
  else {
    if (Math.random() < 0.3) add(accented, 1);
    if (level.digraphs && position === 'first' && Math.random() < 0.3) add(DIGRAPHS, 1);
  }

  const lookalikes = confusableLetters(base.toLowerCase(), need + 4, { pool: ALPHABET }).map((l) =>
    l.toUpperCase()
  );
  for (const letter of lookalikes) {
    if (picked.length >= need) break;
    if (!picked.includes(letter) && fits(letter)) picked.push(letter);
  }
  return picked;
};

const buildLetterRound = (level, previousId, position = 'first') => {
  const word = pickWord(wordsForLevel(level, position), previousId);
  const { index, answer } = target(word, position);
  const distractors = letterDistractors(answer, level, position);
  return { kind: 'letter', position, word, index, answer, options: shuffle([answer, ...distractors]) };
};

// The other way round: the letter is given and the child picks the picture.
// For the random position the question becomes "which one has this letter in
// it", so the wrong pictures are words without that letter anywhere.
const buildPictureRound = (level, previousId, position = 'first') => {
  const pool = wordsForLevel(level, position);
  const word = pickWord(pool, previousId);
  // "Fits" errs on the side of the child: for the first sound it also covers
  // a word that starts with the same sound spelt differently (HAK for CH) or
  // with the same letter (CZAPKA for C), so neither is offered as a wrong one.
  const fits = (w, answer) => {
    if (position === 'last') return lettersOf(w)[lettersOf(w).length - 1] === answer;
    if (position === 'random') return lettersOf(w).includes(answer);
    return soundsClash(w.firstSound, answer);
  };
  // A random letter that half the words share (an A) leaves too few wrong
  // pictures to choose from, so try a few letters of the word for a better one.
  let picked = target(word, position);
  for (let tries = 0; tries < 8; tries++) {
    if (pool.filter((w) => !fits(w, picked.answer)).length >= level.choices - 1) break;
    picked = target(word, position);
  }
  const { index, answer } = picked;
  // No two pictures a child could take for each other (KOŃ and JEŹDZIEC).
  const others = [];
  for (const w of shuffle(pool)) {
    if (others.length >= level.choices - 1) break;
    if (fits(w, answer) || [word, ...others].some((o) => picturesClash(o, w))) continue;
    others.push(w);
  }

  return { kind: 'picture', position, word, index, answer, options: shuffle([word, ...others]) };
};

// In "pick the letter" the word is not printed until it has been answered.
// It used to be, in the question - "Na jaką głoskę zaczyna się Banan?" with B
// among the answers - which handed a reader the answer and gave a child who
// cannot read nothing at all; with no voice in the app, the picture is the
// whole question. The answer names it afterwards.
const QUESTIONS = {
  first: {
    letter: 'What sound does it start with?',
    picture: 'What starts with this sound?',
    done: (name, answer) => <><strong>{name}</strong> starts with <strong>{answer}</strong>.</>
  },
  last: {
    letter: 'What letter does it end with?',
    picture: 'What ends with this letter?',
    done: (name, answer) => <><strong>{name}</strong> ends with <strong>{answer}</strong>.</>
  },
  random: {
    letter: 'Which letter is missing?',
    picture: 'Which one has this letter?',
    done: (name, answer) => <>The word <strong>{name}</strong> has the letter <strong>{answer}</strong>.</>
  }
};

export default function FirstSoundTool({ onBack }) {
  const [levelId, setLevelId] = useState(() => loadChoice(STORAGE_KEY, Object.keys(LEVELS), 'easy'));

  const [mode, setMode] = useState(() => loadChoice(MODE_KEY, ['letter', 'picture'], 'letter'));

  const [position, setPosition] = useState(() => loadChoice(POSITION_KEY, Object.keys(POSITIONS), 'first'));

  const level = LEVELS[levelId];

  const [round, setRound] = useState(() =>
    (mode === 'letter' ? buildLetterRound : buildPictureRound)(LEVELS[levelId], null, position)
  );
  const [wrongKey, setWrongKey] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const game = useRound('first-sound');

  const stars = progress.starsFor('first-sound', itemIdFor(round.word, round.position));
  const question = QUESTIONS[round.position] || QUESTIONS.first;

  useEffect(() => {
    saveChoice(STORAGE_KEY, levelId);
    saveChoice(MODE_KEY, mode);
    saveChoice(POSITION_KEY, position);
  }, [levelId, mode, position]);

  const nextRound = useCallback(
    (nextMode = mode, nextLevel = level, nextPosition = position) => {
      const build = nextMode === 'letter' ? buildLetterRound : buildPictureRound;
      setRound((prev) => build(nextLevel, prev?.word?.id, nextPosition));
      setWrongKey(null);
      setShowSuccess(false);
      game.reset();
    },
    [mode, level, position, game]
  );

  const succeed = () => {
    if (!game.win(itemIdFor(round.word, round.position))) return;
    sounds.playSuccess();
    setShowSuccess(true);
    celebrate();
    game.after(() => nextRound(), 2000);
  };

  const fail = (key) => {
    sounds.playError();
    game.miss();
    setWrongKey(key);
    game.after(() => setWrongKey((current) => (current === key ? null : current)), 700);
  };

  const answerLetter = (option) => {
    if (showSuccess) return;
    if (option === round.answer) succeed();
    else fail(option);
  };

  const answerPicture = (option) => {
    if (showSuccess) return;
    if (option.id === round.word.id) succeed();
    else fail(option.id);
  };

  const switchMode = (next) => {
    sounds.playClick();
    setMode(next);
    nextRound(next, level);
  };

  const chooseLevel = (id) => {
    sounds.playClick();
    setLevelId(id);
    nextRound(mode, LEVELS[id]);
  };

  const choosePosition = (id) => {
    sounds.playClick();
    setPosition(id);
    nextRound(mode, level, id);
  };

  return (
    <div className="stage-container" style={{ backgroundColor: round.word.bgColor || '#FFF1F2' }}>
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Back to activities"
        >
          <ChevronLeft color="#BE123C" size={28} />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge">👂</span>
          <span className="stage-title" style={{ color: '#BE123C' }}>
            {POSITIONS[round.position]?.title || POSITIONS.first.title}
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

      <div className="shapes-mode-tabs glass-panel">
        <button
          className={`shapes-tab-btn ${mode === 'letter' ? 'active' : ''}`}
          onClick={() => switchMode('letter')}
        >
          <Type size={16} aria-hidden="true" /> Pick a letter
        </button>
        <button
          className={`shapes-tab-btn ${mode === 'picture' ? 'active' : ''}`}
          onClick={() => switchMode('picture')}
        >
          <Repeat size={16} aria-hidden="true" /> Pick a picture
        </button>
      </div>

      {round.kind === 'letter' ? (
        <>
          <div className="sound-prompt glass-panel">
            <div
              className="sound-prompt-picture"
              style={{ borderColor: round.word.color }}
              role="img"
              aria-label={showSuccess ? round.word.name : 'Picture'}
            >
              <Picture word={round.word.id} className="sound-prompt-emoji" size="100%" />
            </div>
            {round.position !== 'first' && (
              // Where in the word the letter goes: every letter in its box,
              // the one asked about left as a question mark.
              <div className="sound-word-slots" aria-hidden="true">
                {lettersOf(round.word).map((letter, i) => (
                  <span
                    key={i}
                    className={`sound-word-slot ${i === round.index ? 'is-target' : ''}`}
                    style={i === round.index ? { borderColor: round.word.color, color: round.word.color } : undefined}
                  >
                    {i === round.index ? (showSuccess ? letter : '?') : letter}
                  </span>
                ))}
              </div>
            )}
            <p className="sound-prompt-question">{question.letter}</p>
            <StarBadge count={stars} />
          </div>

          <div className="sound-options">
            {round.options.map((option) => (
              <button
                key={option}
                type="button"
                className={`sound-letter-btn ${wrongKey === option ? 'wrong' : ''}`}
                onClick={() => answerLetter(option)}
                disabled={showSuccess}
                aria-label={`Sound ${option}`}
              >
                {option}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="sound-prompt glass-panel">
            <div className="sound-prompt-letter" aria-label={`Sound ${round.answer}`}>
              {round.answer}
            </div>
            <p className="sound-prompt-question">{question.picture}</p>
            <StarBadge count={stars} />
          </div>

          <div className="sound-options">
            {round.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`sound-picture-btn ${wrongKey === option.id ? 'wrong' : ''}`}
                style={{ borderColor: option.color }}
                onClick={() => answerPicture(option)}
                disabled={showSuccess}
                aria-label={option.name}
              >
                <Picture word={option.id} className="sound-option-picture" size="92%" />
              </button>
            ))}
          </div>
        </>
      )}

      <button
        className="action-btn btn-random-shape"
        onClick={() => {
          sounds.playRandom();
          nextRound();
        }}
      >
        <Shuffle size={18} style={{ marginRight: '6px' }} />
        Another word
      </button>

      {showSuccess && (
        <FeedbackModal color={round.word.color} title="Well done!">
          {question.done(round.word.name, round.answer)}
        </FeedbackModal>
      )}

      {showSettings && (
        <SettingsModal title="Settings" onClose={() => setShowSettings(false)}>
          <div className="settings-section">
            <label className="settings-label">Which letter in the word:</label>
            <div className="settings-quick-actions">
              {Object.values(POSITIONS).map((option) => (
                <button
                  key={option.id}
                  className={`quick-chip-btn ${position === option.id ? 'active' : ''}`}
                  onClick={() => choosePosition(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="settings-hint-text">
              Last - which letter the word ends with. Random - a different letter each time,
              shown in its place in the word.
            </p>
          </div>

          <div className="settings-section">
            <label className="settings-label">How many answers to choose from:</label>
            <div className="settings-quick-actions">
              {Object.values(LEVELS).map((option) => (
                <button
                  key={option.id}
                  className={`quick-chip-btn ${levelId === option.id ? 'active' : ''}`}
                  onClick={() => chooseLevel(option.id)}
                >
                  {option.label} — {option.choices}
                </button>
              ))}
            </div>
            <p className="settings-hint-text">
              On Hard, words that start with two letters join in, like SHip and CHair.
            </p>
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronLeft, RotateCcw, Check, Play, Edit3, Eraser } from 'lucide-react';
import { getFamily, getPatternsForFamily, patternAspect, isRowPattern } from '../data/patternsData';
import { createShapeBoundaryMask } from '../utils/shapeBoundary';
import { sampleGuide, strokeDirection } from '../utils/strokeDirection';
import { getStrokeTiming, drawOn } from '../utils/strokeTiming';
import { rowWindow } from '../utils/patternWindow';
import { FAMILY_ICONS } from '../data/familyIcons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { celebrate } from '../utils/celebrate';
import { sounds } from '../utils/audio';
import { progress } from '../utils/progress';
import { useRound } from '../hooks/useRound';
import { useProgress } from '../hooks/useProgress';
import StarBadge from './StarBadge';
import { usePointerStroke } from '../hooks/usePointerStroke';
import ButtonSwap from './ButtonSwap';
import FeedbackModal from './FeedbackModal';

// Widths below are in viewBox units, not pixels. Every pattern - a row three
// times wider than it is tall, or a square picture - is framed on the same
// 100-unit band height, so one set of numbers describes both.
const CORRIDOR_UNITS = 18; // how far outside the line a stroke may wander
const PEN_UNITS = 5.5; // the child's pen, a good share of that corridor
// The grey line to trace: wide enough for the pen to sit inside, no wider. At
// 10 the nested rings of the "coraz większe" patterns read as one slab of grey
// rather than three separate lines to follow.
const GUIDE_UNITS = 8;

// Deliberately gentler than the shared guided curve. A szlaczek is seven loops
// wide, not one letter: a hand that stays neat for the first three and wobbles
// on the rest has done the exercise, and being told "prawie" for it just makes
// a child stop trying. Coverage is what still has to be earned - most of the
// pattern has to be drawn - while wandering off the line is largely forgiven.
const PATTERN_TOLERANCE = { coverage: 0.22, stray: 0.45 };

// One ring of a growing pattern is a short closed shape, not a row: a fifth of
// it drawn is not a ring, so coverage asks for more here than a szlaczek does.
const RING_TOLERANCE = { coverage: 0.42, stray: 0.45 };

// How far a stroke may run outside the corridor before it is rewound, as a
// share of the canvas's size (the side of a square of the same area, since a
// row's canvas is long and low and a picture's square). A distance, not a count of pointer events: a
// 120 Hz tablet or a pen sends twice the events of a 60 Hz screen, so a count
// failed the same wobble sooner on better hardware. 0.1 is about what the old
// nine events covered on a 60 Hz screen; four was a flinch - a finger crossing a
// corner clips the edge for a moment.
const OUTSIDE_SHARE = 0.1;

// Lifting the finger only ends the exercise once this much of the pattern is
// drawn. Pressing "Check!" uses the tolerance above, which is more forgiving.
const AUTO_ACCEPT_COVERAGE = 0.6;

// A phone in either orientation. Its rows are cut to about half their width;
// a tablet has the room to show them whole.
const PHONE_QUERY = '(max-width: 600px), (max-height: 540px)';
const PHONE_ROW_UNITS = 150;

// One pen colour. A row of colour swatches above the canvas was one more thing
// to tap that was not the exercise, and it appeared only in tracing mode, so
// switching tabs shrank the canvas to make room for it.
const PEN_COLOR = '#3B82F6';

// A row is drawn on a long, low canvas and a picture on a square one. Both are
// sized so the canvas holds roughly the same number of pixels either way: the
// boundary mask walks every one of them on each check.
const canvasSizeFor = (pattern) => {
  const aspect = patternAspect(pattern);
  const scale = Math.round(Math.sqrt(360000 / aspect) / 100) * 100 || 600;
  return { width: Math.round(scale * aspect), height: scale };
};

export default function PatternsTool({ familyId, onBack }) {
  const family = getFamily(familyId);
  const patterns = useMemo(() => getPatternsForFamily(family.id), [family.id]);

  const [currentIdx, setCurrentIdx] = useState(0);
  // Modes: 'animation' (watch it drawn) | 'guided' (trace along the line)
  const [mode, setMode] = useState('animation');
  const [animKey, setAnimKey] = useState(0);
  const [feedback, setFeedback] = useState(null); // 'success' | 'outside' | 'reversed' | 'incomplete'
  // Replays the pattern drawn the right way over the canvas, after a stroke
  // that went the wrong way; and pulses the canvas when Sprawdź finds it empty.
  const [demo, setDemo] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [showStartNudge, setShowStartNudge] = useState(false);
  // The start dot is only a hint about where to begin, so it goes as soon as
  // there is something on the canvas.
  const [hasDrawn, setHasDrawn] = useState(false);
  // How far into a `progressive` pattern the child has got: the ring they are
  // drawing now. Everything before it is already drawn and still on screen.
  const [ringIdx, setRingIdx] = useState(0);
  const [showRingHint, setShowRingHint] = useState(false);

  // Subscribed so the stars under the pattern chips light up the moment one is
  // earned, without leaving the screen.
  useProgress();

  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  // Distance run outside the corridor in the current stroke, in canvas pixels.
  const outsideCountRef = useRef(0);
  // Snapshot taken when a stroke begins, so a stroke that wanders off the line
  // can be undone without wiping everything the child already drew.
  const strokeSnapshotRef = useRef(null);
  // The points of the stroke in progress, for the direction check.
  const strokePointsRef = useRef([]);
  // One pattern is one round: anything that went wrong on it costs the clean
  // stars, it can be won once, and its timers go with it.
  const round = useRound('patterns');

  const safeIdx = patterns.length ? ((currentIdx % patterns.length) + patterns.length) % patterns.length : 0;
  const fullPattern = patterns[safeIdx];
  const isRow = isRowPattern(fullPattern);
  // On a phone a whole row is too small to trace, so only its first few
  // repeats are shown, twice the size (see utils/patternWindow). Everything
  // below draws and judges `pattern`, whichever of the two it is.
  const phone = useMediaQuery(PHONE_QUERY);
  const pattern = useMemo(
    () => (phone && isRow ? rowWindow(fullPattern, PHONE_ROW_UNITS) : fullPattern),
    [fullPattern, phone, isRow]
  );
  const aspect = patternAspect(pattern);
  const canvasSize = useMemo(() => canvasSizeFor(pattern), [pattern]);

  // Corridor and pen are quoted in viewBox units above; the mask works in
  // canvas pixels, so convert once here.
  const unitScale = canvasSize.height / 100;
  const penWidth = PEN_UNITS * unitScale;

  // "Coraz większe" patterns grow around the child's own drawing: only the
  // smallest ring is on screen to begin with, and the next one appears once
  // this one is traced. Every other pattern shows all of its strokes at once.
  const isProgressive = Boolean(pattern.progressive);
  const lastRing = pattern.strokes.length - 1;
  const activeRing = isProgressive ? Math.min(ringIdx, lastRing) : lastRing;
  const guideStrokes = useMemo(
    () => (isProgressive ? pattern.strokes.slice(0, activeRing + 1) : pattern.strokes),
    [pattern, activeRing, isProgressive]
  );

  const shapeMask = useMemo(
    () =>
      createShapeBoundaryMask(
        { viewBox: pattern.viewBox, strokes: guideStrokes },
        canvasSize.width,
        canvasSize.height,
        CORRIDOR_UNITS,
        {
          tolerance: isProgressive ? RING_TOLERANCE : PATTERN_TOLERANCE,
          // The rings already finished stay inside the corridor, but only the
          // ring being drawn now counts towards finishing it.
          targetStrokes: isProgressive ? [pattern.strokes[activeRing]] : null
        }
      ),
    [pattern, guideStrokes, canvasSize.width, canvasSize.height, activeRing, isProgressive]
  );

  // Strokes draw one after another, sized by length - the eight lines of the
  // spider's web appear one at a time rather than all at once.
  const strokeTimings = useMemo(() => getStrokeTiming(pattern.strokes, 4.5), [pattern]);

  // Where the child should put their finger down first - on a growing pattern
  // that is the start of the ring they are on, not of the first one.
  const startPoint = useMemo(() => {
    const first = isProgressive ? pattern.strokes[activeRing] : pattern.strokes?.[0];
    if (!first || typeof document === 'undefined') return null;
    try {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      node.setAttribute('d', first.path);
      const { x, y } = node.getPointAtLength(0);
      return { x, y };
    } catch (e) {
      return null;
    }
  }, [pattern, activeRing, isProgressive]);

  // Which way each stroke goes, checked against the strokes on screen now.
  const guides = useMemo(
    () => sampleGuide(guideStrokes, pattern.viewBox, canvasSize.width, canvasSize.height),
    [guideStrokes, pattern.viewBox, canvasSize.width, canvasSize.height]
  );

  // The check reads the canvas back after every stroke, and a snapshot is taken
  // as each one begins; a context made for that keeps the read from stalling
  // the next touch on a slow tablet. The first getContext call decides, so
  // every call goes through here.
  const ctxOf = () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) || null;

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxOf();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    outsideCountRef.current = 0;
    setHasDrawn(false);
    // Wiping the drawing wipes the rings it earned too, or the child would be
    // left tracing a big ring with nothing inside it.
    setRingIdx(0);
    setShowRingHint(false);
    setDemo(0);
  };

  // The canvas is re-sized whenever the frame changes shape, which also clears
  // it - so this is the one place the drawing is reset between patterns. The
  // screen's own state starts over while rendering, when the key changes; the
  // canvas, the corridor count and the round's timers are outside React and
  // are reset by the effect.
  const sheetKey = `${pattern.id}|${mode}|${canvasSize.width}x${canvasSize.height}`;
  const [sheetFor, setSheetFor] = useState(sheetKey);
  if (sheetFor !== sheetKey) {
    setSheetFor(sheetKey);
    setHasDrawn(false);
    setFeedback(null);
    setShowStartNudge(false);
    setShowRingHint(false);
    setRingIdx(0);
    setDemo(0);
    setAnimKey((prev) => prev + 1);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    outsideCountRef.current = 0;
    round.reset();
  }, [sheetKey, canvasSize.width, canvasSize.height, round]);

  const goTo = (idx) => {
    setCurrentIdx(idx);
    setFeedback(null);
  };

  const handleNext = () => {
    sounds.playClick();
    goTo((safeIdx + 1) % patterns.length);
  };

  const handlePrev = () => {
    sounds.playClick();
    goTo((safeIdx - 1 + patterns.length) % patterns.length);
  };

  const handleRandomize = () => {
    sounds.playRandom();
    if (patterns.length <= 1) {
      setAnimKey((prev) => prev + 1);
      return;
    }
    let next = safeIdx;
    while (next === safeIdx) {
      next = Math.floor(Math.random() * patterns.length);
    }
    goTo(next);
  };

  const handleReplay = () => {
    sounds.playClick();
    setAnimKey((prev) => prev + 1);
  };

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const fireConfetti = () => {
    celebrate({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: [family.color, '#FACC15', '#EC4899', '#3B82F6']
    });
  };

  const succeed = () => {
    if (!round.win(pattern.id)) return;
    sounds.playSuccess();
    setFeedback('success');
    fireConfetti();
    round.after(() => {
      setFeedback(null);
      setCurrentIdx((prev) => (prev + 1) % patterns.length);
    }, 2400);
  };

  // A ring of a growing pattern is finished: put the next, bigger one on
  // screen around it. Nothing is cleared - the child keeps what they drew, and
  // the picture grows the way it does on paper.
  const revealNextRing = () => {
    sounds.playClick();
    setRingIdx((prev) => prev + 1);
    setHasDrawn(false); // the new ring gets its own start dot
    setShowRingHint(true);
    round.after(() => setShowRingHint(false), 2200);
  };

  // Either the pattern is done, or - on a growing one - only this ring is.
  const completeStep = () => {
    if (isProgressive && activeRing < lastRing) {
      revealNextRing();
    } else {
      succeed();
    }
  };

  // The stroke wandered off the line: rewind just that stroke and say so
  // gently. Wiping the whole drawing punishes work that was already right.
  const rewindStroke = () => {
    isDrawingRef.current = false;
    outsideCountRef.current = 0;
    const ctx = ctxOf();
    if (ctx && strokeSnapshotRef.current) ctx.putImageData(strokeSnapshotRef.current, 0, 0);
  };

  const triggerOutOfBounds = () => {
    rewindStroke();
    round.miss();
    sounds.playError();
    setFeedback('outside');
    round.after(() => setFeedback((prev) => (prev === 'outside' ? null : prev)), 1800);
  };

  // The stroke followed the line the wrong way - a row drawn right to left, a
  // ring drawn clockwise. It is rewound, and the pattern (on a growing one, the
  // ring being drawn) is drawn the right way over the canvas from its start.
  const triggerReversed = () => {
    rewindStroke();
    round.miss();
    sounds.playError();
    setFeedback('reversed');
    setDemo((n) => n + 1);
    const shown = isProgressive ? [strokeTimings[activeRing]] : strokeTimings;
    const firstDelay = shown[0]?.delay || 0;
    const total = shown.reduce((end, t) => Math.max(end, (t?.delay || 0) - firstDelay + (t?.duration || 0)), 0);
    round.after(() => {
      setFeedback((prev) => (prev === 'reversed' ? null : prev));
      setDemo(0);
    }, Math.max(2200, total * 1000 + 400));
  };

  const nudgeToStart = () => {
    sounds.playClick();
    setShowStartNudge(true);
    round.after(() => setShowStartNudge(false), 2200);
  };

  const startDrawing = (e) => {
    if (mode === 'animation' || feedback) return;

    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = ctxOf();
    if (!canvas || !ctx) return;

    // Starting away from the pattern used to do nothing at all, which just
    // looks broken to a child. Tell them where to begin instead.
    if (shapeMask && !shapeMask.isPointInside(x, y)) {
      nudgeToStart();
      return;
    }

    isDrawingRef.current = true;
    outsideCountRef.current = 0;
    strokePointsRef.current = [{ x, y }];
    setShowStartNudge(false);
    setHasDrawn(true);

    // Remember the canvas as it was, so this stroke alone can be undone
    strokeSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = penWidth;
    ctx.strokeStyle = PEN_COLOR;
  };

  const draw = (e) => {
    if (!isDrawingRef.current || mode === 'animation' || feedback) return;

    const { x, y } = getCoordinates(e);
    const ctx = ctxOf();
    if (!ctx) return;

    if (shapeMask) {
      if (!shapeMask.isPointInside(x, y)) {
        const last = strokePointsRef.current[strokePointsRef.current.length - 1];
        outsideCountRef.current += last ? Math.hypot(x - last.x, y - last.y) : 0;
        if (outsideCountRef.current >= OUTSIDE_SHARE * Math.sqrt(canvasSize.width * canvasSize.height)) {
          triggerOutOfBounds();
          return;
        }
      } else {
        outsideCountRef.current = 0;
      }
    }

    strokePointsRef.current.push({ x, y });
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    outsideCountRef.current = 0;

    const canvas = canvasRef.current;
    const ctx = ctxOf();
    if (!canvas || !ctx) return;
    ctx.closePath();

    if (shapeMask && !feedback) {
      if (strokeDirection(strokePointsRef.current, guides) === 'backward') {
        triggerReversed();
        return;
      }
      const result = shapeMask.validateUserDrawing(canvas);

      if (result.wentOutside) {
        triggerOutOfBounds();
      } else if (result.isCorrect && result.coverage >= AUTO_ACCEPT_COVERAGE) {
        // Auto-accept only once the pattern is clearly finished. Sprawdź is
        // more forgiving; ending a long szlaczek on its own while a child is
        // still drawing would cut them off mid-row.
        completeStep();
      }
    }
  };

  const pointerHandlers = usePointerStroke({
    onStart: startDrawing,
    onMove: draw,
    onEnd: stopDrawing
  });

  const handleCheck = () => {
    const canvas = canvasRef.current;
    if (!canvas || !shapeMask || feedback) return;

    const result = shapeMask.validateUserDrawing(canvas);

    // Nothing drawn yet: the canvas and the start dot pulse, no card.
    if (result.isEmpty) {
      sounds.playClick();
      setPulse((n) => n + 1);
      return;
    }

    if (result.wentOutside) {
      triggerOutOfBounds();
      return;
    }

    if (result.isCorrect) {
      completeStep();
      return;
    }

    // Inside the lines, but not enough of the pattern is drawn yet. Say so
    // instead of leaving the button feeling broken.
    round.miss();
    sounds.playError();
    setFeedback('incomplete');
    round.after(() => setFeedback((prev) => (prev === 'incomplete' ? null : prev)), 2200);
  };

  // Keyboard shortcuts for whoever sits with the child at a laptop. Declared
  // after the handlers it calls, so none of them is used before it exists.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onBack();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        handleRandomize();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'c' || e.key === 'C') {
        if (mode !== 'animation' && !feedback) clearCanvas();
      } else if (e.key === 'Enter') {
        if (mode !== 'animation') handleCheck();
      } else if (e.key === 'r' || e.key === 'R') {
        handleReplay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div
      className="stage-container patterns-stage"
      style={{ backgroundColor: family.bgColor, '--pattern-aspect': aspect }}
    >
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Back to pattern families"
        >
          <ChevronLeft color={family.color} size={28} />
        </button>

        <div className="tool-header-title-badge">
          <img className="shape-icon-badge shape-icon-img" src={FAMILY_ICONS[family.id]} alt="" width="256" height="256" draggable="false" />
          <span className="stage-title" style={{ color: family.color }}>
            {pattern.name}
          </span>
        </div>

        <div className="stage-header-spacer" />
      </div>

      {/* Mode switcher: the animation plays first, tracing comes after */}
      <div className="shapes-mode-tabs glass-panel">
        <button
          className={`shapes-tab-btn ${mode === 'animation' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setMode('animation');
          }}
        >
          <Play size={16} /> Watch
        </button>
        <button
          className={`shapes-tab-btn ${mode === 'guided' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setMode('guided');
          }}
        >
          <Edit3 size={16} /> Trace it
        </button>
      </div>

      {/* The family's patterns in lesson order: rows first, the picture last.
          Small enough a list to show them all rather than hide a picker. */}
      <div className="pattern-chip-row" role="tablist" aria-label={`Patterns: ${family.name}`}>
        {patterns.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={i === safeIdx}
            className={`pattern-chip ${i === safeIdx ? 'active' : ''}`}
            style={i === safeIdx ? { borderColor: family.color, color: family.color } : undefined}
            onClick={() => {
              sounds.playClick();
              goTo(i);
            }}
          >
            <span className="pattern-chip-icon" aria-hidden="true">
              {p.icon}
            </span>
            {/* Long names get a short label here; the full one is in the
                header above, where there is room for it. */}
            <span className="pattern-chip-name">{p.short || p.name}</span>
            <StarBadge count={progress.starsFor('patterns', p.id)} size="xs" />
          </button>
        ))}
      </div>


      <div className="canvas-wrapper pattern-canvas-wrapper">
        {/* Rows sit on writing lines; pictures keep the shapes helper grid. */}
        {isRow ? (
          <div className="pattern-rules" aria-hidden="true">
            <div className="pattern-rule-line rule-top" />
            <div className="pattern-rule-line rule-mid" />
            <div className="pattern-rule-line rule-bottom" />
          </div>
        ) : (
          <div className="shapes-grid-background" aria-hidden="true">
            <div className="grid-line-h line-top"></div>
            <div className="grid-line-h line-mid"></div>
            <div className="grid-line-h line-bottom"></div>
            <div className="grid-line-v line-center"></div>
          </div>
        )}

        <svg className="svg-guide" viewBox={pattern.viewBox}>
          {/* On a growing pattern this is only the rings reached so far. The
              newest one is keyed by its index, so it mounts fresh and swells
              into place instead of simply being there. */}
          {mode === 'guided' &&
            guideStrokes.map((stroke, i) => (
              <path
                key={`guide-${pattern.id}-${i}`}
                className={isProgressive && i === activeRing && i > 0 ? 'pattern-ring-fresh' : undefined}
                d={stroke.path}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth={GUIDE_UNITS}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

          {mode === 'guided' && startPoint && !hasDrawn && (
            <circle
              key={`start-${pulse}`}
              className={pulse ? 'shape-start-dot is-pulsing' : 'shape-start-dot'}
              cx={startPoint.x}
              cy={startPoint.y}
              r="2.6"
              fill={family.color}
            />
          )}

          {mode === 'animation' &&
            pattern.strokes.map((stroke, i) => {
              const timing = strokeTimings[i] || { duration: 3.0, delay: 0, length: 1000 };
              return (
                <path
                  key={`anim-${pattern.id}-${animKey}-${i}`}
                  d={stroke.path}
                  fill="none"
                  stroke={family.color}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="path-animate"
                  style={drawOn(timing)}
                />
              );
            })}

          {mode === 'animation' &&
            pattern.strokes.map((stroke, i) => {
              const { duration, delay } = strokeTimings[i] || { duration: 3.0, delay: 0 };
              return (
                <g
                  key={`dot-${pattern.id}-${animKey}-${i}`}
                  style={{
                    offsetPath: `path('${stroke.path}')`,
                    offsetRotate: '0deg',
                    animation: `move-dot ${duration}s ease-in-out forwards`,
                    animationDelay: `${delay}s`,
                    opacity: 0,
                    pointerEvents: 'none'
                  }}
                >
                  <circle r="3" fill={family.color} stroke="#ffffff" strokeWidth="1" />
                </g>
              );
            })}
        </svg>

        {showStartNudge && (
          <div className="canvas-nudge-pill">Start on the dot and draw along the grey line ✏️</div>
        )}

        {showRingHint && !showStartNudge && (
          <div className="canvas-nudge-pill ring-hint">Well done! Now a bigger one 🎈</div>
        )}

        <canvas
          ref={canvasRef}
          className="canvas-element"
          {...pointerHandlers}
        />

        {mode === 'guided' && demo > 0 && (
          <svg className="svg-overlay" viewBox={pattern.viewBox} aria-hidden="true">
            {(isProgressive ? [activeRing] : pattern.strokes.map((_, i) => i)).map((i) => {
              const stroke = pattern.strokes[i];
              const timing = strokeTimings[i] || { duration: 3.0, delay: 0, length: 1000 };
              // A growing pattern replays only the ring being drawn, from now.
              const delay = isProgressive ? 0 : timing.delay;
              return (
                <React.Fragment key={`demo-${demo}-${i}`}>
                  <path
                    d={stroke.path}
                    fill="none"
                    stroke={family.color}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="path-animate"
                    style={drawOn(timing, delay)}
                  />
                  <g
                    style={{
                      offsetPath: `path('${stroke.path}')`,
                      offsetRotate: '0deg',
                      animation: `move-dot ${timing.duration}s ease-in-out forwards`,
                      animationDelay: `${delay}s`,
                      opacity: 0
                    }}
                  >
                    <circle r="3" fill={family.color} stroke="#ffffff" strokeWidth="1" />
                  </g>
                </React.Fragment>
              );
            })}
          </svg>
        )}

        {pulse > 0 && <div key={`pulse-${pulse}`} className="canvas-pulse" aria-hidden="true" />}
      </div>

      <div className="shapes-controls">
        <button
          className="action-btn btn-secondary-round"
          onClick={handlePrev}
          title="Previous pattern (←)"
          aria-label="Previous pattern"
        >
          ◀
        </button>


        <ButtonSwap
          active={mode === 'animation' ? 'animation' : 'guided'}
          options={{
            animation: (
              <button className="action-btn btn-replay" onClick={handleReplay} title="Replay animation (R)">
                <RotateCcw size={18} style={{ marginRight: '6px' }} />
                Replay
              </button>
            ),
            guided: (
              <>
                <button
                  className="action-btn btn-clear"
                  aria-label="Clear"
                  onClick={() => {
                    sounds.playClick();
                    clearCanvas();
                  }}
                  title="Clear (C)"
                >
                  <Eraser size={18} style={{ marginRight: '6px' }} />
                  <span className="btn-label-optional">Clear</span>
                </button>
                <button className="action-btn btn-check" onClick={handleCheck} title="Check (Enter)">
                  <Check size={18} style={{ marginRight: '6px' }} />
                  Check!
                </button>
              </>
            )
          }}
        />

        <button
          className="action-btn btn-secondary-round"
          onClick={handleNext}
          title="Next pattern (→)"
          aria-label="Next pattern"
        >
          ▶
        </button>
      </div>

      {feedback === 'success' && (
        <FeedbackModal peek color={family.color} title="Brilliant!" icon="🌟">
          The whole pattern in the lines!
        </FeedbackModal>
      )}

      {feedback === 'outside' && (
        <FeedbackModal peek title="Almost!" icon="💪">
          That line ran outside. We only took that one back - keep drawing!
        </FeedbackModal>
      )}

      {feedback === 'reversed' && (
        <FeedbackModal peek title="The other way!" icon="🔄">
          Start on the dot and draw where the coloured dot goes.
        </FeedbackModal>
      )}

      {feedback === 'incomplete' && (
        <FeedbackModal peek title="Nearly there!" icon="✏️">
          Now draw the rest of the pattern.
        </FeedbackModal>
      )}
    </div>
  );
}

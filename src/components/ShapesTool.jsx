import React, { useState, useRef, useEffect, useMemo } from 'react';
import { celebrate } from '../utils/celebrate';
import { ChevronLeft, RotateCcw, Check, Sliders, Play, Edit3, Eraser } from 'lucide-react';
import { shapesData, shapesCategories, getDefaultShapeIds } from '../data/shapesData';
import { createShapeBoundaryMask } from '../utils/shapeBoundary';
import { sampleGuide, strokeDirection, writingPieces, followsWritingOrder } from '../utils/strokeDirection';
import { sounds } from '../utils/audio';
import { getStrokeTiming, drawOn } from '../utils/strokeTiming';
import { loadSetting, saveSetting } from '../utils/storage';
import { usePointerStroke } from '../hooks/usePointerStroke';
import { useRound } from '../hooks/useRound';
import ButtonSwap from './ButtonSwap';
import FeedbackModal from './FeedbackModal';
import { readable } from '../utils/color';
import SettingsModal from './SettingsModal';

// Lifting the finger only ends the exercise when this much of the shape is
// drawn. Pressing "Check!" uses the shared, more forgiving tolerance.
const AUTO_ACCEPT_COVERAGE = 0.7;

// One pen colour. A row of colour swatches above the canvas was one more thing
// to tap that was not the exercise, and it appeared only in tracing mode, so
// switching tabs shrank the canvas to make room for it.
const PEN_COLOR = '#3B82F6';

const CANVAS_PX = 600;

// How far a stroke may run outside the corridor, in canvas pixels, before it
// is rewound - about what four pointer events covered on a 60 Hz screen.
const OUTSIDE_PX = 24;
const SHAPES_KEY = 'letter_app_selected_shapes';

const validIds = new Set(shapesData.map((s) => s.id));

export default function ShapesTool({ onBack }) {
  const [selectedShapeIds, setSelectedShapeIds] = useState(() => {
    const saved = loadSetting(SHAPES_KEY, null, Array.isArray);
    const filtered = saved ? saved.filter((id) => validIds.has(id)) : [];
    return filtered.length > 0 ? filtered : getDefaultShapeIds();
  });

  const [currentIdx, setCurrentIdx] = useState(0);
  // Modes: 'animation' (Show animation first) | 'guided' (Trace along line)
  const [mode, setMode] = useState('animation');
  const [animKey, setAnimKey] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'success' | 'outside' | 'reversed' | 'incomplete' | null
  // Replays the shape being drawn the right way over the canvas, after a
  // stroke that went the wrong way round.
  const [demo, setDemo] = useState(0);
  const [pulse, setPulse] = useState(0);

  const [showStartNudge, setShowStartNudge] = useState(false);

  const canvasRef = useRef(null);
  const isDrawingRef = useRef(false);
  // Distance run outside the corridor in the current stroke, in canvas pixels.
  const outsideCountRef = useRef(0);
  // The points of the stroke in progress, for the direction check.
  const strokePointsRef = useRef([]);
  // Snapshot taken when a stroke begins, so a stroke that wanders off the line
  // can be undone without wiping everything the child already drew.
  const strokeSnapshotRef = useRef(null);
  const round = useRound('shapes');

  const activeShapes = useMemo(() => {
    const list = shapesData.filter((s) => selectedShapeIds.includes(s.id));
    return list.length > 0 ? list : shapesData.slice(0, 1);
  }, [selectedShapeIds]);

  // Wrapped here rather than at every use, so the displayed counter and the
  // displayed shape can never disagree after the pool is filtered down.
  const safeIdx = activeShapes.length
    ? ((currentIdx % activeShapes.length) + activeShapes.length) % activeShapes.length
    : 0;
  const currentShape = activeShapes[safeIdx] || shapesData[0];

  const shapeMask = useMemo(
    () => createShapeBoundaryMask(currentShape, CANVAS_PX, CANVAS_PX, 13),
    [currentShape]
  );
  const guides = useMemo(
    () => sampleGuide(currentShape.strokes, currentShape.viewBox, CANVAS_PX, CANVAS_PX),
    [currentShape]
  );
  // The same guide cut into sides, each running top to bottom or left to
  // right, so a shape drawn a side at a time the way letters are written is
  // right too (see writingPieces).
  const pieces = useMemo(() => writingPieces(guides), [guides]);

  // Strokes draw one after another, sized by length - a square draws one side
  // at a time instead of two at once.
  const strokeTimings = useMemo(() => getStrokeTiming(currentShape.strokes, 3.0), [currentShape]);

  // Where each stroke begins: the dots that show a child where to put their
  // finger down, numbered when there is more than one, as on the letters.
  const startPoints = useMemo(() => {
    if (typeof document === 'undefined') return [];
    return (currentShape.strokes || []).map((stroke) => {
      try {
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        node.setAttribute('d', stroke.path);
        const { x, y } = node.getPointAtLength(0);
        return { x, y };
      } catch (e) {
        return null;
      }
    });
  }, [currentShape]);

  useEffect(() => saveSetting(SHAPES_KEY, selectedShapeIds), [selectedShapeIds]);

  // The check reads the canvas back after every stroke, and a stroke snapshot
  // is taken as each one begins. Asking for a context built for that keeps the
  // read from stalling the first touch of the next stroke on a slow tablet.
  // The first getContext call on a canvas decides, so every call goes here.
  const ctxOf = () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) || null;

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxOf();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    outsideCountRef.current = 0;
    setDemo(0);
  };

  // A new shape, or a new mode: a clean sheet and a new round.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && canvas.width !== CANVAS_PX) {
      canvas.width = CANVAS_PX;
      canvas.height = CANVAS_PX;
    }
    round.reset();
    clearCanvas();
    setAnimKey((prev) => prev + 1);
    setFeedback(null);
    // clearCanvas is a plain function remade every render; listing it would
    // wipe the drawing on every render instead of on a new shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShape.id, mode, round]);

  const goTo = (idx) => {
    setCurrentIdx(idx);
    setFeedback(null);
  };

  const handleRandomize = () => {
    sounds.playRandom();
    if (activeShapes.length <= 1) {
      setAnimKey((prev) => prev + 1);
      return;
    }
    let nextIdx = safeIdx;
    while (nextIdx === safeIdx) {
      nextIdx = Math.floor(Math.random() * activeShapes.length);
    }
    goTo(nextIdx);
  };

  const handleNext = () => {
    sounds.playClick();
    goTo((safeIdx + 1) % activeShapes.length);
  };

  const handlePrev = () => {
    sounds.playClick();
    goTo((safeIdx - 1 + activeShapes.length) % activeShapes.length);
  };

  const handleReplay = () => {
    sounds.playClick();
    setAnimKey((prev) => prev + 1);
  };

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const succeed = () => {
    if (!round.win(currentShape.id)) return;
    sounds.playSuccess();
    setFeedback('success');
    celebrate({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: [currentShape.color, '#FACC15', '#EC4899', '#3B82F6']
    });
    round.after(() => {
      setFeedback(null);
      if (activeShapes.length > 1) {
        setCurrentIdx((prev) => prev + 1);
      } else {
        // One shape chosen: the same one again, on a clean sheet.
        round.reset();
        clearCanvas();
      }
    }, 2400);
  };

  // Rewind just the last stroke: wiping the whole drawing would punish work
  // that was already right.
  const rewindStroke = () => {
    isDrawingRef.current = false;
    outsideCountRef.current = 0;
    const ctx = ctxOf();
    if (ctx && strokeSnapshotRef.current) ctx.putImageData(strokeSnapshotRef.current, 0, 0);
  };

  // The stroke wandered off the line.
  const triggerOutOfBounds = () => {
    rewindStroke();
    round.miss();
    sounds.playError();
    setFeedback('outside');
    round.after(() => setFeedback((prev) => (prev === 'outside' ? null : prev)), 1800);
  };

  // The stroke followed the line, but the wrong way round. It is rewound, and
  // the shape is drawn the right way over the canvas from its start dot.
  const triggerReversed = () => {
    rewindStroke();
    round.miss();
    sounds.playError();
    setFeedback('reversed');
    setDemo((n) => n + 1);
    const total = strokeTimings.reduce((end, t) => Math.max(end, t.delay + t.duration), 0);
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

    // Starting away from the shape used to do nothing at all, which just looks
    // broken to a child. Tell them where to begin instead.
    if (shapeMask && !shapeMask.isPointInside(x, y)) {
      nudgeToStart();
      return;
    }

    isDrawingRef.current = true;
    outsideCountRef.current = 0;
    strokePointsRef.current = [{ x, y }];
    setShowStartNudge(false);

    // Remember the canvas as it was, so this stroke alone can be undone
    strokeSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Wide enough to fill a good share of the guide band, so tracing inside the
    // line is what the check actually measures.
    ctx.lineWidth = 30;
    ctx.strokeStyle = PEN_COLOR;
  };

  const draw = (e) => {
    if (!isDrawingRef.current || mode === 'animation' || feedback) return;

    const { x, y } = getCoordinates(e);
    const ctx = ctxOf();
    if (!ctx) return;

    if (shapeMask) {
      if (!shapeMask.isPointInside(x, y)) {
        // Measured in distance, not pointer events: a 120 Hz tablet or a pen
        // sends twice the events of a 60 Hz screen for the same movement, so
        // counting events made the same wobble fail sooner on better hardware.
        const last = strokePointsRef.current[strokePointsRef.current.length - 1];
        outsideCountRef.current += last ? Math.hypot(x - last.x, y - last.y) : 0;
        if (outsideCountRef.current >= OUTSIDE_PX) {
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
    if (!shapeMask || feedback) return;

    if (
      strokeDirection(strokePointsRef.current, guides) === 'backward' &&
      !followsWritingOrder(strokePointsRef.current, pieces)
    ) {
      triggerReversed();
      return;
    }

    const result = shapeMask.validateUserDrawing(canvas);
    if (result.wentOutside) {
      triggerOutOfBounds();
    } else if (result.isCorrect && result.coverage >= AUTO_ACCEPT_COVERAGE) {
      // Auto-accept only once the shape is clearly finished. The Sprawdź
      // button is more forgiving; ending the activity on its own while a
      // child is still drawing would cut them off mid-task.
      succeed();
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
      succeed();
      return;
    }

    // Inside the lines, but not enough of the shape is drawn yet. Say so
    // instead of leaving the button feeling broken.
    round.miss();
    sounds.playError();
    setFeedback('incomplete');
    round.after(() => setFeedback((prev) => (prev === 'incomplete' ? null : prev)), 2200);
  };

  // Keyboard shortcuts for whoever sits with the child at a laptop or board.
  // Re-attached every render so it never calls a stale handler; the settings
  // panel stops keys before they get here.
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

  const toggleShape = (id) => {
    sounds.playClick();
    setSelectedShapeIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const selectAll = () => {
    sounds.playClick();
    setSelectedShapeIds(shapesData.map((s) => s.id));
  };

  const selectCategory = (catId) => {
    sounds.playClick();
    setSelectedShapeIds(shapesData.filter((s) => s.category === catId).map((s) => s.id));
  };

  // The animation, either on its own tab or replayed over a stroke that went
  // the wrong way: the line drawn on, with a pen dot travelling along it.
  const animated = (keyPrefix) =>
    currentShape.strokes.map((stroke, i) => {
      const timing = strokeTimings[i] || { duration: 3.0, delay: 0, length: 1 };
      return (
        <React.Fragment key={`${keyPrefix}-${i}`}>
          <path
            d={stroke.path}
            fill="none"
            stroke={currentShape.color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="path-animate"
            style={drawOn(timing)}
          />
          <g
            style={{
              offsetPath: `path('${stroke.path}')`,
              offsetRotate: '0deg',
              animation: `move-dot ${timing.duration}s ease-in-out forwards`,
              animationDelay: `${timing.delay}s`,
              opacity: 0,
              pointerEvents: 'none'
            }}
          >
            <circle r="3" fill={currentShape.color} stroke="#ffffff" strokeWidth="1" />
          </g>
        </React.Fragment>
      );
    });

  return (
    <div className="stage-container" style={{ backgroundColor: currentShape.bgColor || '#F0FDF4' }}>
      <div className="stage-header">
        <button
          className="back-btn"
          onClick={() => {
            sounds.playClick();
            onBack();
          }}
          aria-label="Back to activities"
        >
          <ChevronLeft color={currentShape.color} size={28} />
        </button>

        <div className="tool-header-title-badge">
          <span className="shape-icon-badge" aria-hidden="true">{currentShape.icon}</span>
          <span className="stage-title" style={{ color: readable(currentShape.color) }}>
            {currentShape.name}
          </span>
        </div>

        <button
          className="settings-toggle-btn"
          onClick={() => {
            sounds.playClick();
            setShowSettings(true);
          }}
          title="Choose shapes"
          aria-label="Choose shapes"
        >
          <Sliders size={20} color="#334155" aria-hidden="true" />
        </button>
      </div>

      {/* Mode Switcher Tabs: Watch displays first */}
      <div className="shapes-mode-tabs glass-panel">
        <button
          className={`shapes-tab-btn ${mode === 'animation' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setMode('animation');
          }}
        >
          <Play size={16} aria-hidden="true" /> Watch
        </button>
        <button
          className={`shapes-tab-btn ${mode === 'guided' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setMode('guided');
          }}
        >
          <Edit3 size={16} aria-hidden="true" /> Trace it
        </button>
      </div>

      <div className="canvas-wrapper">
        <div className="shapes-grid-background" aria-hidden="true">
          <div className="grid-line-h line-top"></div>
          <div className="grid-line-h line-mid"></div>
          <div className="grid-line-h line-bottom"></div>
          <div className="grid-line-v line-center"></div>
        </div>

        <svg className="svg-guide" viewBox={currentShape.viewBox || '0 0 100 100'}>
          {mode === 'guided' &&
            currentShape.strokes.map((stroke, i) => (
              <path
                key={`clean-guide-${currentShape.id}-${i}`}
                d={stroke.path}
                fill="none"
                stroke="#CBD5E1"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

          {/* Where to put a finger down. They stay while the child draws, as
              on the letters: the second stroke of a plus needs its dot after
              the first is down. */}
          {mode === 'guided' &&
            startPoints.map((start, i) =>
              start ? (
                <g key={`start-${pulse}-${i}`} className={pulse ? 'shape-start-dot is-pulsing' : 'shape-start-dot'}>
                  <circle cx={start.x} cy={start.y} r="3.6" fill={currentShape.color} />
                  {startPoints.length > 1 && (
                    <text
                      x={start.x}
                      y={start.y}
                      dy="0.35em"
                      textAnchor="middle"
                      fontSize="4.6"
                      fontWeight="800"
                      fill="#ffffff"
                    >
                      {i + 1}
                    </text>
                  )}
                </g>
              ) : null
            )}

          {mode === 'animation' && animated(`shape-anim-${currentShape.id}-${animKey}`)}
        </svg>

        {showStartNudge && (
          <div className="canvas-nudge-pill" role="status">
            Start on the dot and draw along the grey line ✏️
          </div>
        )}

        <canvas ref={canvasRef} className="canvas-element" {...pointerHandlers} />

        {mode === 'guided' && demo > 0 && (
          <svg className="svg-overlay" viewBox={currentShape.viewBox || '0 0 100 100'} aria-hidden="true">
            {animated(`shape-demo-${currentShape.id}-${demo}`)}
          </svg>
        )}

        {pulse > 0 && <div key={`pulse-${pulse}`} className="canvas-pulse" aria-hidden="true" />}
      </div>

      <div className="shapes-controls">
        <button
          className="action-btn btn-secondary-round"
          onClick={handlePrev}
          title="Previous shape (←)"
          aria-label="Previous shape"
        >
          ◀
        </button>

        <ButtonSwap
          active={mode === 'animation' ? 'animation' : 'guided'}
          options={{
            animation: (
              <button className="action-btn btn-replay" onClick={handleReplay} title="Replay animation (R)">
                <RotateCcw size={18} style={{ marginRight: '6px' }} aria-hidden="true" />
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
                  disabled={!!feedback}
                  title="Clear (C)"
                >
                  <Eraser size={18} style={{ marginRight: '6px' }} aria-hidden="true" />
                  <span className="btn-label-optional">Clear</span>
                </button>
                <button className="action-btn btn-check" onClick={handleCheck} title="Check (Enter)">
                  <Check size={18} style={{ marginRight: '6px' }} aria-hidden="true" />
                  Check!
                </button>
              </>
            )
          }}
        />

        <button
          className="action-btn btn-secondary-round"
          onClick={handleNext}
          title="Next shape (→)"
          aria-label="Next shape"
        >
          ▶
        </button>
      </div>

      <div className="shape-tracker-pill">
        Shape {safeIdx + 1} of {activeShapes.length}
      </div>

      {feedback === 'success' && (
        <FeedbackModal peek color={currentShape.color} title="Brilliant!" icon="🌟">
          Perfectly in the lines!
        </FeedbackModal>
      )}

      {feedback === 'outside' && (
        <FeedbackModal peek title="Almost!" icon="💪">
          That line ran outside. We only took that one back - keep drawing!
        </FeedbackModal>
      )}

      {feedback === 'reversed' && (
        <FeedbackModal peek title="The other way!" icon="🔄">
          Start on the dot. Draw lines from top to bottom and from left to right.
        </FeedbackModal>
      )}

      {feedback === 'incomplete' && (
        <FeedbackModal peek title="Nearly there!" icon="✏️">
          Now draw the rest of the shape.
        </FeedbackModal>
      )}

      {showSettings && (
        <SettingsModal
          title="Choose shapes to practise"
          onClose={() => setShowSettings(false)}
          summary={
            <>
              <strong>{selectedShapeIds.length}</strong> of <strong>{shapesData.length}</strong> shapes chosen
            </>
          }
        >
          <div className="settings-quick-actions">
            <button className="quick-chip-btn" onClick={selectAll}>
              ✅ All ({shapesData.length})
            </button>
            {shapesCategories.map((cat) => (
              <button key={cat.id} className="quick-chip-btn" onClick={() => selectCategory(cat.id)}>
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>

          <div className="shapes-selection-grid">
            {shapesData.map((shape) => {
              const isSelected = selectedShapeIds.includes(shape.id);
              return (
                <button
                  key={shape.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  className={`shape-select-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleShape(shape.id)}
                  style={{ borderColor: isSelected ? shape.color : 'rgba(0,0,0,0.08)' }}
                >
                  <div className="shape-select-checkbox" aria-hidden="true">
                    {isSelected ? '✓' : ''}
                  </div>
                  <div className="shape-select-preview" aria-hidden="true">
                    <svg viewBox={shape.viewBox || '0 0 100 100'} className="mini-shape-svg">
                      {shape.strokes.map((st, i) => (
                        <path
                          key={i}
                          d={st.path}
                          fill="none"
                          stroke={isSelected ? shape.color : '#94A3B8'}
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </svg>
                  </div>
                  <span className="shape-select-name">{shape.name}</span>
                </button>
              );
            })}
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

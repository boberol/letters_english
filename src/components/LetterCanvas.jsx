import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  CANVAS_SIZE,
  GUIDE_RATIO,
  ANIM_RATIO,
  BRUSH_RATIO,
  parseViewBox,
  strokeInViewBox,
  strokeInCanvas
} from '../utils/strokeGeometry';
import { getStrokeTiming, drawOn } from '../utils/strokeTiming';
import { usePointerStroke } from '../hooks/usePointerStroke';

// The pictures a child gets instead of sentences (the app has no voice, and
// the child cannot read): `demo` replays the right strokes from their start
// dots over whatever is on the canvas, `highlight` outlines where the letter
// belongs, and `pulse` makes the canvas and its start dots throb. Each one
// plays again whenever its number goes up.
const LetterCanvas = forwardRef(({ paths, mode, themeColor, demo = 0, highlight = 0, pulse = 0 }, ref) => {
  const canvasRef = useRef(null);
  // The path the finger actually took, kept alongside the pixels because the
  // check needs direction and order, which a bitmap cannot record. A stroke in
  // progress lives in currentStrokeRef; a ref rather than state so that two
  // pointer events in the same tick cannot both see "not drawing".
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);
  // Bumped to restart the "watch it drawn" animation.
  const [animKey, setAnimKey] = useState(0);

  // The pixels and the recorded strokes are reset together, always. Clearing
  // one without the other leaves the check disagreeing with what the child can
  // see on screen.
  const resetDrawing = () => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // We assume a fixed internal resolution for consistency
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (mode === 'animation') return;

    // A resting palm or a second finger fires this again part-way through a
    // stroke. Ignoring it keeps the stroke already in progress; overwriting it
    // used to throw away everything drawn so far while the ink stayed on screen.
    if (currentStrokeRef.current) return;

    // Prevent default scrolling via touch
    // e.preventDefault() cannot be called here if it's a passive listener,
    // so we handle touchAction CSS in styles.

    const { x, y } = getCoordinates(e);
    currentStrokeRef.current = [{ x, y }];
    const ctx = canvasRef.current.getContext('2d');

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = canvasLineWidth;
    ctx.strokeStyle = themeColor;

    // Paint the starting point straight away. Only draw() used to stroke, so a
    // tap that never moved left no ink at all - which made the dot on "i" and
    // "j" impossible to write without dragging. A round cap turns this
    // zero-length segment into a dot, and any movement extends it as usual.
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const draw = (e) => {
    if (!currentStrokeRef.current || mode === 'animation') return;
    const { x, y } = getCoordinates(e);
    currentStrokeRef.current.push({ x, y });
    const ctx = canvasRef.current.getContext('2d');

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    const stroke = currentStrokeRef.current;
    if (!stroke) return;
    currentStrokeRef.current = null;
    if (stroke.length) {
      strokesRef.current = [...strokesRef.current, stroke];
    }
    canvasRef.current?.getContext('2d').closePath();
  };

  const pointerHandlers = usePointerStroke({
    onStart: startDrawing,
    onMove: draw,
    onEnd: stopDrawing
  });

  const strokeTimings = useMemo(() => {
    return getStrokeTiming(paths.strokes, 4.0);
  }, [paths.strokes]);

  useImperativeHandle(ref, () => ({
    getCanvas: () => canvasRef.current,
    getStrokes: () => strokesRef.current,
    clearCanvas: resetDrawing,
    replayAnimation: () => {
      setAnimKey(prev => prev + 1);
    },
    // How long `demo` takes to draw every stroke, so feedback can wait for it.
    demoMs: () => {
      const last = strokeTimings[strokeTimings.length - 1];
      return last ? (last.delay + last.duration) * 1000 : 0;
    }
  }));

  // Where each stroke begins, in viewBox units: the dots that show a child
  // where to put their finger down, numbered when there is more than one.
  // Without them the only way to learn a letter's start was to go back and
  // watch the animation, while the check rejects a letter begun at the wrong
  // end.
  const strokeStarts = useMemo(() => {
    if (typeof document === 'undefined') return [];
    return paths.strokes.map((stroke) => {
      try {
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        node.setAttribute('d', stroke.path);
        const { x, y } = node.getPointAtLength(0);
        return { x, y };
      } catch (e) {
        return null;
      }
    });
  }, [paths.strokes]);

  // The outline for `highlight`: the guide's own box, measured off the
  // rendered paths, so it is right for every letter's height and band.
  const guideRef = useRef(null);
  const [guideBox, setGuideBox] = useState(null);
  useEffect(() => {
    if (!highlight || !guideRef.current) return;
    try {
      const b = guideRef.current.getBBox();
      setGuideBox({ x: b.x, y: b.y, width: b.width, height: b.height });
    } catch (e) {
      setGuideBox(null);
    }
  }, [highlight, paths]);
  
  const viewBox = useMemo(() => parseViewBox(paths.viewBox), [paths.viewBox]);
  const vbW = Math.max(viewBox.width, viewBox.height);

  // Every stroke width is a fraction of the viewBox, so SVG-parsed letters
  // (viewBox ~1370) and fallback letters (viewBox 100) render at the same size.
  const guideWidth = strokeInViewBox(viewBox, GUIDE_RATIO);
  const animWidth = strokeInViewBox(viewBox, ANIM_RATIO);
  const canvasLineWidth = strokeInCanvas(BRUSH_RATIO);

  // Pencil tip dot, expressed in viewBox units so it stays a constant size on screen
  const rInVb = (10 / CANVAS_SIZE) * vbW;
  const strokeWInVb = (2.5 / CANVAS_SIZE) * vbW;
  const shadowOffset = (2 / CANVAS_SIZE) * vbW;

  // Switching stage tabs starts a clean sheet: pixels and strokes both go, and
  // the animation tab plays from the start. The replay is state, so it is
  // restarted while rendering when the tab or letter changes; the pixels and
  // strokes live outside React and are cleared by the effect.
  const [sheetFor, setSheetFor] = useState({ mode, paths });
  if (sheetFor.mode !== mode || sheetFor.paths !== paths) {
    setSheetFor({ mode, paths });
    if (mode === 'animation') setAnimKey((prev) => prev + 1);
  }

  useEffect(() => {
    resetDrawing();
  }, [mode, paths]);

  return (
    <div className="canvas-wrapper">
      {/* Notebook Lines */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
        {/* Top ascender line (18%). The margin above it is wider than the one
            below the descender line because a kreska over a capital rises about
            14% above the top line; at 18% it and the tail of a "g" or "j" clear
            the edge of the canvas by about the same amount. */}
        <div style={{ position: 'absolute', top: '18%', width: '100%', borderTop: '2px solid #cbd5e1' }}></div>
        {/* Middle x-height line (43%) */}
        <div style={{ position: 'absolute', top: '43%', width: '100%', borderTop: '2px dashed #94a3b8' }}></div>
        {/* Baseline (68%) */}
        <div style={{ position: 'absolute', top: '68%', width: '100%', borderTop: '4px solid #475569' }}></div>
        {/* Descender line (93%) */}
        <div style={{ position: 'absolute', top: '93%', width: '100%', borderTop: '2px dashed #cbd5e1' }}></div>
      </div>

      {/* SVG Guide */}
      <svg
        className="svg-guide"
        viewBox={paths.viewBox}
        style={{
          opacity: mode === 'independent' ? 0 : 1,
          transition: 'opacity 0.3s'
        }}
      >
        <g ref={guideRef}>
          {paths.strokes.map((stroke, i) => {
            const timing = strokeTimings[i] || { duration: 4.0, delay: 0, length: 1 };
            const animating = mode === 'animation';
            return (
              <path
                key={`${animKey}-${i}`}
                d={stroke.path}
                fill="none"
                stroke={animating ? themeColor : '#cbd5e1'}
                strokeWidth={animating ? animWidth : guideWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={animating ? 'path-animate' : ''}
                style={animating ? drawOn(timing) : undefined}
              />
            );
          })}
        </g>

        {mode === 'animation' && paths.strokes.map((stroke, i) => (
          <PenDot
            key={`dot-group-${animKey}-${i}`}
            path={stroke.path}
            timing={strokeTimings[i]}
            r={rInVb}
            ring={strokeWInVb}
            shadow={shadowOffset}
            color={themeColor}
          />
        ))}

        {/* Where to begin each stroke, in tracing mode only */}
        {mode === 'guided' && strokeStarts.map((start, i) =>
          start ? (
            <g key={`start-${pulse}-${i}`} className={pulse ? 'letter-start is-pulsing' : 'letter-start'}>
              <circle cx={start.x} cy={start.y} r={rInVb * 1.5} fill={themeColor} opacity="0.9" />
              {paths.strokes.length > 1 && (
                <text
                  x={start.x}
                  y={start.y}
                  dy="0.35em"
                  textAnchor="middle"
                  fontSize={rInVb * 1.9}
                  fontWeight="800"
                  fill="#ffffff"
                >
                  {i + 1}
                </text>
              )}
            </g>
          ) : null
        )}
      </svg>
      {/* Drawing Canvas */}
      <canvas
        ref={canvasRef}
        className="canvas-element"
        {...pointerHandlers}
      />

      {/* Feedback drawn over the child's own ink, so they see their letter and
          the right one together */}
      {mode !== 'animation' && (demo > 0 || (highlight > 0 && guideBox)) && (
        <svg className="svg-overlay" viewBox={paths.viewBox} aria-hidden="true">
          {highlight > 0 && guideBox && (
            <rect
              key={`hl-${highlight}`}
              className="letter-highlight"
              x={guideBox.x - guideWidth}
              y={guideBox.y - guideWidth}
              width={guideBox.width + guideWidth * 2}
              height={guideBox.height + guideWidth * 2}
              rx={guideWidth}
              fill={themeColor}
              fillOpacity="0.12"
              stroke={themeColor}
              strokeWidth={guideWidth * 0.35}
              strokeDasharray={`${guideWidth} ${guideWidth * 0.6}`}
            />
          )}
          {demo > 0 && paths.strokes.map((stroke, i) => (
            <path
              key={`demo-${demo}-${i}`}
              d={stroke.path}
              fill="none"
              stroke={themeColor}
              strokeOpacity="0.75"
              strokeWidth={animWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="path-animate"
              style={drawOn(strokeTimings[i])}
            />
          ))}
          {demo > 0 && paths.strokes.map((stroke, i) => (
            <PenDot
              key={`demo-dot-${demo}-${i}`}
              path={stroke.path}
              timing={strokeTimings[i]}
              r={rInVb}
              ring={strokeWInVb}
              shadow={shadowOffset}
              color={themeColor}
            />
          ))}
        </svg>
      )}

      {pulse > 0 && <div key={`pulse-${pulse}`} className="canvas-pulse" aria-hidden="true" />}
    </div>
  );
});

// The bee-coloured pen tip that travels along a stroke as it is drawn on.
function PenDot({ path, timing = { duration: 4.0, delay: 0 }, r, ring, shadow, color }) {
  return (
    <g
      style={{
        offsetPath: `path('${path}')`,
        offsetRotate: '0deg',
        animation: `move-dot ${timing.duration}s ease-in-out forwards`,
        animationDelay: `${timing.delay}s`,
        opacity: 0,
        pointerEvents: 'none'
      }}
    >
      <circle r={r} cx={shadow} cy={shadow} fill="rgba(0,0,0,0.2)" />
      <circle r={r} fill={color} stroke="#ffffff" strokeWidth={ring} />
      <circle r={r * 0.4} fill="#334155" />
    </g>
  );
}

export default LetterCanvas;

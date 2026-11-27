// Shared stroke geometry for the letter tools.
//
// Letters reach the canvas from two sources with very different viewBox scales:
// parseSVG re-frames the SVG assets into a square box roughly 1370 units wide,
// while the fallback paths in lettersData use a 100 unit box. Hard-coded widths
// therefore render ~13x too thin for the SVG letters, so every width here is a
// fraction of the viewBox instead of an absolute number of units.

// Internal resolution of the drawing canvas.
export const CANVAS_SIZE = 600;

// Fractions of the viewBox side. The writing band (x-height) is 25% of the box,
// so a 4.8% guide is a little under a fifth of the letter's height - close to
// the pen weight on a printed handwriting worksheet.
export const GUIDE_RATIO = 0.048; // grey band the child traces inside
export const ANIM_RATIO = 0.036; // pen stroke drawn during the animation
export const BRUSH_RATIO = 0.038; // the child's own stroke
export const SPINE_RATIO = 0.034; // thin centreline used to score coverage
export const CORRIDOR_RATIO = 0.085; // allowed area while tracing a visible guide
export const CORRIDOR_RATIO_FREE = 0.13; // allowed area when writing freehand

// One tolerance curve for both the letter check and the shape check, so the
// same wobble is judged the same way whichever tool a child is in. Coverage is
// measured against a thin centreline of the target; stray is the share of the
// child's ink that fell outside the allowed corridor.
export const TOLERANCE = {
  guided: { coverage: 0.32, stray: 0.25 },
  independent: { coverage: 0.26, stray: 0.4 }
};

export const parseViewBox = (viewBox) => {
  const m = (viewBox || '0 0 100 100').match(
    /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/
  );
  if (!m) return { x: 0, y: 0, width: 100, height: 100 };
  return {
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
    width: parseFloat(m[3]) || 100,
    height: parseFloat(m[4]) || 100
  };
};

// Width in viewBox units, from a ratio of the viewBox side.
export const strokeInViewBox = (vb, ratio) => Math.max(vb.width, vb.height) * ratio;

// Width in canvas pixels, for the same ratio.
export const strokeInCanvas = (ratio, canvasSize = CANVAS_SIZE) => canvasSize * ratio;

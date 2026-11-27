// Shape boundary detection and mask generator for HTML5 Canvas

import { TOLERANCE } from './strokeGeometry';

// `tolerance` defaults to the shared guided curve, so the shape check and the
// letter check judge the same wobble the same way. A caller passes its own only
// when its exercise is genuinely different - a szlaczek runs the width of the
// screen, and holding it to a letter's neatness over that distance is not the
// same ask.
//
// `targetStrokes` splits the two masks apart: the corridor still covers every
// stroke of the shape, but coverage is measured against these strokes alone.
// That is what lets a pattern be drawn a piece at a time - the rings already
// finished stay inside the lines without counting towards the ring being drawn
// now, which would otherwise make every new ring start out already complete.
export function createShapeBoundaryMask(
  shape,
  width = 600,
  height = 600,
  corridorWidth = 13,
  { tolerance = TOLERANCE.guided, targetStrokes = null } = {}
) {
  if (typeof document === 'undefined') return null;

  const offCanvas = document.createElement('canvas');
  offCanvas.width = width;
  offCanvas.height = height;
  const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Parse viewBox (default 0 0 100 100)
  const vbMatches = (shape.viewBox || '0 0 100 100').match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  const vbX = vbMatches ? parseFloat(vbMatches[1]) : 0;
  const vbY = vbMatches ? parseFloat(vbMatches[2]) : 0;
  const vbWidth = vbMatches ? parseFloat(vbMatches[3]) : 100;
  const vbHeight = vbMatches ? parseFloat(vbMatches[4]) : 100;

  const scale = Math.min(width / vbWidth, height / vbHeight);
  const offsetX = (width - vbWidth * scale) / 2;
  const offsetY = (height - vbHeight * scale) / 2;

  // 1. Draw boundary corridor (the maximum allowed area around the shape)
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-vbX, -vbY);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = corridorWidth; // in SVG units (18 * 6 = 108px on 600px canvas)
  ctx.strokeStyle = '#000000';

  shape.strokes.forEach(stroke => {
    const p = new Path2D(stroke.path);
    ctx.stroke(p);
  });
  ctx.restore();

  // Extract boundary mask data (1 = allowed, 0 = outside)
  const boundaryImgData = ctx.getImageData(0, 0, width, height);
  const bData = boundaryImgData.data;
  const boundaryMask = new Uint8Array(width * height);
  for (let i = 0; i < boundaryMask.length; i++) {
    if (bData[i * 4 + 3] > 0) {
      boundaryMask[i] = 1;
    }
  }

  // 2. Draw centerline target mask (to measure if the child drew the actual shape)
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-vbX, -vbY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6; // Centerline width
  ctx.strokeStyle = '#000000';

  (targetStrokes || shape.strokes).forEach(stroke => {
    const p = new Path2D(stroke.path);
    ctx.stroke(p);
  });
  ctx.restore();

  const centerImgData = ctx.getImageData(0, 0, width, height);
  const cData = centerImgData.data;
  const targetCenterMask = new Uint8Array(width * height);
  let totalCenterPixels = 0;

  for (let i = 0; i < targetCenterMask.length; i++) {
    if (cData[i * 4 + 3] > 0) {
      targetCenterMask[i] = 1;
      totalCenterPixels++;
    }
  }

  return {
    width,
    height,
    totalCenterPixels,

    // Returns true if point (x, y) is inside the allowed boundary corridor
    isPointInside(x, y) {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || ix >= width || iy < 0 || iy >= height) return false;
      return boundaryMask[iy * width + ix] === 1;
    },

    // Evaluates full user drawing: checks if in lines AND in good shape
    validateUserDrawing(userCanvas) {
      if (!userCanvas || totalCenterPixels === 0) {
        return { isCorrect: false, isGoodShape: false, coverage: 0, strayRate: 0, wentOutside: false, isEmpty: true };
      }

      const uCtx = userCanvas.getContext('2d');
      const uData = uCtx.getImageData(0, 0, width, height).data;

      let userPixelsCount = 0;
      let strayPixelsCount = 0;
      let coveredCenterCount = 0;

      for (let i = 0; i < width * height; i++) {
        const isUser = uData[i * 4 + 3] > 0;
        if (isUser) {
          userPixelsCount++;
          if (boundaryMask[i] === 0) {
            strayPixelsCount++;
          }
        }
        if (targetCenterMask[i] === 1 && isUser) {
          coveredCenterCount++;
        }
      }

      if (userPixelsCount < 180) {
        return { isCorrect: false, isGoodShape: false, coverage: 0, strayRate: 0, wentOutside: false, isEmpty: true };
      }

      const coverage = coveredCenterCount / totalCenterPixels;
      const strayRate = strayPixelsCount / userPixelsCount;

      // Coverage matters as well as stray: without it, a drawing that never
      // touched the shape but stayed inside the wide corridor counted as
      // correct.
      const limits = tolerance;
      const wentOutside = strayRate > limits.stray;
      const isCorrect = coverage > limits.coverage && !wentOutside;

      return {
        isCorrect,
        coverage,
        strayRate,
        wentOutside,
        isEmpty: false
      };
    }
  };
}

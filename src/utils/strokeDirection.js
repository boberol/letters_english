// Which way a finger went along a shape or a szlaczek.
//
// Kształty and Szlaczki judge a drawing by the pixels it covers, and pixels do
// not record direction: a line traced right to left, or a circle drawn
// clockwise from the bottom, covered the same pixels as the right one and got
// "Idealnie w liniach!". The direction is the point of both exercises (closed
// shapes start at the top and go left, rows run left to right), so each
// finished stroke is also followed along the guide to see which way it went.
//
// Coordinates are canvas pixels throughout; `frameFor` maps the guide's
// viewBox onto the canvas the same way createShapeBoundaryMask does.

const SAMPLES = 240;

export const frameFor = (viewBox = '0 0 100 100', width, height) => {
  const [vx, vy, vw, vh] = viewBox.split(/[\s,]+/).map(Number);
  const scale = Math.min(width / vw, height / vh);
  return {
    scale,
    x: (width - vw * scale) / 2 - vx * scale,
    y: (height - vh * scale) / 2 - vy * scale
  };
};

// Each guide stroke as evenly spaced canvas points, and whether it closes on
// itself (a ring has no "end" to run backwards from - only a turning sense).
export const sampleGuide = (strokes, viewBox, width, height) => {
  if (typeof document === 'undefined') return [];
  const frame = frameFor(viewBox, width, height);
  return strokes.map((stroke) => {
    try {
      const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      node.setAttribute('d', stroke.path);
      const length = node.getTotalLength();
      const points = [];
      for (let i = 0; i < SAMPLES; i++) {
        const p = node.getPointAtLength((length * i) / (SAMPLES - 1));
        points.push({ x: p.x * frame.scale + frame.x, y: p.y * frame.scale + frame.y });
      }
      const first = points[0];
      const last = points[points.length - 1];
      const closed = Math.hypot(first.x - last.x, first.y - last.y) < (length * frame.scale) / 40;
      return { points, closed, length: length * frame.scale };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
};

const nearest = (points, p, from, to, closed) => {
  let best = -1;
  let bestD = Infinity;
  const n = points.length;
  for (let k = from; k <= to; k++) {
    const i = closed ? ((k % n) + n) % n : k;
    if (i < 0 || i >= n) continue;
    const d = (points[i].x - p.x) ** 2 + (points[i].y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, dist: Math.sqrt(bestD) };
};

// How far a stroke travelled forwards and backwards along one guide stroke,
// as shares of that stroke's length. The first point is placed anywhere on the
// guide; after that the search stays within a window of where the finger was,
// so a row of loops that crosses itself is followed through each crossing
// rather than jumping to the other strand.
const travel = (guide, stroke) => {
  const n = guide.points.length;
  const window = Math.round(n * 0.08);
  let { index } = nearest(guide.points, stroke[0], 0, n - 1, false);
  let forward = 0;
  let backward = 0;
  let distSum = 0;
  for (let i = 1; i < stroke.length; i++) {
    const next = nearest(guide.points, stroke[i], index - window, index + window, guide.closed);
    distSum += next.dist;
    let step = next.index - index;
    if (guide.closed) {
      if (step > n / 2) step -= n;
      if (step < -n / 2) step += n;
    }
    if (step > 0) forward += step;
    else backward -= step;
    index = next.index;
  }
  return {
    forward: forward / (n - 1),
    backward: backward / (n - 1),
    meanDist: distSum / Math.max(1, stroke.length - 1)
  };
};

/**
 * Which way one finished stroke went.
 *
 * @param stroke  the finger's points, in canvas pixels
 * @param guides  sampleGuide() output - the strokes the child may be tracing
 * @returns 'forward' | 'backward' | 'unclear' (too short to tell, or no guide)
 */
export const strokeDirection = (stroke, guides) => {
  if (!stroke || stroke.length < 4 || !guides.length) return 'unclear';
  // The guide stroke this one follows is the one it stays closest to.
  let best = null;
  for (const guide of guides) {
    const t = travel(guide, stroke);
    if (!best || t.meanDist < best.meanDist) best = t;
  }
  const { forward, backward } = best;
  // A tap, a dot, or a few millimetres back and forth: nothing to judge.
  if (forward + backward < 0.12) return 'unclear';
  if (backward > 0.1 && backward > forward * 2) return 'backward';
  return 'forward';
};

// --- Writing order: top to bottom, left to right --------------------------
//
// A shape is stored as one path that runs the taught way round, but a child
// is just as often taught to draw it a side at a time, each side the way a
// letter's strokes go: down, or left to right. A square drawn top edge, right
// edge, left edge, bottom edge (each side down or rightwards) ran against the
// stored path on its left side and was told "W drugą stronę!".
//
// So the guide is also cut into pieces - at every corner and wherever it turns
// from going down to going up - and each piece is given the writing direction:
// downwards if it is more than half as tall as it is wide, otherwise left to
// right. A stroke that runs every piece it covers that way is right, whatever
// the stored path says.

// Cut at a corner sharper than this, in degrees.
const CORNER_DEG = 35;

const orientPiece = (points) => {
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const vertical = Math.abs(dy) >= Math.abs(dx) * 0.5;
  const reversed = vertical ? dy < 0 : dx < 0;
  return reversed ? [...points].reverse() : points;
};

/**
 * The guide strokes cut into pieces that each run in writing direction.
 *
 * @param guides sampleGuide() output
 * @returns arrays of canvas points, each with at least 3 points
 */
export const writingPieces = (guides) => {
  const pieces = [];
  for (const guide of guides) {
    const pts = guide.points;
    let current = [pts[0]];
    let lastDir = null;
    let lastSign = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const dir = Math.atan2(dy, dx);
      // Ignore the jitter of a nearly flat stretch when looking for a turn
      // from going down to going up.
      const sign = Math.abs(dy) > len * 0.2 ? Math.sign(dy) : 0;
      let turn = 0;
      if (lastDir !== null) {
        turn = Math.abs(dir - lastDir);
        if (turn > Math.PI) turn = 2 * Math.PI - turn;
      }
      const corner = turn > (CORNER_DEG * Math.PI) / 180;
      const flip = sign !== 0 && lastSign !== 0 && sign !== lastSign;
      if ((corner || flip) && current.length >= 3) {
        pieces.push(orientPiece(current));
        current = [pts[i - 1]];
      }
      current.push(pts[i]);
      lastDir = dir;
      if (sign !== 0) lastSign = sign;
    }
    if (current.length >= 3) pieces.push(orientPiece(current));
  }
  return pieces;
};

/**
 * Whether a stroke runs every piece of the guide it covers top to bottom or
 * left to right. A stroke that goes back along any piece for more than a
 * small share of it is not in writing order.
 */
export const followsWritingOrder = (stroke, pieces) => {
  if (!stroke || stroke.length < 4 || !pieces.length) return true;
  const back = new Array(pieces.length).fill(0);
  const fwd = new Array(pieces.length).fill(0);
  let prev = null;
  for (const p of stroke) {
    let best = null;
    for (let k = 0; k < pieces.length; k++) {
      const { index, dist } = nearest(pieces[k], p, 0, pieces[k].length - 1, false);
      if (!best || dist < best.dist) best = { piece: k, index, dist };
    }
    if (prev && prev.piece === best.piece) {
      const step = best.index - prev.index;
      if (step > 0) fwd[best.piece] += step;
      else back[best.piece] -= step;
    }
    prev = best;
  }
  return pieces.every((piece, k) => {
    const n = Math.max(1, piece.length - 1);
    const b = back[k] / n;
    const f = fwd[k] / n;
    return !(b > 0.15 && b > f * 2);
  });
};

// Comparing how a letter was drawn, rather than what it looks like.
//
// The old check rasterised the drawing and the target into pixel masks and
// measured overlap. That representation has no notion of direction, order or
// position, so a letter drawn bottom-up scored the same as one drawn correctly,
// while a well-formed letter placed slightly to one side scored as wrong.
//
// Here both the child's strokes and the target letter are reduced to sequences
// of equally spaced points, which keeps the order the pen travelled in. Two
// paths are lined up point by point, in order, so drawing the same shape
// backwards is a large distance rather than a match.

import { CANVAS_SIZE, parseViewBox } from './strokeGeometry';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const polylineLength = (points) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
};

// Redistribute a polyline into `count` evenly spaced points, so two paths drawn
// at different speeds or sampling rates line up index for index.
export const resample = (points, count = 32) => {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => ({ ...points[0] }));

  const last = points[points.length - 1];
  const total = polylineLength(points);
  if (total === 0) return Array.from({ length: count }, () => ({ ...points[0] }));

  const step = total / (count - 1);
  const working = points.slice();
  const out = [{ ...points[0] }];
  let carried = 0;

  for (let i = 1; i < working.length; i++) {
    const prev = working[i - 1];
    const curr = working[i];
    const segment = distance(prev, curr);
    if (segment === 0) continue;

    if (carried + segment >= step) {
      const t = (step - carried) / segment;
      const split = { x: prev.x + t * (curr.x - prev.x), y: prev.y + t * (curr.y - prev.y) };
      out.push(split);
      working.splice(i, 0, split);
      carried = 0;
    } else {
      carried += segment;
    }
  }

  while (out.length < count) out.push({ ...last });
  return out.slice(0, count);
};

// Sample an SVG path in its own coordinate space.
export const samplePath = (d, count = 32) => {
  if (typeof document === 'undefined') return [];
  try {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    node.setAttribute('d', d);
    const length = node.getTotalLength();
    if (!length) {
      const p = node.getPointAtLength(0);
      return Array.from({ length: count }, () => ({ x: p.x, y: p.y }));
    }
    return Array.from({ length: count }, (_, i) => {
      const p = node.getPointAtLength((length * i) / (count - 1));
      return { x: p.x, y: p.y };
    });
  } catch (e) {
    return [];
  }
};

// Sampling an SVG path walks it with getPointAtLength, which is the expensive
// part of a check. The checker compares against every letter, so results are
// cached per letter and canvas size; letter data objects are themselves cached
// upstream, so the keys stay stable.
const targetCache = new WeakMap();

export const targetStrokesInCanvas = (letterData, size, count = 32) => {
  let bySize = targetCache.get(letterData);
  if (!bySize) {
    bySize = new Map();
    targetCache.set(letterData, bySize);
  }
  const key = `${size}:${count}`;
  const cached = bySize.get(key);
  if (cached) return cached;

  const sampled = buildTargetStrokes(letterData, size, count);
  bySize.set(key, sampled);
  return sampled;
};

const buildTargetStrokes = (letterData, size, count) => {
  const vb = parseViewBox(letterData.viewBox);
  const scale = Math.min(size / vb.width, size / vb.height);
  const offsetX = (size - vb.width * scale) / 2;
  const offsetY = (size - vb.height * scale) / 2;

  return letterData.strokes.map((stroke) =>
    samplePath(stroke.path, count).map((p) => ({
      x: offsetX + (p.x - vb.x) * scale,
      y: offsetY + (p.y - vb.y) * scale
    }))
  );
};

const bounds = (points) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const centroid = (points) => {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
};

// Overall size of a drawing, used to express distances as a fraction of the
// letter instead of as raw pixels.
export const drawingSize = (strokes) => {
  const all = strokes.flat();
  if (all.length === 0) return 0;
  const b = bounds(all);
  return Math.max(b.width, b.height, 1);
};

// Letters that get confused (k against h, b against k) follow each other for
// most of the path and part company over a short stretch. A plain mean hides
// that, so the worst-matching tenth of the path is weighted alongside it.
const MEAN_WEIGHT = 0.6;
const TAIL_WEIGHT = 0.4;
const TAIL_PERCENTILE = 0.9;

// Points are paired by dynamic time warping rather than by index. Pairing the
// i-th point with the i-th point assumed both paths spend the same share of
// their length on each part of the letter, which a hand never does: an "a"
// whose bowl began at one o'clock instead of three, or an "h" retraced a little
// further up its stem, was out of step with the guide from that point on and
// scored as a different shape however neatly it was drawn. Warping lets either
// path run ahead of the other for a stretch - but only forwards, so a path
// drawn backwards still cannot be lined up with its target.
//
// The band stops a pairing from stalling on one point to soak up a whole
// missing section of the other path.
const WARP_BAND = 0.25;

// Scratch space reused from call to call. A check compares the drawing with
// every letter of the alphabet, and a fresh matrix per comparison was most of
// what a check cost. Only the cells inside the band are ever computed.
let rowBefore = new Float64Array(0);
let rowNow = new Float64Array(0);
let moves = new Uint8Array(0);
let gaps = new Float64Array(0);

// Returns the distance, and with `keepRoute` the pairing it was measured along
// as flat [i, j, i, j, ...] indices into a and b.
const warp = (a, b, keepRoute = false) => {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return { distance: Infinity, route: null };
  const band = Math.max(2, Math.ceil(Math.max(n, m) * WARP_BAND));
  if (rowBefore.length < m) {
    rowBefore = new Float64Array(m);
    rowNow = new Float64Array(m);
  }
  if (moves.length < n * m) moves = new Uint8Array(n * m);
  if (gaps.length < n + m) gaps = new Float64Array(n + m);

  let prev = rowBefore;
  let curr = rowNow;
  let prevFrom = 0;
  let prevTo = -1;

  for (let i = 0; i < n; i++) {
    const centre = Math.round((i * (m - 1)) / Math.max(1, n - 1));
    const from = Math.max(0, centre - band);
    const to = Math.min(m - 1, centre + band);
    const ax = a[i].x;
    const ay = a[i].y;
    const row = i * m;
    let left = Infinity;
    for (let j = from; j <= to; j++) {
      const dx = ax - b[j].x;
      const dy = ay - b[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      let best;
      let step = 0;
      if (i === 0 && j === 0) {
        best = 2 * d;
      } else {
        // A diagonal step counts its gap twice and a step that holds one path
        // still counts it once, so every route sums exactly n + m gaps and the
        // mean below does not favour one route over another.
        best = j > prevFrom && j - 1 <= prevTo ? prev[j - 1] + 2 * d : Infinity;
        const up = j >= prevFrom && j <= prevTo ? prev[j] + d : Infinity;
        if (up < best) {
          best = up;
          step = 1;
        }
        if (left + d < best) {
          best = left + d;
          step = 2;
        }
      }
      curr[j] = best;
      moves[row + j] = step;
      left = best;
    }
    const swap = prev;
    prev = curr;
    curr = swap;
    prevFrom = from;
    prevTo = to;
  }

  const mean = prev[m - 1] / (n + m);

  // The worst-matched tenth, taken from the pairs along the chosen route.
  const route = keepRoute ? new Int32Array(2 * (n + m)) : null;
  let count = 0;
  let i = n - 1;
  let j = m - 1;
  for (;;) {
    if (route) {
      route[2 * count] = i;
      route[2 * count + 1] = j;
    }
    gaps[count++] = distance(a[i], b[j]);
    if (i === 0 && j === 0) break;
    const step = moves[i * m + j];
    if (step !== 2) i--;
    if (step !== 1) j--;
  }
  const sorted = gaps.subarray(0, count).sort();
  const tail = sorted[Math.min(count - 1, Math.floor(count * TAIL_PERCENTILE))];
  return {
    distance: MEAN_WEIGHT * mean + TAIL_WEIGHT * tail,
    route: route && route.subarray(0, 2 * count)
  };
};

const pathDistance = (a, b) => warp(a, b).distance;

// Compare one stroke both ways round, so drawing it backwards is detectable
// rather than invisible.
const bestOrientation = (user, target) => {
  const forward = pathDistance(user, target);
  const backward = pathDistance([...user].reverse(), target);
  return backward < forward
    ? { distance: backward, reversed: true }
    : { distance: forward, reversed: false };
};

// Scaling is clamped so a tiny scribble cannot be blown up to fit the letter.
const MIN_SCALE = 0.45;
const MAX_SCALE = 2.4;

// The smallest letter size, as a share of the canvas, a traced drawing is
// judged against. See compareDrawing.
const MIN_TRACED_SIZE = 1 / 3;

// Move and resize the drawing onto the target before judging its shape, so the
// score measures form alone. Where the letter sits on the line, and how big it
// is, are checked separately and reported in their own words - a letter
// floating above the baseline is a different mistake from a malformed one, and
// a child is better served by being told which.
const alignToTarget = (userStrokes, targetStrokes) => {
  const userPoints = userStrokes.flat();
  const targetPoints = targetStrokes.flat();
  if (userPoints.length === 0 || targetPoints.length === 0) return userStrokes;

  const userSize = drawingSize(userStrokes);
  const targetSize = drawingSize(targetStrokes);
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetSize / userSize));

  const from = centroid(userPoints);
  const to = centroid(targetPoints);

  return userStrokes.map((stroke) =>
    stroke.map((p) => ({
      x: to.x + (p.x - from.x) * scale,
      y: to.y + (p.y - from.y) * scale
    }))
  );
};

// How far the drawing sits below where it belongs, in canvas pixels. Negative
// means it was written too high. Horizontal position is deliberately not
// reported: writing may begin anywhere along the line.
//
// Measured at the ruled line the letter stands on, not at its middle. Freehand
// letters are judged after scaling, so a child's "l" may be shorter than the
// guide; compared by middles, a short "l" standing exactly on the line read as
// sunk below it ("za nisko"). Instead the target's baseline is expressed as a
// share of its own height (1 for an "l", partway down for a "g", whose tail
// hangs below), and the same share of the drawing's height is where the
// drawing's baseline must be. The middle is still measured too, so a letter
// that is merely a little large or small is not sent up or down the page.
//
// Bounding boxes rather than centroids: a centroid is weighted by how many
// points each stroke happens to contain, and those counts do not match - the
// target's tittle is 32 sampled points while a child taps it as one.
const verticalMiddle = (strokes) => {
  const b = bounds(strokes.flat());
  return (b.minY + b.maxY) / 2;
};

export const verticalOffset = (userStrokes, targetStrokes, baselineY) => {
  const userPoints = userStrokes.flat();
  const targetPoints = targetStrokes.flat();
  if (userPoints.length === 0 || targetPoints.length === 0) return 0;
  if (baselineY === undefined) return verticalMiddle(userStrokes) - verticalMiddle(targetStrokes);
  const t = bounds(targetPoints);
  const u = bounds(userPoints);
  const height = t.maxY - t.minY;
  const share = height > 0 ? Math.min(1, Math.max(0, (baselineY - t.minY) / height)) : 1;
  const userBaseline = u.minY + share * (u.maxY - u.minY);
  const targetBaseline = t.minY + share * height;
  const byBaseline = userBaseline - targetBaseline;
  // A letter a little too big or too small is not called off the line as long
  // as its middle or its foot is where it belongs: only a drawing off in both
  // measures, the same way, is reported, by the smaller of the two.
  const byMiddle = (u.minY + u.maxY) / 2 - (t.minY + t.maxY) / 2;
  if (Math.sign(byBaseline) !== Math.sign(byMiddle)) return 0;
  return Math.abs(byBaseline) < Math.abs(byMiddle) ? byBaseline : byMiddle;
};

// Costs for strokes that do not pair up, as a fraction of the letter's size.
const UNMATCHED_PENALTY = 1.0;
const EXTRA_STROKE_PENALTY = 0.45;

// A leftover mark shorter than this, relative to the letter, is a slip rather
// than an attempt at a stroke: a resting palm, or a tap while deciding where to
// start. Those are ignored instead of failing an otherwise correct letter. A
// deliberate tittle on an "i" is not affected, because the matcher pairs it
// with the target's dot and it never becomes a leftover.
const NOISE_LENGTH_RATIO = 0.12;

const matchStrokes = (userStrokes, targetStrokes, scale) => {
  const used = new Set();
  const matches = [];
  let total = 0;

  // Greedy: each target stroke takes the closest stroke not yet spent. Being
  // order-free means drawing the dot on an "i" first is not punished.
  for (let t = 0; t < targetStrokes.length; t++) {
    let best = null;
    for (let u = 0; u < userStrokes.length; u++) {
      if (used.has(u)) continue;
      const result = bestOrientation(userStrokes[u], targetStrokes[t]);
      if (!best || result.distance < best.distance) best = { ...result, index: u };
    }
    // The tittle on an "i" is a dot: it has no direction, so it must not get a
    // vote on whether the letter was written backwards.
    const length = polylineLength(targetStrokes[t]);

    if (best) {
      used.add(best.index);
      matches.push({ target: t, user: best.index, distance: best.distance, reversed: best.reversed, length });
      total += best.distance;
    } else {
      matches.push({ target: t, user: null, distance: UNMATCHED_PENALTY * scale, reversed: false, length });
      total += UNMATCHED_PENALTY * scale;
    }
  }

  // Leftovers: charge for the substantial ones, ignore the dabs. `kept` drops
  // only the dabs, so they stay out of the joined comparison too.
  const noiseLimit = NOISE_LENGTH_RATIO * scale;
  const kept = [];
  let extras = 0;
  let ignored = 0;
  for (let u = 0; u < userStrokes.length; u++) {
    if (used.has(u)) {
      kept.push(u);
      continue;
    }
    if (polylineLength(userStrokes[u]) > noiseLimit) {
      extras++;
      kept.push(u);
    } else {
      ignored++;
    }
  }

  const matchedTotal = total;
  total += extras * EXTRA_STROKE_PENALTY * scale;

  return {
    distance: total / targetStrokes.length,
    // The same score with the extra-mark charge left off, so a caller can tell
    // "the letter is wrong" apart from "the letter is right, plus extra marks".
    distanceIgnoringExtras: matchedTotal / targetStrokes.length,
    matches,
    extras,
    ignored,
    kept
  };
};

// Strokes laid end to end as one sequence of ink, `count` points shared out by
// length - both sides the same way, so warping is not fighting a difference in
// density - with a few for every stroke, so a dot is there at all. Pen-up jumps
// are left out: where a finger travels between strokes is not part of the
// letter. Each point records its stroke and how far along the ink it lies.
const MIN_STROKE_SAMPLES = 4;

const inkSequence = (strokes, count) => {
  const lengths = strokes.map(polylineLength);
  const total = lengths.reduce((sum, l) => sum + l, 0);
  const points = [];
  const owner = [];
  const along = [];
  let travelled = 0;
  strokes.forEach((stroke, k) => {
    const share = total ? (count * lengths[k]) / total : count / strokes.length;
    const samples = resample(stroke, Math.max(MIN_STROKE_SAMPLES, Math.round(share)));
    samples.forEach((p, s) => {
      if (s > 0) travelled += distance(samples[s - 1], p);
      points.push(p);
      owner.push(k);
      along.push(travelled);
    });
  });
  return { points, owner, along, lengths, total: travelled };
};

const reversedInk = (ink) => ({
  points: [...ink.points].reverse(),
  owner: [...ink.owner].reverse(),
  along: ink.along.map((at) => ink.total - at).reverse(),
  lengths: ink.lengths,
  total: ink.total
});

// Warping can lay a whole stroke of one sequence over a few points of the
// other, and that is exactly what a stroke left out, or one added, looks like:
// an "a" lines up with an "ą" by parking the ogonek at the foot of the stem, an
// "A" with no crossbar by parking it on the right leg, an "ó" with an "o" by
// parking its kreska on top of the bowl - each for next to nothing.
//
// Two things give those away, and each catches what the other misses.
//
// Sharing. A stroke that was really drawn has ink of its own on the other side:
// points paired with it and with nothing else. A parked stroke only borrows
// points its neighbour is already using. That is what separates a missing
// kreska from a wobbly one, which distance cannot - a kreska is drawn about as
// far from its letter as a hand strays - and a dot has no length to lend, so it
// cannot stand in for a kreska, nor a kreska for a dot.
//
// Reach. The band stops warping from parking a long stroke on a single point,
// so the pairing spreads it over the nearest ink instead: an "A" with no
// crossbar hands the crossbar the bottom of the right leg, all of it its own.
// But most of that crossbar is then nowhere near its partners. So at least
// half of a stroke must also lie within COVERAGE_REACH of them - a distance in
// canvas pixels, not a share of the letter, because a finger strays the same
// amount over a small "u" as over a capital "U".
//
// A stroke that fails either is charged, a target stroke as unmatched and a
// drawn stroke as an extra mark, the same as when strokes are paired one to one.
const EXCLUSIVE_RATIO = 0.35;
const NEAR_RATIO = 0.5;
const COVERAGE_REACH = 0.065;
const DOT_LENGTH = 0.05;
const DOT_REACH = 0.25;

// For each stroke of `self`: was it matched? `side` says which half of each
// route pair indexes `self` (0 the drawing, 1 the target).
const SHARED = -2;

const strokesCovered = (route, side, self, other, scale) => {
  // The one stroke of `self` each point of `other` was paired with, or SHARED,
  // and how close each point of `self` came to anything it was paired with.
  const partnerOf = new Int32Array(other.points.length).fill(-1);
  const nearest = new Float64Array(self.points.length).fill(Infinity);
  for (let r = 0; r < route.length; r += 2) {
    const s = route[r + side];
    const o = route[r + 1 - side];
    const k = self.owner[s];
    partnerOf[o] = partnerOf[o] === -1 || partnerOf[o] === k ? k : SHARED;
    const gap = distance(self.points[s], other.points[o]);
    if (gap < nearest[s]) nearest[s] = gap;
  }

  const ownInk = self.lengths.map(() => 0);
  for (let o = 1; o < other.points.length; o++) {
    const k = partnerOf[o];
    if (k >= 0 && partnerOf[o - 1] === k && other.owner[o - 1] === other.owner[o]) {
      ownInk[k] += distance(other.points[o - 1], other.points[o]);
    }
  }

  const reach = COVERAGE_REACH * CANVAS_SIZE;
  const nearInk = self.lengths.map(() => 0);
  for (let s = 1; s < self.points.length; s++) {
    const k = self.owner[s];
    if (self.owner[s - 1] === k && nearest[s - 1] <= reach && nearest[s] <= reach) {
      nearInk[k] += distance(self.points[s - 1], self.points[s]);
    }
  }

  const reached = self.lengths.map(() => false);
  const dotReach = DOT_REACH * scale;
  for (let r = 0; r < route.length; r += 2) {
    const s = route[r + side];
    const o = route[r + 1 - side];
    const k = self.owner[s];
    if (partnerOf[o] === k && distance(self.points[s], other.points[o]) <= dotReach) reached[k] = true;
  }

  return self.lengths.map((length, k) =>
    length < DOT_LENGTH * scale
      ? reached[k]
      : ownInk[k] >= EXCLUSIVE_RATIO * length && nearInk[k] >= NEAR_RATIO * length
  );
};

// The whole gesture as one sequence, which rescues a child who drew a
// two-stroke letter without lifting their finger, or lifted part-way through a
// one-stroke letter instead of retracing it.
const joinedDistance = (userStrokes, targetStrokes, scale, count) => {
  const target = inkSequence(targetStrokes, count);
  const forwardInk = inkSequence(userStrokes, count);
  const backwardInk = reversedInk(forwardInk);
  const forward = warp(forwardInk.points, target.points, true);
  const backward = warp(backwardInk.points, target.points, true);
  const reversed = backward.distance < forward.distance;
  const user = reversed ? backwardInk : forwardInk;
  const { distance: fit, route } = reversed ? backward : forward;

  const missing = strokesCovered(route, 1, target, user, scale).filter((drawn) => !drawn).length;
  const extras = strokesCovered(route, 0, user, target, scale).filter((needed) => !needed).length;
  const distanceIgnoringExtras = fit + (missing * UNMATCHED_PENALTY * scale) / targetStrokes.length;

  return {
    distance: distanceIgnoringExtras + (extras * EXTRA_STROKE_PENALTY * scale) / targetStrokes.length,
    distanceIgnoringExtras,
    extras,
    reversed
  };
};

/**
 * Compare a child's strokes against the target letter.
 *
 * @param userStrokes    arrays of {x, y} in canvas pixels, one per pen stroke
 * @param targetStrokes  same shape, from targetStrokesInCanvas
 * @param positionInvariant  true for freehand: move and resize the drawing onto
 *        the target first, so the score reflects the letter's form alone
 * @returns { score, reversed, extras, matches } where score is a mean distance
 *          expressed as a fraction of the letter's size; 0 is a perfect trace
 */
export const compareDrawing = (
  userStrokes,
  targetStrokes,
  { positionInvariant = false, samples = 32 } = {}
) => {
  const user = userStrokes.filter((s) => s.length > 0).map((s) => resample(s, samples));
  const target = targetStrokes.map((s) => resample(s, samples));

  if (user.length === 0 || target.length === 0) {
    return { score: Infinity, reversed: false, extras: 0, matches: [] };
  }

  const aligned = positionInvariant ? alignToTarget(user, target) : user;
  // Distances are judged as a share of the letter's size - but when tracing,
  // never of less than a third of the canvas. A finger strays by about the same
  // number of pixels over a small "u" as over a capital "U", and measured
  // against its own size alone, a small letter was failed for wobble that a
  // capital shrugs off. Freehand has already resized the drawing onto the
  // letter, stray and all, so there the letter's own size is the fair measure.
  const scale = positionInvariant
    ? drawingSize(target)
    : Math.max(drawingSize(target), MIN_TRACED_SIZE * CANVAS_SIZE);

  const perStroke = matchStrokes(aligned, target, scale);

  // Dabs are left out of the joined comparison so they cannot pollute it.
  const keptStrokes = perStroke.kept.map((u) => aligned[u]);
  const joined = keptStrokes.length
    ? joinedDistance(keptStrokes, target, scale, samples * target.length)
    : { distance: Infinity, distanceIgnoringExtras: Infinity, extras: 0, reversed: false };

  const useJoined = joined.distance < perStroke.distance;
  const rawDistance = useJoined ? joined.distance : perStroke.distance;
  const ignoringExtras = Math.min(joined.distanceIgnoringExtras, perStroke.distanceIgnoringExtras);

  // Weighted by stroke length, so one long stroke drawn upside down outvotes a
  // dot that reads the same either way.
  const drawnLength = perStroke.matches.reduce((sum, m) => sum + m.length, 0);
  const reversedLength = perStroke.matches.reduce(
    (sum, m) => sum + (m.reversed ? m.length : 0),
    0
  );
  const mostlyReversed = drawnLength > 0 && reversedLength > drawnLength / 2;

  return {
    score: rawDistance / scale,
    // The same distance in canvas pixels, for comparing one drawing against
    // letters of different sizes.
    distance: rawDistance,
    scoreIgnoringExtras: Math.min(rawDistance, ignoringExtras) / scale,
    // Backwards overall. When the strokes pair up, that is decided by the bulk
    // of what was drawn; when they do not, only the joined path can say. A "p"
    // written with the finger lifted before the bowl, rather than retraced up
    // the stem, pairs its one target stroke with whichever half fits it better
    // turned round - so asking the pairing called that "p" backwards every time.
    reversed: useJoined ? joined.reversed : mostlyReversed,
    extras: useJoined ? joined.extras : perStroke.extras,
    // Marks too small to count as strokes, which this letter had no use for
    // and so left out of the comparison: a stray tap, or the dot of a "ż"
    // measured against a "z".
    ignored: perStroke.ignored,
    matches: perStroke.matches
  };
};

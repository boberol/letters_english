// A szlaczek row is three times wider than it is tall, so on a phone the whole
// row came out about 360 x 120 px: loops 40px across, a guide line 10px thick,
// far too small for a finger. A phone shows the first part of the row instead -
// two to four repeats at twice the size - and the child traces that.
//
// Where to stop is found from the drawing rather than written down per
// pattern, so a re-exported row needs nothing updating here. The window always
// ends on a whole repeat, never partway up a stroke:
//
// - A row of separate shapes (crosses, hearts, circle-and-line) keeps the
//   shapes that fit and drops the rest, along with any stroke that overlaps a
//   dropped one - the other arm of a half-kept cross.
// - A row drawn as one line is cut where that line is doing exactly what it
//   does where the whole row ends: at the same height, moving the same way. A
//   row of Z's ends on the bottom bar of a Z, not on the diagonal into the
//   next one; a row of fins ends at the foot of a fin.
//
// Of the clean ends, the one nearest the wanted width wins, and the frame keeps
// the same margin on the right as the row had on the left - so it reads as a
// shorter row, not a cropped one. Everything downstream - the guide, the
// boundary mask, the start dot, the animation - is handed the result as an
// ordinary pattern.

const SAMPLE_STEP = 0.5; // viewBox units between sampled points
const LOOK_BACK = 4; // samples used to read which way the line is moving
const SHORT_ROW_MARGIN = 15; // viewBox units either side of a row that needs no cutting

const n = (v) => Number(v.toFixed(2));

const samplePath = (d) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  node.setAttribute('d', d);
  const length = node.getTotalLength();
  const count = Math.max(LOOK_BACK + 2, Math.ceil(length / SAMPLE_STEP));
  return Array.from({ length: count + 1 }, (_, i) => {
    const p = node.getPointAtLength((length * i) / count);
    return { x: p.x, y: p.y };
  });
};

const heading = (points, i) => {
  const a = points[Math.max(0, i - LOOK_BACK)];
  const b = points[i];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
};

const maxX = (points) => points.reduce((m, p) => Math.max(m, p.x), -Infinity);
const minX = (points) => points.reduce((m, p) => Math.min(m, p.x), Infinity);

const toPath = (points) => `M ${points.map((p) => `${n(p.x)},${n(p.y)}`).join(' L ')}`;

// Separate shapes: every clean place to stop is just after one of them.
const shapeEnds = (pattern, sampled) => {
  const ranges = sampled.map((points) => ({ lo: minX(points), hi: maxX(points) }));
  return [...new Set(ranges.map((r) => r.hi))].map((cut) => {
    const dropped = ranges.map((r) => r.hi > cut);
    // Drop anything overlapping a dropped stroke, until nothing changes.
    for (let changed = true; changed; ) {
      changed = false;
      ranges.forEach((r, i) => {
        if (dropped[i]) return;
        if (ranges.some((o, j) => dropped[j] && r.hi >= o.lo && r.lo <= o.hi)) {
          dropped[i] = true;
          changed = true;
        }
      });
    }
    const strokes = pattern.strokes.filter((_, i) => !dropped[i]);
    const right = Math.max(...ranges.filter((_, i) => !dropped[i]).map((r) => r.hi));
    return { strokes, right };
  });
};

// One line: every point that matches how the line finishes is a clean end.
const lineEnds = (points) => {
  const last = points.length - 1;
  const endY = points[last].y;
  const endHeading = heading(points, last);
  const matches = (i) => {
    if (Math.abs(points[i].y - endY) > 1.5) return false;
    const h = heading(points, i);
    return h.x * endHeading.x + h.y * endHeading.y > 0.9;
  };
  const ends = [];
  for (let i = LOOK_BACK; i < last; i++) {
    // The last point of each matching run, so a long bottom bar is kept whole.
    if (matches(i) && !matches(i + 1)) {
      ends.push({ strokes: [{ path: toPath(points.slice(0, i + 1)) }], right: maxX(points.slice(0, i + 1)) });
    }
  }
  return ends;
};

const cache = new Map();

// `targetUnits` is roughly how wide the window should be, in viewBox units.
export const rowWindow = (pattern, targetUnits = 150) => {
  if (typeof document === 'undefined') return pattern;
  const key = `${pattern.id}:${targetUnits}`;
  if (cache.has(key)) return cache.get(key);

  let result = pattern;
  try {
    const sampled = pattern.strokes.map((s) => samplePath(s.path));
    const left = Math.min(...sampled.map(minX));
    const fullRight = Math.max(...sampled.map(maxX));

    // A row that is already short - a few repeats in the middle of the strip -
    // fits as it is. Cutting it would leave one repeat, so it keeps every one
    // and is framed tightly instead, with the usual margin either side.
    if (fullRight - left + 2 * SHORT_ROW_MARGIN <= targetUnits * 1.1) {
      result = {
        ...pattern,
        viewBox: `${n(left - SHORT_ROW_MARGIN)} 0 ${n(fullRight - left + 2 * SHORT_ROW_MARGIN)} 100`
      };
      cache.set(key, result);
      return result;
    }

    const ends = pattern.strokes.length > 1 ? shapeEnds(pattern, sampled) : lineEnds(sampled[0]);

    let best = null;
    for (const end of ends) {
      if (!end.strokes.length || end.right >= fullRight - 1) continue;
      const width = end.right + left;
      const miss = Math.abs(width - targetUnits);
      // A tie (within a unit) goes to the wider window: more row to practise.
      const better = !best || miss < best.miss - 1 || (miss <= best.miss + 1 && width > best.width);
      if (better) best = { ...end, width, miss };
    }

    if (best) {
      result = { ...pattern, viewBox: `0 0 ${n(best.width)} 100`, strokes: best.strokes };
    }
  } catch (e) {
    result = pattern;
  }

  cache.set(key, result);
  return result;
};

// Builds the letter artwork the tracing tool follows: the uppercase alphabet,
// and the nine Polish letters that are a base letter plus a diacritic.
//
//   node build_letters.cjs
//
// Reads the exported artwork in letter_sources/ and writes src/assets/letters/.
// Two jobs, both of which have to be done by machine rather than by hand.
//
// 1. Direction. The checker compares trajectories, so a letter drawn bottom-up
//    is a wrong answer rather than a match. The exported SVGs were drawn in
//    whatever order the drawing program happened to emit: C, G, O, Z, D, J and
//    L run backwards end to end, another nine have bottom-to-top stems, and H
//    and T each carry a duplicate stroke. UPPERCASE_FIXES and AUTHORED_LOWER
//    say, per letter, which subpath survives and which way round it goes.
//
// 2. Consistency. Where a letter was drawn by hand it is used as drawn. Where it
//    was not, it is composed from its base letter plus a mark, so a "C" with a
//    kreska is the "C" the child already learned rather than a new drawing.
//
// Each subpath in a source `d` becomes its own `<path>`: the checker treats one
// element as one pen stroke, so an E left as a single three-subpath `d` would
// ask for one stroke where a child draws three.

const fs = require('fs');
const path = require('path');
const reversePath = require('svg-path-reverse');

const LOWER_DIR = path.join(__dirname, 'src', 'assets', 'letters');
const UPPER_DIR = path.join(LOWER_DIR, 'upper');
// The exported artwork this is built from, kept in the repo so a clean checkout
// can regenerate every letter. Re-export into these folders rather than editing
// anything under src/assets/letters.
const SRC_UPPER = path.join(__dirname, 'letter_sources', 'upper');
const SRC_LOWER = path.join(__dirname, 'letter_sources', 'lower');

// ---------------------------------------------------------------- path tools

const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
const NUM_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

// How many numbers one command takes, and which of those slots are x and which
// are y. Anything past that count repeats the same command.
const SHAPES = {
  M: { size: 2, x: [0], y: [1] },
  L: { size: 2, x: [0], y: [1] },
  T: { size: 2, x: [0], y: [1] },
  H: { size: 1, x: [0], y: [] },
  V: { size: 1, x: [], y: [0] },
  C: { size: 6, x: [0, 2, 4], y: [1, 3, 5] },
  S: { size: 4, x: [0, 2], y: [1, 3] },
  Q: { size: 4, x: [0, 2], y: [1, 3] },
  A: { size: 7, x: [5], y: [6] },
  Z: { size: 0, x: [], y: [] }
};

const round = (n) => Math.round(n * 100) / 100;

const args = (text) => (text.match(NUM_RE) || []).map(Number);

// Move a path. Relative commands are already deltas and need no adjustment, so
// only the absolute ones are touched - which is what lets the arcs in "a" and
// "e" survive a shift without being flattened into curves first.
const translate = (d, dx, dy) => {
  let out = '';
  for (const [, cmd, argText] of d.matchAll(CMD_RE)) {
    const upper = cmd.toUpperCase();
    if (upper === 'Z') {
      out += cmd;
      continue;
    }
    const shape = SHAPES[upper];
    const values = args(argText);
    if (cmd === upper) {
      for (let i = 0; i + shape.size <= values.length; i += shape.size) {
        for (const slot of shape.x) values[i + slot] += dx;
        for (const slot of shape.y) values[i + slot] += dy;
      }
    }
    out += cmd + values.map(round).join(',');
  }
  return out;
};

// Walk a path, calling back with every point it names. Control points count:
// they bound the curve closely enough to size a viewBox around a diacritic.
const walk = (d, visit) => {
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (const [, cmd, argText] of d.matchAll(CMD_RE)) {
    const upper = cmd.toUpperCase();
    const relative = cmd !== upper;
    if (upper === 'Z') {
      x = startX;
      y = startY;
      continue;
    }
    const shape = SHAPES[upper];
    const values = args(argText);
    for (let i = 0; i + shape.size <= values.length; i += shape.size) {
      const baseX = relative ? x : 0;
      const baseY = relative ? y : 0;
      if (!shape.x.length) {
        // V: y only, x stays where the pen is.
        y = baseY + values[i + shape.y[0]];
      } else if (!shape.y.length) {
        x = baseX + values[i + shape.x[0]];
      } else {
        for (let k = 0; k < shape.x.length; k++) {
          visit(baseX + values[i + shape.x[k]], baseY + values[i + shape.y[k]]);
        }
        x = baseX + values[i + shape.x[shape.x.length - 1]];
        y = baseY + values[i + shape.y[shape.y.length - 1]];
      }
      visit(x, y);
      if (upper === 'M' && i === 0) {
        startX = x;
        startY = y;
      }
    }
  }
  return { x, y };
};

// Where the pen finishes. Used to hang an ogonek off the end of the letter the
// child has just drawn, rather than at a coordinate guessed from the outline.
const endPoint = (d) => walk(d, () => {});

const bounds = (d) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  walk(d, (px, py) => {
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  });
  return { minX, minY, maxX, maxY };
};

const strokeBounds = (strokes) => {
  const boxes = strokes.map((s) =>
    s.kind === 'line'
      ? { minX: Math.min(s.x1, s.x2), maxX: Math.max(s.x1, s.x2), minY: Math.min(s.y1, s.y2), maxY: Math.max(s.y1, s.y2) }
      : bounds(s.d)
  );
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxY: Math.max(...boxes.map((b) => b.maxY))
  };
};

// --------------------------------------------------------------- svg reading

const readSvg = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const viewBox = text.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
  const strokes = [];
  for (const [, tag, attrs] of text.matchAll(/<(path|line)\b([^>]*)>/g)) {
    if (tag === 'path') {
      // Illustrator wraps long path data over several lines; a stroke used as
      // exported would carry the newlines and tabs into the file written out.
      const d = attrs.match(/\bd="([^"]+)"/)[1].replace(/\s+/g, ' ');
      d.trim()
        .split(/(?=M)/)
        .forEach((sub) => {
          const trimmed = sub.trim();
          if (trimmed) strokes.push({ kind: 'path', d: trimmed });
        });
    } else {
      const at = (name) => parseFloat(attrs.match(new RegExp('\\b' + name + '="([^"]+)"'))[1]);
      strokes.push({ kind: 'line', x1: at('x1'), y1: at('y1'), x2: at('x2'), y2: at('y2') });
    }
  }
  return { viewBox, strokes };
};

const STYLE = [
  '  <defs>',
  '    <style>',
  '      .cls-1 {',
  '        fill: none;',
  '        stroke: #231f20;',
  '        stroke-linecap: round;',
  '        stroke-linejoin: round;',
  '        stroke-width: 17.01px;',
  '      }',
  '    </style>',
  '  </defs>'
].join('\n');

// `data-body` marks the part of the drawing that is the letter itself, and
// `data-band` where that part belongs between the ruled lines: 0.43..0.68 is
// the writing band, 0.18..0.68 the ascender and capital band. Without them the
// re-framing in parseSVG would fit accent and letter together into the writing
// band, so every accented letter would come out smaller than its base - which
// is the one thing "the same letter, plus a mark" cannot be.
const writeSvg = (file, { width, height, body, band, strokes }) => {
  const lines = strokes.map((s) =>
    s.kind === 'line'
      ? `    <line class="cls-1" x1="${round(s.x1)}" y1="${round(s.y1)}" x2="${round(s.x2)}" y2="${round(s.y2)}"/>`
      : `    <path class="cls-1" d="${s.d}"/>`
  );
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" data-body="${round(body[0])} ${round(body[1])}" data-band="${band[0]} ${band[1]}">`,
    STYLE,
    '  <g id="Layer_1-2" data-name="Layer 1">',
    ...lines,
    '  </g>',
    '</svg>',
    ''
  ].join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, svg, 'utf8');
};


// ------------------------------------------------------------ letter metrics

// The writing band (x-height, 0.43..0.68 of the canvas) is a quarter of the
// canvas tall; the capital band (0.18..0.68) is half of it. Lowercase artwork
// is drawn about 326 units tall and capitals about 522, so a unit of capital
// artwork covers 1.6x less of the screen. Diacritics are therefore sized
// separately for each case, so that a kreska comes out the same size on screen
// over a "c" as over a "C" - which is the size it is on paper.
const LOWER = {
  band: [0.43, 0.68],
  kreska: { rise: 103, run: 51, gap: 55 },
  ogonek: 132,
  ukosnik: { run: 130, rise: 80, margin: 60 }
};

const UPPER = {
  band: [0.18, 0.68],
  kreska: { rise: 82, run: 41, gap: 44 },
  // Unlike the kreska, the ogonek is not sized to match the lowercase one on
  // screen. A kreska floats above the letter and stays about one size whatever
  // it sits on; an ogonek hangs off the letter as a structural extension of it,
  // like a descender, and is read in proportion to it. This is the same share
  // of the capital (~21%) that the drawn "ą" gives its own x-height. Matching
  // the absolute size instead packs the curl into too small an area to read.
  ogonek: 105,
  ukosnik: { run: 104, rise: 64, margin: 48 }
};

// The kreska on ć ń ó ś ź is pulled down and to the left. A mark this short is
// mostly vertical, and the rule the rest of the artwork follows is that a
// mostly vertical stroke starts at the top.
const kreska = (cx, top, { rise, run }) => ({
  kind: 'path',
  d: `M${round(cx + run / 2)},${round(top)}L${round(cx - run / 2)},${round(top + rise)}`
});

// The kropka on a "ż": two identical end points, which parseSVG turns into a
// dot the same way it does the tittle on an "i", and which the checker then
// keeps out of the vote on whether the letter was written backwards.
const kropka = (cx, cy) => ({ kind: 'line', x1: cx, y1: cy, x2: cx, y2: cy });

// The ogonek on ą ę, taken from the exported "Ą" and scaled to the depth
// wanted: down and to the left out of the letter, then hooked back up right.
const ogonek = (x, y, depth) => {
  const s = depth / 71.23;
  const n = (v) => round(v * s);
  return {
    kind: 'path',
    d:
      `M${round(x)},${round(y)}` +
      `c0,0,${n(-44.23)},${n(63.77)},${n(-4.6)},${n(71.23)}` +
      `c${n(13.21)},${n(2.49)},${n(28.21)},${n(-10.34)},${n(28.21)},${n(-10.34)}`
  };
};

// The bar on an "ł" climbs to the right, and a mostly horizontal stroke is
// drawn left to right.
const ukosnik = (x, y, { run, rise }) => ({
  kind: 'path',
  d: `M${round(x)},${round(y)}L${round(x + run)},${round(y - rise)}`
});

// The round letters do not start at twelve o'clock any more: an "o" starts
// where a "c" and an "a" do, a little round to the right, so the three are
// begun with the same movement. ROUND_START_DEG is that point, in degrees
// clockwise from twelve, measured off the "c": its first point sits at the
// right of the letter a fifth of the way down, which on an oval is 55 degrees.
const ROUND_START_DEG = 55;

// ------------------------------------------------------- uppercase direction
//
// Per letter, the strokes to keep and the order to keep them in. `i` picks a
// subpath out of the source file, `reverse` turns it round, `d` replaces it
// outright, and anything not listed is dropped. Letters absent from this table
// come through unchanged - S, U and W were already drawn correctly.
const UPPERCASE_FIXES = {
  // Apex down the left leg, apex down the right, then the crossbar. The export
  // drew the right leg first and the left one upwards from the foot.
  A: [{ i: 1, reverse: true }, { i: 0 }, { i: 2 }],
  // The stem ran up from the foot, and the bowls were drawn from the foot of the
  // stem up to the top of it. The short tick at the middle of the stem is where
  // the bowls meet it, not a stroke a child draws, and left unmatched it would
  // cost more than the bowls themselves are worth.
  B: [{ i: 0, reverse: true }, { i: 2, reverse: true }],
  C: [{ i: 0, reverse: true }],
  // Stem first, then the bowl clockwise off the top of it.
  D: [{ i: 1 }, { i: 0, reverse: true }],
  // Exported bottom bar, stem, middle bar, then the top bar right to left.
  // Taught as stem, then the three bars top to bottom, each left to right.
  E: [{ i: 1 }, { i: 3, reverse: true }, { i: 2 }, { i: 0 }],
  F: [{ i: 0, reverse: true }, { i: 1 }, { i: 2 }],
  G: [{ i: 0, reverse: true }],
  // The export carried the crossbar twice, once each way round.
  H: [{ i: 3 }, { i: 1, reverse: true }, { i: 2 }],
  I: [{ i: 0, reverse: true }],
  J: [{ i: 0, reverse: true }],
  // Both diagonals ran upwards and were split at the elbow. Joined and turned
  // round they become the single in-and-out stroke the lowercase "k" uses.
  K: [{ i: 0, reverse: true }, { d: 'M173.16,12.07L21.4,269.69L186.27,541.17' }],
  L: [{ i: 0, reverse: true }],
  M: [{ i: 1, reverse: true }, { i: 0 }],
  // The diagonal ran on up the right stem, so the stem was drawn bottom to top.
  N: [
    { i: 1, reverse: true },
    { d: 'M8.5,14.2c0,-11.57,254.83,537.93,254.83,521.62' },
    { d: 'M263.33,8.5V535.82' }
  ],
  // Drawn clockwise from the foot. Rewritten to run anticlockwise, the way the
  // lowercase "o" does, and started where the "C" is (`startAt`).
  O: [
    {
      startAt: ROUND_START_DEG,
      d:
        'M199.68,8.51C163.79,8.51,131.35,19.31,102.36,40.91C73.38,62.51,50.48,93.5,33.69,133.89' +
        'C16.89,174.27,8.5,220.13,8.5,273.36C8.5,326.59,16.66,373.38,33,413.77' +
        'C49.33,454.16,71.88,485.31,100.64,507.22C129.39,529.14,161.03,540.09,196.92,540.09' +
        'C232.81,540.09,265.48,529.14,294.93,507.22C324.37,485.31,347.73,454.16,364.98,413.77' +
        'C382.23,373.38,390.86,326.57,390.86,273.36C390.86,220.15,382.46,173.5,365.67,133.42' +
        'C348.87,93.36,325.99,62.51,297,40.91C268.01,19.31,235.57,8.51,199.68,8.51Z'
    }
  ],
  // Stem down, then the bowl from the top of it round to the middle. Both were
  // exported running the other way.
  P: [{ i: 0, reverse: true }, { i: 1, reverse: true }],
  R: [{ i: 0, reverse: true }, { i: 1, reverse: true }],
  // The stem was in the file twice; the copy that reached the crossbar ran
  // upwards, and the one drawn downwards started short of it.
  T: [{ d: 'M139.54,11.57V537.36' }, { i: 1 }],
  // The V in one stroke from the top left, then the stem down from where the
  // arms meet. The export ran the stem up from the foot and the V from the right.
  Y: [{ d: 'M8.5,8.5L105.44,270.06L212.27,10.65' }, { d: 'M105.44,270.06V534.3' }],
  Z: [{ i: 0, reverse: true }]
};

// -------------------------------------------- exact geometry on closed curves

// A path as absolute cubic segments. Straight runs become cubics with their
// control points on the ends, so one representation covers everything and a
// path can be measured exactly, reversed, or restarted somewhere else on a
// closed loop. Arcs are not handled - the letters that contain them (a, b, d,
// g, p) are never put through here.
const absSegments = (d) => {
  const segs = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let prevC2 = null;
  const push = (p1, p2, p3) => {
    segs.push({ p0: { x, y }, p1, p2, p3 });
    x = p3.x;
    y = p3.y;
  };
  const straight = (nx, ny) => push({ x, y }, { x: nx, y: ny }, { x: nx, y: ny });

  for (const [, cmd, argText] of d.matchAll(CMD_RE)) {
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const v = args(argText);
    if (up === 'Z') {
      if (x !== sx || y !== sy) straight(sx, sy);
      prevC2 = null;
      continue;
    }
    const size = SHAPES[up].size;
    if (!size) throw new Error(`unsupported command ${cmd}`);
    for (let i = 0; i + size <= v.length; i += size) {
      const bx = rel ? x : 0;
      const by = rel ? y : 0;
      if (up === 'M' && i === 0) {
        x = bx + v[i];
        y = by + v[i + 1];
        sx = x;
        sy = y;
        prevC2 = null;
      } else if (up === 'M' || up === 'L') {
        straight(bx + v[i], by + v[i + 1]);
        prevC2 = null;
      } else if (up === 'H') {
        straight(bx + v[i], y);
        prevC2 = null;
      } else if (up === 'V') {
        straight(x, by + v[i]);
        prevC2 = null;
      } else if (up === 'C' || up === 'S') {
        const c1 =
          up === 'C'
            ? { x: bx + v[i], y: by + v[i + 1] }
            : prevC2
              ? { x: 2 * x - prevC2.x, y: 2 * y - prevC2.y }
              : { x, y };
        const k = up === 'C' ? i + 2 : i;
        const c2 = { x: bx + v[k], y: by + v[k + 1] };
        push(c1, c2, { x: bx + v[k + 2], y: by + v[k + 3] });
        prevC2 = c2;
      } else {
        throw new Error(`unsupported command ${cmd}`);
      }
    }
  }
  return segs;
};

const segmentsToPath = (segs) =>
  `M${round(segs[0].p0.x)},${round(segs[0].p0.y)}` +
  segs
    .map(
      (s) =>
        `C${round(s.p1.x)},${round(s.p1.y)},${round(s.p2.x)},${round(s.p2.y)},${round(s.p3.x)},${round(s.p3.y)}`
    )
    .join('');

const reverseSegments = (segs) =>
  segs
    .slice()
    .reverse()
    .map((s) => ({ p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 }));

// Where a closed letter starts matters as much as which way it goes round: the
// checker resamples both paths into the same number of points and compares them
// index for index, so an "o" begun at the foot is a rotation of the sequence
// and scores as badly as one drawn backwards. Every round letter here starts at
// the top, the way the lowercase "o" the app already teaches does.
const startAtTop = (segs) => {
  let best = 0;
  for (let i = 1; i < segs.length; i++) if (segs[i].p0.y < segs[best].p0.y) best = i;
  return [...segs.slice(best), ...segs.slice(0, best)];
};

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const cubicPoint = (s, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
    y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
  };
};
// de Casteljau: one cubic as two that trace exactly the same curve.
const splitCubic = (s, t) => {
  const a = lerp(s.p0, s.p1, t);
  const b = lerp(s.p1, s.p2, t);
  const c = lerp(s.p2, s.p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const m = lerp(d, e, t);
  return [
    { p0: s.p0, p1: a, p2: d, p3: m },
    { p0: m, p1: e, p2: c, p3: s.p3 }
  ];
};

// Re-points a closed loop so it begins `deg` degrees clockwise from twelve on
// the oval it fills, keeping the direction it already runs in.
const startAtClock = (segs, deg) => {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of segs) {
    const xs = cubicRange(s.p0.x, s.p1.x, s.p2.x, s.p3.x);
    const ys = cubicRange(s.p0.y, s.p1.y, s.p2.y, s.p3.y);
    box.minX = Math.min(box.minX, xs.lo);
    box.maxX = Math.max(box.maxX, xs.hi);
    box.minY = Math.min(box.minY, ys.lo);
    box.maxY = Math.max(box.maxY, ys.hi);
  }
  const a = (deg * Math.PI) / 180;
  const target = {
    x: (box.minX + box.maxX) / 2 + ((box.maxX - box.minX) / 2) * Math.sin(a),
    y: (box.minY + box.maxY) / 2 - ((box.maxY - box.minY) / 2) * Math.cos(a)
  };
  let best = { d: Infinity, i: 0, t: 0 };
  segs.forEach((s, i) => {
    for (let k = 0; k <= 400; k++) {
      const p = cubicPoint(s, k / 400);
      const d = Math.hypot(p.x - target.x, p.y - target.y);
      if (d < best.d) best = { d, i, t: k / 400 };
    }
  });
  const { i, t } = best;
  if (t < 1e-6) return [...segs.slice(i), ...segs.slice(0, i)];
  if (t > 1 - 1e-6) return [...segs.slice(i + 1), ...segs.slice(0, i + 1)];
  const [head, tail] = splitCubic(segs[i], t);
  return [tail, ...segs.slice(i + 1), ...segs.slice(0, i), head];
};

// Grow or shrink a stroke about one of its own end points, keeping its angle
// and its position relative to the letter.
const scaleSegments = (segs, factor, anchor) => {
  const at = (p) => ({
    x: anchor.x + (p.x - anchor.x) * factor,
    y: anchor.y + (p.y - anchor.y) * factor
  });
  return segs.map((s) => ({ p0: at(s.p0), p1: at(s.p1), p2: at(s.p2), p3: at(s.p3) }));
};

// Extremes of a cubic: the ends, plus wherever the derivative crosses zero.
const cubicRange = (a, b, c, d0) => {
  let lo = Math.min(a, d0);
  let hi = Math.max(a, d0);
  const qa = -a + 3 * b - 3 * c + d0;
  const qb = 2 * (a - 2 * b + c);
  const qc = -a + b;
  const consider = (t) => {
    if (!(t > 0 && t < 1)) return;
    const u = 1 - t;
    const v = u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d0;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  };
  if (Math.abs(qa) < 1e-9) {
    if (Math.abs(qb) > 1e-9) consider(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      consider((-qb + r) / (2 * qa));
      consider((-qb - r) / (2 * qa));
    }
  }
  return { lo, hi };
};

// The box the ink actually occupies, as opposed to the hull of the control
// points, which overshoots by enough to misplace a letter on the ruled lines.
const exactBounds = (d) => {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const s of absSegments(d)) {
    const xs = cubicRange(s.p0.x, s.p1.x, s.p2.x, s.p3.x);
    const ys = cubicRange(s.p0.y, s.p1.y, s.p2.y, s.p3.y);
    box.minX = Math.min(box.minX, xs.lo);
    box.maxX = Math.max(box.maxX, xs.hi);
    box.minY = Math.min(box.minY, ys.lo);
    box.maxY = Math.max(box.maxY, ys.hi);
  }
  return box;
};

const strokesBounds = (strokes) => {
  const boxes = strokes.map((s) =>
    s.kind === 'line'
      ? { minX: Math.min(s.x1, s.x2), maxX: Math.max(s.x1, s.x2), minY: Math.min(s.y1, s.y2), maxY: Math.max(s.y1, s.y2) }
      : exactBounds(s.d)
  );
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxY: Math.max(...boxes.map((b) => b.maxY))
  };
};

// ------------------------------------------------ authored Polish lowercase
//
// All nine were drawn by hand and exported, so they are used as drawn
// rather than composed from a base letter - the artwork wins over the recipe.
// What still has to be done to them is direction: exported the way they were,
// the "c" in a "c" with a kreska runs bottom to top, the "o" and the bowl of
// the "a" go round clockwise from the foot, and every kreska is flicked upwards
// instead of pulled down.
//
// `body` marks the strokes that are the letter itself rather than the mark on
// it, which is what data-body is measured from. `startAtTop` re-points a closed
// letter so it begins at twelve o'clock, the way the "o" the app already
// teaches does. `dot` turns a zero-length path into the two-identical-points
// line that parseSVG reads as a dot.
// The kreska as exported is 46 units long against a guide pen 63 units wide -
// shorter than the pen is thick, so it renders as a round blob rather than a
// slanted stroke, and a "z" with a kreska is then indistinguishable from a "z"
// with a dot. Every other mark comes out between 1.8x and 3.4x the pen width;
// this brings the kreska to 1.8x, and to the same share of the canvas as the
// one over the capitals. It keeps the exported angle, curve and position - it
// grows from the end the pen finishes on. Set to 1 for the artwork as drawn.
const KRESKA_SCALE = 2.5;

const AUTHORED_LOWER = {
  'c-acute': [{ i: 0, body: true, reverse: true }, { i: 1, reverse: true, kreska: true }],
  'o-acute': [
    { i: 0, body: true, reverse: true, startAtTop: true, startAt: ROUND_START_DEG },
    { i: 1, reverse: true, kreska: true }
  ],
  // Bowl, back up the stem and down it in one stroke, the way the "a" is, then
  // the ogonek. Exported from the tip of the foot backwards into the bowl.
  'a-ogonek': [{ i: 0, body: true, reverse: true }, { i: 1 }],
  's-acute': [{ i: 0, body: true, reverse: true }, { i: 1, reverse: true, kreska: true }],
  // The "e" in one stroke, as the base letter is, then the ogonek. Both were
  // exported the right way round already.
  'e-ogonek': [{ i: 0, body: true }, { i: 1 }],
  'z-acute': [{ i: 0, body: true }, { i: 1, reverse: true, kreska: true }],
  'n-acute': [{ i: 0, body: true }, { i: 1, reverse: true, kreska: true }],
  // The dot was exported first; the letter is drawn before the mark on it.
  'z-dot': [{ i: 1, body: true }, { i: 0, dot: true }],
  // The stem was exported from the tip of its tail upwards, and the bar right
  // to left.
  'l-stroke': [{ i: 0, body: true, reverse: true }, { i: 1, reverse: true }]
};

// Applies one entry of the table above and works out the framing from what the
// letter body actually occupies, rather than from the height of the whole box.
const authored = (slug, band = LOWER.band) => {
  const src = readSvg(path.join(SRC_LOWER, slug + '.svg'));
  const strokes = [];
  const body = [];
  for (const step of AUTHORED_LOWER[slug]) {
    const from = src.strokes[step.i];
    let stroke;
    if (step.dot) {
      const p = endPoint(from.d);
      stroke = kropka(p.x, p.y);
    } else if (step.reverse || step.startAtTop || step.startAt != null || step.kreska) {
      let segs = absSegments(from.d);
      if (step.reverse) segs = reverseSegments(segs);
      if (step.startAtTop) segs = startAtTop(segs);
      if (step.startAt != null) segs = startAtClock(segs, step.startAt);
      // Grown from the end the pen finishes on, so the mark stays where it was
      // drawn in relation to the letter and only reaches further up.
      if (step.kreska && KRESKA_SCALE !== 1) {
        segs = scaleSegments(segs, KRESKA_SCALE, segs[segs.length - 1].p3);
      }
      stroke = { kind: 'path', d: segmentsToPath(segs) };
    } else {
      stroke = from;
    }
    strokes.push(stroke);
    if (step.body) body.push(stroke);
  }
  // A kreska grown upwards can reach past the top of the exported box. Nothing
  // downstream cares about the box height - data-body decides where the letter
  // sits - but the file should still hold its own artwork, so everything drops
  // by however far the mark overshot.
  const all = strokesBounds(strokes);
  const drop = all.minY < 8.5 ? 8.5 - all.minY : 0;
  const placed = drop ? shift(strokes, 0, drop) : strokes;
  const bodyBox = strokesBounds(drop ? shift(body, 0, drop) : body);

  return {
    strokes: placed,
    body: [bodyBox.minY, bodyBox.maxY],
    band,
    box: { width: src.viewBox[2], height: src.viewBox[3] + drop }
  };
};

// ----------------------------------------------------------------- composing

const BASE_UPPER = 'ABCDEFGHIJKLMNOPRSTUWYZ'.split('');

// Character to file name. ASCII throughout: a file named with a Polish
// character has to survive the filesystem, the bundler's glob and the string
// the app builds to look it up, and those three do not always agree on how to
// normalise one.
const SLUGS = {
  ą: 'a-ogonek',
  ć: 'c-acute',
  ę: 'e-ogonek',
  ł: 'l-stroke',
  ń: 'n-acute',
  ó: 'o-acute',
  ś: 's-acute',
  ź: 'z-acute',
  ż: 'z-dot'
};

// Each Polish letter, the letter it is built from, and the mark that makes it.
// `at` names the stroke whose end the ogonek hangs from, so the tail carries on
// from where the pen already is - the lowercase letters are a single stroke,
// while a capital "A" reaches the foot the ogonek hangs off on its second.
const POLISH = [
  { char: 'ą', base: 'a', mark: 'ogonek', at: 0, atUpper: 1 },
  { char: 'ć', base: 'c', mark: 'kreska' },
  // The capital hangs it off the right end of the bottom bar, the last of the
  // three bars an "E" is drawn with.
  { char: 'ę', base: 'e', mark: 'ogonek', at: 0, atUpper: 3, foot: [138, 338] },
  // "l" is an ascender in both cases, so it sits in the taller band rather
  // than the writing band the other eight Polish letters share.
  { char: 'ł', base: 'l', mark: 'ukosnik', band: [0.18, 0.68] },
  { char: 'ń', base: 'n', mark: 'kreska' },
  { char: 'ó', base: 'o', mark: 'kreska' },
  { char: 'ś', base: 's', mark: 'kreska' },
  { char: 'ź', base: 'z', mark: 'kreska' },
  { char: 'ż', base: 'z', mark: 'kropka' }
];

// How far down the letter the bar on an "ł" crosses it.
const UKOSNIK_HEIGHT = 0.38;

const shift = (strokes, dx, dy) =>
  strokes.map((s) =>
    s.kind === 'line'
      ? { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy }
      : { kind: 'path', d: translate(s.d, dx, dy) }
  );

// Build one accented letter from its base. The letter is drawn first and the
// mark added after, which is both how it is taught and what keeps the base
// letter's own stroke order intact underneath.
const compose = ({ mark, at, foot, band }, base, metrics) => {
  const [, , width, height] = base.viewBox;
  const body = [8.5, height - 8.5];

  // The base letter keeps the box it was exported in, so that a "c" inside a
  // "ć" is framed exactly as the "c" is; only the mark may push the box out.
  const around = (strokes, box, added) => {
    const b = strokeBounds([added]);
    return {
      strokes,
      box: { width: Math.max(box.width, b.maxX + 8.5), height: Math.max(box.height, b.maxY + 8.5) },
      band: band || metrics.band
    };
  };

  if (mark === 'ogonek') {
    // Normally the tail carries on from where the pen stopped. `foot` overrides
    // that for a letter whose last stroke does not finish at the baseline.
    const tail = foot ? { x: foot[0], y: foot[1] } : endPoint(base.strokes[at].d);
    const mark_ = ogonek(tail.x, tail.y, metrics.ogonek);
    return { ...around([...base.strokes, mark_], { width, height }, mark_), body };
  }

  if (mark === 'ukosnik') {
    const { margin, rise } = metrics.ukosnik;
    const cy = 8.5 + UKOSNIK_HEIGHT * (height - 17);
    const mark_ = ukosnik(8.5, cy + rise / 2, metrics.ukosnik);
    const moved = shift(base.strokes, margin, 0);
    return { ...around([...moved, mark_], { width: width + margin, height }, mark_), body };
  }

  // kreska and kropka both sit above the letter, so the letter drops by the
  // room the mark needs and its body moves down with it.
  const overhang = metrics.kreska.gap + metrics.kreska.rise;
  const mark_ =
    mark === 'kropka'
      ? kropka(width / 2, 8.5 + metrics.kreska.rise / 2)
      : kreska(width / 2, 8.5, metrics.kreska);
  const moved = shift(base.strokes, 0, overhang);
  return {
    ...around([...moved, mark_], { width, height: height + overhang }, mark_),
    body: [body[0] + overhang, body[1] + overhang]
  };
};

// Writes a finished letter. Only the width matters to the app, which centres
// the letter horizontally on its box; the vertical framing comes from
// data-body, so the box height is there for anything that opens the file.
const boxed = (file, { strokes, body, band, box }) => {
  writeSvg(file, { width: box.width, height: box.height, body, band, strokes });
  return { file, width: round(box.width), height: round(box.height) };
};

// --------------------------------------------------------------------- build

const built = [];

// The uppercase alphabet, straightened out.
const upperBases = {};
for (const ch of BASE_UPPER) {
  const src = readSvg(path.join(SRC_UPPER, ch + '.svg'));
  const plan = UPPERCASE_FIXES[ch] || src.strokes.map((_, i) => ({ i }));
  const strokes = plan.map((step) => {
    if (step.d && step.startAt != null) {
      return { kind: 'path', d: segmentsToPath(startAtClock(absSegments(step.d), step.startAt)) };
    }
    if (step.d) return { kind: 'path', d: step.d };
    const stroke = src.strokes[step.i];
    return step.reverse ? { kind: 'path', d: reversePath.reverse(stroke.d) } : stroke;
  });
  const letter = { viewBox: src.viewBox, strokes };
  upperBases[ch] = letter;
  built.push({
    char: ch,
    ...boxed(path.join(UPPER_DIR, ch.toLowerCase() + '.svg'), {
      strokes,
      body: [8.5, src.viewBox[3] - 8.5],
      band: UPPER.band,
      box: { width: src.viewBox[2], height: src.viewBox[3] }
    }),
    strokes: strokes.length,
    changed: Boolean(UPPERCASE_FIXES[ch])
  });
}

// The nine Polish letters, in both cases, each one its base plus a mark.
for (const spec of POLISH) {
  const slug = SLUGS[spec.char];

  // Drawn by hand where there is artwork for it; composed from the base letter
  // where there is not. Every lowercase one has artwork today, and "ł" keeps
  // the taller band its spec gives it.
  const lower = AUTHORED_LOWER[slug]
    ? authored(slug, spec.band)
    : compose(spec, readSvg(path.join(LOWER_DIR, spec.base + '.svg')), LOWER);
  built.push({
    char: spec.char,
    ...boxed(path.join(LOWER_DIR, slug + '.svg'), lower),
    strokes: lower.strokes.length,
    changed: true,
    how: AUTHORED_LOWER[slug] ? 'drawn' : 'composed'
  });

  const upperChar = spec.base.toUpperCase();
  const upperBase = upperBases[upperChar];
  built.push({
    char: spec.char.toUpperCase(),
    ...boxed(
      path.join(UPPER_DIR, slug + '.svg'),
      compose({ ...spec, at: spec.atUpper, foot: spec.footUpper }, upperBase, UPPER)
    ),
    strokes: upperBase.strokes.length + 1,
    changed: true,
    how: 'composed'
  });
}

for (const row of built) {
  console.log(
    `${row.char.padEnd(2)} ${row.strokes} stroke(s)  ${String(row.width).padStart(7)} x ${String(row.height).padStart(7)}  ${(row.how || (row.changed ? 'redirected' : 'as exported')).padEnd(10)} ${path.relative(__dirname, row.file)}`
  );
}
console.log(`\n${built.length} letters written`);

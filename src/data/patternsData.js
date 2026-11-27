// Szlaczki grouped into four "families", each named after the animal a child
// can picture while drawing it: the wasp loops, the giraffe turns square
// corners, the dolphin rides waves, the spider draws sharp crossing lines.
//
// A family is a progression, not a random set: two or three rows to practise
// the movement, then the same movement wound into a spiral or into ever bigger
// rings, and finally one picture built out of it. Trace the rows first and the
// picture is a movement the hand already knows.
//
// Patterns come from two places. Some are generated below; the ones drawn by
// hand live in `patternArtwork.js` and are pulled in with `traced()`. Either
// way they land in one of three frames, all 100 units tall, so a single
// corridor, pen and guide width describes every pattern in the app.

import { patternArtwork } from './patternArtwork';

const ROW = '0 0 300 100'; // szlaczki: a long strip with the band at y 25..80
const WIDE = '0 0 150 100'; // pictures wider than they are tall
const FIGURE = '0 0 100 100'; // pictures that fit a square

// The hand-drawn ones, already fitted to their frame.
const traced = (id) => patternArtwork[id].map((path) => ({ path }));

// ─── Path builders ──────────────────────────────────────────────────────────
// A generated szlaczek is one relative segment repeated, so it is written here
// as the segment plus a count rather than as forty transcribed coordinates.
// Relative commands make the repeat exact: every unit below has a net dy of 0,
// so a row cannot drift off its line however many times it repeats.

const n = (v) => Number(v.toFixed(2));

const chain = (x, y, unit, count) => `M ${x},${y}${` ${unit}`.repeat(count)}`;

// Closed shapes all start at the top and set off to the left - anticlockwise,
// the way the letter "o" is written - so a ring, a square and a romb are the
// same movement a child already makes for letters. (Sweep flag 0 is
// anticlockwise on screen, where y grows downwards.)
const ellipse = (cx, cy, rx, ry) =>
  `M ${cx},${cy - ry} a ${rx},${ry} 0 1 0 0,${2 * ry} a ${rx},${ry} 0 1 0 0,${-2 * ry}`;

const circle = (cx, cy, r) => ellipse(cx, cy, r, r);

// From the top right corner along the top to the left, then down.
const square = (cx, cy, half) =>
  `M ${cx + half},${cy - half} L ${cx - half},${cy - half} ` +
  `L ${cx - half},${cy + half} L ${cx + half},${cy + half} Z`;

const diamond = (cx, cy, r) =>
  `M ${cx},${cy - r} L ${cx - r},${cy} L ${cx},${cy + r} L ${cx + r},${cy} Z`;

const vLine = (x, y1, y2) => `M ${x},${y1} L ${x},${y2}`;
const hLine = (y, x1, x2) => `M ${x1},${y} L ${x2},${y}`;

// Evenly spaced copies of a shape - a row of hearts, of crosses, of Z's.
const row = (count, startX, step, build) =>
  Array.from({ length: count }, (_, i) => build(startX + i * step)).flat();

// A snail shell: sampled rather than pieced together from arcs, because the
// radius has to shrink continuously as the angle turns. 32 points per turn
// keeps the chord error well under a pixel at the size these are drawn.
const spiral = (cx, cy, { rInner = 3, rOuter = 38, turns = 2.5, startAngle = -Math.PI / 2, direction = 1 }) => {
  const steps = Math.round(turns * 32);
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Outside in, the way the arrows in the reference sheet start it.
    const r = rOuter + (rInner - rOuter) * t;
    const a = startAngle + direction * turns * 2 * Math.PI * t;
    points.push(`${n(cx + r * Math.cos(a))},${n(cy + r * Math.sin(a))}`);
  }
  return `M ${points.join(' L ')}`;
};

// ─── The four families ──────────────────────────────────────────────────────

export const patternFamilies = [
  {
    id: 'osa',
    name: 'Rodzina osy',
    shortName: 'Osa',
    subtitle: 'Pętelki i kółeczka',
    color: '#B45309',
    bgColor: '#FEF3C7'
  },
  {
    id: 'zyrafa',
    name: 'Rodzina żyrafy',
    shortName: 'Żyrafa',
    subtitle: 'Kąty i kwadraty',
    color: '#C2410C',
    bgColor: '#FFEDD5'
  },
  {
    id: 'delfin',
    name: 'Rodzina delfina',
    shortName: 'Delfin',
    subtitle: 'Fale i serduszka',
    color: '#0369A1',
    bgColor: '#E0F2FE'
  },
  {
    id: 'pajak',
    name: 'Rodzina pająka',
    shortName: 'Pająk',
    subtitle: 'Zygzaki i iksy',
    color: '#6D28D9',
    bgColor: '#F5F3FF'
  }
];

// Rows first, then the wound-up version, then the picture. The order is the
// lesson, so it is the order they are listed in.
//
// `progressive: true` marks a pattern whose strokes are a sequence rather than
// a set: the tracing screen shows the smallest one first and only adds the next
// once it has been drawn, so the shape grows around what the child just made.
const FAMILY_PATTERNS = {
  osa: [
    {
      id: 'osa-petelki',
      name: 'Pętelki',
      icon: '➰',
      viewBox: ROW,
      strokes: traced('osa-petelki')
    },
    {
      id: 'osa-kolo-kreska',
      name: 'Koło i kreska',
      icon: '⭕',
      viewBox: ROW,
      strokes: [
        { path: circle(45, 50, 20) },
        { path: vLine(80, 25, 75) },
        { path: circle(115, 50, 20) },
        { path: vLine(150, 25, 75) },
        { path: circle(185, 50, 20) },
        { path: vLine(220, 25, 75) },
        { path: circle(255, 50, 20) }
      ]
    },
    {
      id: 'osa-slimak-lewo',
      name: 'Ślimaki',
      icon: '🐌',
      viewBox: ROW,
      strokes: [55, 150, 245].map((cx) => ({ path: spiral(cx, 50, { direction: -1 }) }))
    },
    {
      id: 'osa-kola',
      name: 'Coraz większe koła',
      short: 'Koła',
      icon: '🎯',
      viewBox: FIGURE,
      // Three rings, not four: the guide band is 8 units wide, so rings any
      // closer than this merge into one thick slab to trace inside of.
      progressive: true,
      strokes: [13, 28, 43].map((r) => ({ path: circle(50, 50, r) }))
    },
    {
      id: 'osa-osa',
      name: 'Osa',
      icon: '🐝',
      // One journey: over the wasp's back, three loops for its striped body,
      // then back up to the point it started from.
      viewBox: WIDE,
      strokes: traced('osa-osa')
    }
  ],

  zyrafa: [
    {
      id: 'zyrafa-murek',
      name: 'Murek',
      icon: '🧱',
      viewBox: ROW,
      // From the top down, seven turns: down, along, up, along, twice over.
      // Short rows sit in the middle of the strip.
      strokes: [{ path: chain(110, 35, 'l 0,40 l 20,0 l 0,-40 l 20,0', 2) }]
    },
    {
      id: 'zyrafa-kubeczki',
      name: 'Kubeczki',
      icon: '🥛',
      viewBox: ROW,
      strokes: [{ path: chain(22, 32, 'c 0,48 32,48 32,0', 8) }]
    },
    {
      id: 'zyrafa-plusiki',
      name: 'Plusiki',
      icon: '➕',
      viewBox: ROW,
      // Arms stop well short of the next cross: at 18 they touched, and a row
      // of touching crosses reads as one long line.
      strokes: row(7, 32, 40, (x) => [
        { path: vLine(x, 30, 70) },
        { path: hLine(50, x - 13, x + 13) }
      ])
    },
    {
      id: 'zyrafa-kwadraty',
      name: 'Coraz większe kwadraty',
      short: 'Kwadraty',
      icon: '🔲',
      viewBox: FIGURE,
      progressive: true,
      strokes: [13, 28, 43].map((half) => ({ path: square(50, 50, half) }))
    },
    {
      id: 'zyrafa-puzzel',
      name: 'Puzzel',
      icon: '🧩',
      // Straight walls and square corners - the family's movement - with a
      // round tab for a head and two for legs.
      viewBox: FIGURE,
      strokes: traced('zyrafa-puzzel')
    }
  ],

  delfin: [
    {
      id: 'delfin-fale',
      name: 'Fale',
      icon: '🌊',
      viewBox: ROW,
      strokes: [{ path: chain(20, 72, 'c 0,-46 30,-46 30,0', 9) }]
    },
    {
      id: 'delfin-pletwy',
      name: 'Płetwy',
      icon: '🐟',
      viewBox: ROW,
      strokes: traced('delfin-pletwy')
    },
    {
      id: 'delfin-serduszka',
      name: 'Serduszka',
      icon: '❤️',
      viewBox: ROW,
      strokes: traced('delfin-serduszka')
    },
    {
      id: 'delfin-owale',
      name: 'Coraz większe owale',
      short: 'Owale',
      icon: '🥚',
      viewBox: FIGURE,
      progressive: true,
      strokes: [
        [10, 13],
        [21, 27],
        [32, 42]
      ].map(([rx, ry]) => ({ path: ellipse(50, 50, rx, ry) }))
    },
    {
      id: 'delfin-kokardka',
      name: 'Kokardka',
      icon: '🎀',
      // Loops leaving from one point: the upper ones make the heart, the
      // lower ones the dolphin's tail.
      viewBox: WIDE,
      strokes: traced('delfin-kokardka')
    }
  ],

  pajak: [
    {
      id: 'pajak-zygzak',
      name: 'Zygzak',
      icon: '⚡',
      viewBox: ROW,
      strokes: [{ path: chain(25, 30, 'l 20,45 l 20,-45', 6) }]
    },
    {
      id: 'pajak-zetki',
      name: 'Zetki',
      icon: '💤',
      viewBox: ROW,
      strokes: traced('pajak-zetki')
    },
    {
      id: 'pajak-iksy',
      name: 'Iksy',
      icon: '✖️',
      viewBox: ROW,
      strokes: row(6, 35, 46, (x) => [
        { path: `M ${x - 16},34 L ${x + 16},66` },
        { path: `M ${x + 16},34 L ${x - 16},66` }
      ])
    },
    {
      id: 'pajak-romby',
      name: 'Coraz większe romby',
      short: 'Romby',
      icon: '💠',
      viewBox: FIGURE,
      progressive: true,
      strokes: [13, 28, 43].map((r) => ({ path: diamond(50, 50, r) }))
    },
    {
      id: 'pajak-pajeczyna',
      name: 'Pajęczyna',
      icon: '🕸️',
      viewBox: FIGURE,
      // Drawn the way the puzzle is solved: one line, without lifting the pen.
      // It starts on the point of the roof and goes left first, like the
      // triangle and the romb; every corner of the envelope is met an even
      // number of times, so the one line can begin there and still finish.
      // Corners are the hand-drawn artwork's.
      strokes: [
        { path: 'M 50.74,13.22 L 8,41.92 L 8,86.78 L 92,41.92 L 92,86.78 L 8,41.92 L 92,41.92 L 50.74,13.22' }
      ]
    }
  ]
};

// Colour comes from the family, so a child always knows which one they are in
// and a pattern cannot be added in the wrong palette by accident.
export const patternsData = patternFamilies.flatMap((family) =>
  (FAMILY_PATTERNS[family.id] || []).map((pattern) => ({
    ...pattern,
    familyId: family.id,
    color: family.color,
    bgColor: family.bgColor
  }))
);

export const getFamily = (familyId) =>
  patternFamilies.find((f) => f.id === familyId) || patternFamilies[0];

export const getPatternsForFamily = (familyId) =>
  patternsData.filter((p) => p.familyId === familyId);

// Every frame is 100 units tall, so the aspect is the frame. Everything that
// has to size itself to a pattern - the canvas, its wrapper, the boundary mask
// - asks this rather than re-parsing the viewBox.
export const patternAspect = (pattern) => {
  const m = (pattern?.viewBox || FIGURE).match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if (!m) return 1;
  const w = parseFloat(m[3]) || 100;
  const h = parseFloat(m[4]) || 100;
  return h === 0 ? 1 : w / h;
};

// Rows get writing lines behind them, pictures get the helper grid. The
// threshold sits between the two picture frames (1.0, 1.5) and the row (3.0)
// rather than on top of either, so a wide picture is never mistaken for a row.
export const isRowPattern = (pattern) => patternAspect(pattern) >= 2;

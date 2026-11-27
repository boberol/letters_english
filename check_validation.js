// Measures how the letter check treats drawings a child could actually make,
// rather than the one perfect trace. Runs in the browser, because sampling a
// path needs getTotalLength. With the dev server up, in the console:
//
//   const v = await import('/check_validation.js');
//   console.log(await v.run());                         // every letter
//   console.log(await v.run({ letters: 'abh', trials: 40 }));
//   v.explain('b', 'guided', 'medium', 3);              // one attempt, scored
//
// Every drawing is seeded, so two runs over the same checker give the same
// numbers and a change can be compared before and after.
//
// A drawing is the letter's own path, put through what a finger on a tablet
// does to it: a slow wobble along the stroke, proportions that are a little off
// (a bowl too big for its stem), a slight shift, turn and resize, ends that stop
// short or overshoot, a closed letter begun a little round from the top, uneven
// touch sampling - and, where the path goes back over itself (the stem of an
// "a", the retrace up an "h"), lifting the finger instead of retracing.

import { validateDrawing } from '/src/utils/validation.js';
import { targetStrokesInCanvas, compareDrawing } from '/src/utils/strokePath.js';
import { getLetterPaths, TRACING_ALPHABET } from '/src/data/lettersData.js';
import { CANVAS_SIZE } from '/src/utils/strokeGeometry.js';

const SIZE = CANVAS_SIZE;

// Distances are canvas pixels (the canvas is 600 across). On a 1024x600 tablet
// the canvas shows at roughly 400 CSS pixels, so a canvas pixel is about two
// thirds of a screen pixel. "medium" is meant as an ordinary attempt that a
// teacher would accept; "heavy" as a scrappy one that is still the letter.
export const LEVELS = {
  exact: { wobble: 0, warp: 0, scale: 0, shift: 0, rotate: 0, trim: 0, jitter: 0, lift: 0, phase: 0 },
  light: { wobble: 4, warp: 6, scale: 0.03, shift: 6, rotate: 2, trim: 6, jitter: 1, lift: 0.5, phase: 12 },
  medium: { wobble: 8, warp: 12, scale: 0.06, shift: 12, rotate: 4, trim: 12, jitter: 1.5, lift: 0.5, phase: 25 },
  heavy: { wobble: 13, warp: 18, scale: 0.1, shift: 18, rotate: 6, trim: 18, jitter: 2, lift: 0.5, phase: 40 }
};

// ------------------------------------------------------------------ randomness

const makeRandom = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hash = (text) => {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const between = (random, lo, hi) => lo + (hi - lo) * random();
const spread = (random, amount) => between(random, -amount, amount);

// -------------------------------------------------------------------- geometry

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const cumulative = (pts) => {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
};

const pointAt = (pts, cum, s) => {
  const total = cum[cum.length - 1];
  if (s <= 0) return { ...pts[0] };
  if (s >= total) return { ...pts[pts.length - 1] };
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { x: pts[lo].x + t * (pts[hi].x - pts[lo].x), y: pts[lo].y + t * (pts[hi].y - pts[lo].y) };
};

const slice = (pts, cum, s0, s1) => {
  const out = [pointAt(pts, cum, s0)];
  for (let i = 0; i < pts.length; i++) if (cum[i] > s0 && cum[i] < s1) out.push({ ...pts[i] });
  out.push(pointAt(pts, cum, s1));
  return out;
};

const box = (pts) => {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of pts) {
    b.minX = Math.min(b.minX, p.x);
    b.maxX = Math.max(b.maxX, p.x);
    b.minY = Math.min(b.minY, p.y);
    b.maxY = Math.max(b.maxY, p.y);
  }
  return { ...b, width: b.maxX - b.minX, height: b.maxY - b.minY };
};

// ---------------------------------------------------------- what a finger does

// Where a path doubles back over itself, a child often lifts the finger rather
// than retrace. The half that runs upward is the one skipped: nobody draws back
// up a stem they are about to come down.
const RETRACE_GAP = 14;

const liftAtRetraces = (stroke, random, chance) => {
  if (!chance || stroke.length < 12) return [stroke];
  const cum = cumulative(stroke);
  const heading = (i) => {
    const a = stroke[Math.max(0, i - 2)];
    const b = stroke[Math.min(stroke.length - 1, i + 2)];
    const l = dist(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  for (let c = 4; c < stroke.length - 4; c++) {
    const before = heading(c - 3);
    const after = heading(c + 3);
    if (before.x * after.x + before.y * after.y > -0.8) continue;
    let k = 1;
    while (c - k >= 0 && c + k < stroke.length && dist(stroke[c - k], stroke[c + k]) < RETRACE_GAP) k++;
    const back = c - k + 1;
    const fwd = c + k - 1;
    if (cum[fwd] - cum[c] < 30) continue;
    if (random() >= chance) return [stroke];
    const firstRuns = stroke[c].y < stroke[back].y;
    const head = firstRuns ? stroke.slice(0, back + 1) : stroke.slice(0, c + 1);
    const tail = firstRuns ? stroke.slice(c) : stroke.slice(fwd);
    return [head, ...liftAtRetraces(tail, random, chance)].filter((s) => s.length > 1);
  }
  return [stroke];
};

// A loop begun a little way round from where the guide starts it - the bowl of
// an "a" started at one o'clock rather than three, an "o" started off the top.
// A loop is wherever the path comes back to a point it passed, heading the same
// way, at least 150px later. Positive amounts start further along the loop,
// negative ones earlier; either way the rest of the stroke carries on from
// where the loop now ends.
const LOOP_GAP = 14;

const rotateStart = (stroke, amount) => {
  if (!amount || stroke.length < 12) return stroke;
  const cum = cumulative(stroke);
  const heading = (i) => {
    const a = stroke[Math.max(0, i - 2)];
    const b = stroke[Math.min(stroke.length - 1, i + 2)];
    const l = dist(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };
  for (let i = 0; i < stroke.length; i++) {
    for (let j = stroke.length - 1; j > i && cum[j] - cum[i] >= 150; j--) {
      if (dist(stroke[i], stroke[j]) > LOOP_GAP) continue;
      const hi = heading(i);
      const hj = heading(j);
      if (hi.x * hj.x + hi.y * hj.y < 0.3) continue;

      const loop = stroke.slice(i, j + 1);
      const lc = cumulative(loop);
      const length = lc[lc.length - 1];
      const before = stroke.slice(0, i);
      const after = stroke.slice(j + 1);
      const s = Math.min(Math.abs(amount), length / 3);

      if (amount > 0) {
        const rotated = [...slice(loop, lc, s, length), ...slice(loop, lc, 0, s).slice(1)];
        // What followed the loop often ran on along its start; skip the part
        // of it the new, later end has already covered.
        const end = rotated[rotated.length - 1];
        const ac = after.length ? cumulative(after) : [];
        let k = 0;
        while (k < after.length && ac[k] < s + 30 && dist(after[k], end) > LOOP_GAP) k++;
        const rest = k < after.length && ac[k] < s + 30 ? after.slice(k) : after;
        return [...before, ...rotated, ...rest];
      }
      const lead = slice(loop, lc, length - s, length);
      const rotated = [...lead, ...slice(loop, lc, 0, length - s).slice(1)];
      // A closed letter ends where it began; one that carries on goes round
      // past its start to reach the rest of the stroke.
      return after.length ? [...before, ...rotated, ...lead.slice(1), ...after] : [...before, ...rotated];
    }
  }
  return stroke;
};

const extend = (tip, inner, by) => {
  const l = dist(tip, inner) || 1;
  return { x: tip.x + ((tip.x - inner.x) / l) * by, y: tip.y + ((tip.y - inner.y) / l) * by };
};

// Stopping short of the end of a stroke, or running past it.
const adjustEnds = (stroke, random, amount) => {
  if (!amount || stroke.length < 2) return stroke;
  const cum = cumulative(stroke);
  const total = cum[cum.length - 1];
  if (total < amount * 4) return stroke;
  const start = spread(random, amount);
  const end = spread(random, amount);
  let out = slice(stroke, cum, Math.max(0, start), Math.min(total, total - end));
  const outCum = cumulative(out);
  const outTotal = outCum[outCum.length - 1];
  if (start < 0) out = [extend(out[0], pointAt(out, outCum, 10), -start), ...out];
  if (end < 0) out = [...out, extend(out[out.length - 1], pointAt(out, outCum, outTotal - 10), -end)];
  return out;
};

// A slow sway either side of the line, varying along the stroke.
const wobble = (stroke, random, amount) => {
  if (!amount) return stroke;
  const cum = cumulative(stroke);
  const axes = [0, 1].map(() =>
    Array.from({ length: 3 }, () => ({
      period: between(random, 50, 220),
      phase: between(random, 0, Math.PI * 2),
      weight: between(random, 0.3, 1)
    }))
  );
  const norms = axes.map((waves) => waves.reduce((s, w) => s + w.weight, 0));
  return stroke.map((p, i) => {
    const [dx, dy] = axes.map(
      (waves, a) =>
        (amount * waves.reduce((s, w) => s + w.weight * Math.sin((2 * Math.PI * cum[i]) / w.period + w.phase), 0)) /
        norms[a]
    );
    return { x: p.x + dx, y: p.y + dy };
  });
};

// Proportions a little off, plus a shift, turn and resize of the whole letter.
const distort = (strokes, random, level, extra = {}) => {
  const b = box(strokes.flat());
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const span = Math.max(b.width, b.height, 1);
  const field = () => ({
    kx: (between(random, 1, 2.5) * Math.PI) / span,
    ky: (between(random, 1, 2.5) * Math.PI) / span,
    p: between(random, 0, Math.PI * 2),
    q: between(random, 0, Math.PI * 2)
  });
  const fx = field();
  const fy = field();
  const scale = 1 + spread(random, level.scale) + spread(random, extra.scale || 0);
  const angle = (spread(random, level.rotate) * Math.PI) / 180;
  let tx = spread(random, level.shift) + spread(random, extra.shiftX || 0);
  const ty = spread(random, level.shift);
  // Freehand letters are written anywhere along the line, but stay on the canvas.
  const half = (b.width * scale) / 2;
  tx = Math.max(10 + half - cx, Math.min(SIZE - 10 - half - cx, tx));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return strokes.map((stroke) =>
    stroke.map((p) => {
      const wx = level.warp * Math.sin(fx.kx * (p.x - cx) + fx.p) * Math.cos(fx.ky * (p.y - cy) + fx.q);
      const wy = level.warp * Math.sin(fy.kx * (p.x - cx) + fy.p) * Math.cos(fy.ky * (p.y - cy) + fy.q);
      const x = (p.x + wx - cx) * scale;
      const y = (p.y + wy - cy) * scale;
      return { x: cx + tx + x * cos - y * sin, y: cy + ty + x * sin + y * cos };
    })
  );
};

// Touch events arrive unevenly spaced, and each point is a little off.
const touchSample = (stroke, random, jitter) => {
  const cum = cumulative(stroke);
  const total = cum[cum.length - 1];
  const nudge = (p) => ({ x: p.x + spread(random, jitter), y: p.y + spread(random, jitter) });
  if (total < 2) return [nudge(stroke[0])];
  const out = [];
  for (let s = 0; s < total; s += between(random, 3, 10)) out.push(nudge(pointAt(stroke, cum, s)));
  out.push(nudge(stroke[stroke.length - 1]));
  return out;
};

export const attempt = (letter, levelName, mode, seed, { omit } = {}) => {
  const level = LEVELS[levelName] || levelName;
  const random = makeRandom(seed);
  const target = targetStrokesInCanvas(getLetterPaths(letter), SIZE, 128);
  let strokes = target.filter((_, k) => k !== omit).map((s) => s.map((p) => ({ ...p })));
  strokes = strokes.flatMap((s) => liftAtRetraces(s, random, level.lift));
  strokes = strokes.map((s) => rotateStart(s, spread(random, level.phase)));
  strokes = strokes.map((s) => adjustEnds(s, random, level.trim));
  strokes = strokes.map((s) => wobble(s, random, level.wobble));
  strokes = distort(strokes, random, level, mode === 'independent' ? { shiftX: 120, scale: 0.15 } : {});
  return strokes.map((s) => touchSample(s, random, level.jitter));
};

// ----------------------------------------------------------------- the checks

const sameCase = (letter) => {
  const capital = letter !== letter.toLowerCase();
  return TRACING_ALPHABET.map((l) => (capital ? l.toUpperCase() : l));
};

const alternativesCache = new Map();
const alternativesFor = (letter) => {
  if (!alternativesCache.has(letter)) {
    alternativesCache.set(
      letter,
      sameCase(letter)
        .filter((l) => l !== letter)
        .map((l) => ({ id: l, data: getLetterPaths(l) }))
    );
  }
  return alternativesCache.get(letter);
};

// Exactly what LearningStage asks.
const check = (strokes, letter, mode) =>
  validateDrawing(strokes, getLetterPaths(letter), mode, { alternatives: alternativesFor(letter) });

const seedFor = (...parts) => hash(parts.join('|'));

// One attempt, with the verdict and how it scored against its closest letters.
export const explain = (letter, mode = 'guided', levelName = 'medium', trial = 0) => {
  const strokes = attempt(letter, levelName, mode, seedFor(letter, mode, levelName, trial));
  const verdict = check(strokes, letter, mode);
  const positionInvariant = mode === 'independent';
  const scores = sameCase(letter)
    .map((l) => ({
      letter: l,
      score: compareDrawing(strokes, targetStrokesInCanvas(getLetterPaths(l), SIZE), { positionInvariant }).score
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((s) => `${s.letter} ${s.score.toFixed(3)}`);
  return { verdict, strokes: strokes.length, closest: scores.join(', ') };
};

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

// Raw shape scores, before any verdict: how right attempts spread, and how
// close the nearest wrong letters come. The tolerances in validation.js belong
// in the gap between the two.
export const margins = ({ letters, trials = 12, modes = ['guided', 'independent'] } = {}) => {
  const list = letters ? [...letters] : [...TRACING_ALPHABET, ...TRACING_ALPHABET.map((l) => l.toUpperCase())];
  const lines = [];
  for (const mode of modes) {
    const positionInvariant = mode === 'independent';
    const right = { light: [], medium: [], heavy: [] };
    const wrong = [];
    for (const letter of list) {
      const target = targetStrokesInCanvas(getLetterPaths(letter), SIZE);
      for (const levelName of Object.keys(right)) {
        for (let t = 0; t < trials; t++) {
          const strokes = attempt(letter, levelName, mode, seedFor(letter, mode, levelName, t));
          right[levelName].push(compareDrawing(strokes, target, { positionInvariant }).score);
        }
      }
      for (const other of sameCase(letter)) {
        if (other === letter) continue;
        const strokes = attempt(other, 'light', mode, seedFor(other, mode, 'conf', 'light'));
        wrong.push({ pair: `${other}->${letter}`, score: compareDrawing(strokes, target, { positionInvariant }).score });
      }
    }
    wrong.sort((a, b) => a.score - b.score);
    const f = (x) => x.toFixed(3);
    lines.push(
      `${mode}: right light p90 ${f(percentile(right.light, 0.9))}, medium p90 ${f(percentile(right.medium, 0.9))} p98 ${f(percentile(right.medium, 0.98))}, heavy p90 ${f(percentile(right.heavy, 0.9))}`
    );
    lines.push(`  wrong p1 ${f(percentile(wrong.map((w) => w.score), 0.01))} p5 ${f(percentile(wrong.map((w) => w.score), 0.05))}`);
    lines.push(`  closest wrong: ${wrong.slice(0, 18).map((w) => `${w.pair} ${f(w.score)}`).join(', ')}`);
  }
  return lines.join('\n');
};

const pct = (x) => `${Math.round(x * 100)}`.padStart(3);

export const run = async ({
  letters,
  trials = 12,
  levels = ['exact', 'light', 'medium', 'heavy'],
  modes = ['guided', 'independent'],
  confusion = true,
  reversed = true,
  missing = true,
  verbose = false
} = {}) => {
  const started = performance.now();
  const list = letters ? [...letters] : [...TRACING_ALPHABET, ...TRACING_ALPHABET.map((l) => l.toUpperCase())];
  const rates = {};
  const failures = {};

  for (const letter of list) {
    for (const mode of modes) {
      for (const levelName of levels) {
        const n = levelName === 'exact' ? 1 : trials;
        let passed = 0;
        for (let t = 0; t < n; t++) {
          const r = check(attempt(letter, levelName, mode, seedFor(letter, mode, levelName, t)), letter, mode);
          if (r.isCorrect) {
            passed++;
          } else {
            const why = r.reason === 'wrong-letter' ? `as ${r.matchedLetter}` : r.reason;
            const key = `${mode} ${levelName}`;
            failures[letter] ||= {};
            failures[letter][key] ||= {};
            failures[letter][key][why] = (failures[letter][key][why] || 0) + 1;
          }
        }
        rates[`${letter}|${mode}|${levelName}`] = passed / n;
      }
    }
  }

  // Drawn backwards - every stroke reversed, strokes in reverse order.
  const reversedAccepted = [];
  if (reversed) {
    for (const letter of list) {
      for (const mode of modes) {
        for (const levelName of ['exact', 'light']) {
          const strokes = attempt(letter, levelName, mode, seedFor(letter, mode, 'rev', levelName))
            .map((s) => [...s].reverse())
            .reverse();
          if (check(strokes, letter, mode).isCorrect) reversedAccepted.push(`${letter} ${mode} ${levelName}`);
        }
      }
    }
  }

  // Some other letter, drawn well, accepted as this one.
  const falseAccepts = [];
  if (confusion) {
    for (const letter of list) {
      for (const mode of modes) {
        for (const other of sameCase(letter)) {
          if (other === letter) continue;
          for (const levelName of ['exact', 'light']) {
            const strokes = attempt(other, levelName, mode, seedFor(other, mode, 'conf', levelName));
            if (check(strokes, letter, mode).isCorrect) falseAccepts.push(`${other}->${letter} ${mode} ${levelName}`);
          }
        }
      }
    }
  }

  const lines = [];
  const mean = (mode, levelName) => {
    const values = list.map((l) => rates[`${l}|${mode}|${levelName}`]);
    return values.reduce((s, v) => s + v, 0) / values.length;
  };
  lines.push(`pass rate %      ${levels.map((l) => l.padStart(7)).join('')}`);
  for (const mode of modes) {
    lines.push(`${mode.padEnd(16)} ${levels.map((l) => pct(mean(mode, l)).padStart(7)).join('')}`);
  }
  lines.push('');
  lines.push(`per letter (${modes.map((m) => m[0]).join('/')} x ${levels.join('/')}):`);
  const weak = [];
  for (const letter of list) {
    const cells = modes.map((m) => levels.map((l) => pct(rates[`${letter}|${m}|${l}`])).join(''));
    const worst = Math.min(...modes.map((m) => rates[`${letter}|${m}|medium`] ?? 1));
    if (verbose || worst < 0.9 || levels.some((l) => modes.some((m) => l === 'exact' && rates[`${letter}|${m}|${l}`] < 1))) {
      weak.push(letter);
      const why = Object.entries(failures[letter] || {})
        .map(([k, v]) => `${k}: ${Object.entries(v).map(([r, c]) => `${r}x${c}`).join(' ')}`)
        .join('; ');
      lines.push(`  ${letter}  ${cells.join('  |')}   ${why}`);
    }
  }
  if (!weak.length) lines.push('  (every letter passes medium at least 90% of the time in every mode)');
  lines.push('');
  lines.push(`reversed accepted (${reversedAccepted.length}): ${reversedAccepted.join(', ')}`);
  lines.push(`false accepts (${falseAccepts.length}): ${falseAccepts.join(', ')}`);
  // The letter with one of its strokes left out - the ogonek off an "ą", a bar
  // off an "E", the dot off an "i". None of those is the letter.
  if (missing) {
    const missingAccepted = [];
    for (const letter of list) {
      const count = getLetterPaths(letter).strokes.length;
      if (count < 2) continue;
      for (const mode of modes) {
        for (let k = 0; k < count; k++) {
          const strokes = attempt(letter, 'light', mode, seedFor(letter, mode, 'missing', k), { omit: k });
          if (check(strokes, letter, mode).isCorrect) missingAccepted.push(`${letter} without ${k + 1} ${mode}`);
        }
      }
    }
    lines.push(`missing stroke accepted (${missingAccepted.length}): ${missingAccepted.join(', ')}`);
  }
  lines.push(`${Math.round(performance.now() - started)} ms`);
  return lines.join('\n');
};

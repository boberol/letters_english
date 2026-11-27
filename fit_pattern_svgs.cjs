// Fit hand-drawn szlaczek SVGs into the frames the app draws in and write
// src/data/patternArtwork.js.
//
//   node fit_pattern_svgs.cjs "C:/path/to/exported/svgs"
//
// Every frame is 100 units tall, so one corridor, pen and guide width in
// PatternsTool describes every pattern: rows land in 300x100 with the drawing
// in the writing band (y 24..82), wide pictures in 150x100 and square ones in
// 100x100. Fitting is a uniform scale plus a translate - nothing is reshaped.
//
// Per drawing, JOBS says which frame it belongs in, whether it was drawn right
// to left (`reverse`), and how many segments of a repeating row to keep
// (`keep`, the index of the last segment of a finished repeat - dump the
// segment list first if you need to find it). Re-run after re-exporting an SVG
// rather than editing coordinates in patternArtwork.js by hand.
//
// One-off tooling, like fix_svgs.cjs: not part of the build.
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2];
if (!SRC) {
  console.error('usage: node fit_pattern_svgs.cjs <folder-with-svgs>');
  process.exit(1);
}

// ── path parsing → absolute M/L/C segments ──────────────────────────────────
const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function tokenize(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) out.push(m[1] ? m[1] : parseFloat(m[2]));
  return out;
}

function parsePath(d) {
  const t = tokenize(d);
  let i = 0, cmd = null;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let prevC2 = null, prevQ = null;
  const segs = [];
  const num = () => t[i++];
  while (i < t.length) {
    if (typeof t[i] === 'string') cmd = t[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ax = (v) => (rel ? cx + v : v);
    const ay = (v) => (rel ? cy + v : v);
    if (C === 'M') {
      const x = ax(num()), y = ay(num());
      segs.push({ c: 'M', p: [x, y] });
      cx = sx = x; cy = sy = y;
      cmd = rel ? 'l' : 'L';
      prevC2 = prevQ = null;
    } else if (C === 'L') {
      const x = ax(num()), y = ay(num());
      segs.push({ c: 'L', p: [x, y] }); cx = x; cy = y; prevC2 = prevQ = null;
    } else if (C === 'H') {
      const x = rel ? cx + num() : num();
      segs.push({ c: 'L', p: [x, cy] }); cx = x; prevC2 = prevQ = null;
    } else if (C === 'V') {
      const y = rel ? cy + num() : num();
      segs.push({ c: 'L', p: [cx, y] }); cy = y; prevC2 = prevQ = null;
    } else if (C === 'C') {
      const x1 = ax(num()), y1 = ay(num()), x2 = ax(num()), y2 = ay(num()), x = ax(num()), y = ay(num());
      segs.push({ c: 'C', p: [x1, y1, x2, y2, x, y] });
      prevC2 = [x2, y2]; prevQ = null; cx = x; cy = y;
    } else if (C === 'S') {
      const rx = prevC2 ? 2 * cx - prevC2[0] : cx;
      const ry = prevC2 ? 2 * cy - prevC2[1] : cy;
      const x2 = ax(num()), y2 = ay(num()), x = ax(num()), y = ay(num());
      segs.push({ c: 'C', p: [rx, ry, x2, y2, x, y] });
      prevC2 = [x2, y2]; prevQ = null; cx = x; cy = y;
    } else if (C === 'Q' || C === 'T') {
      let qx, qy;
      if (C === 'Q') { qx = ax(num()); qy = ay(num()); }
      else { qx = prevQ ? 2 * cx - prevQ[0] : cx; qy = prevQ ? 2 * cy - prevQ[1] : cy; }
      const x = ax(num()), y = ay(num());
      segs.push({ c: 'C', p: [cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y] });
      prevQ = [qx, qy]; prevC2 = null; cx = x; cy = y;
    } else if (C === 'Z') {
      segs.push({ c: 'L', p: [sx, sy] }); cx = sx; cy = sy; prevC2 = prevQ = null;
    } else {
      throw new Error('unsupported command ' + cmd);
    }
  }
  return segs;
}

// ── geometry helpers ────────────────────────────────────────────────────────
const cubicAt = (p0, p, t) => {
  const [x1, y1, x2, y2, x3, y3] = p;
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
    u * u * u * p0[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
  ];
};

function bbox(all) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const hit = ([x, y]) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (const segs of all) {
    let cur = [0, 0];
    for (const s of segs) {
      if (s.c === 'M' || s.c === 'L') { hit(s.p); cur = s.p; }
      else { for (let k = 0; k <= 24; k++) hit(cubicAt(cur, s.p, k / 24)); cur = [s.p[4], s.p[5]]; }
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Reverse the direction a path is drawn in (M + L/C only).
function reverse(segs) {
  const pts = [segs[0].p];
  for (const s of segs.slice(1)) pts.push(s.c === 'C' ? [s.p[4], s.p[5]] : s.p);
  const out = [{ c: 'M', p: pts[pts.length - 1] }];
  for (let i = segs.length - 1; i >= 1; i--) {
    const s = segs[i];
    const target = pts[i - 1];
    if (s.c === 'C') out.push({ c: 'C', p: [s.p[2], s.p[3], s.p[0], s.p[1], target[0], target[1]] });
    else out.push({ c: 'L', p: target });
  }
  return out;
}

// Keep whole repeats only: the index is the last segment of a finished unit,
// so a row never ends on a dangling half-stroke.
function trim(segs, keep) {
  return keep == null ? segs : segs.slice(0, keep + 1);
}

// Illustrator leaves zero-length line-tos behind (h0, .04,-.06 rounded away).
const dropEmpty = (segs) => {
  const out = [];
  let cur = null;
  for (const s of segs) {
    const end = s.c === 'C' ? [s.p[4], s.p[5]] : s.p;
    const same = cur && Math.abs(end[0] - cur[0]) < 0.05 && Math.abs(end[1] - cur[1]) < 0.05;
    if (s.c === 'L' && same) continue;
    out.push(s);
    cur = end;
  }
  return out;
};

const r2 = (v) => {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
};

function serialize(segs, fx, fy) {
  const parts = [];
  for (const s of segs) {
    if (s.c === 'M') parts.push(`M ${r2(fx(s.p[0]))},${r2(fy(s.p[1]))}`);
    else if (s.c === 'L') parts.push(`L ${r2(fx(s.p[0]))},${r2(fy(s.p[1]))}`);
    else parts.push(`C ${r2(fx(s.p[0]))},${r2(fy(s.p[1]))} ${r2(fx(s.p[2]))},${r2(fy(s.p[3]))} ${r2(fx(s.p[4]))},${r2(fy(s.p[5]))}`);
  }
  return parts.join(' ');
}

function readShapes(file) {
  const svg = fs.readFileSync(path.join(SRC, file), 'utf8');
  const shapes = [];
  for (const m of svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)) shapes.push(parsePath(m[1]));
  for (const m of svg.matchAll(/<polyline[^>]*\spoints="([^"]+)"/g)) {
    const n = m[1].match(NUM).map(Number);
    const segs = [{ c: 'M', p: [n[0], n[1]] }];
    for (let i = 2; i < n.length; i += 2) segs.push({ c: 'L', p: [n[i], n[i + 1]] });
    shapes.push(segs);
  }
  // Illustrator exports sometimes duplicate every shape; keep the first of each.
  const seen = new Set();
  return shapes.filter((s) => {
    const k = JSON.stringify(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ── the seven drawings ──────────────────────────────────────────────────────
const JOBS = [
  { id: 'osa-petelki', file: 'osa-petelki.svg', frame: 'row', reverse: true, keep: 15 },
  // Reversed so the journey sets off to the left from the top of the wasp's
  // back, the way round every closed shape in the app is drawn.
  { id: 'osa-osa', file: 'osa-osa.svg', frame: 'wide', reverse: true },
  { id: 'zyrafa-puzzel', file: 'zyrafa-puzzel.svg', frame: 'figure' },
  // Three fins. The export has an empty line-to between fins, so fin n ends
  // on segment 3n.
  { id: 'delfin-pletwy', file: 'delfin-pletwy.svg', frame: 'row', keep: 9 },
  { id: 'delfin-serduszka', file: 'delfin-serduszka.svg', frame: 'row' },
  { id: 'delfin-kokardka', file: 'delfin-kokardka.svg', frame: 'wide' },
  { id: 'pajak-zetki', file: 'pajak-zetki.svg', frame: 'row', keep: 19 }
  // pajak-pajeczyna is straight lines only, so it now lives in patternsData.js
  // as coordinates, re-ordered to start on the roof and go left.
];

// Fit boxes: rows sit in the writing band, pictures in a square with a margin.
const BOX = {
  row: { x0: 12, y0: 24, x1: 288, y1: 82 },
  wide: { x0: 8, y0: 8, x1: 142, y1: 92 },
  figure: { x0: 8, y0: 8, x1: 92, y1: 92 }
};

const out = {};
for (const job of JOBS) {
  let shapes = readShapes(job.file);
  if (job.reverse) shapes = shapes.map(reverse);
  shapes = shapes.map((s) => dropEmpty(trim(s, job.keep)));
  const bb = bbox(shapes);
  const box = BOX[job.frame];
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const scale = Math.min(bw / bb.w, bh / bb.h);
  const offX = box.x0 + (bw - bb.w * scale) / 2;
  const offY = box.y0 + (bh - bb.h * scale) / 2;
  const fx = (x) => offX + (x - bb.minX) * scale;
  const fy = (y) => offY + (y - bb.minY) * scale;
  out[job.id] = shapes.map((s) => serialize(s, fx, fy));
  console.log(
    job.id.padEnd(18),
    'shapes', String(shapes.length).padStart(2),
    'src', `${bb.w.toFixed(0)}x${bb.h.toFixed(0)}`.padStart(10),
    '-> scale', scale.toFixed(3),
    'fitted', `${(bb.w * scale).toFixed(0)}x${(bb.h * scale).toFixed(0)}`.padStart(9),
    'chars', out[job.id].join('').length
  );
}

const header = [
  '// Szlaczki drawn by hand, exported as SVG and normalised into the frames the',
  '// app draws in: every entry is already in a 100-unit-tall viewBox, so the',
  '// corridor, pen and guide widths in `PatternsTool` describe these the same way',
  '// they describe a generated pattern.',
  '//',
  '// Normalising is a uniform scale plus a translate - nothing is reshaped. Rows',
  '// were fitted to the writing band (y 24..82) and trimmed to a whole number of',
  '// repeats, at a size a finger can follow; pictures were centred in their frame',
  '// with a margin. `osa-petelki` was drawn right to left and is reversed here, so',
  '// tracing runs the way writing does; `osa-osa` is reversed so it sets off to',
  '// the left.',
  '//',
  '// This is artwork - look at it in the app, not here. To replace one, re-export',
  '// the SVG and re-run fit_pattern_svgs.cjs rather than editing coordinates.',
  'export const patternArtwork = {'
].join('\n');
const body = Object.entries(out)
  .map(([id, list]) => `  '${id}': [\n${list.map((p) => `    '${p}'`).join(',\n')}\n  ]`)
  .join(',\n');
const dest = path.join(__dirname, 'src', 'data', 'patternArtwork.js');
fs.writeFileSync(dest, `${header}\n${body}\n};\n`);
console.log('\nwrote', dest);

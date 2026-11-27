// Contact sheet for the letter artwork: every letter framed the way the app
// frames it, on the same four ruled lines, with each stroke numbered, dotted at
// its start and arrowed at its end. Direction and stroke order are the two
// things that cannot be checked by looking at a finished letter, so they are
// drawn in.
//
//   node preview_letters.cjs > sheet.html

const fs = require('fs');
const path = require('path');

const LOWER_DIR = path.join(__dirname, 'src', 'assets', 'letters');
const UPPER_DIR = path.join(LOWER_DIR, 'upper');

const ALPHABET = (process.argv[2] || 'a ą b c ć d e ę f g h i j k l ł m n ń o ó p r s ś t u w y z ź ż').split(' ');
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

// Mirrors getLetterType/parseSVG in src/data/lettersData.js for the files that
// predate data-body.
const TYPES = {
  ascender: ['b', 'd', 'f', 'h', 'k', 'l', 't'],
  descender: ['g', 'p', 'q', 'y'],
  full: ['j']
};

const frameFor = (letter, svgText, vb) => {
  const body = svgText.match(/data-body="([^"]+)"/);
  const band = svgText.match(/data-band="([^"]+)"/);
  if (body && band) {
    const [y0, y1] = body[1].split(/\s+/).map(Number);
    const [top, bottom] = band[1].split(/\s+/).map(Number);
    const V = (y1 - y0) / (bottom - top);
    return { V, minY: y0 - top * V, minX: vb.x + vb.width / 2 - V / 2 };
  }
  let ratio = 0.25;
  let start = 0.35;
  if (letter === 'i') {
    ratio = 0.38;
    start = 0.22;
  } else if (letter === 'j') {
    ratio = 0.56;
    start = 0.29;
  } else if (TYPES.ascender.includes(letter)) {
    ratio = 0.5;
    start = 0.1;
  } else if (TYPES.descender.includes(letter)) {
    ratio = 0.5;
    start = 0.35;
  }
  const V = vb.height / ratio;
  return { V, minY: vb.y - start * V, minX: vb.x + vb.width / 2 - V / 2 };
};

const read = (dir, slug, letter) => {
  const file = path.join(dir, slug + '.svg');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  const nums = text.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);
  const vb = { x: nums[0], y: nums[1], width: nums[2], height: nums[3] };
  const strokes = [];
  for (const [, tag, attrs] of text.matchAll(/<(path|line)\b([^>]*)>/g)) {
    if (tag === 'path') {
      const d = attrs.match(/\bd="([^"]+)"/)[1];
      d.trim()
        .split(/(?=M)/)
        .forEach((sub) => sub.trim() && strokes.push(sub.trim()));
    } else {
      const at = (n) => parseFloat(attrs.match(new RegExp('\\b' + n + '="([^"]+)"'))[1]);
      let x2 = at('x2');
      if (Math.abs(at('x1') - x2) < 0.1 && Math.abs(at('y1') - at('y2')) < 0.1) x2 += 0.1;
      strokes.push(`M ${at('x1')},${at('y1')} L ${x2},${at('y2')}`);
    }
  }
  const frame = frameFor(letter, text, vb);
  return { strokes, frame, count: strokes.length };
};

const cell = (label, letter, data) => {
  if (!data) return `<div class="cell missing"><b>${label}</b><span>no file</span></div>`;
  const { frame, strokes } = data;
  const box = `${frame.minX} ${frame.minY} ${frame.V} ${frame.V}`;
  const pen = frame.V * 0.048;
  const guides = [0.1, 0.35, 0.6, 0.85]
    .map((f) => {
      const y = frame.minY + f * frame.V;
      const solid = f === 0.35 || f === 0.6;
      return `<line x1="${frame.minX}" y1="${y}" x2="${frame.minX + frame.V}" y2="${y}" stroke="${solid ? '#93c5fd' : '#e5e7eb'}" stroke-width="${frame.V * 0.004}" ${solid ? '' : 'stroke-dasharray="' + frame.V * 0.02 + '"'}/>`;
    })
    .join('');
  const paths = strokes
    .map(
      (d, i) =>
        `<path d="${d}" fill="none" stroke="${['#111827', '#dc2626', '#2563eb', '#059669'][i % 4]}" stroke-width="${pen}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>` +
        `<path class="mark" data-i="${i}" d="${d}" fill="none" stroke="none"/>`
    )
    .join('');
  return `<div class="cell"><b>${label}</b>
    <svg viewBox="${box}" data-v="${frame.V}">${guides}${paths}<g class="dir"></g></svg>
    <span>${strokes.length} stroke${strokes.length === 1 ? '' : 's'}</span></div>`;
};

const rows = ALPHABET.map((ch) => {
  const slug = SLUGS[ch] || ch;
  return (
    cell(ch, ch, read(LOWER_DIR, slug, ch)) +
    cell(ch.toUpperCase(), ch, read(UPPER_DIR, slug, ch))
  );
}).join('');

process.stdout.write(`<!doctype html><meta charset="utf-8"><title>letters</title>
<style>
  body { font: 13px system-ui; margin: 12px; background: #fff; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 4px; text-align: center; }
  .cell b { display: block; font-size: 15px; color: #6366f1; }
  .cell span { color: #9ca3af; font-size: 11px; }
  .cell svg { width: 100%; aspect-ratio: 1; display: block; }
  .missing { color: #dc2626; }
</style>
<div class="grid">${rows}</div>
<script>
// Start dot and end arrow per stroke, measured off the real path geometry.
for (const svg of document.querySelectorAll('svg')) {
  const V = parseFloat(svg.dataset.v);
  const g = svg.querySelector('.dir');
  const colors = ['#111827', '#dc2626', '#2563eb', '#059669'];
  for (const p of svg.querySelectorAll('.mark')) {
    const i = +p.dataset.i;
    const len = p.getTotalLength();
    const a = p.getPointAtLength(0);
    const b = p.getPointAtLength(Math.max(0, len - 0.001));
    const back = p.getPointAtLength(Math.max(0, len - V * 0.05));
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y);
    dot.setAttribute('r', V * 0.018); dot.setAttribute('fill', colors[i % 4]);
    g.appendChild(dot);
    const n = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    n.setAttribute('x', a.x); n.setAttribute('y', a.y - V * 0.03);
    n.setAttribute('font-size', V * 0.06); n.setAttribute('text-anchor', 'middle');
    n.setAttribute('fill', colors[i % 4]); n.textContent = i + 1;
    g.appendChild(n);
    const ang = Math.atan2(b.y - back.y, b.x - back.x);
    const s = V * 0.035;
    const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    tri.setAttribute('points', [
      [b.x, b.y],
      [b.x - s * Math.cos(ang - 0.5), b.y - s * Math.sin(ang - 0.5)],
      [b.x - s * Math.cos(ang + 0.5), b.y - s * Math.sin(ang + 0.5)]
    ].map(q => q.join(',')).join(' '));
    tri.setAttribute('fill', colors[i % 4]);
    g.appendChild(tri);
  }
}
</script>
`);

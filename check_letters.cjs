// Reports which way every stroke of every letter runs, so direction can be
// checked without reading path data by eye.
//
//   node check_letters.cjs
//
// The rule the artwork follows is the one in fix_svgs.cjs: a mostly vertical
// stroke starts at the top, a mostly horizontal one at the left. Round letters
// break it legitimately - an "o" travels up its left side on the way round -
// so violations are flagged for reading rather than treated as failures.

const fs = require('fs');
const path = require('path');

const LOWER_DIR = path.join(__dirname, 'src', 'assets', 'letters');
const UPPER_DIR = path.join(LOWER_DIR, 'upper');

const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
const NUM_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const SIZES = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

// Start point, end point, and the extremes the pen reached.
const trace = (d) => {
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let start = null;
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const see = () => {
    box.minX = Math.min(box.minX, x);
    box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y);
    box.maxY = Math.max(box.maxY, y);
  };
  for (const [, cmd, argText] of d.matchAll(CMD_RE)) {
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    const size = SIZES[up];
    const v = (argText.match(NUM_RE) || []).map(Number);
    if (up === 'Z') {
      x = sx;
      y = sy;
      see();
      continue;
    }
    for (let i = 0; i + size <= v.length; i += size) {
      if (up === 'H') x = (rel ? x : 0) + v[i];
      else if (up === 'V') y = (rel ? y : 0) + v[i];
      else if (up === 'A') {
        x = (rel ? x : 0) + v[i + 5];
        y = (rel ? y : 0) + v[i + 6];
      } else {
        x = (rel ? x : 0) + v[i + size - 2];
        y = (rel ? y : 0) + v[i + size - 1];
      }
      see();
      if (start === null) {
        start = { x, y };
        sx = x;
        sy = y;
      }
    }
  }
  return { start, end: { x, y }, box };
};

const readStrokes = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const [, tag, attrs] of text.matchAll(/<(path|line)\b([^>]*)>/g)) {
    if (tag === 'path') {
      attrs
        .match(/\bd="([^"]+)"/)[1]
        .trim()
        .split(/(?=M)/)
        .forEach((s) => s.trim() && out.push(s.trim()));
    } else {
      const at = (n) => parseFloat(attrs.match(new RegExp('\\b' + n + '="([^"]+)"'))[1]);
      out.push(`M ${at('x1')},${at('y1')} L ${at('x2')},${at('y2')}`);
    }
  }
  return out;
};

const ALPHABET = 'a ą b c ć d e ę f g h i j k l ł m n ń o ó p r s ś t u w y z ź ż'.split(' ');
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

let flagged = 0;
let total = 0;

for (const ch of ALPHABET) {
  const slug = SLUGS[ch] || ch;
  for (const [label, dir] of [
    [ch, LOWER_DIR],
    [ch.toUpperCase(), UPPER_DIR]
  ]) {
    const file = path.join(dir, slug + '.svg');
    if (!fs.existsSync(file)) {
      console.log(`${label}  MISSING  ${path.relative(__dirname, file)}`);
      continue;
    }
    const strokes = readStrokes(file);
    const notes = strokes.map((d, i) => {
      total++;
      const { start, end, box } = trace(d);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
      let flag = '';
      if (span > 1) {
        if (Math.abs(dy) > Math.abs(dx) && dy < 0) flag = ' <= runs UP';
        else if (Math.abs(dx) >= Math.abs(dy) && dx < 0) flag = ' <= runs RIGHT-TO-LEFT';
      }
      if (flag) flagged++;
      return `    ${i + 1}. (${start.x.toFixed(0)},${start.y.toFixed(0)}) -> (${end.x.toFixed(0)},${end.y.toFixed(0)})${flag}`;
    });
    console.log(`${label}  ${strokes.length} stroke(s)`);
    console.log(notes.join('\n'));
  }
}

console.log(`\n${total} strokes, ${flagged} to look at`);

// Letters defined inside a 100x100 viewBox
const customSvgs = import.meta.glob('../assets/letters/*.svg', { eager: true, query: '?raw', import: 'default' });
// Capitals live in their own folder rather than alongside the lowercase files:
// "A.svg" and "a.svg" are the same name to Windows and macOS, so one would
// quietly overwrite the other the moment the artwork was copied anywhere.
const upperSvgs = import.meta.glob('../assets/letters/upper/*.svg', { eager: true, query: '?raw', import: 'default' });

// File names stay ASCII. A file named with the letter itself has to survive the
// filesystem, the bundler's glob and the string built below to look it up, and
// those three do not always agree on how to normalise a Polish character.
const ASSET_SLUGS = {
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

// The letter each Polish one is built from - the artwork is that letter plus a
// mark, so it inherits its shape, its theme and its fallback paths.
export const BASE_LETTER = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z'
};

const letterTypes = {
  ascender: ['b', 'd', 'f', 'h', 'k', 'l', 't'],
  descender: ['g', 'p', 'q', 'y'],
  full: ['j'],
  xHeight: ['a', 'c', 'e', 'm', 'n', 'o', 'r', 's', 'u', 'v', 'w', 'x', 'z']
};

const getLetterType = (letter) => {
  const char = letter ? letter.toLowerCase() : '';
  if (letterTypes.ascender.includes(char)) return 'ascender';
  if (letterTypes.descender.includes(char)) return 'descender';
  if (letterTypes.full.includes(char)) return 'full';
  return 'xHeight';
};

const parseSVG = (svgString, letter) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svgNode = doc.querySelector("svg");
  if (!svgNode) return null;
  
  let viewBox = svgNode.getAttribute("viewBox") || "0 0 100 100";
  
  if (letter && svgNode.getAttribute("viewBox")) {
    const vbMatches = viewBox.match(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
    if (vbMatches) {
      const origX = parseFloat(vbMatches[1]);
      const origY = parseFloat(vbMatches[2]);
      const origW = parseFloat(vbMatches[3]);
      const origH = parseFloat(vbMatches[4]);

      let V;
      let minY;

      // A letter carrying a diacritic says outright which part of the drawing
      // is the letter body and which band that body belongs in. Guessing from
      // the box, the way the rule below does, would fit accent and letter
      // together into the writing band and leave every accented letter smaller
      // than the letter it is built from - the one thing "the same letter, plus
      // a mark" must not be. build_letters.cjs writes both attributes.
      const body = (svgNode.getAttribute('data-body') || '').trim().split(/\s+/).map(parseFloat);
      const band = (svgNode.getAttribute('data-band') || '').trim().split(/\s+/).map(parseFloat);

      if (body.length === 2 && band.length === 2 && !body.some(isNaN) && !band.some(isNaN)) {
        V = (body[1] - body[0]) / (band[1] - band[0]);
        minY = body[0] - band[0] * V;
      } else {
        const type = getLetterType(letter);

        let targetRatio = 0.25; // xHeight (43% to 68%)
        let startYPercent = 0.43;

        if (letter.toLowerCase() === 'i') {
          targetRatio = 0.38; // 30% to 68%
          startYPercent = 0.30;
        } else if (letter.toLowerCase() === 'j') {
          targetRatio = 0.56; // 37% to 93%
          startYPercent = 0.37;
        } else if (type === 'ascender') {
          targetRatio = 0.50; // 18% to 68%
          startYPercent = 0.18;
        } else if (type === 'descender') {
          targetRatio = 0.50; // 43% to 93%
          startYPercent = 0.43;
        }

        V = origH / targetRatio;
        minY = origY - (startYPercent * V);
      }

      const minX = origX + (origW / 2) - (V / 2);

      viewBox = `${minX} ${minY} ${V} ${V}`;
    }
  }

  const paths = [];
  Array.from(doc.querySelectorAll("path, line, polyline, polygon")).forEach(node => {
    let d = "";
    let type = undefined;
    const tagName = node.tagName.toLowerCase();
    
    if (tagName === "path") {
      d = node.getAttribute("d");
    } else if (tagName === "line") {
      const x1 = parseFloat(node.getAttribute("x1") || 0);
      const y1 = parseFloat(node.getAttribute("y1") || 0);
      let x2 = parseFloat(node.getAttribute("x2") || 0);
      const y2 = parseFloat(node.getAttribute("y2") || 0);
      
      if (Math.abs(x1 - x2) < 0.1 && Math.abs(y1 - y2) < 0.1) {
        x2 += 0.1;
        type = "dot";
      }
      d = `M ${x1},${y1} L ${x2},${y2}`;
    } else if (tagName === "polyline" || tagName === "polygon") {
      const pointsStr = node.getAttribute("points") || "";
      const points = pointsStr.trim().split(/[\s,]+/).map(parseFloat);
      for (let i = 0; i < points.length; i += 2) {
        if (!isNaN(points[i]) && !isNaN(points[i+1])) {
          if (i === 0) d += `M ${points[i]},${points[i+1]} `;
          else d += `L ${points[i]},${points[i+1]} `;
        }
      }
      if (tagName === "polygon" && d) d += "Z";
    }
    
    if (d) {
      paths.push({ path: d.trim(), type });
    }
  });

  return { viewBox, strokes: paths };
};

export const lettersData = {
  a: [{ path: "M 70,35 C 20,35 20,60 70,60" }, { path: "M 70,35 L 70,60" }],
  b: [{ path: "M 30,10 L 30,60" }, { path: "M 30,35 C 80,35 80,60 30,60" }],
  c: [{ path: "M 70,42 C 30,35 20,43 20,48 C 20,55 30,60 70,60" }],
  d: [{ path: "M 70,35 C 20,35 20,60 70,60" }, { path: "M 70,10 L 70,60" }],
  e: [{ path: "M 20,48 L 75,48 C 75,35 20,35 20,48 C 20,60 75,60 75,55" }],
  f: [{ path: "M 60,10 C 40,10 40,23 40,35 L 40,60" }, { path: "M 25,35 L 55,35" }],
  g: [{ path: "M 70,35 C 20,35 20,60 70,60" }, { path: "M 70,35 L 70,75 C 70,85 40,85 30,75" }],
  h: [{ path: "M 30,10 L 30,60 L 30,35 C 70,30 70,60 70,60" }],
  i: [{ path: "M 50,35 L 50,60" }, { path: "M 50,24 L 50.1,24", type: "dot" }],
  j: [{ path: "M 50,40 L 50,76 C 50,85 37,85 27,79" }, { path: "M 50,29 L 50.1,29", type: "dot" }],
  k: [{ path: "M 30,10 L 30,60" }, { path: "M 70,35 L 30,48 L 70,60" }],
  l: [{ path: "M 50,10 L 50,55 C 50,60 60,60 60,55" }],
  m: [{ path: "M 20,35 L 20,60 L 20,35 C 50,30 50,60 50,60 L 50,35 C 80,30 80,60 80,60" }],
  n: [{ path: "M 30,35 L 30,60 L 30,35 C 70,30 70,60 70,60" }],
  o: [{ path: "M 50,35 C 15,35 15,60 50,60 C 85,60 85,35 50,35 Z" }],
  p: [{ path: "M 30,35 L 30,85" }, { path: "M 30,35 C 80,35 80,60 30,60" }],
  q: [{ path: "M 70,35 C 20,35 20,60 70,60" }, { path: "M 70,35 L 70,85" }],
  r: [{ path: "M 30,35 L 30,60" }, { path: "M 30,43 C 50,30 75,40 70,43" }],
  s: [{ path: "M 70,42 C 50,32 30,35 30,43 C 30,51 70,43 70,51 C 70,60 50,62 30,55" }],
  t: [{ path: "M 50,10 L 50,55 C 50,60 65,60 65,55" }, { path: "M 30,35 L 70,35" }],
  u: [{ path: "M 30,35 L 30,55 C 30,60 70,60 70,55 L 70,35" }, { path: "M 70,35 L 70,60" }],
  v: [{ path: "M 20,35 L 50,60 L 80,35" }],
  w: [{ path: "M 10,35 L 30,60 L 50,48 L 70,60 L 90,35" }],
  x: [{ path: "M 30,35 L 70,60" }, { path: "M 70,35 L 30,60" }],
  y: [{ path: "M 30,35 L 50,60" }, { path: "M 70,35 L 50,60 L 35,80 C 30,85 20,85 20,75" }],
  z: [{ path: "M 20,35 L 80,35 L 20,60 L 80,60" }]
};

// The alphabet the letter games work from. Polish drops q, v and x.
//
// Deliberately the base letters only. The games that draw from this pool ask a
// child to pick a letter out of a grid, and letterConfusion brings the accented
// look-alikes in as distractors on the hardest setting - telling "a" from "ą"
// is its own skill, held back until the plain letters are known.
export const ALPHABET = 'abcdefghijklmnoprstuwyz'.split('');

// What the tracing tool offers, in dictionary order: the full Polish alphabet,
// including the nine letters that are a base letter plus a tail, a line or a
// dot. Each is available in both cases.
export const TRACING_ALPHABET = 'aąbcćdeęfghijklłmnńoóprsśtuwyzźż'.split('');

// Parsing an SVG asset means a DOMParser pass, and the checker now compares a
// drawing against every letter, so results are kept.
const pathCache = new Map();

// Cased, because "A" and "a" are different artwork now, and the identity of the
// object matters: the stroke sampler caches against it in a WeakMap.
export const getLetterPaths = (letter) => {
  const key = letter || '';
  if (pathCache.has(key)) return pathCache.get(key);
  const result = buildLetterPaths(letter);
  pathCache.set(key, result);
  return result;
};

const buildLetterPaths = (letter) => {
  const lower = letter.toLowerCase();
  const slug = ASSET_SLUGS[lower] || lower;
  const isCapital = letter !== lower;
  const source = isCapital ? upperSvgs : customSvgs;
  const customKey = isCapital
    ? `../assets/letters/upper/${slug}.svg`
    : `../assets/letters/${slug}.svg`;

  if (source[customKey]) {
    const parsed = parseSVG(source[customKey], letter);
    if (parsed && parsed.strokes.length > 0) {
      return parsed;
    }
  }

  // No artwork: an accented letter falls back to the letter it is built from,
  // which is at least the right shape, rather than to "a".
  const data = lettersData[lower] || lettersData[BASE_LETTER[lower]] || lettersData["a"];
  // The fallback paths were written against ruled lines at 10/35/60/85; the
  // lines now sit eight points lower, so the box moves up to meet them.
  if (Array.isArray(data)) {
    return { viewBox: "0 -8 100 100", strokes: data };
  }
  return { viewBox: data.viewBox || "0 0 100 100", strokes: data.strokes || [] };
};

import React, { useId } from 'react';

// The three pictures stickers are stuck onto. Drawn here as plain SVG rather
// than shipped as image files: they are a handful of shapes each, they scale to
// any screen without blurring, and they cost nothing to precache.
//
// Every scene is drawn in a 400 x 300 box and sliced to fill whatever it is
// given, so the same component draws the full picture and the round buttons
// that pick it. Each keeps the bottom third as ground - grass, sand, moon rock -
// so there is somewhere for a rabbit, a crab or an alien to stand.
//
// Gradient ids come from useId: the picture and its button are on screen at the
// same time, and two gradients with one id would paint each other.

// Fixed rather than random, so the night sky does not rearrange itself every
// time the screen redraws.
const SPACE_STARS = [
  [22, 18, 1.6], [64, 44, 1.1], [98, 14, 1.4], [140, 58, 1], [176, 24, 1.8], [214, 50, 1.1],
  [250, 16, 1.3], [292, 40, 1.7], [330, 20, 1], [372, 52, 1.5], [36, 86, 1.2], [118, 96, 1.6],
  [196, 104, 1], [270, 92, 1.4], [352, 108, 1.1], [80, 138, 1], [232, 146, 1.3], [312, 150, 1],
  [16, 160, 1.4], [384, 168, 1.2], [156, 170, 1.1]
];

function Meadow({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7DD3FC" />
          <stop offset="1" stopColor="#E0F2FE" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-sky)`} />
      <g fill="#FDE047">
        <circle cx="58" cy="54" r="26" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <rect key={a} x="55" y="12" width="6" height="14" rx="3" transform={`rotate(${a} 58 54)`} />
        ))}
      </g>
      <g fill="white" opacity="0.95">
        <ellipse cx="250" cy="52" rx="34" ry="14" />
        <ellipse cx="274" cy="42" rx="22" ry="14" />
        <ellipse cx="232" cy="44" rx="16" ry="11" />
        <ellipse cx="350" cy="92" rx="26" ry="10" />
        <ellipse cx="364" cy="85" rx="15" ry="10" />
      </g>
      <path d="M0 196 Q 90 150 190 186 T 400 172 V 300 H 0 Z" fill="#86EFAC" />
      <path d="M0 222 Q 120 192 240 216 T 400 210 V 300 H 0 Z" fill="#4ADE80" />
      <g>
        {[[40, 256, '#F472B6'], [118, 278, '#FDE047'], [196, 250, '#FFFFFF'], [286, 272, '#F472B6'], [358, 248, '#FDE047']].map(
          ([x, y, c]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r="5" fill={c} />
              <circle cx={x} cy={y} r="2" fill="#F59E0B" />
            </g>
          )
        )}
      </g>
    </>
  );
}

function Sea({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset="1" stopColor="#0891B2" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-water)`} />
      <g fill="white" opacity="0.12">
        <path d="M60 0 L110 0 L60 230 L30 230 Z" />
        <path d="M200 0 L240 0 L200 230 L176 230 Z" />
        <path d="M320 0 L350 0 L330 230 L312 230 Z" />
      </g>
      <path d="M0 14 Q 25 4 50 14 T 100 14 T 150 14 T 200 14 T 250 14 T 300 14 T 350 14 T 400 14 V 0 H 0 Z" fill="#E0F2FE" opacity="0.7" />
      <g fill="none" stroke="#16A34A" strokeWidth="7" strokeLinecap="round">
        <path d="M34 262 Q 22 232 36 206 Q 50 182 38 160" />
        <path d="M54 266 Q 66 240 54 216" />
        <path d="M352 262 Q 364 234 350 208 Q 338 186 352 166" />
        <path d="M372 266 Q 360 244 372 226" />
      </g>
      <path d="M0 250 Q 100 232 200 248 T 400 244 V 300 H 0 Z" fill="#FDE68A" />
      <g fill="#FBBF24" opacity="0.5">
        <circle cx="90" cy="270" r="3" />
        <circle cx="160" cy="284" r="2.5" />
        <circle cx="250" cy="268" r="3" />
        <circle cx="320" cy="286" r="2.5" />
      </g>
      <g fill="none" stroke="white" strokeWidth="2" opacity="0.6">
        <circle cx="120" cy="120" r="6" />
        <circle cx="128" cy="96" r="4" />
        <circle cx="122" cy="78" r="2.5" />
        <circle cx="290" cy="150" r="5" />
        <circle cx="298" cy="128" r="3" />
      </g>
    </>
  );
}

function Space({ id }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-night`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1E1B4B" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-night)`} />
      <g fill="white">
        {SPACE_STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
        ))}
      </g>
      <circle cx="330" cy="70" r="20" fill="#F9A8D4" />
      <circle cx="324" cy="64" r="5" fill="#F472B6" opacity="0.6" />
      <path d="M0 236 Q 70 206 150 224 T 300 218 T 400 226 V 300 H 0 Z" fill="#CBD5E1" />
      <g fill="#94A3B8">
        <ellipse cx="70" cy="258" rx="22" ry="7" />
        <ellipse cx="196" cy="274" rx="16" ry="5" />
        <ellipse cx="300" cy="252" rx="26" ry="8" />
        <ellipse cx="370" cy="282" rx="12" ry="4" />
      </g>
    </>
  );
}

const ART = { meadow: Meadow, sea: Sea, space: Space };

export default function StickerSceneArt({ scene, className = '' }) {
  const id = useId().replace(/:/g, '');
  const Art = ART[scene] || Meadow;
  return (
    <svg
      className={className}
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <Art id={id} />
    </svg>
  );
}

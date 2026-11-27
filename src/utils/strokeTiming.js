// Sequential timing for "draw the shape" animations.
//
// Each stroke gets a slice of the total duration proportional to its length,
// and starts only once the previous one has finished - a square draws one side
// at a time rather than two at once. Each entry also carries the measured
// `length`, which is what a stroke-dasharray draw-on needs.

const getPathLength = (d) => {
  if (typeof document === 'undefined') return 1;
  try {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    node.setAttribute('d', d);
    return node.getTotalLength() || 1;
  } catch (e) {
    return 1;
  }
};

export const getStrokeTiming = (strokes = [], totalDuration = 4.0) => {
  const count = strokes.length;
  if (count === 0) return [];

  const lengths = strokes.map((stroke) => getPathLength(stroke.path));
  const totalLength = lengths.reduce((sum, len) => sum + len, 0);

  const minDuration = 0.25; // no stroke flashes past faster than this

  if (totalDuration < count * minDuration || totalLength === 0) {
    const even = totalDuration / count;
    return strokes.map((_, i) => ({ duration: even, delay: i * even, length: lengths[i] }));
  }

  const spare = totalDuration - count * minDuration;
  const timings = [];
  let delay = 0;
  for (let i = 0; i < count; i++) {
    const duration = minDuration + spare * (lengths[i] / totalLength);
    // The length is measured here anyway, and a caller drawing the stroke on
    // with stroke-dasharray needs exactly this number.
    timings.push({ duration, delay, length: lengths[i] });
    delay += duration;
  }
  return timings;
};

// Inline style that draws a stroke on over its measured length.
//
// Not pathLength="1" plus a dash in the stylesheet: Chrome does not reliably
// apply a pathLength set at element creation to a dash that came from CSS, and
// the stroke then stays invisible for the whole animation - which looks
// intermittent, because re-setting the attribute by hand fixes it. Litery,
// Kształty and Szlaczki all draw their guides on through this.
export const drawOn = ({ duration = 4.0, delay = 0, length = 1 } = {}, delayOverride) => ({
  strokeDasharray: length,
  strokeDashoffset: length,
  animation: `draw ${duration}s ease-in-out forwards`,
  animationDelay: `${delayOverride ?? delay}s`
});

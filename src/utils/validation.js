import { CANVAS_SIZE } from './strokeGeometry';
import { compareDrawing, targetStrokesInCanvas, drawingSize, verticalOffset } from './strokePath';

// How far the child's path may sit from the letter's, as a fraction of the
// letter's size (and, when tracing, of no less than a third of the canvas).
// Freehand is judged after the drawing has been moved onto the target, so
// writing the letter off to one side is not itself a mistake.
//
// Measured with check_validation.js after the switch to warping, across all 64
// letters: an ordinary attempt scores under 0.15 98% of the time in either
// mode, and a scrappy one about 0.12 or less nine times in ten, while 95% of
// wrong letters drawn well score above about 0.155. The few that come closer are
// near-twins - t and ł, z and ż, R and B - which the nearest-letter check below
// separates. Freehand gets a touch more room because there is no guide to follow.
const TOLERANCE = {
  guided: 0.17,
  independent: 0.18
};

// Below this the drawing is barely a mark rather than an attempt.
const MIN_STROKE_LENGTH = 24;

// Drawing a letter that is a fraction of the guide's size, or sprawls well
// past it, is worth saying out loud rather than scoring as a bad shape.
const SIZE_RATIO_LIMITS = { min: 0.55, max: 1.9 };

// The smallest share of the guide a traced letter may cover. A finger that
// follows the trace lands near 1; the noisiest attempts in check_validation.js
// are about 0.9.
const GUIDED_MIN_SIZE = 0.75;

// How far off the ruled line a freehand letter may sit, as a fraction of the
// canvas. Writing may start anywhere along the line, so horizontal position is
// free, but height on the line is the thing the guides teach: a letter floating
// above the baseline or sunk below it is wrong even when its shape is perfect.
// 0.045 of a 600px canvas is 27px, roughly a sixth of the x-height band.
const BASELINE_TOLERANCE = 0.045;

// The line a letter stands on, as a share of the canvas height. One of the
// four places that agree on 18 / 43 / 68 / 93% (see CLAUDE.md).
const BASELINE = 0.68;

// A handful of letters share most of their path (h against k, for instance) and
// sit close enough to slip under the tolerance. Since the app always knows
// which letter it asked for, it can also ask the opposite question: is this
// drawing a better match for some other letter? If another letter fits this
// much better, the child drew that one instead.
const CONFUSION_MARGIN = 0.88;

const totalLength = (strokes) => {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      total += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
    }
  }
  return total;
};

// Does some other letter fit this drawing clearly better than the one asked for?
//
// When tracing, "better" is measured in canvas pixels. A score is a distance
// divided by the letter's size, and a traced drawing stays where it was drawn,
// so a tall letter divides the same stray ink by more: a scrappy "u" came out a
// better "k" than a "u", though it never went near the stem of a "k". Freehand
// resizes the drawing onto each letter before measuring, so there the
// size-relative score is the fair comparison.
//
// A small mark neither letter pairs up with is dropped as a stray tap, which
// lets a letter look better by ignoring part of the drawing: a "z" fits a "ż"
// perfectly once the dot is thrown away. So a rival that ignored more of the
// drawing than the asked letter did cannot win on fit; and a rival that makes
// use of a mark the asked letter had to ignore wins outright, provided it is a
// good fit in its own right.
const findBetterMatch = (strokes, result, positionInvariant, alternatives, size, limit) => {
  if (!alternatives || alternatives.length === 0) return null;
  const measure = (r) => (positionInvariant ? r.score : r.distance);

  let best = null;
  for (const alt of alternatives) {
    if (!alt?.data?.strokes?.length) continue;
    const rival = compareDrawing(strokes, targetStrokesInCanvas(alt.data, size), {
      positionInvariant
    });
    const explainsMore = rival.ignored < result.ignored && rival.score <= limit;
    const fitsBetter =
      rival.ignored <= result.ignored && measure(rival) < measure(result) * CONFUSION_MARGIN;
    if ((explainsMore || fitsBetter) && (!best || measure(rival) < best.value)) {
      best = { id: alt.id, value: measure(rival) };
    }
  }

  return best;
};

/**
 * Judge a drawn letter from the path the finger took.
 *
 * @param userStrokes arrays of {x, y} in canvas pixels, one per pen stroke
 * @param letterData  { viewBox, strokes: [{ path }] }
 * @param mode        'guided' (a visible guide to trace) or 'independent'
 * @returns { isCorrect, reason, score, reversed, extras }
 *          reason is one of 'ok' | 'empty' | 'reversed' | 'too-small' |
 *          'too-big' | 'off-line' | 'extra-marks' | 'wrong-letter' |
 *          'wrong-shape' | 'off-guide'. 'off-line' also carries direction: 'up' | 'down'.
 *          options.alternatives is [{ id, data }] for the nearest-letter check
 */
export const validateDrawing = (userStrokes, letterData, mode, options = {}) => {
  const size = options.canvasSize || CANVAS_SIZE;
  const strokes = (userStrokes || []).filter((s) => s && s.length > 0);

  if (strokes.length === 0 || totalLength(strokes) < MIN_STROKE_LENGTH) {
    return { isCorrect: false, reason: 'empty', score: Infinity, reversed: false, extras: 0 };
  }

  const target = targetStrokesInCanvas(letterData, size);
  if (target.length === 0) {
    return { isCorrect: false, reason: 'wrong-shape', score: Infinity, reversed: false, extras: 0 };
  }

  const positionInvariant = mode === 'independent';
  const result = compareDrawing(strokes, target, { positionInvariant });
  const limit = options.tolerance ?? TOLERANCE[mode] ?? TOLERANCE.guided;

  // Freehand lets the drawing be moved and resized onto the target, so check
  // the size separately rather than letting it pass silently.
  const sizeRatio = drawingSize(strokes) / (drawingSize(target) || 1);
  // Tracing judges against at least a third of the canvas (MIN_TRACED_SIZE in
  // strokePath), which forgives a finger straying by pixels but also let a
  // letter drawn at 60% of the guide pass as "Wspaniale!". Following the trace
  // is the exercise, so a drawing well short of it is told so.
  if (!positionInvariant && sizeRatio < GUIDED_MIN_SIZE) {
    return { isCorrect: false, reason: 'too-small', score: result.score, reversed: false, extras: result.extras };
  }
  if (positionInvariant && sizeRatio < SIZE_RATIO_LIMITS.min) {
    return { isCorrect: false, reason: 'too-small', score: result.score, reversed: false, extras: result.extras };
  }
  if (positionInvariant && sizeRatio > SIZE_RATIO_LIMITS.max) {
    return { isCorrect: false, reason: 'too-big', score: result.score, reversed: false, extras: result.extras };
  }

  // Drawn backwards: the shape is right but the pen travelled the wrong way,
  // which is the thing handwriting practice is meant to teach.
  if (result.reversed && result.score <= limit) {
    return { isCorrect: false, reason: 'reversed', score: result.score, reversed: true, extras: result.extras };
  }

  // The letter itself is right, but there are extra marks on the canvas. Saying
  // so beats "that is not the right letter", which is what a child used to see.
  if (result.score > limit && result.extras > 0 && result.scoreIgnoringExtras <= limit) {
    return {
      isCorrect: false,
      reason: 'extra-marks',
      score: result.score,
      reversed: false,
      extras: result.extras
    };
  }

  if (result.score <= limit) {
    const rival = findBetterMatch(strokes, result, positionInvariant, options.alternatives, size, limit);
    if (rival) {
      return {
        isCorrect: false,
        reason: 'wrong-letter',
        score: result.score,
        matchedLetter: rival.id,
        reversed: false,
        extras: result.extras
      };
    }

    // Shape is right, so anything left is about placement. Checked last on
    // purpose: "write it on the line" is only useful advice once the letter
    // itself is correct.
    if (positionInvariant) {
      const drop = verticalOffset(strokes, target, BASELINE * size);
      if (Math.abs(drop) > BASELINE_TOLERANCE * size) {
        return {
          isCorrect: false,
          reason: 'off-line',
          direction: drop < 0 ? 'up' : 'down',
          score: result.score,
          reversed: false,
          extras: result.extras
        };
      }
    }

    return { isCorrect: true, reason: 'ok', score: result.score, reversed: false, extras: result.extras };
  }

  // Tracing, and the shape is wrong where it was drawn - but is it the right
  // letter drawn beside the guide? Then "that is not how it is written" and a
  // replay of the strokes would be the wrong lesson; the letter only needs to
  // go on the trace.
  if (!positionInvariant) {
    const free = compareDrawing(strokes, target, { positionInvariant: true });
    if (free.score <= TOLERANCE.independent && !free.reversed &&
        !findBetterMatch(strokes, free, true, options.alternatives, size, TOLERANCE.independent)) {
      return { isCorrect: false, reason: 'off-guide', score: result.score, reversed: false, extras: result.extras };
    }
  }

  return {
    isCorrect: false,
    reason: 'wrong-shape',
    score: result.score,
    reversed: result.reversed,
    extras: result.extras
  };
};

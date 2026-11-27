import confetti from 'canvas-confetti';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Confetti is pure motion, so children who asked their device for less of it
// get the sound and the message without a screenful of moving particles.
export const celebrate = (options = {}) => {
  if (prefersReducedMotion()) return;
  confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 }, ...options });
};

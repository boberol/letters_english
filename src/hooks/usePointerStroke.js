import { useRef } from 'react';

// Canvas handlers that turn pen, finger and mouse into one stroke at a time.
//
// The canvases used to listen to touch and mouse events separately, which
// broke on interactive whiteboards in three ways. A board pen on Windows is
// neither: Chrome only reaches the mouse handlers through emulated events. A
// tap fired the touch handlers and then, ~300ms later, emulated mouse ones, so
// one dot on "i" was recorded as two strokes. And a second hand on the board
// ended the first child's stroke when it lifted, because touchend does not say
// which finger left. Pointer events report all three devices the same way and
// carry a pointerId, so whichever contact started the stroke owns it and every
// other contact is ignored until it lifts.
//
// Touch is implicitly captured by the canvas on pointerdown, so a finger that
// slides off the edge keeps drawing exactly as touchmove did; a pen or mouse
// leaving the canvas ends the stroke, as mouseout did.
export function usePointerStroke({ onStart, onMove, onEnd }) {
  const pointerRef = useRef(null);

  const end = (e) => {
    if (e.pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    onEnd(e);
  };

  return {
    onPointerDown: (e) => {
      if (pointerRef.current !== null) return;
      // Right and middle clicks are not ink.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerRef.current = e.pointerId;
      onStart(e);
    },
    onPointerMove: (e) => {
      if (e.pointerId === pointerRef.current) onMove(e);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    // Windows turns a pen held still into a right click; on a canvas that
    // would open the browser's menu over the child's drawing.
    onContextMenu: (e) => e.preventDefault()
  };
}

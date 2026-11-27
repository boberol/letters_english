import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

// What makes an overlay a dialog for someone on a keyboard, a switch or a
// screen reader, rather than only for someone looking at it: focus moves into
// it when it opens and goes back where it was when it closes, Tab stays inside
// it, Esc closes it, and no key reaches the tool behind it - Enter must not
// press Sprawdź under a settings panel, and Esc must not leave the tool.
//
// Esc used to close the settings in half the tools and do nothing (or leave
// the tool) in the rest; every panel goes through here now.
export function useDialog(ref, onClose) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    const before = document.activeElement;

    const focusables = () => [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    (focusables()[0] || dialog).focus({ preventScroll: true });

    // Capture on the document runs before the tools' own listeners on window.
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      // Keys pressed inside the dialog are stopped where it sits (see
      // stopKeys); anything else - focus left on the page behind - stops here.
      if (!dialog.contains(e.target)) e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (before && typeof before.focus === 'function' && document.contains(before)) {
        before.focus({ preventScroll: true });
      }
    };
  }, [ref]);
}

// For the dialog element's onKeyDown: a key used inside the dialog (Enter on a
// chip, Space on a checkbox) still does its job there, but stops before it
// reaches the tool's shortcuts on window.
export const stopKeys = (e) => e.stopPropagation();

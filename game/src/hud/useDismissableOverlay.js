// Shared behavior for full-screen overlays, ported from Darwin: Escape
// closes, Tab cycles inside the panel instead of escaping into the scene,
// and focus returns to whatever opened the overlay when it closes.
//
// One addition over the Darwin original: while open, the overlay flips the
// shared blocking-UI flag so gameplay keys stop reaching the player. Every
// overlay in this game wants that; pass blockInput: false to opt out.

import { useEffect, useRef } from 'react';
import { setBlockingUiMode } from '../input/uiMode.js';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE))
    .filter((node) => node.offsetWidth > 0 || node.offsetHeight > 0 || node === document.activeElement);
}

export function useDismissableOverlay(open, onClose, { trapFocus = true, autoFocus = true, blockInput = true } = {}) {
  const containerRef = useRef(null);
  const restoreFocusRef = useRef(null);
  // Callers pass inline arrows, so keeping onClose as an effect dependency
  // would tear down and re-run setup on every parent render — which re-stole
  // focus mid-interaction. The listener reads through this ref instead.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || !blockInput) return undefined;
    setBlockingUiMode(true);
    return () => setBlockingUiMode(false);
  }, [open, blockInput]);

  // Focus capture/restore runs only on the open/close transition.
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (autoFocus) {
      const [first] = focusableWithin(containerRef.current);
      (first || containerRef.current)?.focus?.({ preventScroll: true });
    }
    return () => {
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && document.contains(restore)) restore.focus?.({ preventScroll: true });
    };
  }, [autoFocus, open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (!trapFocus || event.key !== 'Tab') return;
      const nodes = focusableWithin(containerRef.current);
      if (nodes.length === 0) {
        event.preventDefault();
        containerRef.current?.focus?.({ preventScroll: true });
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !containerRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture phase so the overlay wins over gameplay handlers on window.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, trapFocus]);

  return containerRef;
}

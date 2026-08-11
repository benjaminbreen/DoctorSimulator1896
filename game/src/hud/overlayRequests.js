const listeners = new Set();

export function requestHudOverlay(overlay) {
  for (const listener of listeners) listener(overlay);
}

export function subscribeHudOverlayRequests(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

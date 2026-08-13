const MOBILE_SCREEN_LIMIT = 1100;

// React Three Fiber defers forceContextLoss by 500ms during Canvas teardown.
// Mount the next mobile zone after that cleanup, so the two heavy contexts do
// not overlap at the point this workaround is meant to protect.
export const MOBILE_CONTEXT_RECYCLE_DELAY_MS = 650;

// Touch-first phones and tablets have a much tighter WebGL memory budget than
// laptops. Keep desktop zone caching, but let these devices release the old
// context before the next zone uploads its textures and render targets.
export function shouldRecycleWebGLContextOnTravel(overrides = {}) {
  const maxTouchPoints = overrides.maxTouchPoints
    ?? globalThis.navigator?.maxTouchPoints
    ?? 0;
  const coarsePointer = overrides.coarsePointer
    ?? globalThis.matchMedia?.('(pointer: coarse)').matches
    ?? false;
  const screenWidth = overrides.screenWidth
    ?? globalThis.screen?.width
    ?? Infinity;
  const screenHeight = overrides.screenHeight
    ?? globalThis.screen?.height
    ?? Infinity;

  return (
    maxTouchPoints > 0
    && coarsePointer
    && Math.min(screenWidth, screenHeight) <= MOBILE_SCREEN_LIMIT
  );
}

export function webGLContextKey(values, recycleOnTravel) {
  const shared = `${values.antialias}-${values.postEnabled}`;
  return recycleOnTravel ? `${shared}-${values.zone}` : shared;
}

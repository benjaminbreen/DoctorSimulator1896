const MOBILE_SCREEN_LIMIT = 1100;
const MOBILE_PIXEL_RATIO_CAP = 1.25;
const MOBILE_SHADOW_MAP_CAP = 1024;
const MOBILE_OUTDOOR_SHADOW_DISTANCE_CAP = 30;
const SAFARI_PIXEL_RATIO_CAP = 1.5;
const SAFARI_SHADOW_MAP_CAP = 2048;

// React Three Fiber defers forceContextLoss by 500ms during Canvas teardown.
// Give WebKit another full second to release the old backing stores before the
// destination starts allocating its own framebuffer, shadows, and textures.
export const MOBILE_CONTEXT_RECYCLE_DELAY_MS = 1500;

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

// Mobile Safari's failure mode is a page-process restart, so its useful limit
// is peak allocation rather than average frame rate. Apply the smaller targets
// before Canvas creates its first framebuffer; changing them in useFrame is too
// late to prevent that initial spike. Desktop Safari keeps the authored
// effects but caps Retina resolution, which otherwise quadruples pixel work.
export function isSafariUserAgent(userAgent = globalThis.navigator?.userAgent ?? '') {
  return /Safari/i.test(userAgent)
    && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/i.test(userAgent);
}

export function graphicsSettingsForDevice(
  values,
  constrainedMobile,
  safari = isSafariUserAgent(),
) {
  const pixelRatioCap = Number(values.pixelRatioCap) || 1;
  return {
    antialias: constrainedMobile ? false : Boolean(values.antialias),
    postEnabled: constrainedMobile ? false : Boolean(values.postEnabled),
    pixelRatioCap: constrainedMobile
      ? Math.min(pixelRatioCap, MOBILE_PIXEL_RATIO_CAP)
      : safari
        ? Math.min(pixelRatioCap, SAFARI_PIXEL_RATIO_CAP)
        : pixelRatioCap,
    maxShadowMapSize: constrainedMobile
      ? MOBILE_SHADOW_MAP_CAP
      : safari
        ? SAFARI_SHADOW_MAP_CAP
        : Infinity,
    maxOutdoorShadowDistance: constrainedMobile
      ? MOBILE_OUTDOOR_SHADOW_DISTANCE_CAP
      : Infinity,
    deferIdleActors: constrainedMobile,
  };
}

export function webGLContextKey(values, recycleOnTravel) {
  const graphics = graphicsSettingsForDevice(values, recycleOnTravel);
  const shared = `${graphics.antialias}-${graphics.postEnabled}`;
  return recycleOnTravel ? `${shared}-${values.zone}` : shared;
}

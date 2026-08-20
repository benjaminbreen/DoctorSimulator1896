const MOBILE_SCREEN_LIMIT = 1100;
const MOBILE_PIXEL_RATIO_CAP = 1.25;
const MOBILE_SHADOW_MAP_CAP = 1024;
const MOBILE_OUTDOOR_SHADOW_DISTANCE_CAP = 12;
const MOBILE_DYNAMIC_SHADOW_DISTANCE_CAP = 10;
const SAFARI_PIXEL_RATIO_CAP = 1.5;
const SAFARI_SHADOW_MAP_CAP = 2048;

const QUALITY_PROFILES = {
  auto: {
    pixelRatioCap: 1.5,
    maxShadowMapSize: 2048,
    maxOutdoorShadowDistance: 35,
    maxDynamicShadowDistance: 18,
    shadowUpdateInterval: 1,
    waterReflectionEnabled: true,
    waterReflectionSize: 384,
    waterReflectionInterval: 6,
  },
  performance: {
    pixelRatioCap: 1,
    maxShadowMapSize: 1024,
    maxOutdoorShadowDistance: 12,
    maxDynamicShadowDistance: 10,
    shadowUpdateInterval: 1,
    waterReflectionEnabled: false,
    waterReflectionSize: 1,
    waterReflectionInterval: 8,
  },
  quality: {
    pixelRatioCap: 2,
    maxShadowMapSize: Infinity,
    maxOutdoorShadowDistance: Infinity,
    maxDynamicShadowDistance: Infinity,
    shadowUpdateInterval: 1,
    waterReflectionEnabled: true,
    waterReflectionSize: 512,
    waterReflectionInterval: 4,
  },
};

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
  const graphicsQuality = QUALITY_PROFILES[values.graphicsQuality] ? values.graphicsQuality : 'auto';
  const profile = QUALITY_PROFILES[graphicsQuality];
  const pixelRatioCap = Math.min(Number(values.pixelRatioCap) || 1, profile.pixelRatioCap);
  const performance = graphicsQuality === 'performance';
  return {
    graphicsQuality,
    antialias: constrainedMobile || performance ? false : Boolean(values.antialias),
    postEnabled: constrainedMobile || performance ? false : Boolean(values.postEnabled),
    pixelRatioCap: constrainedMobile
      ? Math.min(pixelRatioCap, MOBILE_PIXEL_RATIO_CAP)
      : safari
        ? Math.min(pixelRatioCap, SAFARI_PIXEL_RATIO_CAP)
        : pixelRatioCap,
    maxShadowMapSize: constrainedMobile
      ? Math.min(profile.maxShadowMapSize, MOBILE_SHADOW_MAP_CAP)
      : safari
        ? Math.min(profile.maxShadowMapSize, SAFARI_SHADOW_MAP_CAP)
        : profile.maxShadowMapSize,
    maxOutdoorShadowDistance: constrainedMobile
      ? Math.min(profile.maxOutdoorShadowDistance, MOBILE_OUTDOOR_SHADOW_DISTANCE_CAP)
      : profile.maxOutdoorShadowDistance,
    maxDynamicShadowDistance: constrainedMobile
      ? Math.min(profile.maxDynamicShadowDistance, MOBILE_DYNAMIC_SHADOW_DISTANCE_CAP)
      : profile.maxDynamicShadowDistance,
    shadowUpdateInterval: profile.shadowUpdateInterval,
    waterReflectionEnabled: constrainedMobile ? false : profile.waterReflectionEnabled,
    waterReflectionSize: constrainedMobile ? 1 : profile.waterReflectionSize,
    waterReflectionInterval: profile.waterReflectionInterval,
    deferIdleActors: constrainedMobile,
  };
}

export function webGLContextKey(values, recycleOnTravel) {
  const graphics = graphicsSettingsForDevice(values, recycleOnTravel);
  const shared = `${graphics.antialias}-${graphics.postEnabled}`;
  return recycleOnTravel ? `${shared}-${values.zone}` : shared;
}

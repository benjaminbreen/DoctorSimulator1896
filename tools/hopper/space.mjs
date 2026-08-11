// The search space: what the optimizer is allowed to move.
//
// Only non-rebuild tuning ids appear here. A rebuild-mode parameter remounts
// the canvas, which would cost a second per sample and reset the pose.

// Deterministic RNG so a run can be replayed from its seed alone.
export function makeRng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

const uniform = (rng, low, high) => low + rng() * (high - low);
const pick = (rng, values) => values[Math.floor(rng() * values.length) % values.length];

// Sun low in the sky is most of what makes the light read as Hopper, so half
// the samples are drawn from the two golden bands rather than the whole day.
function sampleTimeOfDay(rng) {
  if (rng() < 0.5) return rng() < 0.5 ? uniform(rng, 5.6, 9.0) : uniform(rng, 16.0, 20.2);
  return uniform(rng, 5.5, 20.5);
}

const WINDOW_TINTS = ['#c6c9cd', '#e6dcc0', '#ffe2b4', '#b9c6d6', '#f0e3cf', '#ffd9a0'];

export function sampleTuning(rng, exterior = false) {
  const shared = {
    timeOfDay: sampleTimeOfDay(rng),
    exposure: uniform(rng, 0.6, 1.8),
    ambientIntensity: uniform(rng, 0.02, 0.5),
    hemisphereIntensity: uniform(rng, 0, 0.4),
    envIntensity: uniform(rng, 0.05, 1.2),
    fogDensity: uniform(rng, 0, 0.02),
    // Bloom is most of what separates hard light from glare, so it gets a
    // wide range and a threshold that actually moves.
    bloomIntensity: uniform(rng, 0, 1.4),
    bloomThreshold: uniform(rng, 0.45, 1.0),
    aoIntensity: uniform(rng, 0, 5),
    shadowRadius: uniform(rng, 0, 8),
  };
  if (exterior) {
    return {
      ...shared,
      sunIntensity: uniform(rng, 0.2, 2.6),
      sunShadowRadius: uniform(rng, 0, 5),
      skyTurbidity: uniform(rng, 0.5, 9),
      skyRayleigh: uniform(rng, 0.4, 3.4),
      skyMie: uniform(rng, 0, 0.006),
      cloudCover: uniform(rng, 0, 1),
      cloudCumulus: uniform(rng, 0, 1),
      cloudScale: uniform(rng, 0.5, 2.4),
      cloudSpeed: 0,
    };
  }
  return {
    ...shared,
    windowIntensity: uniform(rng, 0, 3.2),
    // Sun altitude at the window is the single biggest lever on the light:
    // a low sun throws the long raking wedge across the floor.
    windowElevationDeg: rng() < 0.6 ? uniform(rng, 6, 28) : uniform(rng, 28, 70),
    windowColor: pick(rng, WINDOW_TINTS),
    shaftIntensity: uniform(rng, 0, 2.6),
    moteDensity: uniform(rng, 0, 3),
    gaslightIntensity: uniform(rng, 0, 2.5),
    // Flicker off: two renders of the same shot should score the same.
    gaslightFlicker: 0,
    skyBrightness: uniform(rng, 0.3, 2.0),
    skyHaze: uniform(rng, 0, 1.6),
  };
}

// Candidate ground positions, to be filtered by the page's legality test
// before they become shots.
export function sampleGroundPoints(rng, bounds, count) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push([uniform(rng, bounds.minX, bounds.maxX), uniform(rng, bounds.minZ, bounds.maxZ)]);
  }
  return points;
}

// `camera` and `figure` are sample results from window.__shot.sample: each
// carries its own ground height, which outdoors follows the terrain.
export function assembleShot(rng, bounds, camera, figure, exterior = false) {
  const eyeLow = camera.ground + 1.0;
  const eyeHigh = exterior
    ? camera.ground + 2.3
    : Math.min(bounds.ceilingY - 0.3, camera.ground + 2.4);
  // Outdoors the figure can be a long way off, so let the camera aim a touch
  // further down; indoors a tilted frame is not the look.
  const pitchLow = exterior ? -0.3 : -0.22;
  return {
    camera: {
      position: [camera.x, uniform(rng, eyeLow, Math.max(eyeLow + 0.1, eyeHigh)), camera.z],
      yaw: uniform(rng, 0, Math.PI * 2),
      pitch: uniform(rng, pitchLow, 0.1),
      fov: uniform(rng, 28, 62),
    },
    figure: { position: [figure.x, figure.z], yaw: uniform(rng, 0, Math.PI * 2) },
    tuning: sampleTuning(rng, exterior),
  };
}

// A local jitter of a known-good shot, for the hill-climb pass.
export function perturb(rng, shot, scale, bounds) {
  const jitter = (value, amount) => value + (rng() * 2 - 1) * amount * scale;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const next = structuredClone(shot);
  const eye = shot.camera.position[1];
  next.camera.position[0] = clamp(jitter(shot.camera.position[0], 0.9), bounds.minX + 0.5, bounds.maxX - 0.5);
  // Height jitters around wherever the camera already is, so an outdoor shot
  // on a rise is not dragged back down to the room's floor level.
  next.camera.position[1] = clamp(jitter(eye, 0.35), eye - 0.8, eye + 0.8);
  next.camera.position[2] = clamp(jitter(shot.camera.position[2], 0.9), bounds.minZ + 0.5, bounds.maxZ - 0.5);
  next.camera.yaw = jitter(shot.camera.yaw, 0.35);
  next.camera.pitch = clamp(jitter(shot.camera.pitch, 0.08), -0.3, 0.15);
  next.camera.fov = clamp(jitter(shot.camera.fov, 7), 26, 66);
  next.figure.position[0] = clamp(jitter(shot.figure.position[0], 0.8), bounds.minX + 0.6, bounds.maxX - 0.6);
  next.figure.position[1] = clamp(jitter(shot.figure.position[1], 0.8), bounds.minZ + 0.6, bounds.maxZ - 0.6);
  next.figure.yaw = jitter(shot.figure.yaw, 0.6);
  for (const [key, value] of Object.entries(shot.tuning)) {
    if (typeof value !== 'number' || value === 0) continue;
    next.tuning[key] = Math.max(0, jitter(value, Math.abs(value) * 0.25 + 0.05));
  }
  next.tuning.timeOfDay = clamp(jitter(shot.tuning.timeOfDay, 0.8), 5.5, 20.5);
  return next;
}

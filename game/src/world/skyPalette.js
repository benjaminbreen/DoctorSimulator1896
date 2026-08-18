// Three colours describing the sky as a light source: what is overhead, what
// is at the horizon, what bounces off the ground. Framework-free so the
// environment probe and any future fog grade can share one source of truth.

import { solarRamps } from './solar.js';
import { moonState } from './moon.js';

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function scale(color, amount) {
  return color.map((channel) => channel * amount);
}

function add(a, b) {
  return a.map((channel, index) => channel + b[index]);
}

// Linear-light, not sRGB: these go straight into a shader.
const TOP = { night: [0.012, 0.024, 0.065], day: [0.09, 0.24, 0.62], golden: [0.10, 0.16, 0.42] };
const HORIZON = { night: [0.035, 0.05, 0.085], day: [0.52, 0.62, 0.78], golden: [0.92, 0.42, 0.18] };
const CITY_GLOW = [0.028, 0.014, 0.006];
// Day ground is sunlit grass: bright and green enough that the probe lifts
// faces in shade the way a real lawn does.
const GROUND = { night: [0.01, 0.015, 0.024], day: [0.30, 0.32, 0.20], golden: [0.22, 0.14, 0.09] };

// One-entry cache: SkyRig, the probe, water, and clouds all ask within one
// frame with the same clock and options, and each call allocates ~10 arrays.
let paletteKey = '';
let paletteCached = null;

export function environmentPalette(timeOfDay, dayOfYear, options = {}) {
  const key = `${timeOfDay}|${dayOfYear}|${options.nightSkyBrightness ?? 1}|${options.citySkyGlow ?? 1}|${options.moonlightIntensity ?? 1}`;
  if (paletteCached && key === paletteKey) return paletteCached;
  paletteKey = key;
  return (paletteCached = computePalette(timeOfDay, dayOfYear, options));
}

function computePalette(timeOfDay, dayOfYear, options) {
  const {
    daylight,
    golden,
    twilight,
    night,
  } = solarRamps(timeOfDay, dayOfYear);
  const moon = moonState(timeOfDay, dayOfYear);
  const nightBrightness = options.nightSkyBrightness ?? 1;
  const cityGlow = (options.citySkyGlow ?? 1) * night;
  const moonlight = (options.moonlightIntensity ?? 1) * moon.light * night;
  const nightTop = scale(TOP.night, nightBrightness);
  const nightHorizon = add(scale(HORIZON.night, nightBrightness), scale(CITY_GLOW, cityGlow));
  const nightGround = scale(GROUND.night, nightBrightness);
  // Perceptual night adaptation keeps form readable even when the historical
  // moon is absent. Moon and the existing low-horizon city palette add to the
  // same probe rather than introducing separate fill lights.
  const nightFill = Math.min(
    1,
    nightBrightness * (0.28 + 0.14 * moonlight) + 0.03 * cityGlow,
  );
  return {
    top: mix(mix(nightTop, TOP.day, daylight), TOP.golden, golden),
    horizon: mix(mix(nightHorizon, HORIZON.day, daylight), HORIZON.golden, golden),
    ground: mix(mix(nightGround, GROUND.day, daylight), GROUND.golden, golden),
    // Sunlit air is orders brighter than moonlit air; the probe carries that.
    intensity: nightFill + daylight * (1 - nightFill),
    // Sky and clouds consume this exact handoff while fog and the environment
    // consume the palette above, keeping every outdoor layer on one timeline.
    authoredBlend: twilight,
  };
}

// How far apart two palettes are, for deciding when the probe needs redoing.
export function paletteDistance(a, b) {
  let sum = 0;
  for (const key of ['top', 'horizon', 'ground']) {
    for (let i = 0; i < 3; i += 1) sum += Math.abs(a[key][i] - b[key][i]);
  }
  return sum + Math.abs(a.intensity - b.intensity);
}

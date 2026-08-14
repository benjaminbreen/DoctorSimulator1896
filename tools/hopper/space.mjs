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

// Build shuffled full-factorial blocks for the experimental controls whose
// effects we want to separate. A simple set of parallel modulo cycles silently
// locked three camera heights to three shadow families; every complete block
// here contains every camera/shadow/azimuth combination exactly once.
export function counterbalancedFactors(cameraStrata, shadowFamilies, sunAzimuths, count, seed = 1) {
  if (![cameraStrata, shadowFamilies, sunAzimuths].every((values) => values.length > 0)) {
    throw new Error('counterbalanced factors must each contain at least one value');
  }
  const cells = cameraStrata.flatMap((cameraStratum) => shadowFamilies.flatMap(
    (shadowFamily) => sunAzimuths.map((sunAzimuthSector) => ({
      cameraStratum,
      shadowFamily,
      sunAzimuthSector,
    })),
  ));
  const rng = makeRng(seed);
  const schedule = [];
  while (schedule.length < count) {
    const block = [...cells];
    for (let index = block.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      [block[index], block[swap]] = [block[swap], block[index]];
    }
    schedule.push(...block.slice(0, count - schedule.length));
  }
  return schedule;
}

const uniform = (rng, low, high) => low + rng() * (high - low);
const pick = (rng, values) => values[Math.floor(rng() * values.length) % values.length];
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// Named strata keep a run honest about the full day. In particular, sunset and
// evening cannot disappear merely because a midday candidate scored well.
export const TIME_BANDS = Object.freeze([
  Object.freeze({ id: 'dawn', low: 5.5, high: 7.25 }),
  Object.freeze({ id: 'morning', low: 7.25, high: 10.5 }),
  Object.freeze({ id: 'midday', low: 10.5, high: 14.5 }),
  Object.freeze({ id: 'afternoon', low: 14.5, high: 17.25 }),
  Object.freeze({ id: 'sunset', low: 17.25, high: 19.5 }),
  Object.freeze({ id: 'evening', low: 19.5, high: 22.25 }),
]);

export const CAMERA_STRATA = Object.freeze([
  Object.freeze({ id: 'ground', label: 'Ground level' }),
  Object.freeze({ id: 'raised', label: 'Window or fire-escape height' }),
  Object.freeze({ id: 'rooftop', label: 'Rooftop' }),
]);

const CAMERA_STRATUM_BY_ID = new Map(CAMERA_STRATA.map((stratum) => [stratum.id, stratum]));

export function resolveCameraStrata(value = 'ground') {
  const requested = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0 || requested.includes('all')) return [...CAMERA_STRATA];
  const strata = requested.map((id) => CAMERA_STRATUM_BY_ID.get(id));
  const invalid = requested.filter((id, index) => !strata[index]);
  if (invalid.length) throw new Error(`unknown camera stratum(s): ${invalid.join(', ')}`);
  return strata;
}

const TIME_BAND_BY_ID = new Map(TIME_BANDS.map((band) => [band.id, band]));

export function timeBandForHour(hour) {
  const value = Number(hour);
  return TIME_BANDS.find((band) => value >= band.low && value < band.high)?.id ?? 'other';
}

export function resolveTimeBands(value = 'all') {
  const requested = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0 || requested.includes('all')) return [...TIME_BANDS];
  const bands = requested.map((id) => TIME_BAND_BY_ID.get(id));
  const invalid = requested.filter((id, index) => !bands[index]);
  if (invalid.length) throw new Error(`unknown time band(s): ${invalid.join(', ')}`);
  return bands;
}

export function sampleTimeOfDay(rng, requestedBand = null) {
  const band = typeof requestedBand === 'string'
    ? TIME_BAND_BY_ID.get(requestedBand)
    : requestedBand;
  const selected = band ?? pick(rng, TIME_BANDS);
  return uniform(rng, selected.low, selected.high);
}

const WINDOW_TINTS = ['#c6c9cd', '#e6dcc0', '#ffe2b4', '#b9c6d6', '#f0e3cf', '#ffd9a0'];
const COOL_WINDOW_TINTS = ['#8ea0bd', '#a9b6cb', '#c1c6cf', '#8f9eb2'];
const WARM_WINDOW_TINTS = ['#ffe2b4', '#ffd39a', '#efb775', '#f0c78d'];
const GASLIGHT_TINTS = ['#ff9f45', '#ffad55', '#ffc06f', '#e9943f'];

// These are correlated lighting treatments, not filters. Each moves the real
// scene lights, sky, bounce, atmosphere and post-processing together. This
// makes a rating answer useful: it compares plausible moods instead of random
// combinations such as hard noon shadows plus heavy overcast fog.
export const VIBE_FAMILIES = Object.freeze([
  Object.freeze({ id: 'raking-clarity', label: 'Raking clarity' }),
  Object.freeze({ id: 'soft-overcast', label: 'Soft overcast' }),
  Object.freeze({ id: 'warm-afterglow', label: 'Warm afterglow' }),
  Object.freeze({ id: 'quiet-fill', label: 'Quiet ambient fill' }),
  Object.freeze({ id: 'practical-nocturne', label: 'Practical-light nocturne' }),
  Object.freeze({ id: 'luminous-haze', label: 'Luminous haze' }),
]);

export const SHADOW_FAMILIES = Object.freeze([
  Object.freeze({ id: 'hard', range: [0, 0.8] }),
  Object.freeze({ id: 'medium', range: [1.25, 3.25] }),
  Object.freeze({ id: 'soft', range: [4.5, 6] }),
]);

const SHADOW_FAMILY_BY_ID = new Map(SHADOW_FAMILIES.map((family) => [family.id, family]));

export function resolveShadowFamilies(value = 'profile') {
  const requested = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0 || requested.includes('profile')) {
    return [Object.freeze({ id: 'profile', range: null })];
  }
  if (requested.includes('all')) return [...SHADOW_FAMILIES];
  const families = requested.map((id) => SHADOW_FAMILY_BY_ID.get(id));
  const invalid = requested.filter((id, index) => !families[index]);
  if (invalid.length) throw new Error(`unknown shadow family(s): ${invalid.join(', ')}`);
  return families;
}

export const SUN_AZIMUTH_SECTORS = Object.freeze([
  Object.freeze({ id: 'north-east', range: [0, 90] }),
  Object.freeze({ id: 'south-east', range: [90, 180] }),
  Object.freeze({ id: 'south-west', range: [180, 270] }),
  Object.freeze({ id: 'north-west', range: [270, 360] }),
]);

const SUN_AZIMUTH_BY_ID = new Map(SUN_AZIMUTH_SECTORS.map((sector) => [sector.id, sector]));

export function resolveSunAzimuths(value = 'physical') {
  const requested = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0 || requested.includes('physical')) {
    return [Object.freeze({ id: 'physical', range: null })];
  }
  if (requested.includes('all')) return [...SUN_AZIMUTH_SECTORS];
  const sectors = requested.map((id) => SUN_AZIMUTH_BY_ID.get(id));
  const invalid = requested.filter((id, index) => !sectors[index]);
  if (invalid.length) throw new Error(`unknown sun azimuth sector(s): ${invalid.join(', ')}`);
  return sectors;
}

const VIBE_BY_ID = new Map(VIBE_FAMILIES.map((vibe) => [vibe.id, vibe]));

export function resolveVibes(value = 'all') {
  const requested = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  if (requested.length === 0 || requested.includes('all')) return [...VIBE_FAMILIES];
  const vibes = requested.map((id) => VIBE_BY_ID.get(id));
  const invalid = requested.filter((id, index) => !vibes[index]);
  if (invalid.length) throw new Error(`unknown vibe(s): ${invalid.join(', ')}`);
  return vibes;
}

const VIBE_PROFILES = Object.freeze({
  'raking-clarity': {
    exposure: [0.72, 1.15], ambient: [0.35, 0.72], hemisphere: [0.35, 0.75],
    environment: [0.45, 0.85], direct: [1.15, 1.45], fog: [0, 0.0035],
    bloom: [0, 0.28], bloomThreshold: [0.84, 1], ao: [2.5, 5], shadow: [0, 0.9],
    elevation: [0, 0.32], shaft: [1.1, 2.7], motes: [0.2, 1.5], haze: [0, 0.35],
    gaslight: [0.45, 0.85], sky: [0.7, 1.05], litWindows: [0.5, 0.9],
    cloud: [0.03, 0.3], cumulus: [0.3, 0.85], glow: [0.35, 0.9],
    skySaturation: [0.95, 1.3], skyFill: [0.45, 0.9], bounce: [0.35, 0.8],
  },
  'soft-overcast': {
    exposure: [0.95, 1.35], ambient: [1.1, 1.5], hemisphere: [1.15, 1.55],
    environment: [1.2, 1.65], direct: [0.22, 0.55], fog: [0.004, 0.014],
    bloom: [0.08, 0.42], bloomThreshold: [0.76, 0.96], ao: [0.35, 1.8], shadow: [5, 8],
    elevation: [0.25, 0.8], shaft: [0, 0.45], motes: [0, 0.7], haze: [0.55, 1.25],
    gaslight: [0.65, 1], sky: [1.05, 1.4], litWindows: [0.75, 1.15],
    cloud: [0.76, 1], cumulus: [0.12, 0.5], glow: [0.25, 0.7],
    skySaturation: [0.62, 0.92], skyFill: [1.25, 1.85], bounce: [1.15, 1.7],
  },
  'warm-afterglow': {
    exposure: [0.84, 1.25], ambient: [0.68, 1.05], hemisphere: [0.65, 1.05],
    environment: [0.7, 1.1], direct: [0.72, 1.15], fog: [0.001, 0.009],
    bloom: [0.35, 0.92], bloomThreshold: [0.56, 0.82], ao: [1.4, 3.6], shadow: [1.8, 4.8],
    elevation: [0, 0.42], shaft: [0.75, 2.25], motes: [0.5, 2.2], haze: [0.25, 0.9],
    gaslight: [1.15, 1.55], sky: [0.75, 1.15], litWindows: [1.05, 1.5],
    cloud: [0.08, 0.58], cumulus: [0.4, 0.9], glow: [1.8, 3],
    skySaturation: [1.2, 1.7], skyFill: [0.75, 1.25], bounce: [1.15, 1.8],
    window: WARM_WINDOW_TINTS, gaslightColor: GASLIGHT_TINTS,
  },
  'quiet-fill': {
    exposure: [0.9, 1.28], ambient: [0.88, 1.22], hemisphere: [0.9, 1.25],
    environment: [0.9, 1.25], direct: [0.45, 0.82], fog: [0, 0.006],
    bloom: [0, 0.25], bloomThreshold: [0.88, 1], ao: [1, 2.8], shadow: [3, 7],
    elevation: [0.32, 0.78], shaft: [0.05, 0.75], motes: [0, 0.8], haze: [0.05, 0.45],
    gaslight: [0.55, 0.9], sky: [0.9, 1.2], litWindows: [0.65, 1],
    cloud: [0.25, 0.68], cumulus: [0.25, 0.7], glow: [0.35, 1],
    skySaturation: [0.72, 1.02], skyFill: [1.15, 1.75], bounce: [1.2, 1.85],
    window: COOL_WINDOW_TINTS,
  },
  'practical-nocturne': {
    exposure: [0.62, 1.02], ambient: [0.25, 0.62], hemisphere: [0.25, 0.65],
    environment: [0.22, 0.58], direct: [0.08, 0.35], fog: [0.002, 0.012],
    bloom: [0.48, 1.18], bloomThreshold: [0.45, 0.7], ao: [2.4, 5], shadow: [1, 4],
    elevation: [0, 0.45], shaft: [0, 0.55], motes: [0.1, 1.35], haze: [0.35, 1.05],
    gaslight: [1, 1.25], gaslightFloor: [1.25, 2.8], sky: [0.38, 0.75],
    litWindows: [1.3, 2], litWindowsFloor: [0.75, 1.4], cloud: [0.15, 0.65],
    cumulus: [0.2, 0.7], glow: [0.5, 1.5], skySaturation: [0.7, 1.05],
    skyFill: [0.3, 0.8], bounce: [0.3, 0.85], window: COOL_WINDOW_TINTS,
    gaslightColor: GASLIGHT_TINTS,
  },
  'luminous-haze': {
    exposure: [1.05, 1.55], ambient: [0.78, 1.22], hemisphere: [0.82, 1.3],
    environment: [1, 1.45], direct: [0.72, 1.08], fog: [0.008, 0.02],
    bloom: [0.75, 1.4], bloomThreshold: [0.45, 0.68], ao: [0, 1.5], shadow: [5.5, 8],
    elevation: [0, 0.38], shaft: [1.55, 2.8], motes: [1.2, 3], haze: [1, 1.6],
    gaslight: [0.8, 1.2], sky: [1.15, 1.55], litWindows: [0.9, 1.35],
    cloud: [0.3, 0.72], cumulus: [0.55, 1], glow: [2.1, 3],
    skySaturation: [0.92, 1.38], skyFill: [1.1, 1.65], bounce: [1, 1.55],
  },
});

const TIME_PROFILES = Object.freeze({
  dawn: {
    sun: [0.12, 1.15], ambient: [0.06, 0.34], environment: [0.16, 0.72],
    elevation: [5, 18], gaslight: [0.8, 2.5], sky: [0.38, 1.15], window: COOL_WINDOW_TINTS,
  },
  morning: {
    sun: [0.65, 2.2], ambient: [0.08, 0.42], environment: [0.28, 1.0],
    elevation: [14, 38], gaslight: [0.0, 0.9], sky: [0.75, 1.7], window: WINDOW_TINTS,
  },
  midday: {
    sun: [0.9, 2.6], ambient: [0.12, 0.48], environment: [0.38, 1.2],
    elevation: [38, 70], gaslight: [0.0, 0.45], sky: [0.9, 2.0], window: WINDOW_TINTS,
  },
  afternoon: {
    sun: [0.65, 2.25], ambient: [0.08, 0.42], environment: [0.28, 1.05],
    elevation: [18, 45], gaslight: [0.0, 1.0], sky: [0.72, 1.75], window: WINDOW_TINTS,
  },
  sunset: {
    sun: [0.18, 1.55], ambient: [0.04, 0.3], environment: [0.15, 0.78],
    elevation: [5, 18], gaslight: [0.6, 2.4], sky: [0.45, 1.35], window: WARM_WINDOW_TINTS,
  },
  evening: {
    sun: [0.0, 0.18], ambient: [0.02, 0.22], environment: [0.08, 0.5],
    elevation: [5, 10], gaslight: [1.35, 3.0], sky: [0.28, 0.9], window: COOL_WINDOW_TINTS,
  },
});

export function sampleTuning(
  rng,
  exterior = false,
  requestedBand = null,
  requestedVibe = null,
  options = {},
) {
  const timeOfDay = sampleTimeOfDay(rng, requestedBand);
  const timeBand = timeBandForHour(timeOfDay);
  const profile = TIME_PROFILES[timeBand] ?? TIME_PROFILES.midday;
  const vibeFamily = typeof requestedVibe === 'string'
    ? VIBE_BY_ID.get(requestedVibe)
    : requestedVibe;
  const vibe = VIBE_PROFILES[vibeFamily?.id ?? pick(rng, VIBE_FAMILIES).id];
  const scaled = (range, factors, maximum) => clamp(
    uniform(rng, ...range) * uniform(rng, ...factors),
    0,
    maximum,
  );
  const shared = {
    timeOfDay,
    exposure: uniform(rng, ...vibe.exposure),
    ambientIntensity: scaled(profile.ambient, vibe.ambient, 2),
    envIntensity: scaled(profile.environment, vibe.environment, 3),
    fogDensity: uniform(rng, ...vibe.fog),
    bloomIntensity: uniform(rng, ...vibe.bloom),
    bloomThreshold: uniform(rng, ...vibe.bloomThreshold),
    aoIntensity: uniform(rng, ...vibe.ao),
    shadowRadius: uniform(rng, ...vibe.shadow),
  };
  if (exterior) {
    const shadowRange = options.shadowFamily?.range;
    const azimuthRange = options.sunAzimuthSector?.range;
    const tuning = {
      ...shared,
      sunIntensity: scaled(profile.sun, vibe.direct, 3),
      sunDiscSize: uniform(rng, 0.65, timeBand === 'sunset' ? 1.8 : 1.25),
      sunGlow: uniform(rng, ...vibe.glow),
      sunShadowRadius: shadowRange
        ? uniform(rng, ...shadowRange)
        : clamp(uniform(rng, ...vibe.shadow), 0, 6),
      ...(azimuthRange ? { sunAzimuthDeg: uniform(rng, ...azimuthRange) } : {}),
      skyTurbidity: vibeFamily?.id === 'soft-overcast'
        ? uniform(rng, 6.5, 10)
        : uniform(rng, 0.5, 9),
      skyRayleigh: uniform(rng, 0.4, 3.4),
      skyMie: uniform(rng, vibe.fog[0] * 0.25, Math.min(0.01, vibe.fog[1] * 0.5 + 0.001)),
      skyGain: scaled(
        timeBand === 'evening' ? [0.45, 1.35] : [0.8, 2.2],
        vibe.sky,
        3,
      ),
      skySaturation: uniform(rng, ...vibe.skySaturation),
      nightSkyBrightness: scaled(
        [0.65, timeBand === 'evening' ? 2.2 : 1.25],
        vibe.sky,
        2.5,
      ),
      citySkyGlow: scaled(
        [timeBand === 'evening' ? 0.6 : 0, timeBand === 'evening' ? 2.4 : 1],
        vibe.litWindows,
        2.5,
      ),
      starBrightness: uniform(rng, timeBand === 'evening' ? 0.5 : 0, timeBand === 'evening' ? 2.6 : 0.5),
      moonlightIntensity: scaled(
        [timeBand === 'evening' ? 0.45 : 0, timeBand === 'evening' ? 2.2 : 0.5],
        vibe.skyFill,
        3,
      ),
      cloudCover: uniform(rng, ...vibe.cloud),
      cloudCumulus: uniform(rng, ...vibe.cumulus),
      cloudScale: uniform(rng, 0.5, 2.4),
      cloudSpeed: 0,
      skyFill: uniform(rng, ...vibe.skyFill),
      groundBounce: uniform(rng, ...vibe.bounce),
    };
    if (timeBand === 'evening') {
      // Keep nocturnes below the shipped outdoor preset, but do not let four
      // independent low rolls combine into an unrateable black frame. This is
      // a search-domain boundary, not an alternate game lighting mode.
      tuning.exposure = Math.max(0.85, tuning.exposure);
      tuning.ambientIntensity = Math.max(0.08, tuning.ambientIntensity);
      tuning.envIntensity = Math.max(0.22, tuning.envIntensity);
      tuning.nightSkyBrightness = Math.max(0.75, tuning.nightSkyBrightness);
      tuning.skyFill = Math.max(0.9, tuning.skyFill);
    }
    return tuning;
  }
  const elevationMix = uniform(rng, ...vibe.elevation);
  let gaslight = scaled(profile.gaslight, vibe.gaslight, 3);
  if (vibe.gaslightFloor) gaslight = Math.max(gaslight, uniform(rng, ...vibe.gaslightFloor));
  let litWindows = scaled(
    timeBand === 'evening' ? [0.65, 2] : [0, 0.8],
    vibe.litWindows,
    2,
  );
  if (vibe.litWindowsFloor) {
    litWindows = Math.max(litWindows, uniform(rng, ...vibe.litWindowsFloor));
  }
  return {
    ...shared,
    hemisphereIntensity: scaled(
      [profile.ambient[0] * 0.5, profile.ambient[1]],
      vibe.hemisphere,
      2,
    ),
    windowIntensity: scaled(
      timeBand === 'evening' ? [0, 0.65] : [0.15, 3.2],
      vibe.direct,
      4,
    ),
    // Sun altitude at the window is the single biggest lever on the light:
    // a low sun throws the long raking wedge across the floor.
    windowElevationDeg: profile.elevation[0]
      + (profile.elevation[1] - profile.elevation[0]) * elevationMix,
    windowColor: pick(rng, vibe.window ?? profile.window),
    shaftIntensity: uniform(rng, ...vibe.shaft),
    moteDensity: uniform(rng, ...vibe.motes),
    gaslightIntensity: gaslight,
    // Flicker off: two renders of the same shot should score the same.
    gaslightFlicker: 0,
    gaslightColor: pick(rng, vibe.gaslightColor ?? GASLIGHT_TINTS),
    skyBrightness: scaled(profile.sky, vibe.sky, 2.5),
    skyHaze: uniform(rng, ...vibe.haze),
    skyLitWindows: litWindows,
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

function localToWorld(anchor, localX, localZ) {
  const yaw = anchor.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    anchor.position[0] + localX * cos - localZ * sin,
    anchor.position[2] + localX * sin + localZ * cos,
  ];
}

function localDirectionToWorld(anchor, localX, localZ) {
  const yaw = anchor.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [localX * cos - localZ * sin, localX * sin + localZ * cos];
}

// Candidate lenses derived from existing building collider boxes. `raised`
// hovers just outside a façade; `rooftop` sits above the top face. The page
// performs the authoritative 3D collision and terrain check afterward.
export function sampleElevatedCameraCandidates(rng, architecture, count, stratum) {
  if (!['raised', 'rooftop'].includes(stratum)) return [];
  if (!architecture?.length) return [];
  const candidates = [];
  for (let index = 0; index < count; index += 1) {
    const anchor = pick(rng, architecture);
    const [width, height, depth] = anchor.size;
    let localX;
    let localZ;
    let y;
    let outward = null;
    if (stratum === 'rooftop') {
      localX = uniform(rng, -width * 0.3, width * 0.3);
      localZ = uniform(rng, -depth * 0.3, depth * 0.3);
      // Extra clearance keeps a parapet or pitched cap from occupying most
      // of the frame while retaining a recognizably rooftop viewpoint.
      y = anchor.roofY + uniform(rng, 3.8, 6.2);
    } else {
      const side = Math.floor(rng() * 4);
      // A façade-hugging lens was often trapped in a one-building alley and
      // produced a full-frame wall. This is closer to a broad fire-escape or
      // cornice view and leaves enough room to read the opposite roofline.
      const offset = uniform(rng, 5.5, 9.5);
      if (side < 2) {
        const sign = side === 0 ? -1 : 1;
        localX = sign * (width / 2 + offset);
        localZ = uniform(rng, -depth * 0.34, depth * 0.34);
        outward = localDirectionToWorld(anchor, sign, 0);
      } else {
        const sign = side === 2 ? -1 : 1;
        localX = uniform(rng, -width * 0.34, width * 0.34);
        localZ = sign * (depth / 2 + offset);
        outward = localDirectionToWorld(anchor, 0, sign);
      }
      const bottom = anchor.position[1] - height / 2;
      y = uniform(rng, bottom + height * 0.62, anchor.roofY - 1.4);
    }
    const [x, z] = localToWorld(anchor, localX, localZ);
    candidates.push({
      x,
      y,
      z,
      stratum,
      anchorId: anchor.id,
      ...(outward ? { outward } : {}),
    });
  }
  return candidates;
}

// `camera` and `figure` are sample results from window.__shot.sample: each
// carries its own ground height, which outdoors follows the terrain.
export function aimAt(cameraPosition, target) {
  const dx = target[0] - cameraPosition[0];
  const dy = target[1] - cameraPosition[1];
  const dz = target[2] - cameraPosition[2];
  const horizontal = Math.max(1e-6, Math.hypot(dx, dz));
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, horizontal),
  };
}

export function assembleShot(rng, bounds, camera, figure, exterior = false, options = {}) {
  const eyeLow = camera.ground + 1.0;
  const eyeHigh = exterior
    ? camera.ground + 2.3
    : Math.min(bounds.ceilingY - 0.3, camera.ground + 2.4);
  const elevated = exterior && camera.stratum && camera.stratum !== 'ground';
  // Outdoors the figure can be a long way off, so let the camera aim a touch
  // further down; indoors a tilted frame is not the look.
  const pitchLow = elevated ? -0.16 : (exterior ? -0.3 : -0.22);
  const position = [
    camera.x,
    Number.isFinite(camera.y) ? camera.y : uniform(rng, eyeLow, Math.max(eyeLow + 0.1, eyeHigh)),
    camera.z,
  ];
  const fov = elevated ? uniform(rng, 26, 52) : uniform(rng, 28, 62);
  const windows = options.windows ?? [];
  const requestedComposition = options.composition;
  const useWindowFigure = requestedComposition === 'window-figure'
    && !exterior
    && windows.length > 0;
  const useTrackedPerson = requestedComposition === 'people' && options.subject?.id;
  const useLandscape = requestedComposition === 'landscape';
  const useWindow = requestedComposition
    ? requestedComposition === 'window' && !exterior && windows.length > 0
    : !exterior && windows.length > 0 && rng() < 0.24;
  const useFigure = requestedComposition
    ? requestedComposition === 'figure' && !elevated
    : !elevated && !useWindow && !useWindowFigure && !useTrackedPerson && !useLandscape
      && rng() < (exterior ? 0.9 : 0.82);
  let composition = 'architecture';
  let target = null;
  if (useWindowFigure) {
    composition = 'window-figure';
    target = options.target ?? [figure.x, figure.ground + 0.9, figure.z];
  } else if (useTrackedPerson) {
    composition = 'people';
    target = options.target ?? options.subject.position;
  } else if (useLandscape) {
    composition = 'landscape';
    target = options.target ?? null;
  } else if (useWindow) {
    composition = 'window';
    target = pick(rng, windows).position;
  } else if (useFigure) {
    composition = 'figure';
    target = [figure.x, figure.ground + 0.9, figure.z];
  } else if (options.target) {
    target = options.target;
  } else if (exterior && options.architecture?.length) {
    const candidates = options.architecture
      .filter((item) => item.id !== camera.anchorId)
      .map((item) => ({
        item,
        distance: Math.hypot(item.position[0] - position[0], item.position[2] - position[2]),
        outwardness: camera.outward
          ? (
            (item.position[0] - position[0]) * camera.outward[0]
            + (item.position[2] - position[2]) * camera.outward[1]
          )
          : 1,
      }))
      .filter(({ distance, outwardness }) => (
        distance >= (elevated ? 18 : 8)
        && distance <= 180
        && outwardness > distance * 0.12
      ))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 24);
    if (candidates.length) {
      const selected = pick(rng, candidates).item;
      target = [
        selected.position[0],
        elevated
          ? selected.position[1] + selected.size[1] * 0.42
          : selected.position[1] + selected.size[1] * 0.16,
        selected.position[2],
      ];
    } else if (camera.outward) {
      target = [
        position[0] + camera.outward[0] * 60,
        position[1] - 0.5,
        position[2] + camera.outward[1] * 60,
      ];
    }
  } else if (!exterior) {
    target = [(bounds.minX + bounds.maxX) / 2, bounds.floorY + 1.2, (bounds.minZ + bounds.maxZ) / 2];
  }

  let yaw = uniform(rng, 0, Math.PI * 2);
  let pitch = uniform(rng, pitchLow, 0.1);
  if (target) {
    const aimed = aimAt(position, target);
    // Looking a little beside the anchor puts the subject near a third and
    // reserves the large quiet plane that the taste model repeatedly favours.
    const side = rng() < 0.5 ? -1 : 1;
    yaw = aimed.yaw + side * uniform(rng, 0.07, 0.19) * (fov / 45);
    pitch = Math.min(0.15, Math.max(pitchLow, aimed.pitch + uniform(rng, -0.055, 0.045)));
  }

  const vibe = options.vibe ?? pick(rng, VIBE_FAMILIES);
  const tuning = sampleTuning(rng, exterior, options.timeBand, vibe, {
    shadowFamily: options.shadowFamily,
    sunAzimuthSector: options.sunAzimuthSector,
  });
  return {
    camera: {
      position,
      yaw,
      pitch,
      fov,
    },
    figure: {
      position: [figure.x, figure.z],
      yaw: figure.yaw ?? uniform(rng, 0, Math.PI * 2),
      visible: useFigure,
      pose: 'still',
    },
    ...(useWindowFigure ? {
      subject: {
        kind: 'woman',
        position: [figure.x, figure.ground, figure.z],
        yaw: figure.yaw ?? 0,
        visible: true,
      },
    } : {}),
    ...(useTrackedPerson ? {
      subject: {
        kind: 'pedestrian',
        id: options.subject.id,
        position: [...options.subject.position],
        yaw: options.subject.yaw ?? 0,
        visible: true,
      },
    } : {}),
    tuning,
    meta: {
      composition,
      timeBand: timeBandForHour(tuning.timeOfDay),
      vibe: vibe.id,
      cameraStratum: camera.stratum ?? 'ground',
      shadowFamily: options.shadowFamily?.id ?? 'profile',
      sunAzimuthSector: options.sunAzimuthSector?.id ?? 'physical',
      ...(options.sceneFamily ? { sceneFamily: options.sceneFamily } : {}),
    },
  };
}

// A local jitter of a known-good shot, for the hill-climb pass.
export function perturb(rng, shot, scale, bounds) {
  const jitter = (value, amount) => value + (rng() * 2 - 1) * amount * scale;
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const next = structuredClone(shot);
  const eye = shot.camera.position[1];
  const elevated = shot.meta?.cameraStratum && shot.meta.cameraStratum !== 'ground';
  const positionJitter = elevated ? 0.38 : 0.9;
  next.camera.position[0] = clamp(jitter(shot.camera.position[0], positionJitter), bounds.minX + 0.5, bounds.maxX - 0.5);
  // Height jitters around wherever the camera already is, so an outdoor shot
  // on a rise is not dragged back down to the room's floor level.
  next.camera.position[1] = clamp(jitter(eye, elevated ? 0.22 : 0.35), eye - 0.8, eye + 0.8);
  next.camera.position[2] = clamp(jitter(shot.camera.position[2], positionJitter), bounds.minZ + 0.5, bounds.maxZ - 0.5);
  next.camera.yaw = jitter(shot.camera.yaw, 0.35);
  next.camera.pitch = clamp(jitter(shot.camera.pitch, 0.08), -0.3, 0.15);
  next.camera.fov = clamp(jitter(shot.camera.fov, 7), 26, 66);
  next.figure.position[0] = clamp(jitter(shot.figure.position[0], 0.8), bounds.minX + 0.6, bounds.maxX - 0.6);
  next.figure.position[1] = clamp(jitter(shot.figure.position[1], 0.8), bounds.minZ + 0.6, bounds.maxZ - 0.6);
  next.figure.yaw = jitter(shot.figure.yaw, 0.6);
  for (const [key, value] of Object.entries(shot.tuning)) {
    if (key === 'timeOfDay') continue;
    if (typeof value !== 'number' || value === 0) continue;
    if (key === 'sunAzimuthDeg') {
      next.tuning[key] = ((jitter(value, 18) % 360) + 360) % 360;
    } else if (key === 'sunShadowRadius') {
      next.tuning[key] = clamp(jitter(value, 0.7), 0, 6);
    } else {
      next.tuning[key] = Math.max(0, jitter(value, Math.abs(value) * 0.25 + 0.05));
    }
  }
  const band = TIME_BAND_BY_ID.get(shot.meta?.timeBand);
  next.tuning.timeOfDay = band
    ? clamp(jitter(shot.tuning.timeOfDay, 0.65), band.low, band.high - 0.001)
    : clamp(jitter(shot.tuning.timeOfDay, 0.65), 5.5, 22.25);
  return next;
}

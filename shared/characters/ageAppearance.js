export const AGE_APPEARANCE_VALUE_IDS = Object.freeze([
  'ageGeometry',
  'wrinkleAmount',
  'skinTexture',
  'pigmentVariation',
  'freckleAmount',
  'ageSpotAmount',
  'underEyeDarkness',
  'greyAmount',
]);

export const GREY_PATTERNS = Object.freeze(['temples-first', 'scattered', 'uniform']);

const MINIMUM_AGE_YEARS = 16;
const MAXIMUM_AGE_YEARS = 90;
const MINIMUM_AGE_VALUE = 0.5;
const MAXIMUM_AGE_VALUE = 0.9;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(minimum, maximum, value) {
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
}

function hashText(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomSource(seed) {
  let state = hashText(`age-appearance:${seed}`) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bell(random) {
  return ((random() + random() + random() + random()) / 4 - 0.5) * 2;
}

export function rendererCAgeValueToYears(value) {
  const normalized = clamp01(
    (Number(value) - MINIMUM_AGE_VALUE) / (MAXIMUM_AGE_VALUE - MINIMUM_AGE_VALUE),
  );
  return Math.round(MINIMUM_AGE_YEARS + normalized * (MAXIMUM_AGE_YEARS - MINIMUM_AGE_YEARS));
}

export function rendererCYearsToAgeValue(years) {
  const normalized = clamp01(
    (Number(years) - MINIMUM_AGE_YEARS) / (MAXIMUM_AGE_YEARS - MINIMUM_AGE_YEARS),
  );
  return MINIMUM_AGE_VALUE + normalized * (MAXIMUM_AGE_VALUE - MINIMUM_AGE_VALUE);
}

export function deriveAgeAppearance({ ageYears = 35, seed = 1 } = {}) {
  const age = Math.max(16, Math.min(90, Number(ageYears) || 35));
  const random = randomSource(seed);
  const mature = smoothstep(27, 70, age);
  const laterLife = smoothstep(42, 78, age);
  const freckleDisposition = random() ** 1.7;
  const patternDraw = random();

  return {
    ageGeometry: clamp01(smoothstep(28, 86, age) * 0.88 + laterLife * 0.15 + bell(random) * 0.10),
    wrinkleAmount: clamp01(0.035 + mature * 0.60 + laterLife * 0.18 + bell(random) * 0.17),
    skinTexture: clamp01(0.20 + mature * 0.43 + bell(random) * 0.16),
    pigmentVariation: clamp01(0.12 + mature * 0.28 + laterLife * 0.18 + bell(random) * 0.15),
    freckleAmount: clamp01(0.015 + freckleDisposition * 0.55 + mature * 0.035),
    ageSpotAmount: clamp01(0.01 + laterLife ** 1.25 * 0.66 + Math.max(0, bell(random)) * 0.16),
    underEyeDarkness: clamp01(0.12 + mature * 0.39 + bell(random) * 0.18),
    greyAmount: clamp01(smoothstep(30, 73, age) * 0.78 + laterLife * 0.15 + bell(random) * 0.27),
    greyPattern: patternDraw < 0.52 ? 'temples-first' : patternDraw < 0.91 ? 'scattered' : 'uniform',
  };
}

export function applyAgeAppearanceDefaults(values, options = {}) {
  const appearance = deriveAgeAppearance(options);
  Object.assign(values, appearance);
  return appearance;
}

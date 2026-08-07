import { createRandom } from './random.js';
import { getOriginProfile } from './data/demographics.js';
import {
  DRESS_PALETTES, FACE_ARCHETYPES, FACE_DETAIL_CENTERS, FACE_DETAIL_IDS, FACE_VALUE_IDS,
  HAIR_STYLES, OUTFIT_RULES,
} from './data/appearance.js';
import { nearestHairShade } from '../hair/palette.js';
import { generateRestingFaceSignature } from './faceSignature.js';

const NEUTRAL_PERFORMANCE = {
  posture: 0.1, breathing: 1, breathingRate: 13, fidget: 0.85, gazeDrift: 0.9,
  weightShift: 0.9, tremor: 0.08, handTension: 0.35, gestureSpeed: 1,
};

const STYLE_VALUES = {
  'conservative-day': { bodiceFit: 0.96, waistHeight: 0.03, skirtFullness: 1.02, skirtLength: 1.02, skirtDrape: 0.67, bustleAmount: 0.1, sleeveVolume: 0.82, sleeveLength: 1.0, collarHeight: 0.95, collarSpread: 0.88, buttonCount: 7, buttonSpacing: 0.92 },
  'fashionable-1896': { bodiceFit: 0.93, waistHeight: 0.055, skirtFullness: 1.2, skirtLength: 1.02, skirtDrape: 0.72, bustleAmount: 0.18, sleeveVolume: 1.4, sleeveLength: 0.98, collarHeight: 1.08, collarSpread: 1.06, buttonCount: 6, buttonSpacing: 0.95 },
  'mourning-dress': { bodiceFit: 0.98, waistHeight: 0.025, skirtFullness: 1.08, skirtLength: 1.04, skirtDrape: 0.72, bustleAmount: 0.08, sleeveVolume: 0.92, sleeveLength: 1.02, collarHeight: 1.12, collarSpread: 0.82, buttonCount: 8, buttonSpacing: 0.86 },
  'working-day': { bodiceFit: 1.02, waistHeight: 0.015, skirtFullness: 0.88, skirtLength: 0.94, skirtDrape: 0.58, bustleAmount: 0.03, sleeveVolume: 0.72, sleeveLength: 0.94, collarHeight: 0.72, collarSpread: 1.08, buttonCount: 6, buttonSpacing: 1.0 },
  'visiting-dress': { bodiceFit: 0.94, waistHeight: 0.045, skirtFullness: 1.15, skirtLength: 1.01, skirtDrape: 0.7, bustleAmount: 0.15, sleeveVolume: 1.22, sleeveLength: 0.99, collarHeight: 1.0, collarSpread: 1.12, buttonCount: 6, buttonSpacing: 0.92 },
  'mens-sack-suit': { bodiceFit: 1.05, waistHeight: 0, skirtFullness: 0.9, skirtLength: 0.95, skirtDrape: 0.5, bustleAmount: 0, sleeveVolume: 0.58, sleeveLength: 1.0, collarHeight: 0.72, collarSpread: 1.08, buttonCount: 4, buttonSpacing: 1.0 },
  'mens-formal-suit': { bodiceFit: 1.0, waistHeight: 0, skirtFullness: 0.9, skirtLength: 0.95, skirtDrape: 0.5, bustleAmount: 0, sleeveVolume: 0.52, sleeveLength: 1.02, collarHeight: 0.92, collarSpread: 0.96, buttonCount: 5, buttonSpacing: 0.90 },
  'mens-working-clothes': { bodiceFit: 1.08, waistHeight: 0, skirtFullness: 0.9, skirtLength: 0.95, skirtDrape: 0.5, bustleAmount: 0, sleeveVolume: 0.46, sleeveLength: 0.94, collarHeight: 0.50, collarSpread: 1.12, buttonCount: 4, buttonSpacing: 1.05 },
  'mens-mourning-suit': { bodiceFit: 1.02, waistHeight: 0, skirtFullness: 0.9, skirtLength: 0.95, skirtDrape: 0.5, bustleAmount: 0, sleeveVolume: 0.54, sleeveLength: 1.02, collarHeight: 0.90, collarSpread: 0.92, buttonCount: 5, buttonSpacing: 0.90 },
};

function clamped(definitions, id, value) {
  const definition = definitions.find((candidate) => candidate.id === id);
  if (!definition || definition.type !== 'range') return value;
  const stepped = definition.step >= 1 ? Math.round(value) : value;
  return Math.min(definition.max, Math.max(definition.min, stepped));
}

function jitter(random, amount) {
  return random.bell() * amount;
}

function outfitFor(patient, random) {
  if (patient.clinical.flags.includes('mourning') && random.chance(0.86)) {
    return patient.identity.sex === 'male' ? 'mens-mourning-suit' : 'mourning-dress';
  }
  const laboring = ['domestic-servant', 'laundress', 'seamstress', 'factory-worker', 'laborer', 'porter', 'railroad-worker', 'skilled-tradesman'].includes(patient.social.occupationId);
  const candidates = OUTFIT_RULES.filter((outfit) => outfit.classes.includes(patient.social.classId)
    && (!outfit.sexes || outfit.sexes.includes(patient.identity.sex))
    && patient.identity.age <= (outfit.maxAge ?? 120) && !['mourning-dress', 'mens-mourning-suit'].includes(outfit.id));
  return random.weighted(candidates, (outfit) => outfit.weight * (laboring && ['working-day', 'mens-working-clothes'].includes(outfit.id) ? 3.5 : 1)).id;
}

function paletteFor(outfit, random) {
  if (outfit === 'mourning-dress' || outfit === 'mens-mourning-suit') return random.pick(DRESS_PALETTES.mourning);
  if (['fashionable-1896', 'visiting-dress', 'mens-formal-suit'].includes(outfit)) return random.pick(DRESS_PALETTES.fashionable);
  if (outfit === 'working-day' || outfit === 'mens-working-clothes') return random.pick(DRESS_PALETTES.working);
  return random.pick(DRESS_PALETTES.sober);
}

function ageMorph(age) {
  return 0.5 + ((age - 16) / 60) * 0.4;
}

function skinAge(age) {
  return Math.min(1, Math.max(0, (age - 18) / 58));
}

function lipColorForSkin(skinTone, random) {
  const channels = [1, 3, 5].map((index) => parseInt(skinTone.slice(index, index + 2), 16));
  const variation = random.bell() * 10;
  const tinted = [
    channels[0] * 0.72 + 35 + variation,
    channels[1] * 0.55 + 15 + variation * 0.35,
    channels[2] * 0.58 + 18 + variation * 0.45,
  ].map((value) => Math.round(Math.min(255, Math.max(0, value))));
  return `#${tinted.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(left, right, amount) {
  const channels = (value) => [1, 3, 5].map((index) => parseInt(value.slice(index, index + 2), 16));
  const a = channels(left); const b = channels(right);
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount)
    .toString(16).padStart(2, '0')).join('')}`;
}

function bodyMass(patient, random) {
  const classCenter = { elite: 0.56, affluent: 0.53, comfortable: 0.49, sponsored: 0.44 }[patient.social.classId];
  const ageAdjustment = patient.identity.age > 50 ? 0.035 : patient.identity.age < 23 ? -0.035 : 0;
  const complaintAdjustment = ['melancholic-withdrawal', 'neurasthenic-exhaustion', 'morphine-habit'].includes(patient.clinical.id) ? -0.045 : 0;
  return classCenter + ageAdjustment + complaintAdjustment + jitter(random, 0.16);
}

function hairStyleWeight(style, age, sex = null) {
  const band = age < 30 ? 0 : age < 50 ? 1 : 2;
  // Cropped profiles remain possible, but an 1896 private-practice sample
  // should overwhelmingly cast women's hair as dressed-up rather than as the
  // modern bowl silhouette produced when a short profile wins too often.
  const femaleShortPenalty = sex === 'female' && style.id === 'short-parted' ? 0.025
    : sex === 'female' && style.id === 'cropped-waves' ? 0.08 : 1;
  return style.weight * (style.ageWeights?.[band] ?? 1) * femaleShortPenalty;
}

function groomingDisarray(patient, random) {
  const classPolish = { elite: 0.78, affluent: 0.66, comfortable: 0.50, sponsored: 0.38 }[patient.social.classId];
  const performance = patient.clinical.performance || NEUTRAL_PERFORMANCE;
  const agitation = Math.max(0, (performance.fidget - 0.7) / 1.1) * 0.18;
  const fatigue = ['weary', 'sad'].includes(patient.clinical.affect) ? 0.10 : 0;
  return Math.min(1, Math.max(0, 0.54 - classPolish * 0.46 + agitation + fatigue + jitter(random, 0.17)));
}

function descriptionFor(patient) {
  const work = patient.social.occupation ?? patient.social.householdPosition;
  return `${patient.identity.age}-year-old ${patient.identity.origin.label} ${work} from ${patient.social.residence}, presenting with ${patient.clinical.presentingComplaint}.`;
}

const FACE_IDENTITY_IDS = Object.freeze([
  'gender', 'african', 'asian', 'caucasian',
  'headShapeStrength', ...FACE_VALUE_IDS, ...FACE_DETAIL_IDS, 'browHeight', 'faceAsymmetry',
]);

/** Normalized RMS landmark distance. Zero is the same baked face; one would
 * mean every structural control moved across its complete permitted range. */
export function faceIdentityDistance(leftPreset, rightPreset, definitions) {
  const left = leftPreset?.values ?? leftPreset ?? {};
  const right = rightPreset?.values ?? rightPreset ?? {};
  let squared = 0;
  let compared = 0;
  for (const id of FACE_IDENTITY_IDS) {
    const definition = definitions.find((candidate) => candidate.id === id);
    const span = Number(definition?.max) - Number(definition?.min);
    if (!(span > 0) || !Number.isFinite(left[id]) || !Number.isFinite(right[id])) continue;
    squared += ((left[id] - right[id]) / span) ** 2;
    compared += 1;
  }
  return compared ? Math.sqrt(squared / compared) : 0;
}

/** Map a domain patient onto the existing Blender/Three.js preset contract. */
export function patientToCharacterPreset(patient, basePreset, definitions, options = {}) {
  const preset = structuredClone(basePreset);
  const values = preset.values;
  const appearanceSeed = Number(options.appearanceSeed ?? patient.seed);
  const faceRandom = createRandom(appearanceSeed, 'appearance.face');
  const bodyRandom = createRandom(appearanceSeed, 'appearance.body');
  const hairRandom = createRandom(appearanceSeed, 'appearance.hair');
  const dressRandom = createRandom(appearanceSeed, 'appearance.dress');
  const stylizedRandom = createRandom(appearanceSeed, 'appearance.stylized');
  // Performance belongs to the patient's clinical record, not to an alternate
  // visual interpretation of that patient.
  const performanceRandom = createRandom(Number(options.performanceSeed ?? patient.seed), 'appearance.performance');
  const origin = getOriginProfile(patient.identity.origin.id);
  const surfaceAge = skinAge(patient.identity.age);
  const female = patient.identity.sex === 'female';

  values.seed = appearanceSeed;
  values.gender = clamped(definitions, 'gender', (female ? 0.035 : 0.90) + jitter(bodyRandom, 0.035));
  values.age = clamped(definitions, 'age', ageMorph(patient.identity.age));
  values.height = clamped(definitions, 'height', (female ? 0.44 : 0.53) + jitter(bodyRandom, 0.22));
  values.weight = clamped(definitions, 'weight', bodyMass(patient, bodyRandom));
  const laboring = ['domestic-servant', 'laundress', 'factory-worker', 'laborer', 'porter', 'railroad-worker', 'skilled-tradesman'].includes(patient.social.occupationId);
  values.muscle = clamped(definitions, 'muscle', (female ? 0.27 : 0.41) + (laboring ? 0.09 : 0) + jitter(bodyRandom, 0.15));
  values.proportions = clamped(definitions, 'proportions', 0.49 + jitter(bodyRandom, 0.16));
  values.shoulderWidth = clamped(definitions, 'shoulderWidth', (female ? -0.20 : 0.06) + jitter(bodyRandom, 0.18));
  values.torsoLength = clamped(definitions, 'torsoLength', 0.02 + jitter(bodyRandom, 0.22));
  values.mhrNeckLength = clamped(definitions, 'mhrNeckLength', jitter(bodyRandom, 0.28));
  values.mhrUpperArmLength = clamped(definitions, 'mhrUpperArmLength', jitter(bodyRandom, 0.32));
  values.mhrLowerArmLength = clamped(definitions, 'mhrLowerArmLength', jitter(bodyRandom, 0.32));
  values.mhrHipWidth = clamped(definitions, 'mhrHipWidth', (female ? 0.18 : -0.05) + jitter(bodyRandom, 0.23));
  values.mhrUpperLegLength = clamped(definitions, 'mhrUpperLegLength', jitter(bodyRandom, 0.34));
  values.mhrLowerLegLength = clamped(definitions, 'mhrLowerLegLength', jitter(bodyRandom, 0.34));
  values.mhrFootLength = clamped(definitions, 'mhrFootLength', (female ? -0.10 : 0.07) + jitter(bodyRandom, 0.22));
  values.mhrHandScale = clamped(definitions, 'mhrHandScale', (female ? -0.18 : 0.08) + jitter(bodyRandom, 0.20));
  values.mhrEyeSpacing = clamped(definitions, 'mhrEyeSpacing', jitter(faceRandom, 0.22));

  [values.african, values.asian, values.caucasian] = origin.heritage;
  values.skinTone = bodyRandom.pick(origin.skinTones);
  values.eyeColor = bodyRandom.pick(origin.eyeColors);
  values.skinRoughness = clamped(definitions, 'skinRoughness', 1.02 + surfaceAge * 0.32 + jitter(bodyRandom, 0.18));

  const face = faceRandom.weighted(FACE_ARCHETYPES);
  const featureScale = faceRandom.between(0.85, 1.38);
  values.headShape = face.headShape;
  values.headShapeStrength = clamped(definitions, 'headShapeStrength', 0.66 + jitter(faceRandom, 0.14));
  for (const id of FACE_VALUE_IDS) values[id] = clamped(definitions, id, face[id] * featureScale + jitter(faceRandom, 0.26));
  for (const id of FACE_DETAIL_IDS) {
    const center = FACE_DETAIL_CENTERS[face.id]?.[id] ?? 0;
    values[id] = clamped(definitions, id, center * featureScale * 1.25 + jitter(faceRandom, 0.38));
  }
  values.browHeight = clamped(definitions, 'browHeight', -0.03 + jitter(faceRandom, 0.16));
  values.faceAsymmetry = clamped(definitions, 'faceAsymmetry', 0.055 + Math.abs(jitter(faceRandom, 0.08)));
  // The source MHR mean already carries a prominent lower face. Keep broad
  // archetype variety without stacking every random draw on an oversized
  // chin, and let the calibrated presentation field supply sex-linked shape.
  values.jawWidth = clamped(definitions, 'jawWidth', values.jawWidth * 0.84 + (female ? -0.07 : 0));
  values.chinHeight = clamped(definitions, 'chinHeight', values.chinHeight * 0.78);
  values.chinProminence = clamped(definitions, 'chinProminence', values.chinProminence * 0.68 + (female ? -0.05 : -0.02));
  values.chinPrognathism = clamped(definitions, 'chinPrognathism', values.chinPrognathism * 0.74);

  const hairCandidates = HAIR_STYLES.filter((style) => style.classes.includes(patient.social.classId)
    && (!style.sexes || style.sexes.includes(patient.identity.sex))
    && patient.identity.age <= (style.maxAge ?? 120));
  values.hairStyle = hairRandom.weighted(
    hairCandidates,
    (style) => hairStyleWeight(style, patient.identity.age, patient.identity.sex),
  ).id;
  values.hairColor = hairRandom.pick(origin.hairColors);
  values.hairShade = nearestHairShade(values.hairColor);
  values.hairVolume = clamped(definitions, 'hairVolume', 1 + jitter(hairRandom, 0.22));
  values.hairHeight = clamped(definitions, 'hairHeight', 1 + jitter(hairRandom, 0.18));
  values.sideVolume = clamped(definitions, 'sideVolume', 1.02 + jitter(hairRandom, 0.24));
  const styleSweep = {
    'loose-chignon': 0.48, 'cropped-waves': 0.34, 'short-parted': 0.38,
    pompadour: 0.82, 'swept-back': 0.92, 'low-bun': 0.74,
  }[values.hairStyle] ?? 0.68;
  values.flowSweep = clamped(definitions, 'flowSweep', styleSweep + jitter(hairRandom, 0.12));
  values.partWidth = clamped(definitions, 'partWidth', 0.28 + jitter(hairRandom, 0.22));
  values.bunSize = clamped(definitions, 'bunSize', 1 + jitter(hairRandom, 0.28));
  values.hairlineHeight = clamped(definitions, 'hairlineHeight', jitter(hairRandom, 0.20));
  values.templeRecession = clamped(definitions, 'templeRecession', 0.12 + Math.max(0, patient.identity.age - 44) / 115 + jitter(hairRandom, 0.12));
  values.wispAmount = clamped(definitions, 'wispAmount', 0.24 + groomingDisarray(patient, hairRandom) * 0.58);
  values.waveAmount = clamped(definitions, 'waveAmount', 0.38 + jitter(hairRandom, 0.34));
  values.strandContrast = clamped(definitions, 'strandContrast', 0.42 + jitter(hairRandom, 0.24));
  values.greyAmount = clamped(definitions, 'greyAmount', Math.max(0, patient.identity.age - 42) / 38 + jitter(hairRandom, 0.13));
  // Brows usually sit darker and less chromatic than scalp hair; lashes are
  // darker again.  They remain independent live controls after generation.
  values.browColor = mixHex(values.hairColor, '#21150f', 0.42);
  values.browDensity = clamped(definitions, 'browDensity', 0.76 - surfaceAge * 0.13 + jitter(hairRandom, 0.14));
  values.browThickness = clamped(definitions, 'browThickness', 0.96 + jitter(hairRandom, 0.20));
  values.browArch = clamped(definitions, 'browArch', jitter(faceRandom, 0.28));
  values.browAsymmetry = clamped(definitions, 'browAsymmetry', 0.04 + Math.abs(jitter(faceRandom, 0.07)));
  values.lashColor = mixHex(values.hairColor, '#100b09', 0.68);
  values.lashDensity = clamped(definitions, 'lashDensity', 0.68 - surfaceAge * 0.10 + jitter(hairRandom, 0.12));
  values.lashLength = clamped(definitions, 'lashLength', 0.88 + jitter(hairRandom, 0.15));
  values.lashCurl = clamped(definitions, 'lashCurl', 0.46 + jitter(hairRandom, 0.18));
  // MHR's source mesh has no separate eyeballs. Keep the generated globe fit
  // within a conservative anatomical band, then leave every value live for
  // close-up art direction in Character Lab.
  values.mhrEyeGlobeScale = clamped(definitions, 'mhrEyeGlobeScale', 0.98 + jitter(faceRandom, 0.025));
  values.mhrEyeDepth = clamped(definitions, 'mhrEyeDepth', -0.6 + jitter(faceRandom, 0.22));
  values.mhrEyeVertical = clamped(definitions, 'mhrEyeVertical', jitter(faceRandom, 0.35));
  values.mhrScleraColor = mixHex('#ded3c8', '#c8aa9a', 0.10 + surfaceAge * 0.18);
  values.mhrScleraBrightness = clamped(definitions, 'mhrScleraBrightness', 0.30 - surfaceAge * 0.11 + jitter(stylizedRandom, 0.06));
  values.mhrIrisScale = clamped(definitions, 'mhrIrisScale', 1.02 + jitter(faceRandom, 0.09));
  values.mhrPupilScale = clamped(definitions, 'mhrPupilScale', 0.96 + jitter(faceRandom, 0.12));
  values.mhrCorneaGloss = clamped(definitions, 'mhrCorneaGloss', 0.36 + jitter(stylizedRandom, 0.10));
  values.stylizedPlaneContrast = clamped(definitions, 'stylizedPlaneContrast', 0.25 + surfaceAge * 0.16 + jitter(stylizedRandom, 0.10));
  values.stylizedTriangleBlend = clamped(definitions, 'stylizedTriangleBlend', 0.48 - surfaceAge * 0.18 + jitter(stylizedRandom, 0.12));
  values.stylizedSkinDetail = clamped(definitions, 'stylizedSkinDetail', 0.24 + surfaceAge * 0.50 + jitter(stylizedRandom, 0.10));
  values.stylizedPoreScale = clamped(definitions, 'stylizedPoreScale', 0.78 + surfaceAge * 0.62 + jitter(stylizedRandom, 0.22));
  values.stylizedPigmentVariation = clamped(definitions, 'stylizedPigmentVariation', 0.16 + surfaceAge * 0.52 + jitter(stylizedRandom, 0.11));
  values.stylizedFreckleAmount = clamped(definitions, 'stylizedFreckleAmount', 0.04 + surfaceAge * 0.15 + Math.max(0, jitter(stylizedRandom, 0.10)));
  values.stylizedSkinWarmth = clamped(definitions, 'stylizedSkinWarmth', 0.31 - surfaceAge * 0.10 + jitter(stylizedRandom, 0.10));
  values.stylizedCheekBlush = clamped(definitions, 'stylizedCheekBlush', 0.44 - surfaceAge * 0.08 + jitter(stylizedRandom, 0.16));
  values.stylizedNoseRedness = clamped(definitions, 'stylizedNoseRedness', 0.24 + surfaceAge * 0.16 + jitter(stylizedRandom, 0.13));
  values.stylizedForeheadWarmth = clamped(definitions, 'stylizedForeheadWarmth', 0.17 + surfaceAge * 0.05 + jitter(stylizedRandom, 0.10));
  values.stylizedUnderEyeDepth = clamped(definitions, 'stylizedUnderEyeDepth', 0.18 + surfaceAge * 0.34 + jitter(stylizedRandom, 0.11));
  values.stylizedAgeSpots = clamped(definitions, 'stylizedAgeSpots', Math.max(0, surfaceAge - 0.32) * 0.62 + Math.max(0, jitter(stylizedRandom, 0.10)));
  values.stylizedLipTint = clamped(definitions, 'stylizedLipTint', 0.60 - surfaceAge * 0.19 + jitter(stylizedRandom, 0.12));
  values.stylizedLipColor = lipColorForSkin(values.skinTone, stylizedRandom);
  values.stylizedEyeContrast = clamped(definitions, 'stylizedEyeContrast', 0.40 - surfaceAge * 0.17 + jitter(stylizedRandom, 0.10));
  values.stylizedSurfaceRoughness = clamped(definitions, 'stylizedSurfaceRoughness', 0.72 + surfaceAge * 0.18 + jitter(stylizedRandom, 0.07));
  values.stylizedLightSoftness = clamped(definitions, 'stylizedLightSoftness', 0.78 + jitter(stylizedRandom, 0.12));

  values.outfitStyle = outfitFor(patient, dressRandom);
  [values.dressColor, values.trimColor] = paletteFor(values.outfitStyle, dressRandom);
  values.fabricRoughness = clamped(definitions, 'fabricRoughness', 1.42 + jitter(dressRandom, 0.14));
  for (const [id, center] of Object.entries(STYLE_VALUES[values.outfitStyle])) {
    values[id] = clamped(definitions, id, center + jitter(dressRandom, id === 'buttonCount' ? 1.5 : 0.06));
  }

  const severity = patient.clinical.severity;
  for (const [id, neutral] of Object.entries(NEUTRAL_PERFORMANCE)) {
    const target = patient.clinical.performance[id] ?? neutral;
    const amount = ['breathingRate'].includes(id) ? 0.8 : 0.08;
    values[id] = clamped(definitions, id, neutral + (target - neutral) * severity + jitter(performanceRandom, amount));
  }
  values.kneesTogether = clamped(definitions, 'kneesTogether', 0.74 + jitter(performanceRandom, 0.12));
  values.headTilt = clamped(definitions, 'headTilt', jitter(performanceRandom, 0.045));
  values.headTurn = clamped(definitions, 'headTurn', jitter(performanceRandom, 0.16));
  values.armOpenness = clamped(definitions, 'armOpenness', jitter(performanceRandom, 0.16));
  values.elbowBend = clamped(definitions, 'elbowBend', 0.68 + jitter(performanceRandom, 0.12));
  values.armAsymmetry = clamped(definitions, 'armAsymmetry', jitter(performanceRandom, 0.16));
  values.wristAngle = clamped(definitions, 'wristAngle', jitter(performanceRandom, 0.14));
  const sadPresentations = new Set(['melancholic-withdrawal', 'bereavement-visions', 'postpartum-disturbance']);
  const tiredPresentations = new Set(['neurasthenic-exhaustion', 'persistent-insomnia', 'morphine-habit', 'postpartum-disturbance']);
  values.sadness = clamped(definitions, 'sadness', (sadPresentations.has(patient.clinical.id) ? 0.42 : 0.03) * severity + jitter(performanceRandom, 0.05));
  values.fatigueExpression = clamped(definitions, 'fatigueExpression', (tiredPresentations.has(patient.clinical.id) ? 0.54 : 0.05) * severity + jitter(performanceRandom, 0.07));
  values.seated = 1;
  values.idleMode = 'procedural';

  preset.name = patient.identity.displayName;
  preset.description = descriptionFor(patient);
  preset.patient = {
    ...patient,
    appearance: {
      seed: appearanceSeed,
      sex: patient.identity.sex,
      mhrIdentity: {
        version: 1,
        seed: appearanceSeed,
        presentation: values.gender,
        ancestry: { african: values.african, asian: values.asian, caucasian: values.caucasian },
      },
      wardrobeSex: patient.identity.sex,
      faceSignatureSeed: appearanceSeed,
      restingFace: generateRestingFaceSignature(appearanceSeed),
      faceArchetype: face.id, bodyMass: values.weight, stature: values.height,
      skinTone: values.skinTone, eyeColor: values.eyeColor, hairColor: values.hairColor,
      hairShade: values.hairShade, hairStyle: values.hairStyle, flowSweep: values.flowSweep,
      greyAmount: values.greyAmount, browColor: values.browColor, browDensity: values.browDensity,
      lashColor: values.lashColor, lashDensity: values.lashDensity, outfitStyle: values.outfitStyle,
      dressColor: values.dressColor, trimColor: values.trimColor,
      skinRendering: {
        microDetail: values.stylizedSkinDetail,
        poreScale: values.stylizedPoreScale,
        pigmentVariation: values.stylizedPigmentVariation,
        freckleAmount: values.stylizedFreckleAmount,
        underEyeDepth: values.stylizedUnderEyeDepth,
        ageSpots: values.stylizedAgeSpots,
        lipTint: values.stylizedLipTint,
        eyeWhiteContrast: values.stylizedEyeContrast,
        surfaceRoughness: values.stylizedSurfaceRoughness,
      },
    },
  };
  return preset;
}

export const CHARACTER_RECIPE_VERSION = 1;

export const CHARACTER_LODS = Object.freeze(['consultation', 'nearby', 'crowd']);
export const CHARACTER_BODY_CUES = Object.freeze([
  'clinic-idle', 'sitting-talking', 'sitting-distressed',
  'sitting-disapproval', 'sitting-disbelief', 'sitting-self-soothing',
  'sit-down', 'stand-up', 'standing-idle', 'walk',
]);
export const CHARACTER_EXPRESSIONS = Object.freeze([
  'neutral', 'guarded', 'distressed', 'fatigued', 'relieved',
  'smiling', 'frowning', 'discouraged', 'pained', 'anxious', 'ashamed',
]);
export const CHARACTER_GAZES = Object.freeze(['doctor', 'away', 'down', 'neutral']);
// Procedural overlays, not clips: applied by the renderer on top of the
// current body cue.
export const CHARACTER_GESTURES = Object.freeze(['none', 'present-wrist', 'extend-both-arms']);

export const BODY_CUE_CLIPS = Object.freeze({
  'clinic-idle': 'ClinicIdle',
  'sitting-talking': 'SittingTalking',
  'sitting-distressed': 'SittingDejected',
  'sitting-disapproval': 'SittingDejected',
  'sitting-disbelief': 'SittingDejected',
  'sitting-self-soothing': 'SittingTalking',
  'sit-down': 'SitDown',
  'stand-up': 'StandUp',
  'standing-idle': 'StandingIdle',
  walk: 'Walk',
});

function finiteVector(value, size, fallback) {
  if (!Array.isArray(value) || value.length !== size) return [...fallback];
  return value.map((entry, index) => Number.isFinite(Number(entry)) ? Number(entry) : fallback[index]);
}

export function createCharacterRecipe(input = {}) {
  const animation = input.animation || {};
  return {
    schemaVersion: CHARACTER_RECIPE_VERSION,
    id: String(input.id || 'character'),
    renderer: String(input.renderer || 'renderer-c'),
    cohort: String(input.cohort || 'women'),
    identitySeed: Number(input.identitySeed) || 1,
    appearanceSeed: Number(input.appearanceSeed ?? input.identitySeed) || 1,
    anchor: {
      index: Math.max(0, Math.trunc(Number(input.anchor?.index) || 0)),
      id: input.anchor?.id == null ? null : String(input.anchor.id),
    },
    values: { ...(input.values || {}) },
    presentation: structuredClone(input.presentation || {}),
    restingFace: { ...(input.restingFace || {}) },
    animation: {
      body: CHARACTER_BODY_CUES.includes(animation.body) ? animation.body : 'clinic-idle',
      expression: CHARACTER_EXPRESSIONS.includes(animation.expression) ? animation.expression : 'neutral',
      gaze: CHARACTER_GAZES.includes(animation.gaze) ? animation.gaze : 'doctor',
      gesture: CHARACTER_GESTURES.includes(animation.gesture) ? animation.gesture : 'none',
      speaking: Boolean(animation.speaking),
    },
    lod: CHARACTER_LODS.includes(input.lod) ? input.lod : 'consultation',
    asset: input.asset ? { ...input.asset } : null,
    placement: {
      position: finiteVector(input.placement?.position, 3, [0, 0, 0]),
      rotation: finiteVector(input.placement?.rotation, 3, [0, 0, 0]),
      scale: Number.isFinite(Number(input.placement?.scale)) ? Number(input.placement.scale) : 1,
    },
  };
}

export function validateCharacterRecipe(recipe, manifest = null) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') return ['recipe must be an object'];
  if (recipe.schemaVersion !== CHARACTER_RECIPE_VERSION) errors.push(`schemaVersion must be ${CHARACTER_RECIPE_VERSION}`);
  if (!recipe.id) errors.push('id is required');
  if (recipe.renderer !== 'renderer-c' && recipe.renderer !== 'baked-crowd') errors.push(`unsupported renderer: ${recipe.renderer}`);
  if (!CHARACTER_LODS.includes(recipe.lod)) errors.push(`unsupported lod: ${recipe.lod}`);
  if (!CHARACTER_BODY_CUES.includes(recipe.animation?.body)) errors.push(`unsupported body cue: ${recipe.animation?.body}`);
  if (!CHARACTER_EXPRESSIONS.includes(recipe.animation?.expression)) errors.push(`unsupported expression: ${recipe.animation?.expression}`);
  if (!CHARACTER_GAZES.includes(recipe.animation?.gaze)) errors.push(`unsupported gaze: ${recipe.animation?.gaze}`);

  if (recipe.renderer === 'renderer-c') {
    const cohort = manifest?.cohorts?.[recipe.cohort] || manifest;
    const anchors = cohort?.anchors || [];
    if (!['women', 'men'].includes(recipe.cohort)) errors.push(`unsupported Renderer C cohort: ${recipe.cohort}`);
    if (!Number.isInteger(recipe.anchor?.index) || recipe.anchor.index < 0) errors.push('anchor.index must be a non-negative integer');
    if (anchors.length && recipe.anchor.index >= anchors.length) errors.push(`anchor.index ${recipe.anchor.index} exceeds ${anchors.length - 1}`);
    const clip = recipe.asset?.clipMap?.[recipe.animation?.body]
      || BODY_CUE_CLIPS[recipe.animation?.body];
    const availableClips = recipe.asset?.motionClips || cohort?.motionClips || [];
    if (availableClips.length && !availableClips.includes(clip)) errors.push(`character asset is missing clip ${clip}`);
  }
  return errors;
}

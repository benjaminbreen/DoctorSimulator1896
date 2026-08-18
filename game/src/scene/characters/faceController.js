import {
  FACE_WEIGHT_LIMITS,
  FACIAL_EXPRESSION_RECIPES,
  FACIAL_GAZE_RECIPES,
  isSpeechIncompatible,
  safeFaceWeight,
  speechJawWeight,
} from '../../../../shared/characters/facePerformance.js';

export { FACE_WEIGHT_LIMITS, speechJawWeight };

function collectBindings(root) {
  const bindings = new Map();
  root.traverse((object) => {
    if (!object.morphTargetDictionary || !object.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(object.morphTargetDictionary)) {
      if (name.startsWith('rc_')) continue;
      if (!bindings.has(name)) bindings.set(name, []);
      bindings.get(name).push({ object, index });
    }
  });
  return bindings;
}

function add(weights, recipe, scale = 1, excluded = null) {
  for (const [name, value] of Object.entries(recipe || {})) {
    if (excluded?.has(name)) continue;
    weights.set(name, Math.min(1, (weights.get(name) || 0) + value * scale));
  }
}

export function createFaceController(root, recipe) {
  const bindings = collectBindings(root);
  const written = new Set();
  // Expression morphs ease between cues so a face changes like a face, not a
  // mask. Blinks and the speech jaw stay immediate.
  const smoothed = new Map();
  let elapsed = 0;
  const blinkPeriod = 4.2 + (Math.abs(Number(recipe.appearanceSeed) || 1) % 23) / 10;

  const immediate = (name) => name.startsWith('eyeBlink') || name.startsWith('jaw');

  function write(weights, delta) {
    const blend = 1 - Math.exp(-6 * Math.max(0, Math.min(0.1, delta)));
    for (const name of new Set([...smoothed.keys(), ...weights.keys()])) {
      if (immediate(name)) continue;
      const target = weights.get(name) || 0;
      const current = smoothed.get(name) || 0;
      const next = current + (target - current) * blend;
      if (next < 0.002 && target === 0) {
        smoothed.delete(name);
        weights.delete(name);
      } else {
        smoothed.set(name, next);
        weights.set(name, next);
      }
    }
    for (const name of written) {
      if (weights.has(name)) continue;
      for (const binding of bindings.get(name) || []) binding.object.morphTargetInfluences[binding.index] = 0;
    }
    written.clear();
    for (const [name, value] of weights) {
      const safeValue = safeFaceWeight(name, value);
      for (const binding of bindings.get(name) || []) binding.object.morphTargetInfluences[binding.index] = safeValue;
      written.add(name);
    }
  }

  function update(delta, animation = recipe.animation) {
    elapsed += Math.max(0, Math.min(0.1, Number(delta) || 0));
    const excluded = animation.speaking ? { has: isSpeechIncompatible } : null;
    const weights = new Map(Object.entries(recipe.restingFace || {})
      .filter(([name, value]) => Number(value) > 0 && !excluded?.has(name)));
    add(weights, FACIAL_EXPRESSION_RECIPES[animation.expression], 1, excluded);
    add(weights, FACIAL_GAZE_RECIPES[animation.gaze]);

    const blinkTime = elapsed % blinkPeriod;
    if (blinkTime < 0.16) {
      const amount = Math.sin((blinkTime / 0.16) * Math.PI) * 0.92;
      add(weights, { eyeBlinkLeft: amount, eyeBlinkRight: amount });
    }
    if (animation.speaking) {
      add(weights, { jawOpen: speechJawWeight(elapsed, recipe.appearanceSeed) });
    }
    write(weights, Number(delta) || 0);
  }

  return { bindings, update };
}

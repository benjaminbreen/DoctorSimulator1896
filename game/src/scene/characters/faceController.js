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
  let elapsed = 0;
  const blinkPeriod = 4.2 + (Math.abs(Number(recipe.appearanceSeed) || 1) % 23) / 10;

  function write(weights) {
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
    write(weights);
  }

  return { bindings, update };
}

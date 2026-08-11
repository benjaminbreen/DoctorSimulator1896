export const FACIAL_EXPRESSION_RECIPES = Object.freeze({
  guarded: Object.freeze({ browDownLeft: 0.12, browDownRight: 0.11, mouthPressLeft: 0.10, mouthPressRight: 0.09 }),
  distressed: Object.freeze({ browInnerUp: 0.19, mouthFrownLeft: 0.15, mouthFrownRight: 0.15, eyeSquintLeft: 0.05, eyeSquintRight: 0.05 }),
  fatigued: Object.freeze({ eyeBlinkLeft: 0.09, eyeBlinkRight: 0.09, browInnerUp: 0.06, mouthFrownLeft: 0.05, mouthFrownRight: 0.05 }),
  relieved: Object.freeze({ mouthSmileLeft: 0.16, mouthSmileRight: 0.16, cheekSquintLeft: 0.06, cheekSquintRight: 0.06 }),
});

export const FACIAL_GAZE_RECIPES = Object.freeze({
  away: Object.freeze({ eyeLookOutLeft: 0.10, eyeLookInRight: 0.10 }),
  down: Object.freeze({ eyeLookDownLeft: 0.10, eyeLookDownRight: 0.10 }),
});

const SPEECH_INCOMPATIBLE = new Set([
  'jawOpen', 'jawLeft', 'jawRight',
]);

export const FACE_WEIGHT_LIMITS = Object.freeze({
  jawOpen: 0.04,
  mouthFunnel: 0.08,
  mouthPucker: 0.08,
  mouthPressLeft: 0.18,
  mouthPressRight: 0.18,
  mouthFrownLeft: 0.20,
  mouthFrownRight: 0.20,
  mouthSmileLeft: 0.22,
  mouthSmileRight: 0.22,
  eyeBlinkLeft: 1,
  eyeBlinkRight: 1,
});

export const FACE_QA_STATES = Object.freeze([
  Object.freeze({ id: 'neutral', label: 'Neutral', weights: Object.freeze({}) }),
  Object.freeze({ id: 'blink', label: 'Blink', weights: Object.freeze({ eyeBlinkLeft: 1, eyeBlinkRight: 1 }) }),
  Object.freeze({ id: 'jaw-025', label: 'Jaw 0.025', weights: Object.freeze({ jawOpen: 0.025 }) }),
  Object.freeze({ id: 'jaw-05', label: 'Jaw 0.05', weights: Object.freeze({ jawOpen: 0.05 }) }),
  Object.freeze({ id: 'guarded', label: 'Guarded', weights: FACIAL_EXPRESSION_RECIPES.guarded }),
  Object.freeze({ id: 'distressed', label: 'Distressed', weights: FACIAL_EXPRESSION_RECIPES.distressed }),
]);

const SPEECH_PULSES = Object.freeze([
  Object.freeze({ duration: 0.34, active: 0.22, amplitude: 0.026 }),
  Object.freeze({ duration: 0.29, active: 0.18, amplitude: 0.019 }),
  Object.freeze({ duration: 0.47, active: 0.25, amplitude: 0.036 }),
  Object.freeze({ duration: 0.38, active: 0.20, amplitude: 0.023 }),
]);

function smoothstep(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function isSpeechIncompatible(name) {
  return SPEECH_INCOMPATIBLE.has(name) || String(name).startsWith('mouth');
}

export function safeFaceWeight(name, value) {
  const limit = FACE_WEIGHT_LIMITS[name] ?? 0.35;
  return Math.max(0, Math.min(limit, Number(value) || 0));
}

export function speechJawWeight(elapsed, appearanceSeed = 1) {
  const offset = Math.abs(Math.trunc(Number(appearanceSeed) || 1)) % SPEECH_PULSES.length;
  const ordered = SPEECH_PULSES.map((_, index) => SPEECH_PULSES[(index + offset) % SPEECH_PULSES.length]);
  const period = ordered.reduce((sum, pulse) => sum + pulse.duration, 0);
  let local = ((Math.max(0, Number(elapsed) || 0) % period) + period) % period;
  for (const pulse of ordered) {
    if (local > pulse.duration) {
      local -= pulse.duration;
      continue;
    }
    if (local >= pulse.active) return 0;
    const phase = local / pulse.active;
    const envelope = phase < 0.32
      ? smoothstep(phase / 0.32)
      : smoothstep((1 - phase) / 0.68);
    return Math.min(FACE_WEIGHT_LIMITS.jawOpen, pulse.amplitude * envelope);
  }
  return 0;
}

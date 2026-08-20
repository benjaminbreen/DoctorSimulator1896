// Legible at the consultation camera's distance: these read as expressions,
// not twitches. The QA grid renders the same recipes, so judge them there.
export const FACIAL_EXPRESSION_RECIPES = Object.freeze({
  guarded: Object.freeze({ browDownLeft: 0.26, browDownRight: 0.24, mouthPressLeft: 0.24, mouthPressRight: 0.22 }),
  distressed: Object.freeze({ browInnerUp: 0.5, mouthFrownLeft: 0.36, mouthFrownRight: 0.36, eyeSquintLeft: 0.14, eyeSquintRight: 0.14 }),
  fatigued: Object.freeze({ eyeBlinkLeft: 0.22, eyeBlinkRight: 0.22, browInnerUp: 0.18, mouthFrownLeft: 0.14, mouthFrownRight: 0.14 }),
  relieved: Object.freeze({ mouthSmileLeft: 0.38, mouthSmileRight: 0.38, cheekSquintLeft: 0.16, cheekSquintRight: 0.16 }),
  smiling: Object.freeze({ mouthSmileLeft: 0.46, mouthSmileRight: 0.46, cheekSquintLeft: 0.2, cheekSquintRight: 0.2, browInnerUp: 0.06 }),
  frowning: Object.freeze({ browDownLeft: 0.36, browDownRight: 0.36, mouthFrownLeft: 0.3, mouthFrownRight: 0.3, mouthPressLeft: 0.12, mouthPressRight: 0.12 }),
  discouraged: Object.freeze({ browInnerUp: 0.44, mouthFrownLeft: 0.26, mouthFrownRight: 0.26, eyeBlinkLeft: 0.13, eyeBlinkRight: 0.13 }),
  pained: Object.freeze({ browDownLeft: 0.3, browDownRight: 0.3, eyeSquintLeft: 0.3, eyeSquintRight: 0.3, noseSneerLeft: 0.14, noseSneerRight: 0.14, mouthStretchLeft: 0.18, mouthStretchRight: 0.18 }),
  anxious: Object.freeze({ browInnerUp: 0.4, eyeWideLeft: 0.16, eyeWideRight: 0.16, mouthPressLeft: 0.2, mouthPressRight: 0.2, mouthStretchLeft: 0.1, mouthStretchRight: 0.1 }),
  ashamed: Object.freeze({ browInnerUp: 0.3, eyeBlinkLeft: 0.18, eyeBlinkRight: 0.18, mouthPressLeft: 0.26, mouthPressRight: 0.26, mouthFrownLeft: 0.12, mouthFrownRight: 0.12 }),
});

export const FACIAL_GAZE_RECIPES = Object.freeze({
  away: Object.freeze({ eyeLookOutLeft: 0.18, eyeLookInRight: 0.18 }),
  down: Object.freeze({ eyeLookDownLeft: 0.10, eyeLookDownRight: 0.10 }),
});

const SPEECH_INCOMPATIBLE = new Set([
  'jawOpen', 'jawLeft', 'jawRight',
]);

export const FACE_WEIGHT_LIMITS = Object.freeze({
  jawOpen: 0.04,
  mouthFunnel: 0.08,
  mouthPucker: 0.08,
  mouthPressLeft: 0.32,
  mouthPressRight: 0.32,
  mouthFrownLeft: 0.42,
  mouthFrownRight: 0.42,
  mouthSmileLeft: 0.52,
  mouthSmileRight: 0.52,
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
  Object.freeze({ id: 'smiling', label: 'Smiling', weights: FACIAL_EXPRESSION_RECIPES.smiling }),
  Object.freeze({ id: 'frowning', label: 'Frowning', weights: FACIAL_EXPRESSION_RECIPES.frowning }),
  Object.freeze({ id: 'discouraged', label: 'Discouraged', weights: FACIAL_EXPRESSION_RECIPES.discouraged }),
  Object.freeze({ id: 'pained', label: 'Pained', weights: FACIAL_EXPRESSION_RECIPES.pained }),
  Object.freeze({ id: 'anxious', label: 'Anxious', weights: FACIAL_EXPRESSION_RECIPES.anxious }),
  Object.freeze({ id: 'ashamed', label: 'Ashamed', weights: FACIAL_EXPRESSION_RECIPES.ashamed }),
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
  const id = String(name);
  // Keep the emotional corners of the mouth visible while the restrained jaw
  // envelope runs. Other mouth-shape morphs would compete with speech and are
  // therefore suppressed until the patient settles.
  if (id.startsWith('mouthSmile') || id.startsWith('mouthFrown')) return false;
  return SPEECH_INCOMPATIBLE.has(name) || id.startsWith('mouth');
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

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

// The fitted head has measured mouth and lid shapes. Its expressions can
// travel farther than the older cohort meshes without widening their limits.
export const MODULAR_EXPRESSION_RECIPES = Object.freeze({
  guarded: { browDownLeft: .55, browDownRight: .50, mouthPressLeft: .38, mouthPressRight: .34, eyeSquintLeft: .18, eyeSquintRight: .15 },
  distressed: { browInnerUp: .85, browDownLeft: .12, browDownRight: .12, mouthFrownLeft: .65, mouthFrownRight: .60, eyeSquintLeft: .25, eyeSquintRight: .20 },
  fatigued: { eyeBlinkLeft: .38, eyeBlinkRight: .35, browInnerUp: .22, mouthFrownLeft: .22, mouthFrownRight: .20 },
  relieved: { mouthSmileLeft: .36, mouthSmileRight: .34, cheekSquintLeft: .45, cheekSquintRight: .42, eyeSquintLeft: .30, eyeSquintRight: .28, browInnerUp: .12 },
  smiling: { mouthSmileLeft: .62, mouthSmileRight: .58, cheekSquintLeft: .60, cheekSquintRight: .56, eyeSquintLeft: .40, eyeSquintRight: .37, browInnerUp: .16 },
  frowning: { browDownLeft: .80, browDownRight: .76, mouthFrownLeft: .58, mouthFrownRight: .54, mouthPressLeft: .20, mouthPressRight: .20, eyeSquintLeft: .25, eyeSquintRight: .23 },
  discouraged: { browInnerUp: .65, mouthFrownLeft: .48, mouthFrownRight: .45, eyeBlinkLeft: .18, eyeBlinkRight: .18 },
  pained: { browDownLeft: .65, browDownRight: .60, eyeSquintLeft: .80, eyeSquintRight: .75, noseSneerLeft: .40, noseSneerRight: .35, mouthStretchLeft: .35, mouthStretchRight: .30 },
  anxious: { browInnerUp: .72, browDownLeft: .15, browDownRight: .15, eyeWideLeft: .75, eyeWideRight: .70, mouthPressLeft: .22, mouthPressRight: .22, mouthStretchLeft: .28, mouthStretchRight: .25 },
  ashamed: { browInnerUp: .48, eyeBlinkLeft: .30, eyeBlinkRight: .28, mouthPressLeft: .40, mouthPressRight: .37, mouthFrownLeft: .20, mouthFrownRight: .18 },
});

const SPEECH_INCOMPATIBLE = new Set([
  'jawOpen', 'jawLeft', 'jawRight',
]);

export const FACE_WEIGHT_LIMITS = Object.freeze({
  jawOpen: 0.04,
  mouthFunnel: 0.08,
  mouthPucker: 0.08,
  speechOpen: 0.35,
  speechWide: 0.35,
  speechRound: 0.35,
  mouthPressLeft: 0.32,
  mouthPressRight: 0.32,
  mouthFrownLeft: 0.42,
  mouthFrownRight: 0.42,
  mouthSmileLeft: 0.52,
  mouthSmileRight: 0.52,
  eyeBlinkLeft: 1,
  eyeBlinkRight: 1,
});

export const MODULAR_FACE_WEIGHT_LIMITS = Object.freeze({
  ...FACE_WEIGHT_LIMITS,
  browInnerUp: .9, browDownLeft: .85, browDownRight: .85,
  eyeWideLeft: .8, eyeWideRight: .8, eyeSquintLeft: .85, eyeSquintRight: .85,
  cheekSquintLeft: .75, cheekSquintRight: .75,
  mouthSmileLeft: .85, mouthSmileRight: .85, mouthFrownLeft: .7, mouthFrownRight: .7,
  mouthPressLeft: .45, mouthPressRight: .45, mouthStretchLeft: .4, mouthStretchRight: .4,
  noseSneerLeft: .45, noseSneerRight: .45,
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

export function isSpeechIncompatible(name, modular = false) {
  const id = String(name);
  // Keep the emotional corners of the mouth visible while the restrained jaw
  // envelope runs. Other mouth-shape morphs would compete with speech and are
  // therefore suppressed until the patient settles.
  if (id.startsWith('mouthSmile') || id.startsWith('mouthFrown')) return false;
  if (modular && id.startsWith('mouthStretch')) return false;
  return SPEECH_INCOMPATIBLE.has(name) || id.startsWith('mouth') || id.startsWith('speech');
}

export function expressionFaceWeights(expression, modular = false, speaking = false) {
  const recipe = (modular ? MODULAR_EXPRESSION_RECIPES : FACIAL_EXPRESSION_RECIPES)[expression] || {};
  if (!speaking) return recipe;
  return Object.fromEntries(Object.entries(recipe)
    .filter(([name]) => !isSpeechIncompatible(name, modular))
    .map(([name, value]) => [name, modular && name.startsWith('mouth') ? value * (name.startsWith('mouthSmile') ? .72 : .82) : value]));
}

export function safeFaceWeight(name, value, modular = false) {
  const limit = (modular ? MODULAR_FACE_WEIGHT_LIMITS : FACE_WEIGHT_LIMITS)[name] ?? 0.35;
  return Math.max(0, Math.min(limit, Number(value) || 0));
}

function speechPulse(elapsed, appearanceSeed) {
  const offset = Math.abs(Math.trunc(Number(appearanceSeed) || 1)) % SPEECH_PULSES.length;
  const ordered = SPEECH_PULSES.map((_, index) => SPEECH_PULSES[(index + offset) % SPEECH_PULSES.length]);
  const period = ordered.reduce((sum, pulse) => sum + pulse.duration, 0);
  let local = ((Math.max(0, Number(elapsed) || 0) % period) + period) % period;
  for (const [index, pulse] of ordered.entries()) {
    if (local > pulse.duration) {
      local -= pulse.duration;
      continue;
    }
    if (local >= pulse.active) return { weight: 0, index: (index+offset) % ordered.length };
    const phase = local / pulse.active;
    const envelope = phase < 0.32
      ? smoothstep(phase / 0.32)
      : smoothstep((1 - phase) / 0.68);
    return { weight: Math.min(FACE_WEIGHT_LIMITS.jawOpen, pulse.amplitude * envelope), index: (index+offset) % ordered.length };
  }
  return { weight: 0, index: 0 };
}

export function speechJawWeight(elapsed, appearanceSeed = 1) {
  return speechPulse(elapsed, appearanceSeed).weight;
}

export function speechFaceWeights(elapsed, appearanceSeed = 1) {
  const { weight, index } = speechPulse(elapsed, appearanceSeed);
  const local = Math.max(0, Number(elapsed) || 0) % 7.1;
  const phrase = [[0,2.1],[2.6,4.4],[5.0,6.2]].find(([start,end]) => local >= start && local < end);
  const envelope = phrase ? smoothstep((local-phrase[0])/.10)*smoothstep((phrase[1]-local)/.14) : 0;
  const amount = weight / FACE_WEIGHT_LIMITS.jawOpen*envelope;
  return {
    speechOpen: amount*.31,
    speechWide: amount*([.18, 0, .08, .12][index]),
    speechRound: amount*([0, .23, .06, 0][index]),
  };
}

export function blinkFaceWeights(elapsed, seed = 1) {
  const intervals = [3.7,5.1,4.4,6.0];
  const offset = Math.abs(Math.trunc(Number(seed) || 1)) % intervals.length;
  let local = Math.max(0, Number(elapsed) || 0) % intervals.reduce((a,b) => a+b, 0);
  for (let i=0;i<intervals.length;i++) {
    const interval = intervals[(i+offset)%intervals.length];
    if (local >= interval) { local -= interval; continue; }
    const phase = local-(interval-.20);
    const amount = delay => {
      const t = phase-delay;
      if (t < 0 || t > .20) return 0;
      if (t < .05) return smoothstep(t/.05);
      if (t < .085) return 1;
      return smoothstep((.20-t)/.115);
    };
    return {eyeBlinkLeft:amount(0),eyeBlinkRight:amount(.005)};
  }
  return {eyeBlinkLeft:0,eyeBlinkRight:0};
}

export function blinkEyelids(weights, blink) {
  const result = {};
  for (const side of ['Left','Right']) {
    const amount = blink['eyeBlink'+side] || 0;
    result['eyeBlink'+side] = 1-(1-(weights['eyeBlink'+side] || 0))*(1-amount);
    // A wide-eye expression must yield while the lids close completely.
    for (const name of ['eyeWide','eyeSquint']) result[name+side] = (weights[name+side] || 0)*(1-amount);
  }
  return result;
}

export function idleGazeWeights(elapsed, seed = 1, gaze = 'doctor', speaking = false) {
  if (gaze !== 'doctor') return {};
  const period = 9.3+(Math.abs(Number(seed)||1)%7)*.17;
  const local = Math.max(0,elapsed)%period;
  const amount = smoothstep((local-3.1)/.20)*smoothstep((4.6-local)/.35)*(speaking ? .10 : .16);
  if (amount <= 0) return {};
  const right = (Math.floor(Math.max(0,elapsed)/period)+Math.abs(Math.trunc(Number(seed)||1)))%2;
  return right ? {eyeLookOutLeft:amount,eyeLookInRight:amount} : {eyeLookInLeft:amount,eyeLookOutRight:amount};
}

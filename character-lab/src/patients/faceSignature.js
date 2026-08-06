import { createRandom } from './random.js';

export const FACE_UNIT_NAMES = Object.freeze([
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'eyeBlinkLeft', 'eyeBlinkRight',
  'eyeLookDownLeft', 'eyeLookDownRight', 'eyeLookInLeft', 'eyeLookInRight',
  'eyeLookOutLeft', 'eyeLookOutRight', 'eyeLookUpLeft', 'eyeLookUpRight',
  'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'jawForward',
  'jawLeft', 'jawOpen', 'jawRight', 'mouthClose', 'mouthDimpleLeft',
  'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft',
  'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthPressLeft', 'mouthPressRight',
  'mouthPucker', 'mouthRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower',
  'mouthShrugUpper', 'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft',
  'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft',
  'noseSneerRight', 'tongueOut',
]);

export const FACE_UNIT_PAIRS = Object.freeze([
  ['browDownLeft', 'browDownRight'], ['browOuterUpLeft', 'browOuterUpRight'],
  ['cheekSquintLeft', 'cheekSquintRight'], ['eyeBlinkLeft', 'eyeBlinkRight'],
  ['eyeSquintLeft', 'eyeSquintRight'], ['eyeWideLeft', 'eyeWideRight'],
  ['mouthDimpleLeft', 'mouthDimpleRight'], ['mouthFrownLeft', 'mouthFrownRight'],
  ['mouthLowerDownLeft', 'mouthLowerDownRight'], ['mouthPressLeft', 'mouthPressRight'],
  ['mouthSmileLeft', 'mouthSmileRight'], ['mouthStretchLeft', 'mouthStretchRight'],
  ['mouthUpperUpLeft', 'mouthUpperUpRight'], ['noseSneerLeft', 'noseSneerRight'],
]);

const roundWeight = (value) => Number(Math.min(0.72, Math.max(0, value)).toFixed(3));

/**
 * Build a coherent neutral facial signature from the 52 exported MPFB units.
 * Paired traits are bilateral 75% of the time, but never perfectly mirrored.
 * Mutually exclusive action families are selected together to prevent the
 * randomizer from combining a smile, frown, lip press, and jaw opening at once.
 */
export function generateRestingFaceSignature(seed, { dramatic = false } = {}) {
  const random = createRandom(seed, dramatic ? 'face-signature.surprise' : 'face-signature');
  const weights = Object.fromEntries(FACE_UNIT_NAMES.map((name) => [name, 0]));
  // Generated patients receive a subtle habitual set. The debugger's
  // Surprise me mode deliberately explores the full expressive range.
  const strength = dramatic ? 1.16 : 0.62;

  const pair = (left, right, maximum) => {
    const base = random.between(maximum * 0.16, maximum) * strength;
    if (random.chance(0.75)) {
      const difference = base * random.between(0.025, 0.11);
      const direction = random.chance(0.5) ? 1 : -1;
      weights[left] = roundWeight(base + difference * direction);
      weights[right] = roundWeight(base - difference * direction);
    } else {
      const quieter = base * random.between(0.16, 0.62);
      const stronger = base * random.between(0.82, 1.12);
      [weights[left], weights[right]] = random.chance(0.5)
        ? [roundWeight(quieter), roundWeight(stronger)]
        : [roundWeight(stronger), roundWeight(quieter)];
    }
  };

  const pairFamilies = {
    browDown: ['browDownLeft', 'browDownRight', 0.24],
    browOuterUp: ['browOuterUpLeft', 'browOuterUpRight', 0.22],
    eyeBlink: ['eyeBlinkLeft', 'eyeBlinkRight', 0.16],
    eyeSquint: ['eyeSquintLeft', 'eyeSquintRight', 0.21],
    eyeWide: ['eyeWideLeft', 'eyeWideRight', 0.18],
    mouthDimple: ['mouthDimpleLeft', 'mouthDimpleRight', 0.29],
    mouthFrown: ['mouthFrownLeft', 'mouthFrownRight', 0.36],
    mouthPress: ['mouthPressLeft', 'mouthPressRight', 0.28],
    mouthSmile: ['mouthSmileLeft', 'mouthSmileRight', 0.28],
    mouthStretch: ['mouthStretchLeft', 'mouthStretchRight', 0.60],
  };
  const activate = (name) => pair(...pairFamilies[name]);

  const brow = random.pick(['browDown', 'browDown', 'browOuterUp', 'browOuterUp', 'neutral']);
  if (brow !== 'neutral') activate(brow);
  if (brow !== 'browDown' && random.chance(0.38)) weights.browInnerUp = roundWeight(random.between(0.025, 0.16) * strength);

  const aperture = random.pick(['eyeBlink', 'eyeSquint', 'eyeWide', 'neutral', 'neutral']);
  if (aperture !== 'neutral') activate(aperture);
  if (aperture !== 'eyeWide' && random.chance(0.42)) pair('cheekSquintLeft', 'cheekSquintRight', 0.16);

  const mouth = random.pick([
    'mouthDimple', 'mouthFrown', 'mouthPress', 'mouthSmile', 'mouthStretch',
    'mouthStretch', 'neutral',
  ]);
  if (mouth !== 'neutral') activate(mouth);
  if (random.chance(0.34)) pair('mouthLowerDownLeft', 'mouthLowerDownRight', 0.14);
  if (random.chance(0.30)) pair('mouthUpperUpLeft', 'mouthUpperUpRight', 0.13);
  if (random.chance(0.28)) pair('noseSneerLeft', 'noseSneerRight', 0.12);

  const gaze = random.pick(['neutral', 'neutral', 'left', 'right', 'up', 'down', 'converge', 'diverge']);
  const gazeWeight = roundWeight(random.between(0.018, dramatic ? 0.12 : 0.075));
  if (gaze === 'left') {
    weights.eyeLookOutLeft = gazeWeight; weights.eyeLookInRight = roundWeight(gazeWeight * random.between(0.9, 1.1));
  } else if (gaze === 'right') {
    weights.eyeLookInLeft = gazeWeight; weights.eyeLookOutRight = roundWeight(gazeWeight * random.between(0.9, 1.1));
  } else if (gaze === 'up' || gaze === 'down') {
    const prefix = gaze === 'up' ? 'eyeLookUp' : 'eyeLookDown';
    weights[`${prefix}Left`] = gazeWeight; weights[`${prefix}Right`] = roundWeight(gazeWeight * random.between(0.9, 1.1));
  } else if (gaze === 'converge' || gaze === 'diverge') {
    const prefix = gaze === 'converge' ? 'eyeLookIn' : 'eyeLookOut';
    weights[`${prefix}Left`] = roundWeight(gazeWeight * 0.72);
    weights[`${prefix}Right`] = roundWeight(gazeWeight * random.between(0.58, 0.84));
  }

  const jaw = random.pick(['neutral', 'neutral', 'forward', 'open', 'left', 'right']);
  if (jaw === 'forward') weights.jawForward = roundWeight(random.between(0.018, 0.08) * strength);
  else if (jaw === 'open') weights.jawOpen = roundWeight(random.between(0.012, 0.065) * strength);
  else if (jaw === 'left' || jaw === 'right') weights[`jaw${jaw[0].toUpperCase()}${jaw.slice(1)}`] = roundWeight(random.between(0.015, 0.07) * strength);

  let lipForm = random.pick(['neutral', 'neutral', 'close', 'funnel', 'pucker', 'roll', 'shrug']);
  if (jaw === 'open' && lipForm === 'close') lipForm = 'neutral';
  if (lipForm === 'close') weights.mouthClose = roundWeight(random.between(0.02, 0.12) * strength);
  else if (lipForm === 'funnel') weights.mouthFunnel = roundWeight(random.between(0.02, 0.12) * strength);
  else if (lipForm === 'pucker') weights.mouthPucker = roundWeight(random.between(0.02, 0.11) * strength);
  else if (lipForm === 'roll') {
    weights.mouthRollLower = roundWeight(random.between(0.018, 0.09) * strength);
    weights.mouthRollUpper = roundWeight(random.between(0.018, 0.09) * strength);
  } else if (lipForm === 'shrug') {
    weights.mouthShrugLower = roundWeight(random.between(0.018, 0.10) * strength);
    weights.mouthShrugUpper = roundWeight(random.between(0.018, 0.10) * strength);
  }
  if (random.chance(0.23)) {
    const side = random.chance(0.5) ? 'Left' : 'Right';
    weights[`mouth${side}`] = roundWeight(random.between(0.018, 0.08) * strength);
  }

  return weights;
}

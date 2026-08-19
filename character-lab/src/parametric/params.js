// Parameter schema, period palettes, and archetype presets for the
// parametric 1896 crowd figure. The lab panel is generated from this table.

export const SKIN_TONES = {
  fair: '#eac3a9', light: '#dfb392', medium: '#c99873',
  olive: '#b58767', brown: '#8a5f43', deep: '#5f4030',
};

export const HAIR_COLORS = {
  black: '#211a15', darkBrown: '#33241a', brown: '#4a3220', chestnut: '#5d3d24',
  auburn: '#6e3b22', blond: '#a08350', grey: '#8d8578', white: '#cfc9bd',
};

export const EYE_COLORS = {
  brown: '#4a2f1d', hazel: '#6b4a26', grey: '#7a8288', blue: '#5b7a94', green: '#5d6e4a',
};

// Garment colors grouped so class archetypes can draw from period-plausible sets.
export const CLOTH_COLORS = {
  black: '#211f1c', charcoal: '#2d2a26', darkGrey: '#453f39', grey: '#5d564d',
  umber: '#4a3527', walnut: '#5b4632', tan: '#8a7358', corduroy: '#6b5637',
  navy: '#232c38', indigo: '#3a4a5c', chambray: '#67798a', slate: '#4a4e52',
  bottle: '#2e3d31', olive: '#4f5138', burgundy: '#4f2a30', plum: '#43304a',
  cream: '#e8e0cf', ivory: '#efe7d6', dove: '#b9b2a4', fawn: '#a79680',
  lilac: '#8d7f96', rose: '#a96b6e', golden: '#b08d4f', rust: '#7c4a2c',
};

export const MALE_OUTFITS = ['shirtsleeves', 'workJacket', 'sackSuit', 'frockCoat'];
export const FEMALE_OUTFITS = ['workDress', 'shirtwaist', 'walkingDress', 'visitingDress'];
export const MALE_HATS = ['none', 'flatCap', 'bowler', 'homburg', 'topHat', 'boater'];
export const FEMALE_HATS = ['none', 'straw', 'wideBrim', 'toque', 'headscarf'];
export const MALE_HAIR = ['shortSide', 'slicked', 'curly', 'cropped', 'balding'];
export const FEMALE_HAIR = ['lowBun', 'gibson', 'partedBun', 'crown'];
export const FACIAL_HAIR = ['clean', 'moustache', 'walrus', 'fullBeard', 'muttonChops', 'goatee'];
export const FABRIC_PATTERNS = ['plain', 'stripe', 'check', 'tweed'];
export const ANIM_MODES = ['idle', 'walk', 'talk'];

export const PARAM_GROUPS = [
  {
    id: 'identity', label: 'Identity',
    params: [
      { id: 'sex', label: 'Sex', type: 'select', options: ['male', 'female'] },
      { id: 'socialClass', label: 'Class', type: 'select', options: ['laborer', 'trade', 'middle', 'upper'] },
      { id: 'age', label: 'Age', type: 'slider', min: 18, max: 78, step: 1 },
    ],
  },
  {
    id: 'body', label: 'Body',
    params: [
      { id: 'height', label: 'Height (m)', type: 'slider', min: 1.45, max: 1.98, step: 0.01 },
      { id: 'build', label: 'Build', type: 'slider', min: 0, max: 1, step: 0.01 },
      { id: 'shoulders', label: 'Shoulders', type: 'slider', min: 0.82, max: 1.2, step: 0.01 },
      { id: 'waist', label: 'Waist', type: 'slider', min: 0.7, max: 1.25, step: 0.01 },
      { id: 'hips', label: 'Hips', type: 'slider', min: 0.82, max: 1.3, step: 0.01 },
      { id: 'posture', label: 'Stoop', type: 'slider', min: 0, max: 1, step: 0.01 },
      { id: 'headSize', label: 'Head size', type: 'slider', min: 0.9, max: 1.1, step: 0.01 },
    ],
  },
  {
    id: 'face', label: 'Face',
    params: [
      { id: 'faceWidth', label: 'Face width', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'faceLength', label: 'Face length', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'jawWidth', label: 'Jaw width', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'chin', label: 'Chin', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'cheekbones', label: 'Cheekbones', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'gauntness', label: 'Gauntness', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'noseSize', label: 'Nose size', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'noseWidth', label: 'Nose width', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'noseBridge', label: 'Nose bridge', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'eyeSize', label: 'Eye size', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'eyeSpacing', label: 'Eye spacing', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'browWeight', label: 'Brow weight', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'mouthWidth', label: 'Mouth width', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'lipFullness', label: 'Lip fullness', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'earSize', label: 'Ear size', type: 'slider', min: -1, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'coloring', label: 'Coloring',
    params: [
      { id: 'skinTone', label: 'Skin', type: 'select', options: Object.keys(SKIN_TONES) },
      { id: 'hairColor', label: 'Hair', type: 'select', options: Object.keys(HAIR_COLORS) },
      { id: 'eyeColor', label: 'Eyes', type: 'select', options: Object.keys(EYE_COLORS) },
    ],
  },
  {
    id: 'grooming', label: 'Grooming',
    params: [
      { id: 'hairStyle', label: 'Hair style', type: 'select', options: MALE_HAIR, optionsBySex: { male: MALE_HAIR, female: FEMALE_HAIR } },
      { id: 'facialHair', label: 'Facial hair', type: 'select', options: FACIAL_HAIR, maleOnly: true },
    ],
  },
  {
    id: 'wardrobe', label: 'Wardrobe',
    params: [
      { id: 'outfit', label: 'Outfit', type: 'select', options: MALE_OUTFITS, optionsBySex: { male: MALE_OUTFITS, female: FEMALE_OUTFITS } },
      { id: 'hat', label: 'Hat', type: 'select', options: MALE_HATS, optionsBySex: { male: MALE_HATS, female: FEMALE_HATS } },
      { id: 'coatColor', label: 'Coat / bodice', type: 'select', options: Object.keys(CLOTH_COLORS) },
      { id: 'legColor', label: 'Trousers / skirt', type: 'select', options: Object.keys(CLOTH_COLORS) },
      { id: 'accentColor', label: 'Accent', type: 'select', options: Object.keys(CLOTH_COLORS) },
      { id: 'fabricPattern', label: 'Fabric', type: 'select', options: FABRIC_PATTERNS },
      { id: 'wear', label: 'Wear & fade', type: 'slider', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    id: 'performance', label: 'Performance',
    params: [
      { id: 'animMode', label: 'Motion', type: 'select', options: ANIM_MODES },
      { id: 'walkSpeed', label: 'Walk speed', type: 'slider', min: 0.4, max: 1.6, step: 0.01 },
      { id: 'stride', label: 'Stride', type: 'slider', min: 0.4, max: 1.5, step: 0.01 },
      { id: 'armSwing', label: 'Arm swing', type: 'slider', min: 0, max: 1.6, step: 0.01 },
      { id: 'bounce', label: 'Bounce', type: 'slider', min: 0, max: 1.5, step: 0.01 },
      { id: 'energy', label: 'Idle energy', type: 'slider', min: 0, max: 1.5, step: 0.01 },
      { id: 'expression', label: 'Expression', type: 'slider', min: -1, max: 1, step: 0.01 },
      { id: 'blinkRate', label: 'Blink rate', type: 'slider', min: 0, max: 2, step: 0.01 },
      { id: 'gazeWander', label: 'Gaze wander', type: 'slider', min: 0, max: 1.5, step: 0.01 },
    ],
  },
];

export function defaultParams() {
  return {
    sex: 'male', socialClass: 'middle', age: 38,
    height: 1.7, build: 0.39, shoulders: 0.82, waist: 1.18, hips: 1.22, posture: 0.06, headSize: 0.99,
    faceWidth: 0, faceLength: 0, jawWidth: 0, chin: 0, cheekbones: 0, gauntness: 0,
    noseSize: 0, noseWidth: 0, noseBridge: 0, eyeSize: 0, eyeSpacing: 0,
    browWeight: 0, mouthWidth: 0, lipFullness: 0, earSize: 0,
    skinTone: 'light', hairColor: 'brown', eyeColor: 'brown',
    hairStyle: 'shortSide', facialHair: 'moustache',
    outfit: 'sackSuit', hat: 'bowler',
    coatColor: 'charcoal', legColor: 'darkGrey', accentColor: 'golden',
    fabricPattern: 'plain', wear: 0.15,
    animMode: 'walk', walkSpeed: 1, stride: 1, armSwing: 1, bounce: 1,
    energy: 1, expression: 0, blinkRate: 1, gazeWander: 1,
  };
}

// mulberry32, matching the seeding style used elsewhere in the repo.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARCHETYPES = {
  male: {
    laborer: {
      outfit: ['shirtsleeves', 'shirtsleeves', 'workJacket'], hat: ['flatCap', 'flatCap', 'none', 'boater'],
      coat: ['corduroy', 'umber', 'walnut', 'indigo', 'slate', 'chambray'], leg: ['umber', 'darkGrey', 'corduroy', 'olive', 'walnut'],
      accent: ['rust', 'dove', 'fawn', 'burgundy'], pattern: ['plain', 'plain', 'tweed', 'stripe'],
      wear: [0.45, 0.95], build: [0.3, 0.85], facialHair: ['moustache', 'walrus', 'clean', 'fullBeard'],
      hairStyle: ['cropped', 'shortSide', 'curly'],
    },
    trade: {
      outfit: ['workJacket', 'sackSuit'], hat: ['bowler', 'flatCap', 'boater'],
      coat: ['darkGrey', 'walnut', 'slate', 'bottle', 'navy'], leg: ['darkGrey', 'grey', 'walnut', 'navy'],
      accent: ['burgundy', 'golden', 'dove', 'bottle'], pattern: ['plain', 'check', 'tweed', 'stripe'],
      wear: [0.2, 0.6], build: [0.25, 0.8], facialHair: ['moustache', 'moustache', 'walrus', 'goatee', 'clean'],
      hairStyle: ['shortSide', 'slicked', 'curly'],
    },
    middle: {
      outfit: ['sackSuit', 'sackSuit', 'frockCoat'], hat: ['bowler', 'bowler', 'homburg', 'boater'],
      coat: ['charcoal', 'navy', 'darkGrey', 'bottle', 'black'], leg: ['darkGrey', 'charcoal', 'grey', 'navy'],
      accent: ['golden', 'burgundy', 'plum', 'dove'], pattern: ['plain', 'plain', 'stripe', 'check'],
      wear: [0.05, 0.35], build: [0.3, 0.75], facialHair: ['moustache', 'moustache', 'clean', 'goatee', 'muttonChops'],
      hairStyle: ['shortSide', 'slicked', 'balding'],
    },
    upper: {
      outfit: ['frockCoat', 'frockCoat', 'sackSuit'], hat: ['topHat', 'topHat', 'homburg'],
      coat: ['black', 'charcoal', 'navy'], leg: ['charcoal', 'darkGrey', 'black'],
      accent: ['golden', 'ivory', 'plum', 'burgundy'], pattern: ['plain', 'plain', 'stripe'],
      wear: [0, 0.15], build: [0.25, 0.7], facialHair: ['moustache', 'clean', 'muttonChops', 'goatee'],
      hairStyle: ['slicked', 'shortSide', 'balding'],
    },
  },
  female: {
    laborer: {
      outfit: ['workDress', 'workDress', 'shirtwaist'], hat: ['headscarf', 'none', 'straw'],
      coat: ['dove', 'fawn', 'chambray', 'slate', 'rose'], leg: ['umber', 'darkGrey', 'slate', 'olive', 'walnut'],
      accent: ['cream', 'dove', 'rust'], pattern: ['plain', 'plain', 'stripe', 'check'],
      wear: [0.4, 0.9], build: [0.25, 0.8], hairStyle: ['lowBun', 'partedBun'],
    },
    trade: {
      outfit: ['shirtwaist', 'shirtwaist', 'workDress'], hat: ['straw', 'none', 'toque'],
      coat: ['cream', 'ivory', 'chambray', 'dove', 'rose'], leg: ['navy', 'darkGrey', 'bottle', 'charcoal'],
      accent: ['burgundy', 'navy', 'bottle'], pattern: ['plain', 'stripe', 'plain'],
      wear: [0.15, 0.5], build: [0.2, 0.7], hairStyle: ['gibson', 'lowBun', 'partedBun'],
    },
    middle: {
      outfit: ['walkingDress', 'shirtwaist', 'walkingDress'], hat: ['wideBrim', 'toque', 'straw'],
      coat: ['bottle', 'burgundy', 'navy', 'plum', 'cream'], leg: ['bottle', 'burgundy', 'navy', 'plum', 'charcoal'],
      accent: ['ivory', 'golden', 'dove'], pattern: ['plain', 'plain', 'stripe'],
      wear: [0.05, 0.3], build: [0.2, 0.65], hairStyle: ['gibson', 'partedBun', 'crown'],
    },
    upper: {
      outfit: ['visitingDress', 'walkingDress'], hat: ['wideBrim', 'wideBrim', 'toque'],
      coat: ['plum', 'burgundy', 'bottle', 'golden', 'lilac', 'ivory'], leg: ['plum', 'burgundy', 'bottle', 'golden', 'lilac', 'ivory'],
      accent: ['ivory', 'golden', 'black'], pattern: ['plain'],
      wear: [0, 0.1], build: [0.15, 0.6], hairStyle: ['gibson', 'crown'],
    },
  },
};

function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }
function range(rand, [lo, hi]) { return lo + rand() * (hi - lo); }

export function rollParams(seed, { sex = null, socialClass = null } = {}) {
  const rand = seededRandom(seed);
  const p = defaultParams();
  p.sex = sex || (rand() < 0.5 ? 'male' : 'female');
  p.socialClass = socialClass || pick(rand, ['laborer', 'laborer', 'trade', 'trade', 'middle', 'middle', 'upper']);
  const arch = ARCHETYPES[p.sex][p.socialClass];

  p.age = Math.round(18 + rand() * rand() * 55);
  const heightBase = p.sex === 'male' ? 1.73 : 1.6;
  p.height = heightBase + (rand() - 0.5) * 0.17;
  p.build = range(rand, arch.build);
  p.shoulders = (p.sex === 'male' ? 0.9 : 0.85) + (rand() - 0.5) * 0.14;
  p.waist = p.sex === 'female'
    ? (p.socialClass === 'laborer' ? 0.98 : 0.86) + (rand() - 0.5) * 0.12
    : 1.06 + (rand() - 0.5) * 0.16 + p.build * 0.18;
  p.hips = (p.sex === 'female' ? 1.12 : 1.04) + (rand() - 0.5) * 0.14;
  p.posture = Math.max(0, (p.age - 40) / 80) + rand() * 0.18;
  p.headSize = 0.96 + rand() * 0.08;

  for (const id of ['faceWidth', 'faceLength', 'jawWidth', 'chin', 'cheekbones', 'noseSize',
    'noseWidth', 'noseBridge', 'eyeSize', 'eyeSpacing', 'browWeight', 'mouthWidth',
    'lipFullness', 'earSize']) {
    p[id] = (rand() + rand() - 1) * 0.75;
  }
  p.gauntness = (rand() + rand() - 1) * 0.5 + (p.age > 55 ? 0.25 : 0) + (p.socialClass === 'laborer' ? 0.15 : 0) - p.build * 0.4;

  p.skinTone = pick(rand, Object.keys(SKIN_TONES));
  const grey = p.age > 62 ? ['grey', 'white', 'grey'] : p.age > 48 ? ['grey', 'darkBrown', 'brown', 'black'] : ['black', 'darkBrown', 'brown', 'chestnut', 'auburn', 'blond'];
  p.hairColor = pick(rand, grey);
  p.eyeColor = pick(rand, Object.keys(EYE_COLORS));
  p.hairStyle = pick(rand, arch.hairStyle);
  p.facialHair = p.sex === 'male' ? pick(rand, arch.facialHair) : 'clean';

  p.outfit = pick(rand, arch.outfit);
  p.hat = pick(rand, arch.hat);
  p.coatColor = pick(rand, arch.coat);
  p.legColor = pick(rand, arch.leg);
  p.accentColor = pick(rand, arch.accent);
  p.fabricPattern = pick(rand, arch.pattern);
  p.wear = range(rand, arch.wear);

  p.walkSpeed = 0.85 + rand() * 0.35;
  p.stride = 0.85 + rand() * 0.3;
  p.armSwing = 0.7 + rand() * 0.6;
  p.bounce = 0.7 + rand() * 0.6;
  p.energy = 0.6 + rand() * 0.8;
  p.expression = (rand() + rand() - 1) * 0.6;
  p.blinkRate = 0.7 + rand() * 0.6;
  p.gazeWander = 0.5 + rand() * 0.8;
  return p;
}

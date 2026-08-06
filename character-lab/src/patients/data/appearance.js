/** Safe correlated face archetypes and historically plausible presentation data. */

export const FACE_ARCHETYPES = [
  { id: 'fine-oval', weight: 15, headShape: 'oval', headWidth: -0.18, faceHeight: 0.22, headDepth: -0.06, jawWidth: -0.24, chinHeight: 0.18, chinProminence: 0.08, noseWidth: -0.22, noseLength: 0.28, noseVolume: -0.08, eyeSize: -0.08, eyeSpacing: -0.04, mouthWidth: -0.18, lipFullness: -0.08, cheekVolume: -0.12, cheekboneProminence: 0.22 },
  { id: 'soft-round', weight: 14, headShape: 'round', headWidth: 0.28, faceHeight: -0.24, headDepth: 0.15, jawWidth: 0.18, chinHeight: -0.20, chinProminence: -0.14, noseWidth: 0.14, noseLength: -0.18, noseVolume: 0.08, eyeSize: 0.16, eyeSpacing: 0.10, mouthWidth: 0.12, lipFullness: 0.16, cheekVolume: 0.30, cheekboneProminence: -0.12 },
  { id: 'broad-square', weight: 11, headShape: 'square', headWidth: 0.20, faceHeight: 0.06, headDepth: 0.12, jawWidth: 0.38, chinHeight: -0.04, chinProminence: 0.24, noseWidth: 0.18, noseLength: 0.10, noseVolume: 0.20, eyeSize: -0.14, eyeSpacing: 0.08, mouthWidth: 0.24, lipFullness: -0.10, cheekVolume: -0.12, cheekboneProminence: 0.18 },
  { id: 'long-angular', weight: 13, headShape: 'rectangular', headWidth: -0.02, faceHeight: 0.34, headDepth: 0.08, jawWidth: 0.16, chinHeight: 0.24, chinProminence: 0.18, noseWidth: 0.02, noseLength: 0.34, noseVolume: 0.16, eyeSize: -0.12, eyeSpacing: -0.08, mouthWidth: 0.02, lipFullness: -0.14, cheekVolume: -0.20, cheekboneProminence: 0.28 },
  { id: 'high-cheeked', weight: 12, headShape: 'diamond', headWidth: -0.08, faceHeight: 0.12, headDepth: -0.03, jawWidth: -0.28, chinHeight: 0.12, chinProminence: 0.10, noseWidth: -0.10, noseLength: 0.12, noseVolume: -0.04, eyeSize: 0.08, eyeSpacing: 0.04, mouthWidth: -0.08, lipFullness: 0.10, cheekVolume: -0.16, cheekboneProminence: 0.42 },
  { id: 'strong-jaw', weight: 10, headShape: 'triangular', headWidth: 0.12, faceHeight: 0.10, headDepth: 0.02, jawWidth: 0.30, chinHeight: -0.08, chinProminence: 0.04, noseWidth: 0.22, noseLength: -0.04, noseVolume: 0.10, eyeSize: 0.02, eyeSpacing: 0.10, mouthWidth: 0.18, lipFullness: 0.04, cheekVolume: 0.12, cheekboneProminence: 0.02 },
  { id: 'tapered', weight: 12, headShape: 'invertedtriangular', headWidth: 0.18, faceHeight: 0.16, headDepth: -0.04, jawWidth: -0.36, chinHeight: 0.22, chinProminence: 0.06, noseWidth: -0.12, noseLength: 0.18, noseVolume: -0.10, eyeSize: 0.12, eyeSpacing: 0.06, mouthWidth: -0.12, lipFullness: 0.12, cheekVolume: -0.06, cheekboneProminence: 0.30 },
];

export const HAIR_STYLES = [
  { id: 'center-parted-bun', weight: 18, ageWeights: [1.12, 1.05, 0.96], classes: ['elite', 'affluent', 'comfortable', 'sponsored'] },
  { id: 'side-parted-bun', weight: 12, ageWeights: [1.12, 1.06, 0.78], classes: ['elite', 'affluent', 'comfortable'] },
  { id: 'low-bun', weight: 18, ageWeights: [0.92, 1.04, 1.20], classes: ['affluent', 'comfortable', 'sponsored'] },
  { id: 'coiled-bun', weight: 9, ageWeights: [0.72, 1.02, 1.28], classes: ['elite', 'affluent', 'comfortable'] },
  { id: 'loose-chignon', weight: 11, ageWeights: [1.24, 1.02, 0.68], classes: ['elite', 'affluent'] },
  { id: 'swept-back', weight: 10, ageWeights: [1.08, 1.04, 0.88], classes: ['affluent', 'comfortable', 'sponsored'] },
  { id: 'pompadour', weight: 5, ageWeights: [1.26, 0.72, 0.18], classes: ['elite', 'affluent'], maxAge: 48 },
  { id: 'braided-crown', weight: 5, ageWeights: [1.10, 1.0, 0.78], classes: ['comfortable', 'sponsored'] },
  { id: 'cropped-waves', weight: 3, ageWeights: [0.62, 0.88, 1.08], classes: ['elite', 'affluent', 'comfortable'] },
  { id: 'short-parted', weight: 2, ageWeights: [0.48, 0.80, 1.12], classes: ['elite', 'affluent', 'comfortable', 'sponsored'] },
];

export const OUTFIT_RULES = [
  { id: 'conservative-day', weight: 25, classes: ['elite', 'affluent', 'comfortable', 'sponsored'] },
  { id: 'fashionable-1896', weight: 18, classes: ['elite', 'affluent'], maxAge: 55 },
  { id: 'visiting-dress', weight: 17, classes: ['elite', 'affluent', 'comfortable'] },
  { id: 'working-day', weight: 20, classes: ['comfortable', 'sponsored'] },
  { id: 'mourning-dress', weight: 1, classes: ['elite', 'affluent', 'comfortable', 'sponsored'] },
];

export const DRESS_PALETTES = {
  sober: [
    ['#171525', '#4f4333'], ['#1b2731', '#806c4a'], ['#273326', '#6d5940'],
    ['#38253d', '#88705a'], ['#20201f', '#52504b'], ['#243d46', '#9b876b'],
  ],
  fashionable: [
    ['#462329', '#9a8060'], ['#493624', '#b0926b'], ['#203f49', '#aa8f68'],
    ['#384225', '#a58a63'], ['#4b2d4a', '#a88772'],
  ],
  working: [
    ['#2e3230', '#625b4b'], ['#303c43', '#716853'], ['#40372f', '#77644d'],
    ['#3d333e', '#746252'],
  ],
  mourning: [['#111111', '#34312e'], ['#171616', '#46413c']],
};

export const FACE_VALUE_IDS = [
  'headWidth', 'faceHeight', 'headDepth', 'noseWidth', 'noseLength', 'noseVolume',
  'jawWidth', 'chinHeight', 'chinProminence', 'eyeSize', 'eyeSpacing', 'mouthWidth',
  'lipFullness', 'cheekVolume', 'cheekboneProminence',
];

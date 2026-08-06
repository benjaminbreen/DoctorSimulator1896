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

/** Secondary landmark structure layered over the broad head archetypes. These
 * dimensions use MakeHuman's detailed targets and are intentionally general
 * anatomical correlations rather than ancestry labels. */
export const FACE_DETAIL_CENTERS = {
  'fine-oval': {
    headAngle: -0.08, headBackDepth: -0.05, noseDepth: 0.12, noseBridge: 0.18, noseCurve: -0.12,
    noseTipAngle: 0.08, nostrilWidth: -0.14, chinPrognathism: -0.02, eyeVerticalPosition: 0.08,
    eyeDepth: 0.10, eyeHeightInner: 0.02, eyeHeightCenter: 0.10, eyeHeightOuter: 0.04,
    epicanthus: -0.12, eyeFold: 0.14, browAngle: 0.12, mouthVerticalPosition: -0.04,
    mouthDepth: -0.05, cupidBow: 0.24, philtrumVolume: 0.12, cheekHeight: 0.18, cheekInnerVolume: -0.08,
  },
  'soft-round': {
    headAngle: 0.10, headBackDepth: 0.18, noseDepth: -0.12, noseBridge: -0.10, noseCurve: -0.08,
    noseTipAngle: 0.18, nostrilWidth: 0.12, chinPrognathism: -0.14, eyeVerticalPosition: 0.04,
    eyeDepth: -0.06, eyeHeightInner: 0.15, eyeHeightCenter: 0.20, eyeHeightOuter: 0.10,
    epicanthus: 0.05, eyeFold: -0.05, browAngle: -0.08, mouthVerticalPosition: 0.08,
    mouthDepth: 0.06, cupidBow: -0.04, philtrumVolume: -0.10, cheekHeight: -0.04, cheekInnerVolume: 0.18,
  },
  'broad-square': {
    headAngle: 0.15, headBackDepth: 0.10, noseDepth: 0.20, noseBridge: 0.12, noseCurve: 0.14,
    noseTipAngle: -0.08, nostrilWidth: 0.20, chinPrognathism: 0.18, eyeVerticalPosition: -0.08,
    eyeDepth: 0.14, eyeHeightInner: -0.08, eyeHeightCenter: -0.10, eyeHeightOuter: -0.04,
    epicanthus: -0.08, eyeFold: 0.06, browAngle: -0.12, mouthVerticalPosition: -0.08,
    mouthDepth: 0.14, cupidBow: -0.12, philtrumVolume: 0.12, cheekHeight: 0.08, cheekInnerVolume: -0.12,
  },
  'long-angular': {
    headAngle: -0.12, headBackDepth: 0.05, noseDepth: 0.22, noseBridge: 0.22, noseCurve: 0.20,
    noseTipAngle: -0.16, nostrilWidth: -0.04, chinPrognathism: 0.12, eyeVerticalPosition: 0.12,
    eyeDepth: 0.08, eyeHeightInner: -0.08, eyeHeightCenter: 0.02, eyeHeightOuter: -0.06,
    epicanthus: -0.06, eyeFold: 0.16, browAngle: 0.06, mouthVerticalPosition: -0.16,
    mouthDepth: 0.08, cupidBow: 0.14, philtrumVolume: 0.22, cheekHeight: 0.12, cheekInnerVolume: -0.18,
  },
  'high-cheeked': {
    headAngle: -0.06, headBackDepth: -0.03, noseDepth: 0.06, noseBridge: 0.08, noseCurve: -0.06,
    noseTipAngle: 0.04, nostrilWidth: -0.02, chinPrognathism: 0.02, eyeVerticalPosition: 0.08,
    eyeDepth: -0.02, eyeHeightInner: 0.06, eyeHeightCenter: 0.12, eyeHeightOuter: 0.03,
    epicanthus: 0.12, eyeFold: 0.10, browAngle: 0.10, mouthVerticalPosition: -0.02,
    mouthDepth: 0.02, cupidBow: 0.16, philtrumVolume: 0.06, cheekHeight: 0.30, cheekInnerVolume: -0.16,
  },
  'strong-jaw': {
    headAngle: 0.18, headBackDepth: 0.08, noseDepth: 0.14, noseBridge: 0.04, noseCurve: 0.08,
    noseTipAngle: -0.10, nostrilWidth: 0.18, chinPrognathism: 0.24, eyeVerticalPosition: -0.10,
    eyeDepth: 0.12, eyeHeightInner: -0.04, eyeHeightCenter: -0.06, eyeHeightOuter: -0.02,
    epicanthus: -0.06, eyeFold: 0.02, browAngle: -0.16, mouthVerticalPosition: -0.08,
    mouthDepth: 0.16, cupidBow: -0.08, philtrumVolume: 0.04, cheekHeight: -0.04, cheekInnerVolume: 0.08,
  },
  tapered: {
    headAngle: -0.10, headBackDepth: -0.08, noseDepth: -0.02, noseBridge: 0.06, noseCurve: -0.12,
    noseTipAngle: 0.14, nostrilWidth: -0.08, chinPrognathism: -0.08, eyeVerticalPosition: 0.10,
    eyeDepth: -0.04, eyeHeightInner: 0.12, eyeHeightCenter: 0.16, eyeHeightOuter: 0.08,
    epicanthus: 0.14, eyeFold: 0.12, browAngle: 0.14, mouthVerticalPosition: 0.04,
    mouthDepth: -0.02, cupidBow: 0.20, philtrumVolume: 0.08, cheekHeight: 0.22, cheekInnerVolume: -0.04,
  },
};

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

export const FACE_DETAIL_IDS = [
  'headAngle', 'headBackDepth', 'noseDepth', 'noseBridge', 'noseCurve', 'noseTipAngle',
  'nostrilWidth', 'chinPrognathism', 'eyeVerticalPosition', 'eyeDepth', 'eyeHeightInner',
  'eyeHeightCenter', 'eyeHeightOuter', 'epicanthus', 'eyeFold', 'browAngle',
  'mouthVerticalPosition', 'mouthDepth', 'cupidBow', 'philtrumVolume', 'cheekHeight',
  'cheekInnerVolume',
];

export const HAIR_PROFILES = Object.freeze({
  'center-parted-bun': {
    part: 'center', partAzimuth: 0, frontDepth: 0.49, sideDepth: 0.88, napeDepth: 0.94,
    crown: 1, sides: 0.82, mass: 'bun', bunHeight: 0.16, bunScale: [1, 0.86, 0.72],
  },
  'side-parted-bun': {
    part: 'side', partAzimuth: 0.40, frontDepth: 0.48, sideDepth: 0.86, napeDepth: 0.94,
    crown: 1.02, sides: 0.74, mass: 'bun', bunHeight: 0.18, bunScale: [1.08, 0.84, 0.70],
  },
  'low-bun': {
    part: 'center', partAzimuth: 0, frontDepth: 0.50, sideDepth: 0.90, napeDepth: 0.98,
    crown: 0.88, sides: 0.66, mass: 'low-bun', bunHeight: -0.12, bunScale: [1.12, 0.78, 0.68],
  },
  'coiled-bun': {
    part: 'center', partAzimuth: 0, frontDepth: 0.48, sideDepth: 0.87, napeDepth: 0.93,
    crown: 0.95, sides: 0.58, mass: 'coiled-bun', bunHeight: 0.14, bunScale: [1, 1, 0.62],
  },
  'loose-chignon': {
    part: 'center', partAzimuth: 0, frontDepth: 0.51, sideDepth: 0.91, napeDepth: 0.98,
    crown: 0.9, sides: 1.02, mass: 'chignon', bunHeight: -0.06, bunScale: [1.42, 0.72, 0.75],
  },
  'swept-back': {
    part: null, partAzimuth: 0, frontDepth: 0.47, sideDepth: 0.88, napeDepth: 0.94,
    crown: 1.18, sides: 0.62, mass: 'chignon', bunHeight: 0.28, bunScale: [1.28, 0.68, 0.72],
  },
  pompadour: {
    part: null, partAzimuth: 0, frontDepth: 0.47, sideDepth: 0.86, napeDepth: 0.93,
    crown: 1.24, sides: 0.68, mass: 'pompadour', bunHeight: 0.15, bunScale: [1.06, 0.82, 0.70],
  },
  'braided-crown': {
    part: null, partAzimuth: 0, frontDepth: 0.50, sideDepth: 0.87, napeDepth: 0.91,
    crown: 1.05, sides: 0.62, mass: 'braided-crown', bunHeight: 0.12, bunScale: [0.80, 0.80, 0.60],
  },
  'cropped-waves': {
    part: 'center', partAzimuth: 0, frontDepth: 0.50, sideDepth: 0.78, napeDepth: 0.76,
    crown: 0.78, sides: 0.48, mass: 'cropped-waves',
  },
  'short-parted': {
    part: 'center', partAzimuth: 0, frontDepth: 0.49, sideDepth: 0.75, napeDepth: 0.73,
    crown: 0.76, sides: 0.32, mass: 'short-parted',
  },
});

export function getHairProfile(style) {
  return HAIR_PROFILES[style] || HAIR_PROFILES['center-parted-bun'];
}

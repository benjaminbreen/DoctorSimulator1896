export const HAIR_PROFILES = Object.freeze({
  'center-parted-bun': {
    part: 'center', partAzimuth: 0, frontDepth: 0.20, sideDepth: 0.74, napeDepth: 0.94,
    crown: 1, sides: 0.82, templePuff: 0.76, mass: 'bun', bunHeight: 0.16,
    bunScale: [1, 0.86, 0.72], flowGuideRow: 0.29, flowAnchorRow: 0.58,
  },
  'side-parted-bun': {
    part: 'side', partAzimuth: 0.40, frontDepth: 0.20, sideDepth: 0.72, napeDepth: 0.94,
    crown: 1.02, sides: 0.74, templePuff: 0.68, mass: 'bun', bunHeight: 0.18,
    bunScale: [1.08, 0.84, 0.70], flowGuideRow: 0.28, flowAnchorRow: 0.58,
  },
  'low-bun': {
    part: 'center', partAzimuth: 0, frontDepth: 0.21, sideDepth: 0.76, napeDepth: 0.98,
    crown: 0.88, sides: 0.66, templePuff: 0.54, mass: 'low-bun', bunHeight: -0.12,
    bunScale: [1.12, 0.78, 0.68], flowGuideRow: 0.34, flowAnchorRow: 0.80,
  },
  'coiled-bun': {
    part: 'center', partAzimuth: 0, frontDepth: 0.20, sideDepth: 0.73, napeDepth: 0.93,
    crown: 0.95, sides: 0.58, templePuff: 0.58, mass: 'coiled-bun', bunHeight: 0.14,
    bunScale: [1, 1, 0.62], flowGuideRow: 0.27, flowAnchorRow: 0.56,
  },
  'loose-chignon': {
    part: 'center', partAzimuth: 0, frontDepth: 0.21, sideDepth: 0.77, napeDepth: 0.98,
    crown: 0.9, sides: 1.02, templePuff: 1.14, mass: 'chignon', bunHeight: -0.06,
    bunScale: [1.42, 0.72, 0.75], flowGuideRow: 0.35, flowAnchorRow: 0.76,
  },
  'swept-back': {
    part: null, partAzimuth: 0, frontDepth: 0.20, sideDepth: 0.71, napeDepth: 0.94,
    crown: 1.18, sides: 0.62, templePuff: 0.46, mass: 'chignon', bunHeight: 0.28,
    bunScale: [1.28, 0.68, 0.72], flowGuideRow: 0.22, flowAnchorRow: 0.50,
  },
  pompadour: {
    part: null, partAzimuth: 0, frontDepth: 0.19, sideDepth: 0.72, napeDepth: 0.93,
    crown: 1.24, sides: 0.68, templePuff: 0.74, mass: 'pompadour', bunHeight: 0.15,
    bunScale: [1.06, 0.82, 0.70], flowGuideRow: 0.18, flowAnchorRow: 0.54,
  },
  'braided-crown': {
    part: null, partAzimuth: 0, frontDepth: 0.21, sideDepth: 0.73, napeDepth: 0.91,
    crown: 1.05, sides: 0.62, templePuff: 0.62, mass: 'braided-crown', bunHeight: 0.12,
    bunScale: [0.80, 0.80, 0.60], flowGuideRow: 0.25, flowAnchorRow: 0.55,
  },
  'cropped-waves': {
    part: 'side', partAzimuth: 0.30, frontDepth: 0.19, sideDepth: 0.70, napeDepth: 0.94,
    crown: 0.78, sides: 0.48, templePuff: 0.34, mass: 'cropped-waves',
    flowGuideRow: 0.16, flowAnchorRow: 0.18,
  },
  'short-parted': {
    part: 'side', partAzimuth: 0.26, frontDepth: 0.19, sideDepth: 0.68, napeDepth: 0.92,
    crown: 0.76, sides: 0.32, templePuff: 0.22, mass: 'short-parted',
    flowGuideRow: 0.14, flowAnchorRow: 0.17,
  },
});

export function getHairProfile(style) {
  return HAIR_PROFILES[style] || HAIR_PROFILES['center-parted-bun'];
}

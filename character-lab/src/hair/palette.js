import * as THREE from 'three';

/** Natural hair shades are material recipes rather than a single flat swatch.
 * `base` fills the dense shell, `root` darkens the fitted hairline underlay,
 * and `sheen` supplies restrained warm/cool highlights. */
export const HAIR_PALETTES = Object.freeze({
  black: Object.freeze({ label: 'Black', base: '#090706', root: '#020202', sheen: '#4a3a34' }),
  'soft-black': Object.freeze({ label: 'Soft black', base: '#15100e', root: '#070504', sheen: '#625048' }),
  'dark-brown': Object.freeze({ label: 'Dark brown', base: '#261710', root: '#0f0907', sheen: '#76533f' }),
  'medium-brown': Object.freeze({ label: 'Medium brown', base: '#4a2e20', root: '#24150f', sheen: '#a2785b' }),
  chestnut: Object.freeze({ label: 'Chestnut', base: '#633522', root: '#2d160f', sheen: '#bd7952' }),
  auburn: Object.freeze({ label: 'Auburn', base: '#71351f', root: '#32150d', sheen: '#c87249' }),
  'ash-brown': Object.freeze({ label: 'Ash brown', base: '#59483b', root: '#29211c', sheen: '#aa9784' }),
  'dark-blonde': Object.freeze({ label: 'Dark blonde', base: '#806044', root: '#443326', sheen: '#cfad7b' }),
  'golden-blonde': Object.freeze({ label: 'Golden blonde', base: '#a47b53', root: '#58422f', sheen: '#e1c28f' }),
});

const shadeEntries = Object.entries(HAIR_PALETTES);

export function nearestHairShade(color) {
  const target = new THREE.Color(color || '#17100d');
  let best = 'dark-brown';
  let bestDistance = Infinity;
  for (const [id, palette] of shadeEntries) {
    const sample = new THREE.Color(palette.base);
    const distance = (sample.r - target.r) ** 2 + (sample.g - target.g) ** 2 + (sample.b - target.b) ** 2;
    if (distance < bestDistance) {
      best = id;
      bestDistance = distance;
    }
  }
  return best;
}

function customPalette(color) {
  const base = new THREE.Color(color || '#17100d');
  const root = base.clone().multiplyScalar(0.43);
  const sheen = base.clone().lerp(new THREE.Color('#d8b69a'), 0.30);
  return {
    label: 'Custom', base: `#${base.getHexString()}`, root: `#${root.getHexString()}`,
    sheen: `#${sheen.getHexString()}`,
  };
}

export function resolveHairPalette(values = {}) {
  const shade = values.hairShade || 'custom';
  return HAIR_PALETTES[shade] || customPalette(values.hairColor);
}

export const HAIR_SHADE_IDS = Object.freeze([...Object.keys(HAIR_PALETTES), 'custom']);

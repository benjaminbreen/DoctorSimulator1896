// What hangs in each window, decided once and read by every renderer that
// needs it: Curtains builds the geometry, LightShafts cuts the beam, and
// LightingRig dims the portal light, all from the same plan.
//
// 1890s New York practice, by room:
//   parlor   spring roller shade at the glass, a lace panel across the
//            opening, heavy over-curtains at the jambs, valance if the
//            house is grand
//   office   wide-slat wooden Venetian blind and a shade. Studies,
//            libraries and consulting rooms took blinds where a front
//            parlor took drapery
//   service  shade alone
//
// Historical note: layered treatments are well documented for formal rooms;
// the room-by-room split is the weaker claim and wants checking against
// period interior photographs before it hardens into anything else.

// Fraction of daylight each layer passes. Holland shade cloth was sized and
// sometimes oiled, so it is close to opaque; lace only veils.
const SHADE_PASS = 0.14;
const LACE_PASS = 0.72;
// Slats closed pass almost nothing; turned open they pass most of the gap.
const BLIND_PASS_SHUT = 0.06;
const BLIND_PASS_OPEN = 0.52;
// Panels at the jambs and a valance across the head eat the edges of the
// opening rather than the middle of it.
const HEAVY_PASS = 0.9;
const VALANCE_PASS = 0.95;

const FABRICS = {
  humble: ['#8d8674', '#6f6a5c'],
  middling: ['#6d4038', '#42513f', '#4a4258'],
  grand: ['#6b2b2a', '#2f4a44', '#5b4420', '#452f52'],
};

// A working room is furnished soberly whatever the house is worth.
const OFFICE_FABRICS = ['#3d4a3f', '#4a332c', '#3a3a44'];

export function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function layersFor(role, wealth) {
  // The blind does the shade's job in a working room, and mounted in the
  // same reveal it would hide one anyway.
  if (role === 'office') {
    return { shade: false, lace: false, heavy: wealth !== 'humble', valance: false, blind: true };
  }
  if (role === 'service') {
    return { shade: true, lace: false, heavy: false, valance: false, blind: false };
  }
  return {
    shade: true,
    lace: true,
    heavy: wealth !== 'humble',
    valance: wealth === 'grand',
    blind: false,
  };
}

// Shades on one wall were drawn as a row, by eye and not quite level, so the
// drop is a per-wall base with a small per-window offset rather than noise.
function wallKey(hole) {
  return `${Math.round(hole.normal[0])},${Math.round(hole.normal[2])}`;
}

/**
 * Plan the dressing for a room's windows.
 * Returns a Map keyed by hole id; `openFraction` is the share of daylight
 * that still gets through, for the light and beam renderers.
 */
export function dressWindows(holes = [], options = {}) {
  const { wealth = 'middling', role = 'parlor', seed = 0 } = options;
  const layers = layersFor(role, wealth);
  const palette = role === 'office' ? OFFICE_FABRICS : FABRICS[wealth] ?? FABRICS.middling;

  // One room, one set of curtains: the fabric is chosen for the room, not
  // window by window. Curtains varies the tone a little between them.
  const color = palette[Math.floor(hash01(seed * 1.7) * palette.length) % palette.length];

  const walls = new Map();
  const plans = new Map();

  holes.forEach((hole, index) => {
    if (hole.type !== 'window') return;
    const key = wallKey(hole);
    if (!walls.has(key)) {
      walls.set(key, {
        shade: 0.05 + hash01(seed * 3.1 + walls.size * 9.7) * 0.32,
        blind: 0.3 + hash01(seed * 4.7 + walls.size * 5.3) * 0.35,
        tilt: 0.45 + hash01(seed * 6.1 + walls.size * 3.9) * 0.4,
      });
    }
    const wall = walls.get(key);
    const jitter = (hash01(seed * 2.3 + index * 11.9) - 0.5) * 0.12;

    const shadeDrop = layers.shade ? clamp(wall.shade + jitter, 0, 0.62) : 0;
    const blindDrop = layers.blind ? clamp(wall.blind + jitter, 0, 0.85) : 0;
    const blindTilt = layers.blind ? wall.tilt : 0;
    const blindPass = BLIND_PASS_SHUT + (BLIND_PASS_OPEN - BLIND_PASS_SHUT) * blindTilt;

    const openFraction =
      (1 - shadeDrop + shadeDrop * SHADE_PASS) *
      (1 - blindDrop + blindDrop * blindPass) *
      (layers.lace ? LACE_PASS : 1) *
      (layers.heavy ? HEAVY_PASS : 1) *
      (layers.valance ? VALANCE_PASS : 1);

    plans.set(hole.id, {
      id: hole.id,
      role,
      lace: layers.lace,
      heavy: layers.heavy,
      valance: layers.valance,
      shade: layers.shade ? { drop: shadeDrop } : null,
      blind: layers.blind ? { drop: blindDrop, tilt: blindTilt } : null,
      color,
      openFraction,
    });
  });

  return plans;
}

// How much of the portal light a dressed window keeps. Not openFraction
// directly: the renderer has no bounce, so taking the full cut leaves a
// dressed room darker than a real one with the same shades down.
export function portalDimming(plan) {
  if (!plan) return 1;
  return 0.35 + 0.65 * plan.openFraction;
}

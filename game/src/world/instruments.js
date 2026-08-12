// Apparatus for a psychological laboratory of 1896, built from primitives.
//
// The set is Cattell's, not a general collection: the ten "mental tests" he
// published in Mind in 1890 and then ran on every entering Columbia freshman
// from 1894, plus the recording and timing apparatus any laboratory of the
// period stood behind them. Each builder names which test it serves.
//
// Historical note for Ben: the tests and their apparatus are well documented,
// but two things here want checking before they become game content. Columbia
// was still on the 49th Street campus in 1896 — Morningside Heights and
// Schermerhorn Hall open in 1897 — so this room is a converted upper floor,
// not the purpose-built lab people picture. And the exact makers' patterns
// (Zimmermann, Verdin, Willyoung) varied; these are the common forms, not any
// one catalogue's plate.
//
// Every builder takes (id, x, y, z, yaw) with y the surface it stands on, and
// returns furniture items. Bench instruments are anchored; the small
// hand-held pieces are loose bodies so they can be picked up and knocked
// about.

import { place, round, hash01 } from './furnishings.js';

// Laboratory finishes: japanned iron, lacquered brass, French-polished
// mahogany bases, and the deal of the benches themselves.
const IRON = '#2e3033';
const BRASS = '#a8863f';
const BRASS_DARK = '#7d6330';
const MAHOGANY = '#4a2c1d';
const DEAL = '#8a6f4c';
const IVORY = '#e8e3d4';
const EBONITE = '#1c1a19';

function part(id, origin, offset, size, yaw, color, extra = {}) {
  return {
    id,
    kind: 'furniture',
    position: place(origin, offset, yaw),
    size: size.map(round),
    yaw,
    color,
    collider: false,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Laboratory furniture

export const LAB_BENCH_SCHEMA = {
  version: 1,
  groups: [
    {
      id: 'dimensions',
      label: 'Dimensions',
      parameters: [
        { id: 'length', label: 'Length (m)', type: 'range', min: 1.6, max: 3.6, step: 0.05, default: 2.4 },
        { id: 'height', label: 'Height (m)', type: 'range', min: 0.72, max: 1.05, step: 0.01, default: 0.9 },
        { id: 'depth', label: 'Depth (m)', type: 'range', min: 0.55, max: 0.95, step: 0.01, default: 0.72 },
      ],
    },
    {
      id: 'construction',
      label: 'Construction',
      parameters: [
        { id: 'topThickness', label: 'Top thickness', type: 'range', min: 0.055, max: 0.14, step: 0.005, default: 0.085 },
        { id: 'legSize', label: 'Leg section', type: 'range', min: 0.075, max: 0.16, step: 0.005, default: 0.105 },
        { id: 'apronHeight', label: 'Apron depth', type: 'range', min: 0.08, max: 0.22, step: 0.005, default: 0.13 },
        { id: 'shelfHeight', label: 'Shelf height', type: 'range', min: 0.14, max: 0.46, step: 0.01, default: 0.26 },
        { id: 'shelfDepth', label: 'Shelf depth', type: 'range', min: 0.3, max: 0.72, step: 0.01, default: 0.52 },
        { id: 'shelfThickness', label: 'Shelf thickness', type: 'range', min: 0.035, max: 0.085, step: 0.005, default: 0.055 },
        { id: 'plankCount', label: 'Top planks', type: 'range', min: 1, max: 6, step: 1, default: 3 },
      ],
    },
    {
      id: 'joinery',
      label: 'Visible and inferred detail',
      parameters: [
        { id: 'bevelRadius', label: 'Edge bevel', type: 'range', min: 0.002, max: 0.022, step: 0.001, default: 0.009 },
        { id: 'rearApron', label: 'Rear apron', type: 'toggle', default: true },
        { id: 'stretcher', label: 'Rear stretcher', type: 'toggle', default: false },
        { id: 'cornerBlocks', label: 'Corner blocks', type: 'toggle', default: true },
        { id: 'bolts', label: 'Iron fasteners', type: 'toggle', default: false },
      ],
    },
    {
      id: 'surface',
      label: 'PBR timber surface',
      parameters: [
        { id: 'textureScale', label: 'Grain scale (m)', type: 'range', min: 0.22, max: 0.8, step: 0.01, default: 0.42 },
        { id: 'textureIntensity', label: 'Texture intensity', type: 'range', min: 0, max: 2, step: 0.05, default: 1 },
        { id: 'normalStrength', label: 'Grain relief', type: 'range', min: 0, max: 0.8, step: 0.02, default: 0.34 },
        { id: 'roughness', label: 'Surface roughness', type: 'range', min: 0.55, max: 1, step: 0.01, default: 0.82 },
        { id: 'aoStrength', label: 'Cavity response', type: 'range', min: 0, max: 1.2, step: 0.05, default: 0.45 },
        { id: 'finishTint', label: 'Timber tint', type: 'color', default: '#ffffff', vary: false },
      ],
    },
  ],
};

// An action-ready bench made from named pieces. Optional details are kept as
// editor choices because the supplied flat-shaded view does not prove them.
export function labBench(id, x, z, yaw, options = {}) {
  const length = options.length ?? 2.4;
  const depth = options.depth ?? 0.72;
  const height = options.height ?? 0.9;
  const topThickness = options.topThickness ?? 0.085;
  const legSize = options.legSize ?? 0.105;
  const apronHeight = options.apronHeight ?? 0.13;
  const shelfHeight = options.shelfHeight ?? 0.26;
  const shelfDepth = Math.min(options.shelfDepth ?? 0.52, depth - 0.08);
  const shelfThickness = options.shelfThickness ?? 0.055;
  const plankCount = Math.max(1, Math.round(options.plankCount ?? 3));
  const bevelRadius = options.bevelRadius ?? 0.009;
  const overhangX = Math.min(0.09, length * 0.05);
  const overhangZ = Math.min(0.08, depth * 0.12);
  const legX = length / 2 - overhangX - legSize / 2;
  const legZ = depth / 2 - overhangZ - legSize / 2;
  const legHeight = height - topThickness + 0.02;
  const apronY = height - topThickness - apronHeight / 2 + 0.018;
  const railLength = legX * 2 + legSize;
  const endRailDepth = legZ * 2 + legSize;
  const origin = [x, 0, z];
  const variantPreview = options.previewQuality === 'variants';
  const items = [];
  const timber = (grainRotation = 0, textureOffset = [0, 0]) => ({
    shape: 'roundedBox',
    finish: 'laboratoryDeal',
    tint: options.finishTint ?? '#ffffff',
    textureScale: options.textureScale ?? 0.42,
    textureIntensity: variantPreview ? 1 : (options.textureIntensity ?? 1),
    texturePreview: variantPreview,
    normalStrength: options.normalStrength ?? 0.34,
    roughness: options.roughness ?? 0.82,
    aoStrength: options.aoStrength ?? 0.45,
    grainRotation,
    textureOffset,
    bevelRadius,
    bevelSegments: 2,
  });
  const box = (suffix, offset, size, component, extra = {}) => items.push(part(
    `${id}-${suffix}`,
    origin,
    offset,
    size,
    yaw,
    DEAL,
    { sculptPart: component, fractureGroup: component, ...extra },
  ));

  const boardDepth = depth / plankCount;
  for (let index = 0; index < plankCount; index += 1) {
    const seamInsetA = index === 0 ? 0 : 0.002;
    const seamInsetB = index === plankCount - 1 ? 0 : 0.002;
    const boardMin = -depth / 2 + boardDepth * index + seamInsetA;
    const boardMax = -depth / 2 + boardDepth * (index + 1) - seamInsetB;
    box(
      `worktop-plank-${index + 1}`,
      [0, height - topThickness / 2, (boardMin + boardMax) / 2],
      [length, topThickness, Math.max(0.03, boardMax - boardMin)],
      'worktop',
      { ...timber(0, [round(index * 0.271), round(index * 0.419)]), collider: true, detachable: true, socket: `worktop-plank-${index + 1}` },
    );
  }

  box('apron-front', [0, apronY, legZ], [railLength, apronHeight, 0.05], 'frame', {
    ...timber(0, [0.19, 0.61]), socket: 'front-apron',
  });
  if (options.rearApron ?? true) {
    box('apron-rear', [0, apronY, -legZ], [railLength, apronHeight, 0.05], 'frame', {
      ...timber(0, [0.43, 0.17]), socket: 'rear-apron', inferred: true,
    });
  }
  for (const side of [-1, 1]) {
    box(`apron-end-${side < 0 ? 'left' : 'right'}`, [side * legX, apronY, 0], [0.05, apronHeight, endRailDepth], 'frame', {
      ...timber(Math.PI / 2, [side < 0 ? 0.13 : 0.67, 0.31]), socket: 'end-apron',
    });
    for (const front of [-1, 1]) {
      const sideName = side < 0 ? 'left' : 'right';
      const faceName = front < 0 ? 'rear' : 'front';
      box(`leg-${sideName}-${faceName}`, [side * legX, legHeight / 2, front * legZ], [legSize, legHeight, legSize], 'legs', {
        ...timber(Math.PI / 2, [side < 0 ? 0.23 : 0.73, front < 0 ? 0.37 : 0.83]), collider: true, detachable: true, socket: `${sideName}-${faceName}-corner`,
      });
      if (options.cornerBlocks ?? true) {
        box(`corner-block-${sideName}-${faceName}`, [side * (legX - legSize * 0.42), apronY + 0.012, front * (legZ - legSize * 0.42)], [legSize * 1.45, apronHeight * 0.72, legSize * 1.45], 'joinery', {
          ...timber(0, [side < 0 ? 0.11 : 0.59, front < 0 ? 0.29 : 0.79]), inferred: true,
        });
      }
    }
  }

  const shelfWidth = Math.max(0.4, railLength - legSize * 0.3);
  box('lower-shelf', [0, shelfHeight, 0], [shelfWidth, shelfThickness, shelfDepth], 'lower-shelf', {
    ...timber(0, [0.37, 0.71]), collider: true, detachable: true, socket: 'shelf-seat',
  });
  for (const face of [-1, 1]) {
    box(`shelf-cleat-${face < 0 ? 'rear' : 'front'}`, [0, shelfHeight - shelfThickness / 2 - 0.022, face * (shelfDepth / 2 - 0.035)], [railLength, 0.055, 0.05], 'shelf-supports', {
      ...timber(0), socket: 'shelf-cleat',
    });
  }

  if (options.stretcher) {
    box('rear-stretcher', [0, Math.max(0.34, shelfHeight + 0.12), -legZ], [railLength, 0.085, 0.055], 'frame', {
      ...timber(0), inferred: true, socket: 'rear-stretcher',
    });
  }

  if (options.bolts) {
    for (const side of [-1, 1]) {
      for (const front of [-1, 1]) {
        for (const vertical of [-1, 1]) {
          box(`bolt-${side < 0 ? 'left' : 'right'}-${front < 0 ? 'rear' : 'front'}-${vertical < 0 ? 'low' : 'high'}`, [side * legX, apronY + vertical * apronHeight * 0.22, front * (legZ + 0.028)], [0.032, 0.007, 0.032], 'fasteners', {
            shape: 'cylinder', rotation: [Math.PI / 2, 0, 0], finish: 'iron', collider: false, inferred: true,
          });
        }
      }
    }
  }
  return items;
}

// A four-legged laboratory stool. Loose: the subject pulls it up to the bench.
export function labStool(id, x, z, options = {}) {
  const height = options.height ?? 0.62;
  const seat = options.radius ?? 0.16;
  const parts = [
    { shape: 'cylinder', size: [seat * 2, 0.035, seat * 2], position: [0, round(height / 2 - 0.02), 0], color: MAHOGANY, roughness: 0.6 },
  ];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push({
      shape: 'cylinder',
      size: [0.028, height - 0.05, 0.028],
      position: [round(Math.cos(angle) * seat * 0.7), round(-0.02), round(Math.sin(angle) * seat * 0.7)],
      // Splayed, as a stool's legs are, or it walks across the floor.
      rotation: [round(Math.sin(angle) * 0.1), 0, round(-Math.cos(angle) * 0.1)],
      color: '#5a3a24',
      roughness: 0.7,
    });
  }
  return [{
    id: `${id}-stool`,
    kind: 'furniture',
    position: [round(x), round(height / 2), round(z)],
    size: [seat * 2, height, seat * 2],
    yaw: 0,
    dynamic: true,
    mass: 5,
    parts,
  }];
}

// ---------------------------------------------------------------------------
// Cattell's ten tests

// Test 1, "Dynamometer Pressure": the strength of squeeze of the hand, read
// off a spring dynamometer of the oval Collin pattern.
export function dynamometer(id, x, y, z, yaw = 0) {
  return [{
    id: `${id}-dynamometer`,
    kind: 'furniture',
    position: [round(x), round(y + 0.055), round(z)],
    size: [0.13, 0.11, 0.05],
    yaw,
    dynamic: true,
    mass: 0.9,
    parts: [
      // The oval steel spring the hand closes, and the dial that reads it.
      { shape: 'torus', size: [0.13, 0.016, 0.13], position: [0, 0, 0], rotation: [0, round(Math.PI / 2), 0], color: '#5e6469', roughness: 0.35 },
      { shape: 'cylinder', size: [0.062, 0.012, 0.062], position: [0, 0.005, 0.022], rotation: [round(Math.PI / 2), 0, 0], color: IVORY, roughness: 0.5 },
      { shape: 'cylinder', size: [0.07, 0.008, 0.07], position: [0, 0.005, 0.016], rotation: [round(Math.PI / 2), 0, 0], color: BRASS, roughness: 0.3 },
      { shape: 'box', size: [0.004, 0.05, 0.004], position: [0, 0.018, 0.03], rotation: [0, 0, 0.5], color: IRON, roughness: 0.4 },
    ],
  }];
}

// Test 2, "Rate of Movement": the time to move the hand fifty centimetres,
// stopped by striking the far contact. A brass rail with a start key at one
// end and the stop plate at the other.
export function movementRail(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));
  box('base', [0, 0.012, 0], [0.62, 0.024, 0.1], MAHOGANY);
  box('rail', [0, 0.032, 0], [0.56, 0.016, 0.02], BRASS);
  // The graduation strip: fifty centimetres, which is the measurement.
  box('scale', [0, 0.026, 0.036], [0.52, 0.002, 0.022], IVORY);
  box('key', [-0.27, 0.042, 0], [0.05, 0.02, 0.05], EBONITE);
  box('stop', [0.28, 0.05, 0], [0.02, 0.05, 0.07], BRASS_DARK);
  for (const side of [-1, 1]) {
    box(`post-${side}`, [side * 0.25, 0.036, -0.038], [0.012, 0.024, 0.012], BRASS);
  }
  return items;
}

// Test 3, "Sensation-areas": the two-point threshold, taken with an
// aesthesiometer — a graduated bar carrying two sliding points.
export function aesthesiometer(id, x, y, z, yaw = 0) {
  return [{
    id: `${id}-aesthesiometer`,
    kind: 'furniture',
    position: [round(x), round(y + 0.02), round(z)],
    size: [0.28, 0.04, 0.04],
    yaw,
    dynamic: true,
    mass: 0.3,
    parts: [
      { shape: 'box', size: [0.26, 0.008, 0.018], position: [0, 0, 0], color: BRASS, roughness: 0.35 },
      { shape: 'box', size: [0.26, 0.002, 0.006], position: [0, 0.005, 0.007], color: IVORY, roughness: 0.5 },
      // Two uprights carrying the points, set the width of the test apart.
      { shape: 'box', size: [0.012, 0.026, 0.012], position: [-0.045, 0.014, 0], color: BRASS_DARK, roughness: 0.35 },
      { shape: 'box', size: [0.012, 0.026, 0.012], position: [0.045, 0.014, 0], color: BRASS_DARK, roughness: 0.35 },
      { shape: 'cone', size: [0.006, 0.02, 0.006], position: [-0.045, 0.034, 0], color: '#6e7479', roughness: 0.3 },
      { shape: 'cone', size: [0.006, 0.02, 0.006], position: [0.045, 0.034, 0], color: '#6e7479', roughness: 0.3 },
    ],
  }];
}

// Test 4, "Pressure causing Pain": an algometer, a rubber tip driven against
// the forehead through a spring until the subject says stop.
export function algometer(id, x, y, z, yaw = 0) {
  return [{
    id: `${id}-algometer`,
    kind: 'furniture',
    position: [round(x), round(y + 0.03), round(z)],
    size: [0.2, 0.06, 0.06],
    yaw,
    dynamic: true,
    mass: 0.4,
    parts: [
      { shape: 'cylinder', size: [0.03, 0.09, 0.03], position: [-0.055, 0, 0], rotation: [0, 0, round(Math.PI / 2)], color: MAHOGANY, roughness: 0.55 },
      { shape: 'cylinder', size: [0.022, 0.1, 0.022], position: [0.03, 0, 0], rotation: [0, 0, round(Math.PI / 2)], color: BRASS, roughness: 0.35 },
      { shape: 'box', size: [0.07, 0.004, 0.016], position: [0.03, 0.014, 0], color: IVORY, roughness: 0.5 },
      // The rubber tip that does the pressing.
      { shape: 'cylinder', size: [0.024, 0.012, 0.024], position: [0.086, 0, 0], rotation: [0, 0, round(Math.PI / 2)], color: '#3a3532', roughness: 0.9 },
    ],
  }];
}

// Test 5, "Least noticeable difference in Weight": a set of small boxes of
// one size and graded weight, lifted in pairs. Loose, and identical to look
// at, which is the point of them.
export function liftedWeights(id, x, y, z, options = {}) {
  const count = options.count ?? 6;
  const items = [];
  // The tray they live in.
  const origin = [x, y, z];
  items.push(part(`${id}-tray`, origin, [0, 0.008, 0], [0.34, 0.016, 0.1], 0, MAHOGANY));
  for (let i = 0; i < 4; i += 1) {
    const along = -0.16 + i * (0.32 / 3);
    items.push(part(`${id}-tray-rib-${i}`, origin, [along, 0.02, 0], [0.004, 0.024, 0.09], 0, '#3a2418'));
  }
  for (let i = 0; i < count; i += 1) {
    const along = -0.13 + (i % 6) * 0.052;
    items.push({
      id: `${id}-weight-${i}`,
      kind: 'furniture',
      shape: 'cylinder',
      position: [round(x + along), round(y + 0.04), round(z + (i < 3 ? -0.02 : 0.02))],
      size: [0.032, 0.046, 0.032],
      yaw: 0,
      dynamic: true,
      // The whole test is that they differ by a little and look the same.
      mass: round(0.08 + i * 0.012),
      color: BRASS,
    });
  }
  return items;
}

// Tests 6 and 7, "Reaction-time for Sound" and "Time for naming Colours":
// both timed on a Hipp chronoscope, the clock-driven instrument reading to
// the thousandth of a second that every laboratory of the period was built
// around. Anchored — it weighs a good deal and wants levelling.
export function hippChronoscope(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));

  box('base', [0, 0.018, 0], [0.3, 0.036, 0.22], IRON, { collider: true });
  box('base-lip', [0, 0.04, 0], [0.26, 0.012, 0.18], IRON);
  for (const side of [-1, 1]) {
    box(`pillar-${side}`, [side * 0.1, 0.14, -0.03], [0.022, 0.18, 0.022], BRASS, { shape: 'cylinder' });
  }
  // The train and its housing, laid across the pillars.
  box('barrel', [0, 0.2, -0.03], [0.09, 0.2, 0.09], BRASS_DARK, { shape: 'cylinder', rotation: [0, 0, Math.PI / 2] });
  // Two dials: thousandths on the large one, seconds on the small.
  box('dial-large', [-0.055, 0.19, 0.06], [0.11, 0.012, 0.11], IVORY, { shape: 'cylinder', rotation: [Math.PI / 2, 0, 0] });
  box('dial-large-bezel', [-0.055, 0.19, 0.052], [0.125, 0.01, 0.125], BRASS, { shape: 'torus', rotation: [0, 0, 0] });
  box('dial-small', [0.06, 0.215, 0.055], [0.062, 0.01, 0.062], IVORY, { shape: 'cylinder', rotation: [Math.PI / 2, 0, 0] });
  box('hand-large', [-0.055, 0.205, 0.068], [0.004, 0.042, 0.004], IRON);
  box('hand-small', [0.06, 0.225, 0.062], [0.003, 0.024, 0.003], IRON);
  // The fly governor on top, and the binding posts the key wires land on.
  box('governor-post', [0.02, 0.31, -0.03], [0.014, 0.04, 0.014], BRASS, { shape: 'cylinder' });
  for (const vane of [-1, 1]) {
    box(`governor-vane-${vane}`, [0.02 + vane * 0.022, 0.328, -0.03], [0.04, 0.002, 0.018], BRASS);
  }
  for (const side of [-1, 1]) {
    box(`terminal-${side}`, [side * 0.11, 0.052, 0.08], [0.014, 0.024, 0.014], BRASS, { shape: 'cylinder' });
    box(`terminal-nut-${side}`, [side * 0.11, 0.066, 0.08], [0.022, 0.008, 0.022], BRASS_DARK, { shape: 'cylinder' });
  }
  return items;
}

// The key the chronoscope stops on: a telegraph pattern on a wooden base,
// used for the sound-reaction and colour-naming tests alike.
export function reactionKey(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));
  box('base', [0, 0.012, 0], [0.14, 0.024, 0.09], MAHOGANY, { collider: true });
  box('trunnion', [-0.01, 0.036, 0], [0.02, 0.024, 0.03], BRASS);
  // The lever, resting a little above its contact.
  box('lever', [0.02, 0.05, 0], [0.11, 0.008, 0.014], BRASS, { rotation: [0, 0, -0.06] });
  box('knob', [0.062, 0.052, 0], [0.028, 0.014, 0.028], EBONITE, { shape: 'cylinder' });
  box('contact', [0.03, 0.038, 0], [0.008, 0.006, 0.008], '#b0763a', { shape: 'cylinder' });
  for (const side of [-1, 1]) {
    box(`terminal-${side}`, [-0.05, 0.034, side * 0.03], [0.01, 0.02, 0.01], BRASS, { shape: 'cylinder' });
  }
  return items;
}

// The standard papers a colour wheel was set with. These are the Bradley
// papers every American laboratory ordered from the same catalogue, which is
// why results from different labs could be compared at all.
export const COLOUR_PAPERS = [
  { name: 'Vermilion', color: '#8f2a20' },
  { name: 'Emerald', color: '#215a3b' },
  { name: 'Ultramarine', color: '#22376a' },
  { name: 'Chrome yellow', color: '#ab811c' },
  { name: 'White', color: '#cfc9ba' },
  { name: 'Black', color: '#171512' },
];

// Where the colour wheel's moving parts turn. The disc and the driving wheel
// each spin about their own centre, so the instrument view needs the axis, not
// just the part list.
export const COLOUR_WHEEL_FRAME = {
  discPivot: [0, 0.42, 0.09],
  drivePivot: [0.13, 0.155, 0.07],
  // Driving wheel to spindle pulley: cranking once turns the disc this many
  // times, which is how a hand crank reaches fusion speed at all.
  ratio: 6.5,
};

// Test 7, "Time for Naming Colours", and the colour-mixing work behind it: a
// belt-driven colour wheel of the pattern Ogden Rood used in the physics
// department across the quad, and wrote up in Modern Chromatics.
//
// Discs of coloured paper are slit to the centre and slid into one another, so
// a turn of the crank shows the eye each paper in proportion to its sector.
// Spun past about fifty flashes a second the eye stops resolving them and
// reports one colour. The instrument does no mixing; the observer does.
export function colourWheel(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));

  // Cast-iron bed, japanned, on four turned feet.
  box('bed', [0, 0.019, 0], [0.32, 0.038, 0.24], IRON, { finish: 'iron', collider: true });
  box('bed-lip', [0, 0.045, 0], [0.285, 0.014, 0.205], IRON, { finish: 'iron' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(`foot-${sx}-${sz}`, [sx * 0.135, 0.005, sz * 0.095], [0.03, 0.01, 0.03], IRON, {
        shape: 'cylinder',
        finish: 'iron',
      });
    }
  }
  box('plate', [0, 0.04, 0.108], [0.13, 0.02, 0.003], BRASS, { finish: 'brass' });

  // The standard: a turned column at the back carrying the spindle bearing out
  // over the bed, so the disc hangs clear of everything.
  box('column-base', [0, 0.062, -0.075], [0.09, 0.034, 0.09], IRON, { shape: 'cylinder', finish: 'iron' });
  box('column', [0, 0.235, -0.075], [0.048, 0.31, 0.048], IRON, { shape: 'cylinder', finish: 'iron' });
  box('column-collar', [0, 0.385, -0.075], [0.062, 0.022, 0.062], BRASS, { shape: 'cylinder', finish: 'brassDull' });
  box('arm', [0, 0.42, -0.03], [0.042, 0.038, 0.115], IRON, { finish: 'iron' });
  box('bearing', [0, 0.42, 0.032], [0.056, 0.062, 0.056], BRASS, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'brass',
  });
  box('oiler', [0, 0.452, 0.032], [0.018, 0.024, 0.018], BRASS, { shape: 'cylinder', finish: 'brass' });
  box('spindle', [0, 0.42, 0.062], [0.013, 0.11, 0.013], BRASS, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'brass',
  });
  // The small pulley the belt drives, behind the bearing.
  box('pulley', [0, 0.42, -0.006], [0.038, 0.014, 0.038], BRASS, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'brassDull',
    channel: 'disc',
    pivot: COLOUR_WHEEL_FRAME.discPivot,
  });

  // The papers. Three sectors as it stands on the bench; the instrument view
  // sets them from its own state.
  box('disc', [0, 0.42, 0.09], [0.30, 0.004, 0.30], IVORY, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    channel: 'disc',
    pivot: COLOUR_WHEEL_FRAME.discPivot,
    disc: [
      { color: COLOUR_PAPERS[0].color, fraction: 0.4 },
      { color: COLOUR_PAPERS[1].color, fraction: 0.35 },
      { color: COLOUR_PAPERS[4].color, fraction: 0.25 },
    ],
  });
  box('disc-washer', [0, 0.42, 0.095], [0.052, 0.008, 0.052], BRASS, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'brass',
    channel: 'disc',
    pivot: COLOUR_WHEEL_FRAME.discPivot,
  });
  box('disc-nut', [0, 0.42, 0.103], [0.026, 0.014, 0.026], BRASS, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'brass',
    channel: 'disc',
    pivot: COLOUR_WHEEL_FRAME.discPivot,
  });

  // The drive: a heavy wheel low on the bed, cranked by hand, belted up to the
  // pulley. The mass is the point — it carries the disc through the turn.
  box('standard', [0.13, 0.098, 0.006], [0.034, 0.12, 0.052], IRON, { finish: 'iron' });
  const drive = { channel: 'drive', pivot: COLOUR_WHEEL_FRAME.drivePivot };
  box('flywheel', [0.13, 0.155, 0.07], [0.2, 0.014, 0.2], IRON, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'iron',
    ...drive,
  });
  box('flywheel-hub', [0.13, 0.155, 0.078], [0.046, 0.02, 0.046], BRASS, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'brassDull',
    ...drive,
  });
  // Spokes, so a still wheel does not read as a plate.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI;
    box(`spoke-${i}`, [0.13, 0.155, 0.072], [0.19, 0.012, 0.012], IRON, {
      rotation: [0, 0, round(angle)],
      finish: 'iron',
      ...drive,
    });
  }
  box('crank-arm', [0.13, 0.155 + 0.072, 0.084], [0.016, 0.02, 0.016], BRASS, { finish: 'brass', ...drive });
  box('crank-handle', [0.13, 0.155 + 0.072, 0.108], [0.016, 0.055, 0.016], EBONITE, {
    shape: 'cylinder',
    rotation: [round(Math.PI / 2), 0, 0],
    finish: 'ebonite',
    ...drive,
  });

  // The belt, as its two straight runs. A loop of leather modelled properly
  // would be a dozen segments to say the same thing.
  for (const side of [-1, 1]) {
    box(`belt-${side}`, [0.065 + side * 0.033, 0.288, 0.03], [0.008, 0.29, 0.012], '#4a3524', {
      rotation: [0, 0, round(side * 0.23)],
      finish: 'ebonite',
      tint: '#6b4d33',
    });
  }

  // The reference chip the fused colour is matched against, on a small easel
  // beside the disc.
  box('chip-stand', [-0.115, 0.075, 0.06], [0.012, 0.075, 0.012], MAHOGANY, { finish: 'mahogany' });
  box('chip-back', [-0.115, 0.135, 0.06], [0.075, 0.075, 0.006], MAHOGANY, {
    finish: 'mahogany',
    rotation: [round(-0.22), 0, 0],
  });
  box('chip', [-0.115, 0.136, 0.065], [0.055, 0.055, 0.002], '#8f2a20', {
    channel: 'chip',
    rotation: [round(-0.22), 0, 0],
  });

  return items;
}

// Test 8, "Bisection of a 50cm. Line": a plain strip of wood, graduated on
// the far side only, with a slider the subject sets by eye.
export function lineBisector(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));
  box('board', [0, 0.01, 0], [0.58, 0.02, 0.08], MAHOGANY, { collider: true });
  box('face', [0, 0.021, 0.01], [0.5, 0.002, 0.03], IVORY);
  box('slider', [0.04, 0.03, 0], [0.014, 0.02, 0.06], EBONITE);
  return items;
}

export const SECONDS_PENDULUM_FRAME = {
  pivot: [0, 1.14, 0.11],
  catchPivot: [0.34, 1.1, 0.11],
};

// Test 9, "Judgment of 10 seconds time": a seconds pendulum, swung and
// stopped. This is built at full scale so its one-metre pendulum is legible.
export function secondsPendulum(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra = {}) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));

  // A broad, weighted plinth keeps the tall frame visually and physically
  // planted on the bench.
  box('base', [0, 0.045, 0], [0.72, 0.09, 0.36], MAHOGANY, {
    shape: 'roundedBox',
    finish: 'mahogany',
    bevelRadius: 0.018,
    bevelSegments: 3,
    collider: true,
  });
  box('base-bead', [0, 0.095, 0], [0.64, 0.018, 0.3], BRASS_DARK, {
    shape: 'roundedBox',
    bevelRadius: 0.007,
  });
  box('base-inlay', [0, 0.106, 0.045], [0.46, 0.005, 0.13], IRON, {
    shape: 'roundedBox',
    finish: 'ebonite',
    bevelRadius: 0.012,
  });

  for (const side of [-1, 1]) {
    box(`foot-${side}`, [side * 0.27, 0.008, 0], [0.14, 0.025, 0.29], IRON, {
      shape: 'roundedBox',
      bevelRadius: 0.008,
    });
    box(`column-shoe-${side}`, [side * 0.28, 0.16, -0.04], [0.1, 0.11, 0.1], BRASS_DARK, {
      shape: 'roundedBox',
      bevelRadius: 0.012,
    });
    box(`column-${side}`, [side * 0.28, 0.65, -0.04], [0.07, 0.94, 0.07], MAHOGANY, {
      shape: 'roundedBox',
      finish: 'mahogany',
      bevelRadius: 0.016,
      bevelSegments: 3,
    });
    box(`column-inlay-${side}`, [side * 0.28, 0.66, 0.001], [0.016, 0.76, 0.008], BRASS_DARK, {
      shape: 'roundedBox',
      bevelRadius: 0.006,
    });
    box(`column-cap-${side}`, [side * 0.28, 1.14, -0.04], [0.11, 0.1, 0.11], BRASS_DARK, {
      shape: 'roundedBox',
      bevelRadius: 0.012,
    });
  }

  box('lintel', [0, 1.2, -0.04], [0.68, 0.13, 0.14], MAHOGANY, {
    shape: 'roundedBox',
    finish: 'mahogany',
    bevelRadius: 0.022,
    bevelSegments: 3,
  });
  box('lintel-bead', [0, 1.274, -0.04], [0.6, 0.025, 0.12], BRASS_DARK, {
    shape: 'roundedBox',
    bevelRadius: 0.009,
  });

  // The dark circular scale makes the brass pendulum readable even from
  // across the room. Marks are radial, with a longer centre line.
  box('dial', [0, 1.045, 0.018], [0.49, 0.028, 0.49], IRON, {
    shape: 'cylinder',
    rotation: [Math.PI / 2, 0, 0],
    finish: 'ebonite',
  });
  box('dial-rim', [0, 1.045, 0.04], [0.505, 0.018, 0.505], BRASS_DARK, {
    shape: 'torus',
    rotation: [Math.PI / 2, 0, 0],
  });
  for (let index = -6; index <= 6; index += 1) {
    const angle = index * 0.048;
    const radius = 0.19;
    const major = index === 0 || index % 3 === 0;
    box(`tick-${index + 6}`, [
      round(Math.sin(angle) * radius),
      round(SECONDS_PENDULUM_FRAME.pivot[1] - Math.cos(angle) * radius),
      0.061,
    ], [major ? 0.012 : 0.008, major ? 0.065 : 0.042, 0.008], major ? IVORY : BRASS, {
      rotation: [0, 0, round(-angle)],
    });
  }

  box('pivot-block', [0, 1.14, 0.07], [0.15, 0.1, 0.08], BRASS_DARK, {
    shape: 'roundedBox',
    bevelRadius: 0.015,
  });
  box('pivot-boss', SECONDS_PENDULUM_FRAME.pivot, [0.075, 0.038, 0.075], BRASS, {
    shape: 'cylinder',
    rotation: [Math.PI / 2, 0, 0],
  });
  box('pivot-pin', [0, 1.14, 0.136], [0.029, 0.02, 0.029], IRON, {
    shape: 'cylinder',
    rotation: [Math.PI / 2, 0, 0],
  });

  // The rod and bob rotate together around the knife edge. The length from
  // the pivot to the bob centre is one seconds-pendulum metre.
  box('rod', [0, 0.67, 0.11], [0.012, 0.94, 0.012], BRASS, {
    shape: 'cylinder',
    channel: 'pendulum',
  });
  box('bob', [0, 0.146, 0.11], [0.19, 0.055, 0.19], BRASS_DARK, {
    shape: 'cylinder',
    rotation: [Math.PI / 2, 0, 0],
    channel: 'pendulum',
  });
  box('bob-face', [0, 0.146, 0.145], [0.154, 0.018, 0.154], BRASS, {
    shape: 'cylinder',
    rotation: [Math.PI / 2, 0, 0],
    channel: 'pendulum',
  });
  box('bob-rim', [0, 0.146, 0.151], [0.196, 0.014, 0.196], BRASS, {
    shape: 'torus',
    rotation: [Math.PI / 2, 0, 0],
    channel: 'pendulum',
  });
  box('bob-finial', [0, 0.035, 0.11], [0.055, 0.055, 0.055], BRASS_DARK, {
    shape: 'sphere',
    channel: 'pendulum',
  });

  // A side catch arrests the pendulum at the centre of its swing.
  box('catch-boss', SECONDS_PENDULUM_FRAME.catchPivot, [0.065, 0.035, 0.065], BRASS_DARK, {
    shape: 'cylinder',
    rotation: [Math.PI / 2, 0, 0],
  });
  box('catch-lever', [0.395, 1.1, 0.11], [0.12, 0.018, 0.018], BRASS, {
    channel: 'catch',
  });
  box('catch-handle', [0.455, 1.1, 0.11], [0.048, 0.048, 0.048], EBONITE, {
    shape: 'sphere',
    channel: 'catch',
  });

  return items;
}

// Test 10, "Number of Letters repeated on once Hearing": the letters were
// spoken, so the apparatus is a card rack and a screen. This is the rack.
export function cardRack(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));
  box('base', [0, 0.012, 0], [0.3, 0.024, 0.12], MAHOGANY, { collider: true });
  box('back', [0, 0.11, -0.05], [0.3, 0.2, 0.014], MAHOGANY, { rotation: [-0.18, 0, 0] });
  for (let i = 0; i < 5; i += 1) {
    box(`card-${i}`, [-0.1 + i * 0.05, round(0.06 + i * 0.008), round(-0.03 + i * 0.004)], [0.045, 0.07, 0.001], IVORY, {
      rotation: [-0.18, 0, 0],
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Recording and stimulus apparatus

// A kymograph: a smoked drum turned by clockwork, with a lever writing on it.
// The one instrument that makes a laboratory look like a laboratory.
export function kymograph(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));
  box('base', [0, 0.025, 0], [0.26, 0.05, 0.26], IRON, { shape: 'cylinder', collider: true });
  box('clockwork', [0, 0.11, 0], [0.16, 0.12, 0.16], IRON, { shape: 'cylinder' });
  box('winder', [0.1, 0.11, 0], [0.012, 0.05, 0.012], BRASS, { rotation: [0, 0, Math.PI / 2] });
  box('spindle', [0, 0.3, 0], [0.022, 0.28, 0.022], BRASS, { shape: 'cylinder' });
  // The drum, papered and smoked over a lamp until it is dead black.
  box('drum', [0, 0.32, 0], [0.19, 0.24, 0.19], '#171514', { shape: 'cylinder', spin: [0, 1, 0] });
  box('drum-hoop-top', [0, 0.44, 0], [0.196, 0.012, 0.196], BRASS_DARK, { shape: 'torus' });
  box('drum-hoop-foot', [0, 0.2, 0], [0.196, 0.012, 0.196], BRASS_DARK, { shape: 'torus' });
  // The writing lever on its own upright, stylus just touching the drum.
  box('lever-post', [0.19, 0.16, 0.02], [0.02, 0.32, 0.02], IRON, { shape: 'cylinder' });
  box('lever-boss', [0.19, 0.3, 0.02], [0.03, 0.03, 0.04], BRASS);
  box('lever', [0.135, 0.3, 0.02], [0.12, 0.006, 0.006], BRASS);
  box('stylus', [0.08, 0.3, 0.02], [0.02, 0.002, 0.002], '#cfc7b4');
  return items;
}

// A fall-screen tachistoscope, of the pattern Wundt's laboratory used and
// every laboratory after copied.
//
// The card sits in a holder behind a plate with one aperture cut in it. The
// screen in front is a shutter with a slot; a catch holds it up, and when the
// catch is knocked off the shutter falls and the slot sweeps past the
// aperture. Nothing else in the instrument does anything, which is why it
// could be trusted: there is no clockwork to run down and no spring to fatigue.
//
// `channel` marks the parts the instrument view drives from its simulation —
// the shutter, and the card that shows through the aperture — so the room copy
// and the working copy are one model.
export const TACHISTOSCOPE_FRAME = {
  // Where the aperture's top edge sits above the plinth, and where the slot's
  // lower edge is authored. The instrument view needs both: it hangs the
  // shutter so the slot starts exactly `drop` above the aperture, and `drop`
  // is a control, so the model's own rest position is only a starting point.
  apertureTop: 0.495,
  slotFoot: 0.645,
  // The leaf below the slot. It has to be at least (aperture height + the
  // longest drop) or the card shows before the shutter is released.
  lowerLeaf: 0.31,
};

export function tachistoscope(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));

  // Foot: a mahogany plinth with a moulded edge, and levelling screws, because
  // an instrument that reads by gravity has to stand true.
  box('foot', [0, 0.024, 0], [0.50, 0.048, 0.30], MAHOGANY, { finish: 'mahogany', collider: true });
  box('foot-lip', [0, 0.055, 0], [0.455, 0.016, 0.255], MAHOGANY, { finish: 'mahogany' });
  box('maker-plate', [0, 0.03, 0.152], [0.15, 0.024, 0.003], BRASS, { finish: 'brass' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(`level-${sx}-${sz}`, [sx * 0.22, 0.006, sz * 0.125], [0.028, 0.012, 0.028], BRASS_DARK, {
        shape: 'cylinder',
        finish: 'brassDull',
      });
    }
    // Binding posts: the release could be worked by a key from the next room,
    // so the wiring came up through the foot.
    box(`post-${sx}`, [sx * 0.1, 0.075, -0.115], [0.014, 0.028, 0.014], BRASS, {
      shape: 'cylinder',
      finish: 'brass',
    });
    box(`post-nut-${sx}`, [sx * 0.1, 0.094, -0.115], [0.024, 0.012, 0.024], EBONITE, {
      shape: 'cylinder',
      finish: 'ebonite',
    });
  }

  // Uprights, with brass runners the shutter falls between and shoes at the
  // foot. The runners stand proud of the face, so the screen is held off it.
  for (const side of [-1, 1]) {
    box(`upright-${side}`, [side * 0.21, 0.46, 0], [0.042, 0.80, 0.08], MAHOGANY, { finish: 'mahogany' });
    box(`runner-${side}`, [side * 0.136, 0.47, 0.03], [0.010, 0.76, 0.014], BRASS_DARK, { finish: 'brassAged' });
    box(`shoe-${side}`, [side * 0.21, 0.076, 0], [0.05, 0.022, 0.088], BRASS, { finish: 'brass' });
    box(`cap-${side}`, [side * 0.21, 0.925, 0], [0.03, 0.03, 0.03], BRASS, { shape: 'sphere', finish: 'brass' });
  }
  // Head, with the catch that holds the shutter and the release lever.
  box('head', [0, 0.885, 0], [0.50, 0.055, 0.09], MAHOGANY, { finish: 'mahogany' });
  box('head-bead', [0, 0.912, 0.034], [0.50, 0.016, 0.022], BRASS_DARK, { finish: 'brassAged' });
  box('catch-block', [0.21, 0.852, 0.055], [0.055, 0.04, 0.055], BRASS, { finish: 'brass' });
  box('catch-pivot', [0.21, 0.868, 0.082], [0.014, 0.014, 0.014], BRASS_DARK, { shape: 'cylinder', finish: 'brassDull' });
  box('catch-lever', [0.244, 0.864, 0.082], [0.068, 0.011, 0.013], BRASS, { finish: 'brass', rotation: [0, 0, -0.22] });
  box('catch-knob', [0.279, 0.856, 0.082], [0.022, 0.022, 0.022], EBONITE, { shape: 'sphere', finish: 'ebonite' });
  // The tongue the shutter's lug rests on until the lever throws it clear.
  box('catch-tongue', [0.178, 0.845, 0.055], [0.03, 0.01, 0.03], BRASS, { finish: 'brass' });

  // The face plate, and the aperture cut through it. Four pieces rather than
  // one, because the hole is what the whole instrument is about and a painted
  // rectangle would read as a sticker. It runs the full width between the
  // uprights, wider than the screen, so japanned iron shows either side of the
  // falling black leaf instead of the whole front reading as one dark slab.
  // Slightly enlarged from the physical apparatus so five letters remain
  // legible at the instrument camera's working distance.
  const AP_W = 0.20;
  const AP_H = 0.09;
  const AP_Y = 0.45;
  const FACE_W = 0.38;
  const FACE_Z = -0.03;
  const FACE_TOP = 0.85;
  const FACE_FOOT = 0.10;
  const sideWidth = (FACE_W - AP_W) / 2;
  const topHeight = FACE_TOP - (AP_Y + AP_H / 2);
  const footHeight = AP_Y - AP_H / 2 - FACE_FOOT;
  const FACE = [
    ['face-top', [0, AP_Y + AP_H / 2 + topHeight / 2, FACE_Z], [FACE_W, topHeight, 0.012]],
    ['face-foot', [0, FACE_FOOT + footHeight / 2, FACE_Z], [FACE_W, footHeight, 0.012]],
    ['face-left', [-(AP_W / 2 + sideWidth / 2), AP_Y, FACE_Z], [sideWidth, AP_H, 0.012]],
    ['face-right', [AP_W / 2 + sideWidth / 2, AP_Y, FACE_Z], [sideWidth, AP_H, 0.012]],
  ];
  // Mahogany, not japanned iron: an iron face is the same black as the screen
  // in front of it, and the two merge into one slab from any distance. Only
  // the ground the card is read against needs to be dead black, and that is a
  // small panel behind the aperture.
  for (const [suffix, offset, size] of FACE) {
    box(suffix, offset, size, MAHOGANY, { finish: 'mahogany' });
  }
  // Leave the aperture physically open. The face pieces already frame it;
  // another solid plate here would hide the card when the slot passes.
  // The ground the card is read against, behind the card and dead matte: it
  // is the only part that wants to be black, which is why the face plate is
  // not.
  box('ground', [0, AP_Y, -0.064], [0.23, 0.15, 0.006], IRON, { finish: 'iron' });
  // Fixation mark: a brass cross the subject holds their eye on between
  // exposures, so the card lands on the fovea and not wherever they happened
  // to be looking.
  box('fix-v', [0, AP_Y + 0.115, -0.022], [0.004, 0.026, 0.004], BRASS, { finish: 'brass' });
  box('fix-h', [0, AP_Y + 0.115, -0.022], [0.026, 0.004, 0.004], BRASS, { finish: 'brass' });

  // The card itself, seen through the aperture whenever the slot is over it.
  box('card', [0, AP_Y, -0.052], [AP_W - 0.008, AP_H - 0.008, 0.002], IVORY, {
    finish: 'card',
    channel: 'card',
  });
  box('card-holder', [0, AP_Y - 0.048, -0.056], [0.17, 0.022, 0.018], MAHOGANY, { finish: 'mahogany' });

  // The shutter: two leaves with the slot between them, running in the brass
  // guides. `channel: 'shutter'` is what the instrument view moves. Narrower
  // than the face by design — see FACE_W above.
  const SLOT = 0.03;
  const SH_W = 0.25;
  const SH_Z = 0.026;
  const SLOT_TOP = 0.675;
  const SLOT_FOOT = SLOT_TOP - SLOT;
  const LEAF = TACHISTOSCOPE_FRAME.lowerLeaf;
  const shutter = (suffix, offset, size, color, extra = {}) =>
    box(suffix, offset, size, color, { channel: 'shutter', ...extra });

  shutter('shutter-upper', [0, SLOT_TOP + 0.15, SH_Z], [SH_W, 0.3, 0.010], EBONITE, { finish: 'ebonite' });
  shutter('shutter-lower', [0, SLOT_FOOT - LEAF / 2, SH_Z], [SH_W, LEAF, 0.010], EBONITE, { finish: 'ebonite' });
  // Brass binding on the slot edges. It is what makes the slot read as a slot
  // rather than a join between two black panels, and on the real instrument it
  // is there to keep the edge true after a few thousand falls.
  shutter('slot-bind-upper', [0, SLOT_TOP + 0.004, SH_Z + 0.002], [SH_W, 0.008, 0.013], BRASS, { finish: 'brass' });
  shutter('slot-bind-lower', [0, SLOT_FOOT - 0.004, SH_Z + 0.002], [SH_W, 0.008, 0.013], BRASS, { finish: 'brass' });
  shutter('shutter-rail', [0, SLOT_TOP + 0.297, SH_Z], [SH_W, 0.016, 0.016], BRASS_DARK, { finish: 'brassAged' });
  shutter('shutter-lug', [0.145, SLOT_TOP + 0.287, SH_Z], [0.032, 0.022, 0.022], BRASS, { finish: 'brass' });
  shutter('shutter-knob', [0, SLOT_FOOT - LEAF + 0.05, SH_Z + 0.014], [0.03, 0.03, 0.03], EBONITE, {
    shape: 'sphere',
    finish: 'ebonite',
  });
  // Brass edging down both sides of each leaf. Without it the screen is a
  // rectangle of nothing; with it, it reads as a board someone made, and it is
  // also what a real one had — the edges take the whole of the arrest.
  for (const side of [-1, 1]) {
    shutter(`edge-upper-${side}`, [side * (SH_W / 2 - 0.006), SLOT_TOP + 0.15, SH_Z + 0.002], [0.008, 0.3, 0.012], BRASS_DARK, {
      finish: 'brassAged',
    });
    shutter(`edge-lower-${side}`, [side * (SH_W / 2 - 0.006), SLOT_FOOT - LEAF / 2, SH_Z + 0.002], [0.008, LEAF, 0.012], BRASS_DARK, {
      finish: 'brassAged',
    });
  }
  shutter('shutter-foot', [0, SLOT_FOOT - LEAF + 0.005, SH_Z + 0.002], [SH_W, 0.01, 0.012], BRASS_DARK, {
    finish: 'brassAged',
  });

  // A graduated scale let into the front of one upright: the drop height is
  // set against this. The divisions are geometry, not a dial texture — a dial
  // map on an 18 mm strip prints an arc of an unrelated circle.
  box('scale', [-0.21, 0.47, 0.043], [0.02, 0.64, 0.003], IVORY, { finish: 'ivory' });
  for (let i = 0; i < 13; i += 1) {
    const major = i % 4 === 0;
    box(`scale-${i}`, [-0.21 + (major ? 0 : 0.004), 0.17 + i * 0.05, 0.045], [major ? 0.02 : 0.012, 0.002, 0.002], IRON, {
      finish: 'iron',
    });
  }
  // The index that reads against it, carried on the shutter.
  shutter('index', [-0.21, SLOT_FOOT - LEAF / 2, 0.046], [0.026, 0.004, 0.004], BRASS, { finish: 'brass' });

  return items;
}

// Where the sledge coil's moving and live parts are, so the instrument view
// can drive them without re-deriving the model.
export const COIL_FRAME = {
  // The secondary carriage runs along +x. This is its centre at nought on the
  // scale, where the two bobbins are cheek to cheek; the reading in
  // centimetres is added to it directly, which is the whole point of the
  // instrument being built to a scale.
  carriageNear: -0.02,
  // Where the carriage is authored: ten centimetres out, so the piece standing
  // on the bench reads as two coils and not as one lump. The instrument view
  // offsets from here.
  carriageRest: 10,
  // The fixed discharge ball. The other rides a micrometer screw, and the
  // spark is struck across whatever they are set to — real millimetres, so a
  // spark that jumps two of them means four kilovolts and nothing else.
  gapFixed: [0.245, 0.145, 0.052],
  gapBallRadius: 0.011,
  // The Wagner hammer's armature, which the field pulls down on each break.
  hammerPivot: [-0.225, 0.115, 0.045],
};

// A du Bois-Reymond sledge coil: the induction apparatus that supplied the
// shocks and the make-and-break for half the experiments in the building.
//
// The primary is fixed at the near end of the slide. The secondary rides a
// carriage that runs up to it, and the scale under the carriage is the
// measurement — a shock is quoted as a distance, because that is the only
// part of it anyone could read off. The Wagner hammer at the far end breaks
// the primary circuit sixty times a second; the discharge balls beside the
// terminals let you see how hard it is working.
export function inductionCoil(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));

  // Mahogany bed with a moulded edge, on turned feet.
  box('bed', [0.04, 0.021, 0], [0.62, 0.042, 0.20], MAHOGANY, { finish: 'mahogany', collider: true });
  box('bed-lip', [0.04, 0.049, 0], [0.575, 0.014, 0.165], MAHOGANY, { finish: 'mahogany' });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(`foot-${sx}-${sz}`, [0.04 + sx * 0.27, 0.006, sz * 0.078], [0.028, 0.012, 0.028], BRASS_DARK, {
        shape: 'cylinder',
        finish: 'brassAged',
      });
    }
  }
  box('maker-plate', [0.04, 0.028, 0.101], [0.14, 0.022, 0.003], BRASS, { finish: 'brass' });

  // The slide: two brass rails the carriage runs on, and the scale between.
  for (const side of [-1, 1]) {
    box(`rail-${side}`, [0.13, 0.062, side * 0.052], [0.44, 0.012, 0.012], BRASS, { finish: 'brass' });
  }
  box('scale', [0.08, 0.058, 0], [0.24, 0.003, 0.03], IVORY, { finish: 'ivory' });
  // Twenty centimetres of graduations at true scale, every fifth one long.
  // The carriage index reads against these, so a centimetre here is a
  // centimetre in the simulation.
  for (let i = 0; i <= 20; i += 1) {
    const major = i % 5 === 0;
    box(`grad-${i}`, [COIL_FRAME.carriageNear + i * 0.01, 0.0605, major ? 0 : 0.008], [0.0015, 0.001, major ? 0.026 : 0.012], IRON, {
      finish: 'iron',
    });
  }

  // Primary coil: a short thick bobbin on the fixed end, wound with heavy wire
  // and lacquered. Cheeks either side, as a bobbin has.
  box('primary-core', [-0.14, 0.115, 0], [0.078, 0.115, 0.078], IRON, {
    shape: 'cylinder',
    rotation: [0, 0, round(Math.PI / 2)],
    finish: 'iron',
  });
  box('primary-winding', [-0.14, 0.115, 0], [0.094, 0.10, 0.094], '#7a4a22', {
    shape: 'cylinder',
    rotation: [0, 0, round(Math.PI / 2)],
    finish: 'brassAged',
    tint: '#8a6136',
  });
  for (const end of [-1, 1]) {
    box(`primary-cheek-${end}`, [-0.14 + end * 0.058, 0.115, 0], [0.11, 0.012, 0.11], MAHOGANY, {
      shape: 'cylinder',
      rotation: [0, 0, round(Math.PI / 2)],
      finish: 'mahogany',
    });
  }
  box('primary-standard', [-0.14, 0.072, 0], [0.05, 0.05, 0.09], MAHOGANY, { finish: 'mahogany' });
  // The soft-iron core bundle showing at the ends, which is what the hammer
  // is answering to.
  for (const end of [-1, 1]) {
    box(`core-${end}`, [-0.14 + end * 0.07, 0.115, 0], [0.03, 0.014, 0.03], '#6a6f74', {
      shape: 'cylinder',
      rotation: [0, 0, round(Math.PI / 2)],
      finish: 'steel',
    });
  }

  // Secondary coil on its carriage. `channel: 'carriage'` is what the
  // instrument view slides; everything about it is authored at the near end.
  const carriage = { channel: 'carriage' };
  box('carriage-plate', [COIL_FRAME.carriageNear + COIL_FRAME.carriageRest / 100, 0.07, 0], [0.11, 0.018, 0.13], MAHOGANY, {
    finish: 'mahogany',
    ...carriage,
  });
  box('carriage-winding', [COIL_FRAME.carriageNear + COIL_FRAME.carriageRest / 100, 0.13, 0], [0.115, 0.085, 0.115], '#6b4523', {
    shape: 'cylinder',
    rotation: [0, 0, round(Math.PI / 2)],
    finish: 'brassAged',
    tint: '#7d5730',
    ...carriage,
  });
  for (const end of [-1, 1]) {
    box(`carriage-cheek-${end}`, [COIL_FRAME.carriageNear + COIL_FRAME.carriageRest / 100 + end * 0.05, 0.13, 0], [0.135, 0.012, 0.135], MAHOGANY, {
      shape: 'cylinder',
      rotation: [0, 0, round(Math.PI / 2)],
      finish: 'mahogany',
      ...carriage,
    });
  }
  box('carriage-knob', [COIL_FRAME.carriageNear + COIL_FRAME.carriageRest / 100, 0.196, 0], [0.03, 0.03, 0.03], EBONITE, {
    shape: 'sphere',
    finish: 'ebonite',
    ...carriage,
  });
  box('carriage-stem', [COIL_FRAME.carriageNear + COIL_FRAME.carriageRest / 100, 0.182, 0], [0.012, 0.03, 0.012], BRASS, {
    shape: 'cylinder',
    finish: 'brass',
    ...carriage,
  });
  // The index that reads against the scale.
  box('carriage-index', [COIL_FRAME.carriageNear + COIL_FRAME.carriageRest / 100, 0.062, 0.026], [0.003, 0.006, 0.024], BRASS, {
    finish: 'brass',
    ...carriage,
  });

  // Wagner hammer: a sprung armature over the core end, its platinum contact,
  // and the screw that sets the gap. This is the part that buzzes.
  box('hammer-post', [-0.245, 0.09, 0.045], [0.016, 0.08, 0.016], BRASS, { shape: 'cylinder', finish: 'brass' });
  box('hammer-spring', [-0.205, 0.128, 0.045], [0.075, 0.004, 0.012], '#8d9298', {
    finish: 'steel',
    channel: 'hammer',
    pivot: COIL_FRAME.hammerPivot,
  });
  box('hammer-armature', [-0.165, 0.128, 0.045], [0.026, 0.012, 0.026], '#6a6f74', {
    finish: 'steel',
    channel: 'hammer',
    pivot: COIL_FRAME.hammerPivot,
  });
  box('hammer-contact', [-0.205, 0.121, 0.045], [0.008, 0.006, 0.008], '#d8d2c4', {
    shape: 'cylinder',
    finish: 'ivory',
    channel: 'hammer',
    pivot: COIL_FRAME.hammerPivot,
  });
  box('contact-screw', [-0.205, 0.104, 0.045], [0.01, 0.03, 0.01], BRASS, { shape: 'cylinder', finish: 'brass' });
  box('contact-pillar', [-0.205, 0.075, 0.045], [0.018, 0.03, 0.018], BRASS, { shape: 'cylinder', finish: 'brass' });
  box('screw-head', [-0.205, 0.121, 0.045], [0.022, 0.008, 0.022], BRASS, { shape: 'cylinder', finish: 'brass' });

  // The key: a brass lever on an ebonite block that closes the primary. Its
  // own channel, so the view can drop it when the circuit is made.
  box('key-block', [-0.075, 0.062, -0.062], [0.07, 0.028, 0.05], EBONITE, { finish: 'ebonite' });
  box('key-anvil', [-0.05, 0.079, -0.062], [0.016, 0.008, 0.016], BRASS, { shape: 'cylinder', finish: 'brass' });
  box('key-lever', [-0.088, 0.09, -0.062], [0.08, 0.008, 0.014], BRASS, {
    finish: 'brass',
    channel: 'key',
    pivot: [-0.118, 0.09, -0.062],
  });
  box('key-knob', [-0.05, 0.098, -0.062], [0.022, 0.022, 0.022], EBONITE, {
    shape: 'sphere',
    finish: 'ebonite',
    channel: 'key',
    pivot: [-0.118, 0.09, -0.062],
  });
  box('key-pivot', [-0.118, 0.09, -0.062], [0.012, 0.02, 0.012], BRASS, { shape: 'cylinder', finish: 'brass' });

  // Discharge balls on the secondary terminals: the spark jumps here, and it
  // is the only reading you get of how hard the coil is being driven.
  const [gx, gy, gz] = COIL_FRAME.gapFixed;
  const R = COIL_FRAME.gapBallRadius;
  box('gap-pillar-l', [gx, 0.1, gz], [0.014, 0.09, 0.014], BRASS, { shape: 'cylinder', finish: 'brass' });
  box('gap-ball-l', [gx, gy, gz], [R * 2, R * 2, R * 2], BRASS, { shape: 'sphere', finish: 'brass' });
  // The moving ball, on its screw. `channel: 'gap'` slides it by the setting,
  // which is a millimetre or two — small, and correctly so.
  box('gap-pillar-r', [gx + R * 2, 0.1, gz], [0.014, 0.09, 0.014], BRASS, {
    shape: 'cylinder',
    finish: 'brass',
    channel: 'gap',
  });
  box('gap-ball-r', [gx + R * 2, gy, gz], [R * 2, R * 2, R * 2], BRASS, {
    shape: 'sphere',
    finish: 'brass',
    channel: 'gap',
  });
  box('gap-screw', [gx + R * 2, 0.062, gz], [0.026, 0.02, 0.026], BRASS, {
    shape: 'cylinder',
    finish: 'brassAged',
  });

  // Binding posts, and the electrodes on their flex, coiled on the bed.
  for (const side of [-1, 1]) {
    box(`post-${side}`, [0.31, 0.068, side * 0.055], [0.014, 0.032, 0.014], BRASS, {
      shape: 'cylinder',
      finish: 'brass',
    });
    box(`post-nut-${side}`, [0.31, 0.09, side * 0.055], [0.024, 0.012, 0.024], EBONITE, {
      shape: 'cylinder',
      finish: 'ebonite',
    });
    box(`electrode-${side}`, [0.29, 0.075, side * 0.085], [0.026, 0.075, 0.026], BRASS, {
      shape: 'cylinder',
      rotation: [round(Math.PI / 2), 0, 0],
      finish: 'brassAged',
    });
    box(`electrode-grip-${side}`, [0.29, 0.075, side * 0.085], [0.03, 0.04, 0.03], EBONITE, {
      shape: 'cylinder',
      rotation: [round(Math.PI / 2), 0, 0],
      finish: 'ebonite',
    });
    box(`flex-${side}`, [0.315, 0.06, side * 0.085], [0.008, 0.008, 0.06], '#3a2a1c', { finish: 'ebonite' });
  }

  return items;
}

export function tuningForks(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));
  // Resonance box, open at one end.
  box('box-top', [0, 0.09, 0], [0.26, 0.012, 0.09], DEAL, { collider: true });
  box('box-front', [0, 0.05, 0.045], [0.26, 0.09, 0.008], DEAL);
  box('box-back', [0, 0.05, -0.045], [0.26, 0.09, 0.008], DEAL);
  box('box-end', [-0.126, 0.05, 0], [0.008, 0.09, 0.09], DEAL);
  box('box-foot', [0, 0.008, 0], [0.26, 0.016, 0.09], '#6f593c');
  // The fork standing on it, and two smaller ones lying beside.
  box('fork-stem', [-0.05, 0.115, 0], [0.012, 0.05, 0.012], '#8d9298', { shape: 'cylinder' });
  for (const tine of [-1, 1]) {
    box(`fork-tine-${tine}`, [-0.05 + tine * 0.014, 0.2, 0], [0.008, 0.12, 0.008], '#8d9298');
  }
  for (let i = 0; i < 2; i += 1) {
    box(`fork-spare-${i}`, [0.06 + i * 0.055, 0.102, 0], [0.09, 0.007, 0.007], '#8d9298', {
      rotation: [0, round(0.3 + i * 0.5), 0],
    });
  }
  return items;
}

// A wet-cell battery: two glass jars of bichromate solution on a stand, the
// power behind the coil and the chronoscope's magnet.
export function batteryJars(id, x, y, z, yaw = 0) {
  const origin = [x, y, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, yaw, color, extra));
  box('stand', [0, 0.01, 0], [0.28, 0.02, 0.15], MAHOGANY, { collider: true });
  for (const side of [-1, 1]) {
    const along = side * 0.065;
    box(`jar-${side}`, [along, 0.11, 0], [0.1, 0.18, 0.1], '#b9cfc6', { shape: 'cylinder', glass: true, opacity: 0.32 });
    box(`fluid-${side}`, [along, 0.08, 0], [0.088, 0.11, 0.088], '#7a5a1e', { shape: 'cylinder', glass: true, opacity: 0.75 });
    box(`plate-${side}`, [along, 0.14, 0], [0.05, 0.14, 0.006], '#3c3a36');
    box(`post-${side}`, [along, 0.22, 0], [0.012, 0.04, 0.012], BRASS, { shape: 'cylinder' });
  }
  return items;
}

// A plain tin-shaded pendant on a twisted flex. Columbia had electric light
// by the mid-nineties, and a laboratory took the cheap industrial fitting
// rather than anything a parlor would recognise.
export function pendantLamp(id, x, ceilingY, z, options = {}) {
  const drop = options.drop ?? 0.9;
  const origin = [x, ceilingY, z];
  const items = [];
  const box = (suffix, offset, size, color, extra) =>
    items.push(part(`${id}-${suffix}`, origin, offset, size, 0, color, extra));
  box('rose', [0, -0.03, 0], [0.09, 0.03, 0.09], IVORY, { shape: 'cylinder' });
  box('flex', [0, -drop / 2, 0], [0.008, drop, 0.008], '#2a2622', { shape: 'cylinder' });
  box('shade', [0, -drop - 0.06, 0], [0.26, 0.13, 0.26], '#4b5a52', { shape: 'cone', rotation: [Math.PI, 0, 0] });
  box('lamp', [0, -drop - 0.14, 0], [0.07, 0.09, 0.07], '#fff2cf', { shape: 'sphere', emissive: '#ffdc9a' });
  return items;
}

// ---------------------------------------------------------------------------

// Everything the props panel can stand on its own on the grid, and the note
// it shows beside each piece.
export const INSTRUMENTS = {
  'lab-bench': {
    label: 'Laboratory bench',
    build: (id, o, recipe) => labBench(id, o[0], o[2], 0, {
      ...(recipe?.values ?? {}),
      previewQuality: recipe?.previewQuality,
    }),
    note: 'Editable named timber parts with an ImageGen-authored PBR surface.',
    family: 'laboratory-bench',
    schema: LAB_BENCH_SCHEMA,
    defaultSeed: 17,
    historicalStatus: 'draft — material and inferred construction require reference review',
    performanceBudget: { maxParts: 32, maxMaterials: 6 },
  },
  'lab-stool': { label: 'Laboratory stool', build: (id, o) => labStool(id, o[0], o[2]), note: 'Loose: the subject pulls it up.' },
  dynamometer: { label: 'Dynamometer', build: (id, o) => dynamometer(id, o[0], o[1], o[2]), note: "Cattell test 1: strength of squeeze." },
  'movement-rail': { label: 'Rate-of-movement rail', build: (id, o) => movementRail(id, o[0], o[1], o[2]), note: 'Cattell test 2: 50cm hand movement.' },
  aesthesiometer: { label: 'Aesthesiometer', build: (id, o) => aesthesiometer(id, o[0], o[1], o[2]), note: 'Cattell test 3: two-point threshold.' },
  algometer: { label: 'Algometer', build: (id, o) => algometer(id, o[0], o[1], o[2]), note: 'Cattell test 4: pressure causing pain.' },
  'lifted-weights': { label: 'Lifted weights', build: (id, o) => liftedWeights(id, o[0], o[1], o[2]), note: 'Cattell test 5: least noticeable difference.' },
  'hipp-chronoscope': { label: 'Hipp chronoscope', build: (id, o) => hippChronoscope(id, o[0], o[1], o[2]), note: 'Tests 6-7: times to the thousandth.' },
  'reaction-key': { label: 'Reaction key', build: (id, o) => reactionKey(id, o[0], o[1], o[2]), note: 'The key the chronoscope stops on.' },
  'colour-wheel': { label: 'Colour wheel', build: (id, o) => colourWheel(id, o[0], o[1], o[2]), note: 'Belt-driven rotator for Maxwell discs. Crank to fusion and the papers mix.' },
  'line-bisector': { label: 'Line bisector', build: (id, o) => lineBisector(id, o[0], o[1], o[2]), note: 'Cattell test 8: bisecting 50cm by eye.' },
  'seconds-pendulum': { label: 'Seconds pendulum', build: (id, o) => secondsPendulum(id, o[0], o[1], o[2]), note: 'Cattell test 9: judging ten seconds.' },
  'card-rack': { label: 'Card rack', build: (id, o) => cardRack(id, o[0], o[1], o[2]), note: 'Test 10: letters repeated on hearing.' },
  kymograph: { label: 'Kymograph', build: (id, o) => kymograph(id, o[0], o[1], o[2]), note: 'Smoked drum and writing lever.' },
  tachistoscope: { label: 'Tachistoscope', build: (id, o) => tachistoscope(id, o[0], o[1], o[2]), note: 'Fall-screen exposure apparatus.' },
  'induction-coil': { label: 'Induction coil', build: (id, o) => inductionCoil(id, o[0], o[1], o[2]), note: 'du Bois-Reymond sledge coil.' },
  'tuning-forks': { label: 'Tuning forks', build: (id, o) => tuningForks(id, o[0], o[1], o[2]), note: 'Forks on a resonance box.' },
  'battery-jars': { label: 'Battery jars', build: (id, o) => batteryJars(id, o[0], o[1], o[2]), note: 'Bichromate cells for coil and magnet.' },
  'pendant-lamp': { label: 'Pendant lamp', build: (id, o) => pendantLamp(id, o[0], o[1] + 1.3, o[2], { drop: 0.7 }), note: 'Tin-shaded electric pendant.' },
};

// Unused import guard: hash01 is here for builders that want jitter.
void hash01;

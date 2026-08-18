// Built furniture: pieces made of boards plus catalog models, where a single
// box would not do. Framework-free, so zones and tests both read it.

import { modelSize } from './modelPacks.js';

// Books that stand on a shelf, spine out, and the loose stacks that fill the
// gaps. The pack was split per book by scripts/models/convert-pack.mjs.
const VOLUMES = ['elegan_old_book_pack__Book_3', 'elegan_old_book_pack__Book_6'];
const STACKS = [
  'elegan_old_book_pack__Book_pack_3',
  'elegan_old_book_pack__Book_pack_5',
  'elegan_old_book_pack__Book_pack_6',
  'elegan_old_book_pack__Book_pack_9',
];

export function hash01(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export const round = (value) => Math.round(value * 1e3) / 1e3;

// A local offset placed in world space around a yaw-rotated piece.
export function place(origin, [dx, dy, dz], yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    round(origin[0] + dx * cos + dz * sin),
    round(origin[1] + dy),
    round(origin[2] - dx * sin + dz * cos),
  ];
}

// A wall bookcase, filled. The local frame runs width on x and depth on z with
// the opening toward +z, so a case standing against the east wall takes
// yaw -PI/2. Shelf pitch follows the tallest volume rather than a round
// number, or the books would not fit under the board above.
export function bookcase(id, x, z, yaw, options = {}) {
  const width = options.width ?? 2.6;
  const height = options.height ?? 2.5;
  const depth = options.depth ?? 0.45;
  const seed = options.seed ?? 1;
  const carcass = options.color ?? '#3d2f22';
  const board = 0.04;
  const plinth = 0.12;
  const origin = [x, 0, z];
  const items = [];
  const box = (suffix, offset, size, color = carcass, extra = {}) => {
    items.push({
      id: `${id}-${suffix}`,
      kind: 'furniture',
      position: place(origin, offset, yaw),
      size: size.map(round),
      yaw,
      color,
      ...extra,
    });
  };

  // Carcass: plinth, two sides, back, top.
  box('plinth', [0, plinth / 2, 0], [width, plinth, depth]);
  box('top', [0, height - board / 2, 0], [width, board, depth]);
  for (const side of [-1, 1]) {
    box(`side-${side > 0 ? 'r' : 'l'}`, [side * (width - board) / 2, height / 2, 0], [board, height, depth]);
  }
  box('back', [0, height / 2, -(depth - 0.02) / 2], [width - board * 2, height, 0.02]);

  // Shelves, spaced to clear the tallest volume.
  const tallest = Math.max(...VOLUMES.map((name) => modelSize(name)[1]));
  const clear = tallest + 0.06;
  const bays = Math.max(1, Math.floor((height - plinth - board) / (clear + board)));
  const pitch = (height - plinth - board) / bays;
  const shelves = [];
  for (let bay = 0; bay < bays; bay += 1) {
    const shelfY = plinth + bay * pitch;
    if (bay > 0) box(`shelf-${bay}`, [0, shelfY - board / 2, 0], [width - board * 2, board, depth - 0.04]);
    shelves.push(shelfY);
  }

  // Fill each shelf: runs of upright volumes with a stack dropped in now and
  // then, and a gap at the end so it does not read as a wall of spines.
  const inner = width - board * 2 - 0.06;
  let placed = 0;
  shelves.forEach((shelfY, bay) => {
    let along = -inner / 2;
    const limit = inner / 2 - 0.1;
    // The roll comes off the attempt, not the book count: a gap has to change
    // the roll too, or every following attempt repeats it.
    for (let attempt = 0; along < limit && attempt < 120; attempt += 1) {
      const roll = hash01(seed * 3.7 + bay * 11.3 + attempt * 2.9);
      if (roll < 0.14) {
        // A gap: a shelf packed end to end reads as wallpaper, not as books.
        along += 0.04 + roll * 0.4;
        continue;
      }
      const stacked = roll > 0.82;
      const model = stacked
        ? STACKS[Math.floor(roll * 991) % STACKS.length]
        : VOLUMES[Math.floor(roll * 617) % VOLUMES.length];
      const [sx, sy, sz] = modelSize(model);
      // Turned side-on: the model's z runs along the shelf and its x becomes
      // the depth into it, which is how a book sits with its spine out.
      // Anything that will not fit is skipped, not fatal: the next roll may be
      // a thin volume that does.
      if (along + sz > limit || sy > pitch - board - 0.01) continue;
      items.push({
        id: `${id}-book-${bay}-${placed}`,
        kind: 'furniture',
        model,
        // Front edge set back from the shelf lip.
        position: place(origin, [along + sz / 2, shelfY, depth / 2 - 0.04 - sx / 2], yaw),
        size: [sx, sy, sz],
        yaw: yaw + Math.PI / 2,
        collider: false,
      });
      along += sz + 0.004;
      placed += 1;
    }
  });


  return items;
}

// A folding screen: three leaves on hinges, standing in a shallow zig-zag.
// Every consulting room had one — it is what a patient undressed behind —
// and there is no model for it in any pack. Each leaf is a stile-and-rail
// frame with a fabric panel set into it, which is four boards and a fill.
//
// The local frame runs the span on x with the leaves facing +z, so a screen
// standing across a corner takes the yaw of the wall it shields.
export function screen(id, x, z, yaw, options = {}) {
  const leaves = options.leaves ?? 3;
  const leafW = options.leafWidth ?? 0.58;
  const height = options.height ?? 1.72;
  const frameColor = options.frame ?? '#3b2b1d';
  const panelColor = options.panel ?? '#7b6a4e';
  const stile = 0.055;
  const thickness = 0.035;
  // Leaves alternate about the hinge line, so the screen stands on its own.
  const fold = options.fold ?? 0.34;
  const origin = [x, 0, z];
  const items = [];

  let along = -((leaves - 1) * leafW) / 2;
  for (let leaf = 0; leaf < leaves; leaf += 1) {
    const swing = (leaf % 2 === 0 ? 1 : -1) * fold;
    const centre = [along, 0, Math.cos(swing) * 0 + (leaf % 2 === 0 ? 0.09 : -0.09)];
    const leafYaw = yaw + swing;
    const base = place(origin, centre, yaw);
    const box = (suffix, offset, size, color) => {
      items.push({
        id: `${id}-${suffix}-${leaf}`,
        kind: 'furniture',
        position: place(base, offset, leafYaw),
        size: size.map(round),
        yaw: leafYaw,
        color,
        collider: false,
      });
    };
    // Two stiles, a top and bottom rail, then the panel inside them.
    for (const side of [-1, 1]) {
      box(`stile-${side < 0 ? 'l' : 'r'}`, [side * (leafW / 2 - stile / 2), height / 2, 0], [stile, height, thickness], frameColor);
    }
    box('rail-top', [0, height - stile / 2, 0], [leafW, stile, thickness], frameColor);
    box('rail-foot', [0, stile / 2, 0], [leafW, stile, thickness], frameColor);
    box(
      'panel',
      [0, height / 2, 0],
      [leafW - stile * 2, height - stile * 2, thickness * 0.6],
      panelColor,
    );
    along += leafW;
  }

  return items;
}

// A glass vase of cut flowers, standing on a table.
//
// One loose body, not one per stem. Eight flower bodies sharing a vase neck
// means eight colliders interpenetrating on the first frame, and the solver
// answers that by firing them across the room — which is what happened. A
// bouquet behaves as one object anyway: it tips, rolls and lands together.
// Splitting it into loose stems is worth doing at the moment the vase
// breaks, and wants a fracture pass that does not exist yet.
//
// A bloom is one lathe rather than a head of modelled petals: revolved on five
// to seven segments, a cupped profile already gives a faceted edge and a
// dished centre, which is what a flower reads as at arm's length. Thirty
// petals per head would be thirty times the meshes for the same silhouette.

// The bouquet is authored rather than rolled, because the examination record
// states what is in it: two roses gone over, sweet peas, one stem of
// mignonette. See examine/examinables.js. Roses come first, so a bunch cut
// short in the workbench is still a bunch and not a handful of sweet peas.
//
// Five tints across eight stems, not eight: cut from one garden on one
// morning, a bunch is not a paint chart, and every extra colour is another
// material on a prop that already carries glass and water.
const BOUQUET = [
  { kind: 'rose', angle: 0.35, lean: 0.30, stem: 0.30, head: 0.050, colour: '#bf4f68' },
  { kind: 'rose', angle: 2.45, lean: 0.20, stem: 0.35, head: 0.046, colour: '#ddc0c2' },
  { kind: 'pea', angle: 1.35, lean: 0.44, stem: 0.26, head: 0.025, colour: '#c5aed4' },
  { kind: 'pea', angle: 3.05, lean: 0.48, stem: 0.22, head: 0.022, colour: '#e7e0e6' },
  { kind: 'pea', angle: 4.15, lean: 0.38, stem: 0.29, head: 0.024, colour: '#c5aed4' },
  { kind: 'pea', angle: 5.25, lean: 0.52, stem: 0.21, head: 0.021, colour: '#e7e0e6' },
  { kind: 'pea', angle: 5.95, lean: 0.28, stem: 0.31, head: 0.023, colour: '#c5aed4' },
  { kind: 'spike', angle: 4.75, lean: 0.16, stem: 0.37, head: 0.019, colour: '#c3c69b' },
];

const STEM_GREEN = '#5a7340';
const LEAF_GREEN = '#4c6a37';

// Blown open: the outer petals have dropped away from the vertical, so the
// head is wide and shallow with the centre showing.
function bloomProfile(kind, r) {
  const h = kind === 'rose' ? r * 0.78 : r * 1.15;
  if (kind === 'spike') {
    // Mignonette is a spike of tiny florets, not a cup. Waisted, so the
    // revolve keeps a knobbly edge instead of a smooth cone.
    return [
      [0, 0], [r * 0.8, r * 0.5], [r * 0.5, r * 1.1], [r * 0.95, r * 1.7],
      [r * 0.55, r * 2.3], [r * 0.8, r * 2.9], [r * 0.35, r * 3.4], [0, r * 3.8],
    ];
  }
  const rim = kind === 'rose' ? 0.94 : 0.88;
  return [
    [0, 0],
    [r * 0.40, h * 0.18],
    [r * 0.78, h * 0.50],
    [r, h * 0.86],
    [r * rim, h],
    [r * 0.58, h * 0.80],
    [r * 0.26, h * 0.73],
    [r * 0.09, h * 0.79],
    [0, h * 0.74],
  ];
}

export function vaseOfFlowers(id, x, y, z, options = {}) {
  // The workbench can cut the bunch short; it cannot add stems that were not
  // authored, because the record says what is in the vase.
  const count = Math.min(BOUQUET.length, Math.max(1, Math.round(options.count ?? BOUQUET.length)));
  const vaseH = options.height ?? 0.28;
  const vaseR = options.radius ?? 0.085;
  const half = vaseH / 2;
  const parts = [];

  // Pressed glass on a foot: a turned profile, so the light has a belly and a
  // lip to break on instead of one straight cylinder wall. Heights are local
  // to the body centre, which sits at mid-glass.
  const wall = [
    [0, -half], [vaseR * 0.62, -half], [vaseR * 0.66, -half + 0.008],
    [vaseR * 0.35, -half + 0.022], [vaseR * 0.33, -half + 0.04],
    [vaseR * 0.56, -half + 0.068], [vaseR * 0.82, -half + 0.11],
    [vaseR * 0.92, half - 0.126], [vaseR * 0.82, half - 0.082],
    [vaseR * 0.66, half - 0.042], [vaseR * 0.73, half - 0.01],
    [vaseR * 0.78, half],
    // Back down the inside, so the glass has a thickness at the lip.
    [vaseR * 0.70, half], [vaseR * 0.60, half - 0.012],
    [vaseR * 0.58, half - 0.044], [vaseR * 0.75, half - 0.09],
    [vaseR * 0.84, half - 0.15], [vaseR * 0.74, -half + 0.096],
    [vaseR * 0.49, -half + 0.062], [vaseR * 0.27, -half + 0.03],
    [vaseR * 0.25, -half + 0.02], [0, -half + 0.02],
  ];
  parts.push({
    shape: 'lathe',
    profile: wall.map(([r, h]) => [round(r), round(h)]),
    radialSegments: 40,
    size: [vaseR * 2, vaseH, vaseR * 2],
    position: [0, 0, 0],
    finish: 'bottleGlass',
    color: options.glass ?? '#d3e2dc',
    wallThickness: 0.003,
    attenuationDistance: 0.5,
  });

  // Three days in the same water: clouded, an inch under the tidemark it dried
  // onto the glass. The examination reads both, so both are modelled.
  const waterTop = half - 0.086;
  parts.push({
    shape: 'cylinder',
    size: [vaseR * 1.56, vaseH * 0.52, vaseR * 1.56],
    position: [0, round(waterTop - vaseH * 0.26), 0],
    finish: 'bottleLiquid',
    color: '#5d6b41',
    surfaceColor: '#c8cdae',
    transmission: 0.62,
    attenuationDistance: 0.06,
  });
  parts.push({
    shape: 'torus',
    size: [vaseR * 1.66, 0.004, vaseR * 1.66],
    position: [0, round(waterTop + 0.024), 0],
    rotation: [round(Math.PI / 2), 0, 0],
    color: '#7d8a53',
    roughness: 0.9,
  });

  for (const flower of BOUQUET.slice(0, count)) {
    const { angle, lean, stem, head } = flower;
    const reach = Math.sin(lean) * stem;
    const rise = Math.cos(lean) * stem;
    const base = waterTop - 0.02;
    const tip = [round(Math.cos(angle) * reach), round(base + rise), round(Math.sin(angle) * reach)];
    const tilt = [round(Math.sin(angle) * lean), 0, round(-Math.cos(angle) * lean)];
    parts.push({
      shape: 'cylinder',
      size: [0.0055, stem, 0.0055],
      position: [round(Math.cos(angle) * reach * 0.5), round(base + rise / 2), round(Math.sin(angle) * reach * 0.5)],
      rotation: tilt,
      color: STEM_GREEN,
      roughness: 0.88,
    });
    // Calyx: without it the head sits on the stem like a bead on a wire.
    parts.push({
      shape: 'cone',
      size: [head * 1.05, head * 0.7, head * 1.05],
      position: [tip[0], round(tip[1] - head * 0.16), tip[2]],
      rotation: tilt,
      color: LEAF_GREEN,
      roughness: 0.86,
    });
    parts.push({
      shape: 'lathe',
      profile: bloomProfile(flower.kind, head).map(([r, h]) => [round(r), round(h)]),
      radialSegments: flower.kind === 'rose' ? 7 : flower.kind === 'pea' ? 5 : 9,
      size: [head * 2, head * 2, head * 2],
      position: tip,
      // Sweet peas nod; a blown rose faces up and out.
      rotation: flower.kind === 'pea' ? [round(tilt[0] * 2.1), 0, round(tilt[2] * 2.1)] : tilt,
      color: flower.colour,
      roughness: 0.74,
    });
    if (flower.kind === 'rose') {
      parts.push({
        shape: 'sphere',
        size: [head * 0.4, head * 0.4, head * 0.4],
        position: [tip[0], round(tip[1] + head * 0.56), tip[2]],
        color: '#d8bb62',
        roughness: 0.6,
      });
    }
  }

  // A few leaves low in the bunch, where the foliage of a hand-cut bouquet is.
  for (let i = 0; i < 4; i += 1) {
    const angle = 0.9 + i * 1.6;
    const out = vaseR * 0.9 + i * 0.006;
    parts.push({
      shape: 'roundedBox',
      size: [0.052, 0.0025, 0.026],
      bevelRadius: 0.008,
      position: [round(Math.cos(angle) * out), round(half + 0.026 + i * 0.008), round(Math.sin(angle) * out)],
      rotation: [round(0.35 + hash01(i * 3.3) * 0.3), round(-angle), round(0.4 + hash01(i * 7.1) * 0.4)],
      color: LEAF_GREEN,
      roughness: 0.86,
    });
  }

  return [{
    id: `${id}-vase`,
    kind: 'furniture',
    shape: 'cylinder',
    // The body sits at the middle of the glass.
    position: [round(x), round(y + vaseH / 2), round(z)],
    size: [vaseR * 2, vaseH, vaseR * 2],
    yaw: 0,
    // Fixed, not loose. Its table is a catalog model that mounts a stage
    // later than this does, and an interior floor carries no collider for a
    // dynamic body — so a loose vase spends that gap falling and never stops.
    // It can go back to `dynamic: true, mass: 1.4` once interiors have a
    // floor collider and the props stage no longer arrives after the dressing.
    collider: false,
    parts,
  }];
}

// Petals dropped from the vase onto the table cloth. Not part of the vase
// body: they stay where they fell when somebody knocks the flowers over.
export function fallenPetals(id, x, y, z, options = {}) {
  const seed = options.seed ?? 5;
  const spread = options.spread ?? 0.11;
  const parts = [];
  for (let i = 0; i < 5; i += 1) {
    const angle = hash01(seed + i * 2.7) * Math.PI * 2;
    const out = spread * (0.35 + hash01(seed + i * 5.3) * 0.65);
    parts.push({
      shape: 'cylinder',
      // A shed petal lies cupped, not flat, so it catches a highlight.
      size: [0.026 + hash01(seed + i) * 0.008, 0.0015, 0.026],
      radialSegments: 7,
      position: [round(Math.cos(angle) * out), 0, round(Math.sin(angle) * out)],
      rotation: [round(hash01(seed + i * 9.1) * 0.5 - 0.25), round(angle), round(hash01(seed + i * 11.7) * 0.4 - 0.2)],
      color: i % 2 === 0 ? '#c25a70' : '#dcbfc1',
      roughness: 0.72,
    });
  }
  return [{
    id: `${id}-petals`,
    kind: 'furniture',
    position: [round(x), round(y + 0.002), round(z)],
    size: [spread * 2, 0.004, spread * 2],
    yaw: 0,
    collider: false,
    cameraOccluder: false,
    render: true,
    parts,
  }];
}

// A woman's four-button kid glove, left hand, lying palm down where it was
// set down. Length and the 6¼ wrist stamp come from the examination record;
// the geometry only has to agree with it.
export function ladysGlove(id, x, y, z, options = {}) {
  const yaw = options.yaw ?? 0;
  const thickness = 0.018;
  const palmLength = 0.105;
  const palmWidth = 0.078;
  const cuffLength = 0.062;
  const leather = { finish: 'coachLeather', color: options.leather ?? '#cbbca2' };
  const parts = [];

  // Palm, then the cuff flaring back from the wrist. +x runs from cuff to
  // fingertips.
  parts.push({
    shape: 'roundedBox',
    size: [palmLength, thickness, palmWidth],
    bevelRadius: 0.008,
    bevelSegments: 3,
    position: [0, 0, 0],
    ...leather,
  });
  parts.push({
    shape: 'roundedBox',
    size: [cuffLength, thickness * 0.85, palmWidth * 0.92],
    bevelRadius: 0.007,
    bevelSegments: 3,
    position: [round(-(palmLength + cuffLength) / 2 + 0.006), round(-thickness * 0.06), 0],
    rotation: [0, 0.06, 0],
    ...leather,
  });

  // Four fingers off the knuckle line, splayed a little, and the second one
  // curled under — a glove keeps the shape of the last hand in it.
  //
  // A cylinder stands on +y. Laying it down with z=-PI/2 puts it on +x; the y
  // rotation then splays it in plan, and the tip follows (cos, 0, sin) of the
  // same angle. Every digit below is placed with that pair.
  const knuckle = palmLength / 2 - 0.004;
  const digit = (from, length, spread, radius, extra = {}) => {
    const dx = Math.cos(spread);
    const dz = Math.sin(spread);
    parts.push({
      shape: 'cylinder',
      size: [radius * 2, length, radius * 2],
      radialSegments: 10,
      position: [
        round(from[0] + dx * length * 0.5),
        round(from[1]),
        round(from[2] + dz * length * 0.5),
      ],
      rotation: [0, round(-spread), round(-Math.PI / 2)],
      ...leather,
      ...extra,
    });
    const tip = [round(from[0] + dx * length), round(from[1]), round(from[2] + dz * length)];
    parts.push({ shape: 'sphere', size: [radius * 2, radius * 2, radius * 2], position: tip, ...leather, ...extra });
    return { tip, spread };
  };

  const fingers = [
    { z: -0.027, length: 0.050, spread: -0.13 },
    { z: -0.009, length: 0.057, spread: -0.03 },
    { z: 0.009, length: 0.053, spread: 0.07 },
    { z: 0.026, length: 0.041, spread: 0.18 },
  ];
  fingers.forEach((finger, index) => {
    const from = [knuckle, -thickness * 0.08, finger.z];
    digit(from, finger.length, finger.spread, 0.0078);
    if (index === 1) {
      // The darn on the forefinger, in silk a shade too light for the kid.
      const along = finger.length - 0.012;
      parts.push({
        shape: 'cylinder',
        size: [0.0168, 0.011, 0.0168],
        radialSegments: 10,
        position: [
          round(from[0] + Math.cos(finger.spread) * along),
          round(from[1]),
          round(from[2] + Math.sin(finger.spread) * along),
        ],
        rotation: [0, round(-finger.spread), round(-Math.PI / 2)],
        color: '#e2d8c3',
        roughness: 0.52,
      });
    }
  });

  // Thumb, turned out from the side of the palm.
  digit([palmLength * 0.10, -thickness * 0.06, -palmWidth * 0.40], 0.044, -1.0, 0.0086);

  // Three mother-of-pearl buttons at the wrist; the fourth is the thread loop.
  for (let i = 0; i < 3; i += 1) {
    parts.push({
      shape: 'cylinder',
      size: [0.0075, 0.002, 0.0075],
      position: [round(-palmLength / 2 - 0.012 - i * 0.016), round(thickness * 0.5), round(palmWidth * 0.34)],
      color: '#f0ebe0',
      roughness: 0.16,
      metalness: 0.08,
    });
  }
  parts.push({
    shape: 'torus',
    size: [0.011, 0.0022, 0.011],
    position: [round(-palmLength / 2 - 0.06), round(thickness * 0.45), round(palmWidth * 0.34)],
    rotation: [round(Math.PI / 2), 0, 0],
    color: '#241f1b',
    roughness: 0.85,
  });

  return [{
    id: `${id}-glove`,
    kind: 'furniture',
    position: [round(x), round(y + thickness / 2), round(z)],
    size: [palmLength + cuffLength + 0.06, thickness, palmWidth + 0.03],
    yaw,
    // Static: it is where somebody left it, and a glove stops nothing.
    collider: false,
    cameraOccluder: false,
    parts,
  }];
}

// A neutral bottle used to prove the label workflow. Its dimensions and text
// are deliberately generic: a photographed object should replace them before
// this becomes historical content.
export function labeledBottle(id, x, y, z, options = {}) {
  const height = options.height ?? 0.18;
  const radius = options.radius ?? 0.04;
  const shoulderRoundness = options.shoulderRoundness ?? 0.62;
  const neckRatio = options.neckRatio ?? 0.43;
  const wallThickness = options.wallThickness ?? 0.002;
  const baseThickness = options.baseThickness ?? 0.0045;
  const corkHeight = height * 0.13;
  const corkInsertion = corkHeight * 0.34;
  const totalHeight = height + corkHeight - corkInsertion;
  const bottom = -totalHeight / 2;
  const glassTop = bottom + height;
  const heelHeight = height * 0.035;
  const bodyTop = bottom + height * 0.61;
  const shoulderTop = bottom + height * 0.81;
  const lipHeight = height * 0.045;
  const lipOuter = radius * neckRatio * 1.15;
  const neckRadius = radius * neckRatio;
  const innerNeckRadius = neckRadius - wallThickness;
  const innerBottom = bottom + baseThickness;
  const glassCenter = bottom + height / 2;
  const liquidLevel = options.liquidLevel ?? 0.58;
  const radialSegments = Math.max(16, Math.round(options.radialSegments ?? 64));
  const liquidSegments = Math.max(16, Math.round(radialSegments * 0.875));
  const corkSegments = Math.max(16, Math.round(radialSegments * 0.75));
  const precise = (value) => Math.round(value * 1e5) / 1e5;

  const shoulderRadius = (t, inset = 0) => {
    const smooth = t * t * (3 - 2 * t);
    const blend = t * (1 - shoulderRoundness) + smooth * shoulderRoundness;
    return radius + (neckRadius - radius) * blend - inset;
  };

  const outer = [
    [0, bottom],
    [radius * 0.75, bottom],
    [radius * 0.92, bottom + heelHeight * 0.22],
    [radius, bottom + heelHeight],
    [radius, bodyTop],
  ];
  for (let step = 1; step <= 7; step += 1) {
    const t = step / 7;
    outer.push([shoulderRadius(t), bodyTop + (shoulderTop - bodyTop) * t]);
  }
  outer.push(
    [neckRadius, glassTop - lipHeight],
    [lipOuter, glassTop - lipHeight * 0.7],
    [lipOuter, glassTop - lipHeight * 0.16],
    [lipOuter * 0.96, glassTop],
  );

  const inner = [
    [innerNeckRadius, glassTop],
    [innerNeckRadius, glassTop - lipHeight],
    [innerNeckRadius, shoulderTop],
  ];
  for (let step = 6; step >= 0; step -= 1) {
    const t = step / 7;
    inner.push([
      shoulderRadius(t, wallThickness),
      bodyTop + (shoulderTop - bodyTop) * t,
    ]);
  }
  inner.push(
    [radius - wallThickness, bottom + heelHeight],
    [radius - wallThickness * 1.1, innerBottom],
    [0, innerBottom],
    [0, bottom],
  );
  const glassProfile = [...outer, ...inner].map(([r, h]) => [precise(r), precise(h - glassCenter)]);

  const innerRadiusAt = (at) => {
    if (at <= bodyTop) return radius - wallThickness * 1.35;
    if (at <= shoulderTop) {
      return shoulderRadius((at - bodyTop) / (shoulderTop - bodyTop), wallThickness * 1.35);
    }
    return innerNeckRadius - wallThickness * 0.35;
  };
  const liquidBottom = innerBottom + wallThickness * 0.7;
  const liquidLimit = glassTop - lipHeight * 1.35;
  const fillY = liquidBottom + (liquidLimit - liquidBottom) * liquidLevel;
  const liquidCenter = (liquidBottom + fillY) / 2;
  const meniscusDepth = options.meniscusDepth ?? 0.0014;
  const liquidProfile = [[0, liquidBottom]];
  for (let step = 0; step <= 14; step += 1) {
    const at = liquidBottom + (fillY - liquidBottom) * (step / 14);
    liquidProfile.push([Math.max(0.001, innerRadiusAt(at)), at]);
  }
  const fillRadius = innerRadiusAt(fillY);
  liquidProfile.push(
    [fillRadius * 0.72, fillY - meniscusDepth * 0.55],
    [fillRadius * 0.34, fillY - meniscusDepth * 0.9],
    [0, fillY - meniscusDepth],
    [0, liquidBottom],
  );

  const corkBottom = glassTop - corkInsertion;
  const corkTop = corkBottom + corkHeight;
  const corkCenter = (corkBottom + corkTop) / 2;
  const corkBottomRadius = innerNeckRadius * 0.96;
  const corkTopRadius = corkBottomRadius * 1.045;
  const corkProfile = [
    [0, corkBottom],
    [corkBottomRadius * 0.94, corkBottom],
    [corkBottomRadius, corkBottom + corkHeight * 0.12],
    [corkTopRadius, corkTop - corkHeight * 0.08],
    [corkTopRadius * 0.94, corkTop],
    [0, corkTop],
    [0, corkBottom],
  ].map(([r, h]) => [precise(r), precise(h - corkCenter)]);

  const labelWrap = options.labelWrap ?? 3.25;
  const labelHeight = (bodyTop - bottom) * (options.labelHeight ?? 0.46);
  const labelY = bottom + heelHeight + (bodyTop - bottom - heelHeight) * (0.5 + (options.labelPosition ?? 0));
  const labelRadius = radius + wallThickness * 0.35 + 0.00035;
  const parts = [
    {
      sculptPart: 'glass-shell',
      shape: 'lathe',
      profile: glassProfile,
      radialSegments,
      size: [lipOuter * 2, height, lipOuter * 2],
      position: [0, precise(glassCenter), 0],
      color: options.glass ?? '#a9c7bd',
      finish: 'bottleGlass',
      wallThickness,
      roughness: options.glassRoughness ?? 0.07,
      transmission: options.glassClarity ?? 0.96,
      renderOrder: 2,
      castShadow: false,
      collider: false,
    },
    {
      sculptPart: 'liquid-volume',
      shape: 'lathe',
      profile: liquidProfile.map(([r, h]) => [precise(r), precise(h - liquidCenter)]),
      radialSegments: liquidSegments,
      size: [fillRadius * 2, fillY - liquidBottom, fillRadius * 2],
      position: [0, precise(liquidCenter), 0],
      color: options.liquid ?? '#6f4b25',
      finish: 'bottleLiquid',
      attenuationDistance: options.liquidDepth ?? 0.085,
      thickness: radius * 1.4,
      renderOrder: 1,
      castShadow: false,
      collider: false,
    },
    {
      sculptPart: 'liquid-meniscus',
      shape: 'torus',
      size: [fillRadius * 2, Math.max(0.0007, radius * 0.018), fillRadius * 2],
      position: [0, precise(fillY - meniscusDepth * 0.12), 0],
      rotation: [Math.PI / 2, 0, 0],
      radialSegments: liquidSegments,
      color: options.liquid ?? '#6f4b25',
      finish: 'bottleLiquid',
      attenuationDistance: options.liquidDepth ?? 0.085,
      thickness: radius,
      renderOrder: 1,
      castShadow: false,
      collider: false,
    },
    {
      sculptPart: 'cork-stopper',
      shape: 'lathe',
      profile: corkProfile,
      radialSegments: corkSegments,
      size: [corkTopRadius * 2, corkHeight, corkTopRadius * 2],
      position: [0, precise(corkCenter), 0],
      finish: 'bottleCork',
      renderOrder: 3,
      collider: false,
    },
    {
      sculptPart: 'curved-paper-label',
      shape: 'cylinderSector',
      radialSegments,
      size: [labelRadius * 2, labelHeight, labelRadius * 2],
      thetaStart: -labelWrap / 2,
      thetaLength: labelWrap,
      position: [0, precise(labelY), 0],
      renderOrder: 4,
      castShadow: false,
      collider: false,
      label: {
        text: options.labelText ?? 'PREPARATION',
        font: options.labelFont ?? 'caslon',
        paper: options.labelPaper ?? '#ded0aa',
        ink: options.labelInk ?? '#2d2118',
        paperAge: options.paperAge ?? 0.25,
        surface: 'agedPaper',
      },
    },
  ];

  return [{
    id: `${id}-bottle`,
    kind: 'furniture',
    shape: 'cylinder',
    position: [round(x), round(y + totalHeight / 2), round(z)],
    size: [radius * 2, totalHeight, radius * 2],
    yaw: 0,
    dynamic: true,
    mass: 0.32,
    sculptPart: 'bottle-root',
    parts,
  }];
}

// An opium pipe at rest on its lacquer tray: bamboo stem, brass saddle,
// terracotta bowl. Laid flat, bowl up, as it sat between uses.
export function opiumPipe(id, x, y, z, options = {}) {
  const yaw = options.yaw ?? 0;
  const stemLength = options.length ?? 0.48;
  const stemRadius = 0.011;
  const trayRadius = options.trayRadius ?? 0.15;
  const totalHeight = 0.09;
  const half = totalHeight / 2;
  const stemY = -half + 0.016 + 0.018 + stemRadius;
  const bowlX = stemLength * 0.24;
  const parts = [];

  // Tray: a shallow lacquer disc with a raised lip.
  parts.push({
    shape: 'cylinder',
    size: [trayRadius * 2, 0.016, trayRadius * 2],
    position: [0, -half + 0.008, 0],
    color: options.tray ?? '#241a12',
    roughness: 0.32,
  });
  parts.push({
    shape: 'torus',
    size: [trayRadius * 2, 0.012, trayRadius * 2],
    position: [0, -half + 0.018, 0],
    rotation: [Math.PI / 2, 0, 0],
    color: options.tray ?? '#241a12',
    roughness: 0.32,
  });

  // Stem across the tray, on a slight diagonal so it reads as laid down.
  const lean = 0.18;
  parts.push({
    shape: 'cylinder',
    size: [stemRadius * 2, stemLength, stemRadius * 2],
    position: [0, stemY, 0],
    rotation: [lean * 0.12, lean, Math.PI / 2],
    color: options.stem ?? '#7a5a33',
    roughness: 0.55,
  });
  // Horn end caps.
  for (const side of [-1, 1]) {
    parts.push({
      shape: 'cylinder',
      size: [stemRadius * 2.4, 0.035, stemRadius * 2.4],
      position: [
        round(side * (stemLength / 2 - 0.014) * Math.cos(lean)),
        stemY,
        round(-side * (stemLength / 2 - 0.014) * Math.sin(lean)),
      ],
      rotation: [lean * 0.12, lean, Math.PI / 2],
      color: '#33261b',
      roughness: 0.4,
    });
  }

  // Brass saddle where the bowl mounts, off-centre along the stem.
  parts.push({
    shape: 'cylinder',
    size: [stemRadius * 3, 0.05, stemRadius * 3],
    position: [round(bowlX * Math.cos(lean)), stemY, round(-bowlX * Math.sin(lean))],
    rotation: [lean * 0.12, lean, Math.PI / 2],
    color: '#8a6b3a',
    roughness: 0.35,
    metalness: 0.5,
  });
  // The bowl stands up from the saddle, sunk in so it reads as a drum.
  parts.push({
    shape: 'sphere',
    size: [0.062, 0.062, 0.062],
    position: [round(bowlX * Math.cos(lean)), stemY + 0.026, round(-bowlX * Math.sin(lean))],
    color: options.bowl ?? '#8a4a3a',
    roughness: 0.7,
  });
  parts.push({
    shape: 'cylinder',
    size: [0.022, 0.014, 0.022],
    position: [round(bowlX * Math.cos(lean)), stemY + 0.06, round(-bowlX * Math.sin(lean))],
    color: '#4a2c22',
    roughness: 0.75,
  });

  return [{
    id: `${id}-pipe`,
    kind: 'furniture',
    shape: 'cylinder',
    position: [round(x), round(y + half), round(z)],
    size: [trayRadius * 2, totalHeight, trayRadius * 2],
    yaw,
    dynamic: true,
    mass: 0.6,
    parts,
  }];
}

// A rack proof built from the bottle proof above. The whole assembly stays on
// one body for now, while stable slot and part names preserve a later route to
// individually removable bottles.
export function reagentBottleRack(id, x, y, z, options = {}) {
  const columns = Math.max(4, Math.min(10, Math.round(options.columns ?? 6)));
  const rows = Math.max(1, Math.min(2, Math.round(options.rows ?? 1)));
  const seed = Math.trunc(options.seed ?? 37);
  const variantPreview = options.previewQuality === 'variants';
  const bottleHeight = options.bottleHeight ?? 0.18;
  const bottleRadius = options.bottleRadius ?? 0.04;
  const shapeVariety = options.shapeVariety ?? 0.68;
  const liquidVariation = options.liquidVariation ?? 0.72;
  const emptyRate = options.emptyRate ?? 0;
  const slotGap = options.slotGap ?? 0.018;
  const rowGap = options.rowGap ?? 0.025;
  const frameThickness = options.frameThickness ?? 0.014;
  const baseThickness = options.rackBaseThickness ?? 0.022;
  const bottleDiameter = bottleRadius * 2;
  const slotPitch = bottleDiameter + slotGap;
  const rowPitch = bottleDiameter + rowGap;
  const sideWidth = frameThickness * 2.2;
  const rackWidth = columns * slotPitch + sideWidth * 2;
  const rackDepth = rows * bottleDiameter + (rows - 1) * rowGap + frameThickness * 3;
  const liquids = [
    options.liquidA ?? '#6f3f1d',
    options.liquidB ?? '#b17118',
    options.liquidC ?? '#657052',
  ];
  const slots = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const occupied = hash01(seed + index * 97 + 11) >= emptyRate;
      if (!occupied) continue;
      const heightRoll = hash01(seed + index * 97 + 23) - 0.5;
      const radiusRoll = hash01(seed + index * 97 + 31) - 0.5;
      const shoulderRoll = hash01(seed + index * 97 + 43) - 0.5;
      const neckRoll = hash01(seed + index * 97 + 59) - 0.5;
      const liquidRoll = hash01(seed + index * 97 + 71) - 0.5;
      const yaw = (hash01(seed + index * 97 + 83) - 0.5) * 0.16 * shapeVariety;
      const height = bottleHeight * (1 + heightRoll * 0.22 * shapeVariety);
      const radius = bottleRadius * (1 + radiusRoll * 0.16 * shapeVariety);
      const shoulderRoundness = Math.max(0.08, Math.min(0.96, 0.6 + shoulderRoll * 0.72 * shapeVariety));
      const neckRatio = Math.max(0.34, Math.min(0.62, 0.43 + neckRoll * 0.24 * shapeVariety));
      const liquidLevel = Math.max(0.14, Math.min(0.9, 0.56 + liquidRoll * 0.78 * liquidVariation));
      const labelRoot = String(options.labelText ?? 'PREPARATION').trim();
      const labelNumber = String(index + 1).padStart(2, '0');
      const labelText = options.numberLabels === false || !labelRoot
        ? labelRoot
        : `${labelRoot} ${labelNumber}`.slice(0, 42);
      const [bottle] = labeledBottle(`${id}-slot-${index + 1}`, 0, 0, 0, {
        height,
        radius,
        shoulderRoundness,
        neckRatio,
        wallThickness: options.wallThickness ?? 0.002,
        baseThickness: options.glassBaseThickness ?? 0.0045,
        liquidLevel,
        meniscusDepth: options.meniscusDepth ?? 0.0015,
        labelText,
        labelFont: options.labelFont ?? 'caslon',
        labelWrap: options.labelWrap ?? 3.25,
        labelHeight: options.labelHeight ?? 0.46,
        labelPosition: options.labelPosition ?? 0,
        paperAge: options.paperAge ?? 0.34,
        labelPaper: options.labelPaper ?? '#ded0aa',
        labelInk: options.labelInk ?? '#2d2118',
        glass: options.glass ?? '#a9c7bd',
        glassRoughness: options.glassRoughness ?? 0.07,
        glassClarity: options.glassClarity ?? 0.96,
        liquid: liquids[Math.floor(hash01(seed + index * 97 + 89) * liquids.length)],
        liquidDepth: options.liquidDepth ?? 0.085,
        radialSegments: variantPreview ? 24 : 64,
      });
      slots.push({
        index,
        row,
        column,
        yaw,
        bottle,
        x: -((columns - 1) * slotPitch) / 2 + column * slotPitch,
        z: ((rows - 1) * rowPitch) / 2 - row * rowPitch,
      });
    }
  }

  // A fully empty rack is allowed by the control, but keep one bottle in the
  // proof so it never loses the defining material and label systems.
  if (slots.length === 0) {
    return reagentBottleRack(id, x, y, z, { ...options, emptyRate: 0, columns: 4, rows: 1 });
  }

  const tallestBottle = Math.max(...slots.map((slot) => slot.bottle.size[1]));
  const backHeight = tallestBottle * 0.82;
  const totalHeight = baseThickness + Math.max(tallestBottle, backHeight);
  const localY = (height) => round(height - totalHeight / 2);
  const wood = (sculptPart, position, size, extra = {}) => ({
    sculptPart,
    shape: 'roundedBox',
    position: position.map(round),
    size: size.map(round),
    color: options.woodTint ?? '#9d8462',
    finish: 'laboratoryDeal',
    roughness: options.woodRoughness ?? 0.75,
    normalStrength: options.normalStrength ?? 0.52,
    textureIntensity: variantPreview ? 1 : (options.textureIntensity ?? 1.15),
    texturePreview: variantPreview,
    textureScale: options.textureScale ?? 2.8,
    bevelRadius: Math.min(options.edgeBevel ?? 0.0035, Math.min(...size) * 0.24),
    bevelSegments: 3,
    collider: false,
    ...extra,
  });
  const parts = [
    wood('rack-base', [0, localY(baseThickness / 2), 0], [rackWidth, baseThickness, rackDepth]),
    wood(
      'rack-back',
      [0, localY(baseThickness + backHeight / 2), -rackDepth / 2 + frameThickness / 2],
      [rackWidth - sideWidth * 0.8, backHeight, frameThickness],
    ),
    wood(
      'side-cheek-left',
      [-rackWidth / 2 + sideWidth / 2, localY(baseThickness + backHeight / 2), 0],
      [sideWidth, backHeight, rackDepth],
    ),
    wood(
      'side-cheek-right',
      [rackWidth / 2 - sideWidth / 2, localY(baseThickness + backHeight / 2), 0],
      [sideWidth, backHeight, rackDepth],
    ),
  ];

  for (let row = 0; row < rows; row += 1) {
    const rowZ = ((rows - 1) * rowPitch) / 2 - row * rowPitch;
    const railDiameter = frameThickness * 0.9;
    parts.push(wood(
      `front-retaining-rail-${row + 1}`,
      [0, localY(baseThickness + bottleHeight * 0.34), rowZ + bottleRadius + frameThickness * 0.7],
      [rackWidth - sideWidth * 1.2, railDiameter, railDiameter],
    ));
    for (let divider = 1; divider < columns; divider += 1) {
      const dividerX = -((columns - 1) * slotPitch) / 2 + (divider - 0.5) * slotPitch;
      const dividerHeight = bottleHeight * 0.18;
      parts.push(wood(
        `slot-divider-${row + 1}-${divider}`,
        [dividerX, localY(baseThickness + dividerHeight / 2), rowZ],
        [frameThickness * 0.72, dividerHeight, bottleDiameter + frameThickness],
      ));
    }
  }

  for (const slot of slots) {
    const slotName = `bottle-${String(slot.index + 1).padStart(2, '0')}`;
    for (const part of slot.bottle.parts) {
      if (variantPreview && ['liquid-meniscus', 'curved-paper-label'].includes(part.sculptPart)) continue;
      parts.push({
        ...part,
        sculptPart: `${slotName}-${part.sculptPart}`,
        assemblyPart: slotName,
        socket: `rack-slot-${String(slot.index + 1).padStart(2, '0')}`,
        position: [
          round(slot.x + part.position[0]),
          localY(baseThickness + slot.bottle.position[1] + part.position[1]),
          round(slot.z + part.position[2]),
        ],
        rotation: [
          part.rotation?.[0] ?? 0,
          (part.rotation?.[1] ?? 0) + slot.yaw,
          part.rotation?.[2] ?? 0,
        ],
        collider: false,
      });
    }
  }

  return [{
    id: `${id}-rack`,
    kind: 'furniture',
    shape: 'box',
    position: [round(x), round(y + totalHeight / 2), round(z)],
    size: [round(rackWidth), round(totalHeight), round(rackDepth)],
    yaw: 0,
    dynamic: true,
    mass: 4.8,
    sculptPart: 'reagent-rack-root',
    slotCount: columns * rows,
    occupiedSlots: slots.map((slot) => slot.index + 1),
    parts,
  }];
}

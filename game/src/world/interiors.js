// Procedural parlor/entry interiors for street buildings, seeded from the
// building so every visit regenerates the same room. Interiors are larger
// than their shells (standard game abstraction); the door and street
// windows still line up with the exterior facade grid.
//
// Furniture is placeholder boxes keyed by slot id (`sofa`, `hearth`, ...).
// When the Victorian GLB catalog lands, slots swap to models — the layout
// logic does not change.

import { facadeLayout, doorWorld } from './facade.js';
import { pickModel, modelSize, flameHeight, pickSurfaces } from './victorianCatalog.js';

// Size classes. `base` is [width, depth] in meters; the per-class tuning
// slider (interiorScaleS..XL) multiplies it, so "make small 20% bigger" is
// one slider, not a refactor. M matches the waiting-room footprint.
export const SIZE_CLASSES = {
  S: { base: [10, 13], ceiling: 3.6 },
  M: { base: [16, 20], ceiling: 4.8 },
  L: { base: [20, 30], ceiling: 5.4 },
  XL: { base: [30, 40], ceiling: 11 },
};

// Wealth classes drive palette, furniture tier, density, and symmetry.
const PALETTES = {
  humble: {
    walls: ['#b5a98c', '#a8977a', '#9aa08a'],
    floor: '#6b543c', ceiling: '#e8e2d2', trim: '#4c3a28',
    rugs: ['#5d5648', '#635043'],
    wood: '#5a4632', upholstery: ['#5d5244', '#4f4a3c'],
  },
  middling: {
    walls: ['#8f7f96', '#7d8a6f', '#a08a70', '#87919e'],
    floor: '#5f4832', ceiling: '#efe9da', trim: '#3c2d1e',
    rugs: ['#6d3f38', '#4f5a4a', '#54476b'],
    wood: '#4a3626', upholstery: ['#5a3f38', '#44503f', '#4a4458'],
  },
  grand: {
    walls: ['#7d4238', '#3c554e', '#6d5c3a', '#584668'],
    floor: '#4c3423', ceiling: '#f6f1e4', trim: '#2c2013',
    rugs: ['#7c2f2a', '#31504a', '#5d4a24'],
    wood: '#3a2a1c', upholstery: ['#6d2f2a', '#2f4a44', '#4d3a5e'],
  },
};

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function idHash(id) {
  let total = 0;
  for (let i = 0; i < id.length; i += 1) total = (total * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(total);
}

function pick(list, roll) {
  return list[Math.floor(roll * list.length) % list.length];
}

const round = (value) => Math.round(value * 100) / 100;

// Size from the shell, wealth from the facade style: dark brownstone rows
// read humble, brownstone rows middling, brick/stone landmarks grand.
export function interiorSpec(building) {
  const style = building.facadeStyle ?? 0;
  const wealth = style === 3 ? 'humble' : style === 0 ? 'middling' : 'grand';
  let size;
  if (wealth === 'grand') size = 'XL';
  else if (building.size[0] < 6.6) size = 'M';
  else size = 'L';
  if (wealth === 'humble' && building.size[1] < 13) size = 'S';
  return { size, wealth };
}

export function interiorZoneId(buildingId) {
  return `interior:${buildingId}`;
}

// The generated blueprint uses its own centered frame: the street (door)
// wall is always south (+z); the transition handles world orientation.
export function generateInterior(building, values = {}) {
  const seed = idHash(building.id);
  const { size, wealth } = interiorSpec(building);
  const sizeClass = SIZE_CLASSES[size];
  const scale = values[`interiorScale${size}`] ?? 1;
  const density = values.interiorDensity ?? 1;
  const W = round(sizeClass.base[0] * scale);
  const D = round(sizeClass.base[1] * scale);
  const H = sizeClass.ceiling;
  const palette = PALETTES[wealth];
  const grand = wealth === 'grand';
  const humble = wealth === 'humble';

  const wallColor = pick(palette.walls, hash01(seed * 0.7));
  const surfaces = pickSurfaces(wealth, hash01(seed * 1.3), hash01(seed * 2.9));

  // Street wall openings from the facade grid, mapped proportionally.
  const layout = facadeLayout(building.size[0], building.size[1]);
  const door = layout.ground.find((win) => win.isDoor);
  const doorAlong = round(Math.max(-W / 2 + 1.6, Math.min(W / 2 - 1.6, ((door.x + door.w / 2) / layout.texW - 0.5) * W)));
  // Sash height clamps to the ceiling so low rooms keep a header above.
  const winH = round(Math.min(grand ? 3.0 : 2.6, H - 1.4));
  const southOpenings = [
    { id: 'front-door', type: 'door', center: [doorAlong, 1.35], size: [1.4, 2.7], sillHeight: 0, blocked: true },
  ];
  for (const win of layout.ground.filter((w) => !w.isDoor)) {
    const along = round(Math.max(-W / 2 + 1.2, Math.min(W / 2 - 1.2, ((win.x + win.w / 2) / layout.texW - 0.5) * W)));
    if (Math.abs(along - doorAlong) < 1.6) continue;
    southOpenings.push({
      id: `window-s-${win.col}`, type: 'window', center: [along, 1.1 + winH / 2], size: [1.5, winH], sillHeight: 1.1,
    });
  }
  // Rear windows for cross light.
  const rearOpenings = [-1, 1].map((side) => ({
    id: `window-n${side > 0 ? 'e' : 'w'}`, type: 'window',
    center: [round((side * W) / 4), 1.1 + winH / 2], size: [1.5, winH], sillHeight: 1.1,
  }));

  const walls = [
    { id: 'south-wall', position: [0, H / 2, D / 2], size: [W, H, 0.24], yaw: 0, openings: southOpenings },
    { id: 'north-wall', position: [0, H / 2, -D / 2], size: [W, H, 0.24], yaw: 0, openings: rearOpenings },
    { id: 'west-wall', position: [-W / 2, H / 2, 0], size: [0.24, H, D], yaw: 0, openings: [] },
    { id: 'east-wall', position: [W / 2, H / 2, 0], size: [0.24, H, D], yaw: 0, openings: [] },
  ];

  // L rooms are 1896 double parlors: an arch divides front from back.
  const archZ = size === 'L' ? round(-D * 0.12) : null;
  if (archZ !== null) {
    walls.push({
      id: 'arch-wall', position: [0, H / 2, archZ], size: [W, H, 0.24], yaw: 0,
      openings: [{ id: 'arch', type: 'door', center: [0, (H - 1.0) / 2], size: [round(W * 0.5), H - 1.0], sillHeight: 0 }],
    });
  }

  const furniture = [];
  const props = [];
  const gaslights = [];
  // A gaslight burner. `fixture` false means a catalog model already provides
  // the visible lamp, so the rig only adds light and a small flame glow.
  const light = (id, x, y, z, intensity, options = {}) => {
    props.push({ id, kind: 'lightMarker', position: [round(x), round(y), round(z)], fixture: options.fixture !== false });
    gaslights.push({
      propId: id,
      color: options.color ?? '#ffc57a',
      intensity,
      distance: options.distance ?? 7 + intensity * 0.9,
      decay: 2,
      flicker: options.flicker ?? 0.09,
      castShadow: gaslights.length === 0,
      flameRadius: options.flameRadius ?? 0.05,
    });
  };

  // Place a catalog model by its floor-contact point. The collider is the
  // model's measured footprint; decor (`solid: false`) is walk-through.
  let placed = 0;
  function place(slot, x, z, options = {}) {
    const roll = hash01(seed * 5.3 + placed * 2.7 + (options.rollSalt ?? 0));
    const model = pickModel(slot, wealth, roll);
    if (!model) return null;
    const [sx, sy, sz] = modelSize(model);
    const scale = options.scale ?? 1;
    const y = options.y ?? 0;
    const item = {
      id: `${slot}-${placed}`,
      kind: 'furniture',
      model,
      modelScale: scale,
      position: [round(x), round(y), round(z)],
      size: [round(sx * scale), round(sy * scale), round(sz * scale)],
      yaw: round(options.yaw ?? 0),
    };
    if (options.solid === false) item.collider = false;
    furniture.push(item);

    // Lamps light themselves: the burner sits inside the model, so the glow
    // comes from the fixture instead of a bare bulb floating nearby.
    const flame = flameHeight(model);
    if (flame !== null) {
      light(`${item.id}-flame`, x, y + flame * scale, z, options.lightIntensity ?? 3.4, {
        fixture: false,
        distance: options.lightDistance,
        flameRadius: options.flameRadius ?? 0.045,
      });
    }

    placed += 1;
    return item;
  }

  // Front room: rug, center table, seating ring. The front room is
  // everything south of the arch (or the whole room).
  const frontZ = archZ !== null ? round((archZ + D / 2) / 2) : 0;
  const rug = place('rug', 0, frontZ, { solid: false });
  const rugW = rug ? rug.size[0] : Math.min(W, D) * 0.42;
  const rugD = rug ? rug.size[2] : rugW * 0.72;
  place('centerTable', 0, frontZ, { rollSalt: 1.1 });

  const seatCount = Math.max(2, Math.round((humble ? 2 : grand ? 5 : 3) * density));
  for (let i = 0; i < seatCount; i += 1) {
    // Ring the rug: alternate sides, facing inward.
    const angle = (i / seatCount) * Math.PI * 2 + hash01(seed + i) * 0.3;
    const x = Math.sin(angle) * (rugW / 2 + 0.65);
    const z = frontZ + Math.cos(angle) * (rugD / 2 + 0.65);
    if (Math.abs(x) > W / 2 - 0.8 || Math.abs(z) > D / 2 - 0.8) continue;
    place(i % 3 === 0 ? 'seating' : 'sideChair', x, z, { yaw: angle + Math.PI, rollSalt: i * 3.1 });
  }

  // Hearth on a party wall, in the back room when the arch exists.
  const hearthSide = hash01(seed * 4.3) < 0.5 ? -1 : 1;
  const hearthZ = archZ !== null ? round((archZ - D / 2) / 2) : round(-D / 5);
  const hearth = place('hearth', hearthSide * (W / 2 - 0.45), hearthZ, {
    yaw: hearthSide > 0 ? -Math.PI / 2 : Math.PI / 2,
  });
  if (hearth) {
    place('clock', hearthSide * (W / 2 - 0.5), hearthZ + 2.4, { yaw: hearthSide > 0 ? -Math.PI / 2 : Math.PI / 2, rollSalt: 7.3 });
  }

  // Perimeter: storage against the far wall, pedestals in the corners, a
  // radiator under a street window, work table for humble rooms.
  place('storage', -hearthSide * (W / 2 - 0.6), round(D * 0.1), {
    yaw: -hearthSide > 0 ? -Math.PI / 2 : Math.PI / 2, rollSalt: 2.9,
  });
  const cornerCount = Math.round((grand ? 4 : humble ? 1 : 2) * density);
  for (let i = 0; i < cornerCount; i += 1) {
    const cx = (i % 2 === 0 ? -1 : 1) * (W / 2 - 0.8);
    const cz = (i < 2 ? -1 : 1) * (D / 2 - 1.0);
    place('pedestal', cx, cz, { rollSalt: i * 5.7 });
  }
  place('radiator', round(W * 0.28), D / 2 - 0.45, { yaw: Math.PI, rollSalt: 4.1 });
  if (humble) place('work', hearthSide * (W / 2 - 1.0), round(D * 0.22), { yaw: 0.2, rollSalt: 6.7 });

  // Side tables carry the lamps.
  const sideTable = place('sideTable', -rugW / 2 - 1.1, frontZ - rugD / 2 - 0.4, { rollSalt: 8.9 });
  if (sideTable) {
    place('tableLamp', sideTable.position[0], sideTable.position[2], {
      y: sideTable.size[1], solid: false, rollSalt: 9.3,
    });
  }

  // Wall decor and sconces on the party walls, clear of the hearth.
  const decorCount = Math.round((grand ? 4 : humble ? 0 : 2) * density);
  for (let i = 0; i < decorCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = round(frontZ + (i < 2 ? -1 : 1) * D * 0.14);
    if (side === hearthSide && Math.abs(z - hearthZ) < 2.4) continue;
    place('wallDecor', side * (W / 2 - 0.14), z, {
      y: 1.75, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, solid: false, rollSalt: i * 11.3,
    });
  }
  for (const side of [-1, 1]) {
    place('wallLight', side * (W / 2 - 0.18), round(frontZ + D * 0.05), {
      y: 1.85, yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, solid: false, rollSalt: side * 13.7,
      lightIntensity: 2.8, lightDistance: 7,
    });
  }

  // Chandelier hangs over the front room.
  place('ceilingLight', 0, frontZ, {
    y: H - 1.9, solid: false, rollSalt: 17.1, lightIntensity: 5.2, lightDistance: 13, flameRadius: 0.055,
  });

  // XL atrium: column ring plus a second chandelier over the back half.
  if (size === 'XL') {
    for (const sx of [-1, 1]) {
      for (const sz2 of [-1, 1]) {
        furniture.push({
          id: `column-${sx}-${sz2}`, kind: 'furniture', shape: 'cylinder',
          position: [round((sx * W) / 4), H / 2, round((sz2 * D) / 4)], size: [0.7, H, 0.7], yaw: 0, color: palette.ceiling,
        });
      }
    }
    place('ceilingLight', 0, round(-D * 0.28), {
      y: H - 1.9, solid: false, rollSalt: 19.3, lightIntensity: 5.0, lightDistance: 13,
    });
  }

  // Hearth fire: a low warm light at the grate, the room's other anchor.
  if (hearth) {
    light('hearth-fire', hearthSide * (W / 2 - 0.75), 0.42, hearthZ, 2.6, {
      fixture: false, color: '#ff9a4a', distance: 7, flicker: 0.3, flameRadius: 0.09,
    });
  }

  // Humble rooms have no fixed lamps, so give them one bare burner.
  if (humble && gaslights.length === 0) {
    light('bare-burner', 0, H - 1.2, frontZ, 3.6, { color: '#ffcf8a', distance: 9 });
  }

  const windowPortals = [...southOpenings, ...rearOpenings]
    .filter((opening) => opening.type === 'window')
    .map((opening) => ({
      windowId: opening.id,
      // Kept low: a sash window is a small hole in a thick wall, and strong
      // portal lights wash the floor out to a flat grey.
      color: '#cdd4e2',
      intensity: grand ? 0.95 : 0.8,
      elevationDeg: 34,
      azimuthDeg: Math.round(-opening.center[0] * 2),
    }));

  const blueprint = {
    id: `INTERIOR_${building.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
    label: `${wealth[0].toUpperCase()}${wealth.slice(1)} ${size === 'XL' ? 'atrium' : size === 'S' ? 'entry hall' : 'parlor'}`,
    schemaVersion: 1,
    dimensions: { width: W, depth: D, ceiling: H, floorY: 0 },
    outline: [[-W / 2, D / 2], [W / 2, D / 2], [W / 2, -D / 2], [-W / 2, -D / 2]],
    // Spawn sits outside the exit trigger's radius, so arriving players are
    // not one E-press from bouncing straight back out.
    navigation: { defaultSpawn: [doorAlong, 0, D / 2 - 2.4], defaultFacing: [0, -1] },
    walls,
    transitions: [
      {
        id: 'to-street',
        label: 'Out to the street',
        position: [doorAlong, D / 2 - 0.55],
        radius: 0.95,
        to: exitTransition(building),
      },
    ],
    furniture,
    props,
  };

  const lighting = {
    id: `${blueprint.id}_LIGHT`,
    // `scale` dims the panel's global fill for this room. Gas-lit interiors
    // need very little ambient — the flat corner glow is what makes a room
    // read as fake, so the lamps and windows do nearly all the work.
    ambient: { color: '#6b6558', intensity: 0.38, scale: 0.3 },
    hemisphere: { skyColor: '#8e9ab5', groundColor: '#3a2e22', intensity: 0.55, scale: 0.3 },
    windowSky: '#bcc8e0',
    windowPortals,
    gaslights,
    exposureBase: 1.0,
    materials: {
      wall: wallColor,
      floor: palette.floor,
      ceiling: palette.ceiling,
      trim: palette.trim,
      // Seamless surfaces from the Victorian pack; Room tints them with the
      // colors above so a row of parlors is not one wallpaper.
      wallTexture: surfaces.wall,
      floorTexture: surfaces.floor,
    },
  };

  return { blueprint, lighting };
}

function exitTransition(building) {
  const outside = doorWorld(building, 2.0);
  return {
    zone: 'central-park',
    spawn: [round(outside.x), 1.35, round(outside.z)],
    facing: [outside.normal[0], outside.normal[2]],
  };
}

// Entry triggers for the exterior zone: one at each enabled building's door.
// No spawn override — arrival falls back to the interior's own default
// spawn, which sits just inside the door.
export function interiorEntryTransitions(buildings) {
  return buildings.map((building) => {
    const at = doorWorld(building, 1.3);
    const { wealth } = interiorSpec(building);
    return {
      id: `enter-${building.id}`,
      label: `Enter the ${wealth} house`,
      position: [round(at.x), round(at.z)],
      radius: 1.5,
      to: { zone: interiorZoneId(building.id), facing: [0, -1] },
    };
  });
}

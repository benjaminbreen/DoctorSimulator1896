// Procedural parlor/entry interiors for street buildings, seeded from the
// building so every visit regenerates the same room. Interiors are larger
// than their shells (standard game abstraction); the door and street
// windows still line up with the exterior facade grid.
//
// Furniture is placeholder boxes keyed by slot id (`sofa`, `hearth`, ...).
// When the Victorian GLB catalog lands, slots swap to models — the layout
// logic does not change.

import { facadeLayoutForFace, doorWorld } from './facade.js';
import { pickModel, modelSize, fixtureBurners, pickSurfaces, looseMass } from './victorianCatalog.js';
import { friezeBand, ceilingPanel } from './mouldings.js';
import { pickPainting } from './paintings.js';

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
    floor: '#6b543c', ceiling: '#e4e5e2', trim: '#4c3a28',
    rugs: ['#5d5648', '#635043'],
    wood: '#5a4632', upholstery: ['#5d5244', '#4f4a3c'],
  },
  middling: {
    walls: ['#8f7f96', '#7d8a6f', '#a08a70', '#87919e'],
    floor: '#5f4832', ceiling: '#eef0ed', trim: '#3c2d1e',
    rugs: ['#6d3f38', '#4f5a4a', '#54476b'],
    wood: '#4a3626', upholstery: ['#5a3f38', '#44503f', '#4a4458'],
  },
  grand: {
    walls: ['#7d4238', '#3c554e', '#6d5c3a', '#584668'],
    floor: '#4c3423', ceiling: '#f6f8f5', trim: '#2c2013',
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
  const wealth = style === 3 ? 'humble' : style === 0 || style === 5 ? 'middling' : 'grand';
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
  const layout = facadeLayoutForFace(building);
  const door = layout.ground.find((win) => win.isDoor);
  const doorAlong = round(Math.max(-W / 2 + 1.6, Math.min(W / 2 - 1.6, ((door.x + door.w / 2) / layout.texW - 0.5) * W)));
  // 1896 parlor sashes are tall and narrow with a low sill — near enough
  // floor to ceiling that you could step out to a balcony. A high sill and
  // a squat opening is what makes a room read as modern.
  const sill = humble ? 0.55 : 0.42;
  const winW = grand ? 1.45 : 1.3;
  const winH = round(Math.min(grand ? 3.5 : 3.1, H - sill - 0.75));
  const southOpenings = [
    { id: 'front-door', type: 'door', center: [doorAlong, 1.35], size: [1.4, 2.7], sillHeight: 0, blocked: true },
  ];
  for (const win of layout.ground.filter((w) => !w.isDoor)) {
    const along = round(Math.max(-W / 2 + 1.2, Math.min(W / 2 - 1.2, ((win.x + win.w / 2) / layout.texW - 0.5) * W)));
    if (Math.abs(along - doorAlong) < 1.6) continue;
    southOpenings.push({
      id: `window-s-${win.col}`, type: 'window',
      center: [along, round(sill + winH / 2)], size: [winW, winH], sillHeight: sill,
    });
  }
  // Rear windows for cross light.
  const rearOpenings = [-1, 1].map((side) => ({
    id: `window-n${side > 0 ? 'e' : 'w'}`, type: 'window',
    center: [round((side * W) / 4), round(sill + winH / 2)], size: [winW, winH], sillHeight: sill,
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
  // Height of the chair rail capping the dado; the wainscot panels below it
  // are sized from this, so it has to be known before either is placed.
  const dadoY = 0.95;
  // Picture rail height. Declared here rather than with the rest of the
  // joinery because the wall art hangs from it and is placed first.
  const railY = round(Math.min(H - 0.5, sill + winH + 0.3));
  // Visible burner glow. Free, so every flame in a fixture gets one.
  const flame = (id, x, y, z, radius = 0.04) => {
    props.push({ id, kind: 'flame', position: [round(x), round(y), round(z)], radius });
  };

  // A real light. Shadow-casting ones become downward spots in the rig — one
  // shadow face instead of a point light's six — so the room can afford a
  // few of them and the furniture actually sits on the floor.
  let shadowsUsed = 0;
  const SHADOW_BUDGET = 2;
  const light = (id, x, y, z, intensity, options = {}) => {
    const castShadow = options.shadow === true && shadowsUsed < SHADOW_BUDGET;
    if (castShadow) shadowsUsed += 1;
    props.push({ id, kind: 'lightMarker', position: [round(x), round(y), round(z)], fixture: options.fixture !== false });
    gaslights.push({
      propId: id,
      color: options.color ?? '#ffc57a',
      intensity,
      distance: options.distance ?? 7 + intensity * 0.9,
      decay: 2,
      flicker: options.flicker ?? 0.09,
      castShadow,
      coneAngle: options.coneAngle ?? 1.25,
    });
    if (options.flame !== false) flame(`${id}-glow`, x, y, z, options.flameRadius ?? 0.05);
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
    else if (y === 0 && options.dynamic !== false) {
      // Loose pieces standing on the floor get their own dynamic body. Raised
      // and wall-fixed pieces stay put — their lights were placed with them.
      const mass = looseMass(model);
      if (mass !== null) {
        item.dynamic = true;
        item.mass = mass;
      }
    }
    furniture.push(item);

    // Lamps light themselves, from their actual burners. A twin-armed sconce
    // gets a light under each shade; a candelabra gets six visible flames but
    // pools its output into one source, since six point lights for one
    // fixture is not a trade worth making.
    const burners = options.unlit ? null : fixtureBurners(model);
    if (burners) {
      const cos = Math.cos(item.yaw);
      const sin = Math.sin(item.yaw);
      const at = ([px, py, pz]) => [
        x + (px * cos + pz * sin) * scale,
        y + py * scale,
        z + (-px * sin + pz * cos) * scale,
      ];
      burners.flames.forEach((point, index) => {
        const [fx, fy, fz] = at(point);
        flame(`${item.id}-flame-${index}`, fx, fy, fz, options.flameRadius ?? 0.035);
      });
      const share = (options.lightIntensity ?? 3.4) / burners.lights.length;
      burners.lights.forEach((point, index) => {
        const [lx, ly, lz] = at(point);
        light(`${item.id}-light-${index}`, lx, ly, lz, share, {
          fixture: false,
          flame: false,
          distance: options.lightDistance,
          shadow: options.shadow,
        });
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

  // Counts follow floor area, not the wealth tier alone: a flat count leaves
  // the bigger rooms looking abandoned, since the same six pieces have three
  // times the floor to cover.
  const areaScale = Math.min(1.5, Math.sqrt((W * D) / 300));
  // Cased goods and pictures scale with the room, not with the person: an
  // atrium wants a press twice the height of a parlor's.
  const caseScale = size === 'XL' ? 1.8 : 1;
  const scaled = (base) => Math.max(1, Math.round(base * density * areaScale));

  const seatCount = Math.max(2, scaled(humble ? 2 : grand ? 4 : 3));
  for (let i = 0; i < seatCount; i += 1) {
    // Ring the rug: alternate sides, facing inward.
    const angle = (i / seatCount) * Math.PI * 2 + hash01(seed + i) * 0.3;
    const x = Math.sin(angle) * (rugW / 2 + 0.65);
    const z = frontZ + Math.cos(angle) * (rugD / 2 + 0.65);
    if (Math.abs(x) > W / 2 - 0.8 || Math.abs(z) > D / 2 - 0.8) continue;
    place(i % 3 === 0 ? 'seating' : 'sideChair', x, z, { yaw: angle + Math.PI, rollSalt: i * 3.1 });
    // A footstool drawn up to every third seat.
    if (i % 3 === 0) {
      place('footstool', x * 0.72, frontZ + (z - frontZ) * 0.72, {
        yaw: angle + Math.PI, rollSalt: i * 4.9,
      });
    }
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
  place('storage', -hearthSide * round(W / 2 - 0.6 * caseScale), round(D * 0.1), {
    yaw: -hearthSide > 0 ? -Math.PI / 2 : Math.PI / 2, rollSalt: 2.9, scale: caseScale,
  });
  const cornerCount = scaled(grand ? 3 : humble ? 1 : 2);
  for (let i = 0; i < cornerCount; i += 1) {
    const cx = (i % 2 === 0 ? -1 : 1) * (W / 2 - 0.8);
    const cz = (i < 2 ? -1 : 1) * (D / 2 - 1.0) * (i < 4 ? 1 : 0.45);
    place('pedestal', cx, cz, { rollSalt: i * 5.7 });
  }
  // Radiators under the street windows, where they belong.
  for (const opening of southOpenings.filter((o) => o.type === 'window')) {
    place('radiator', opening.center[0], D / 2 - 0.42, { yaw: Math.PI, rollSalt: opening.center[0] * 2.3 });
  }
  if (humble) place('work', hearthSide * (W / 2 - 1.0), round(D * 0.22), { yaw: 0.2, rollSalt: 6.7 });
  // A floor globe stands in the back of a grand room — a study piece, so not
  // in every one of them.
  if (grand && hash01(seed * 9.7) < 0.6) {
    place('globe', hearthSide * round(W / 2 - 1.3), round(-D * 0.3), {
      yaw: -hearthSide * 0.7, rollSalt: 12.9,
    });
  }

  // Side tables carry the lamps; bigger rooms get more of both.
  const tableCount = scaled(humble ? 1 : 2);
  for (let i = 0; i < tableCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const bank = i < 2 ? -1 : 1;
    const tx = side * (rugW / 2 + 1.1);
    const tz = frontZ + bank * (rugD / 2 + 0.5);
    if (Math.abs(tx) > W / 2 - 0.9 || Math.abs(tz) > D / 2 - 0.9) continue;
    // Anchored, however light: the lamp that goes on top is placed separately
    // and would hang in the air if the table were pushed out from under it.
    const sideTable = place('sideTable', tx, tz, { rollSalt: 8.9 + i * 2.7, dynamic: false });
    if (sideTable) {
      place('tableLamp', sideTable.position[0], sideTable.position[2], {
        y: sideTable.size[1], solid: false, rollSalt: 9.3 + i * 3.1,
        lightIntensity: 2.6, lightDistance: 6.5,
        // Only the first pair are actually lit; the rest stand unlit, which
        // is both cheaper and truer to a room lit lamp by lamp.
        unlit: i >= 2,
      });
    }
  }

  // Wall decor and sconces on the party walls, clear of the hearth.
  // Carved brackets either side of the double-parlor arch.
  if (archZ !== null) {
    for (const side of [-1, 1]) {
      place('bracket', side * round(W * 0.25), archZ, {
        y: round(H - 1.55), yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
        solid: false, rollSalt: side * 21.7,
      });
    }
  }

  // Dado panelling below the chair rail on the party walls.
  if (grand) {
    const panel = pickModel('wainscot', wealth, hash01(seed * 6.1));
    if (panel) {
      const [pw, ph, pd] = modelSize(panel);
      const panelScale = round((dadoY - 0.28) / ph);
      const step = pw * panelScale;
      const panelSize = [round(step), round(ph * panelScale), round(pd * panelScale)];
      const runs = Math.floor((D - 1.5) / step);
      for (const side of [-1, 1]) {
        for (let i = 0; i < runs; i += 1) {
          const pz = round(-D / 2 + 0.75 + (i + 0.5) * step);
          furniture.push({
            id: `wainscot-${side}-${i}`, kind: 'furniture', model: panel, modelScale: panelScale,
            position: [round(side * (W / 2 - 0.14)), 0.26, pz],
            size: panelSize,
            yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, collider: false,
          });
        }
      }
    }
  }

  // Framed prints, hung from the picture rail on cords. Drawn rather than
  // modelled: the pack's painting carries a modern colour photograph.
  const decorCount = scaled(grand ? 3 : humble ? 0 : 2);
  for (let i = 0; i < decorCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = round(frontZ + (i < 2 ? -1 : 1) * D * 0.14);
    if (side === hearthSide && Math.abs(z - hearthZ) < 2.4) continue;
    const w = round((0.62 + hash01(seed + i * 5.1) * 0.42) * caseScale);
    // The first frame carries a real painting; the rest stay engravings.
    // 0.15 is rail plus mount on both sides, so the canvas keeps its aspect.
    const painting = i === 0 ? pickPainting(hash01(seed * 9.7)) : null;
    const h = painting ? round((w - 0.15) / painting.aspect + 0.15) : round(w * 0.78);
    furniture.push({
      id: `wall-art-${i}`,
      kind: 'wallArt',
      art: painting ? 'painting' : 'engraving',
      artTexture: painting ? painting.texture : undefined,
      moulding: grand ? 'gilt' : 'walnut',
      position: [round(side * (W / 2 - 0.16)), round(1.75 * caseScale), z],
      size: [w, h, 0.06],
      yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      seed: seed + i * 13,
      railY: railY,
      collider: false,
    });
  }
  for (const side of [-1, 1]) {
    place('wallLight', side * round(W / 2 - 0.18 * (size === 'XL' ? 1.5 : 1)), round(frontZ + D * 0.05), {
      y: round(1.85 * (size === 'XL' ? 1.5 : 1)), yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      solid: false, rollSalt: side * 13.7, lightIntensity: 2.8, lightDistance: 7,
      scale: size === 'XL' ? 1.5 : 1,
    });
  }

  // Chandelier hangs over the front room.
  place('ceilingLight', 0, frontZ, {
    y: H - 1.9, solid: false, rollSalt: 17.1, lightIntensity: 5.2, lightDistance: 13,
    flameRadius: 0.045, shadow: true,
  });

  // XL atrium: column ring plus a second chandelier over the back half.
  if (size === 'XL') {
    // Carved shafts on plain drums: the drum carries the height, the model
    // gives the ring of columns something worth looking at.
    for (const sx of [-1, 1]) {
      for (const sz2 of [-1, 1]) {
        const cx = round((sx * W) / 4);
        const cz = round((sz2 * D) / 4);
        furniture.push({
          id: `column-drum-${sx}-${sz2}`, kind: 'furniture', shape: 'cylinder',
          position: [cx, H / 2, cz], size: [0.7, H, 0.7], yaw: 0, color: palette.ceiling,
        });
        place('column', cx, cz, { solid: false, rollSalt: sx * 3 + sz2 * 7 });
      }
    }
    place('ceilingLight', 0, round(-D * 0.28), {
      y: H - 1.9, solid: false, rollSalt: 19.3, lightIntensity: 5.0, lightDistance: 13,
    });

    // Gallery railing running the long walls at half height, which is what
    // makes the void read as two storeys rather than one very tall room.
    const rail = pickModel('railing', wealth, hash01(seed * 8.3));
    if (rail) {
      const [rw, rh, rd] = modelSize(rail);
      const step = rw;
      const railSize = [round(rw), round(rh), round(rd)];
      const spans = Math.floor((D - 4) / step);
      for (const side of [-1, 1]) {
        for (let i = 0; i < spans; i += 1) {
          furniture.push({
            id: `gallery-${side}-${i}`, kind: 'furniture', model: rail, modelScale: 1,
            position: [round(side * (W / 2 - 2.2)), round(H / 2), round(-D / 2 + 2 + (i + 0.5) * step)],
            size: railSize,
            yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, collider: false,
          });
        }
      }
    }
  }

  // The front door leaf, shut in its opening. The opening is already blocked
  // by the wall derivation, so this is the visible half of that.
  const leaf = modelSize('Door_02_Wing');
  const leafScale = round(2.68 / leaf[1]);
  furniture.push({
    id: 'front-door-leaf',
    kind: 'furniture',
    model: 'Door_02_Wing',
    modelScale: leafScale,
    position: [doorAlong, 0, round(D / 2 - 0.16)],
    size: leaf.map((value) => round(value * leafScale)),
    yaw: 0,
    collider: false,
  });

  // Joinery: skirting, picture rail, and cornice around the perimeter. A
  // room whose walls run straight into the floor and ceiling is the clearest
  // tell that an interior was not built by a joiner.
  const trim = (id, x, y, z, sx, sy, sz, color) => {
    furniture.push({
      id, kind: 'furniture', position: [round(x), round(y), round(z)],
      size: [round(sx), round(sy), round(sz)], yaw: 0, color, collider: false,
    });
  };
  // Runs are [alongCentre, length] pairs per wall; the south wall breaks
  // either side of the front door.
  // A moulding stops at an opening and picks up on the far side — it cannot
  // run through a window. Each wall is cut into spans by whichever openings
  // that member's own height band actually crosses, so the skirting ignores
  // a window with a raised sill while the chair rail below the head does not.
  const WALLS = [
    { id: 'south', length: W, openings: southOpenings, along: 'x', fixed: D / 2 - 0.14 },
    { id: 'north', length: W, openings: rearOpenings, along: 'x', fixed: -D / 2 + 0.14 },
    { id: 'west', length: D, openings: [], along: 'z', fixed: -W / 2 + 0.14 },
    { id: 'east', length: D, openings: [], along: 'z', fixed: W / 2 - 0.14 },
  ];

  function spansFor(wall, low, high) {
    const blocked = wall.openings
      .filter((opening) => {
        const bottom = opening.center[1] - opening.size[1] / 2;
        const top = opening.center[1] + opening.size[1] / 2;
        return high > bottom && low < top;
      })
      .map((opening) => [opening.center[0] - opening.size[0] / 2 - 0.09, opening.center[0] + opening.size[0] / 2 + 0.09])
      .sort((a, b) => a[0] - b[0]);

    const spans = [];
    let cursor = -wall.length / 2;
    for (const [from, to] of blocked) {
      if (from - cursor > 0.25) spans.push([cursor, from]);
      cursor = Math.max(cursor, to);
    }
    if (wall.length / 2 - cursor > 0.25) spans.push([cursor, wall.length / 2]);
    return spans;
  }

  // Each moulding is built from stepped members rather than one flat board.
  // A single box reads as a painted stripe; the step is what catches the
  // light and says joinery.
  const member = (wall, id, y, height, factor, color) => {
    for (const [from, to] of spansFor(wall, y - height / 2, y + height / 2)) {
      const centre = (from + to) / 2;
      const length = to - from;
      const thickness = 0.09 * factor;
      const [x, z, sx, sz] =
        wall.along === 'x'
          ? [centre, wall.fixed, length, thickness]
          : [wall.fixed, centre, thickness, length];
      trim(`${id}-${wall.id}-${round(centre)}`, x, y, z, sx, height, sz, color);
    }
  };

  for (const wall of WALLS) {
    // Skirting: plinth board with a cap moulding standing proud of it.
    member(wall, 'skirting', 0.11, 0.22, 1.0, palette.trim);
    member(wall, 'skirting-cap', 0.245, 0.05, 1.9, palette.trim);

    if (!humble) {
      // Picture rail: the rail itself over a slim bead.
      member(wall, 'picture-rail', railY, 0.05, 1.9, palette.trim);
      member(wall, 'picture-bead', railY - 0.045, 0.03, 1.2, palette.trim);
    }
    if (grand) {
      // Chair rail capping the dado, with a bead under it.
      member(wall, 'chair-rail', dadoY, 0.07, 2.0, palette.trim);
      member(wall, 'chair-bead', dadoY - 0.055, 0.03, 1.3, palette.trim);
    }

    // Cornice: a deep cove with a bed moulding tucked beneath.
    member(wall, 'cornice', H - 0.1, 0.2, 2.6, palette.ceiling);
    member(wall, 'cornice-bed', H - 0.235, 0.08, 1.6, palette.ceiling);
  }

  // Hearth fire: a low warm light at the grate, the room's other anchor.
  if (hearth) {
    light('hearth-fire', hearthSide * (W / 2 - 0.75), 0.42, hearthZ, 2.6, {
      fixture: false, color: '#ff9a4a', distance: 7, flicker: 0.3, flameRadius: 0.09,
      shadow: true, coneAngle: 1.45,
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

  // The wall above the picture rail and the panel in the ceiling both need
  // the finished wall list, so they go on after the blueprint is assembled.
  // A humble room took one paper and no frieze; there is no picture rail up
  // there to divide it from anyway.
  furniture.push(
    ...(humble ? [] : friezeBand(blueprint, { wall: wallColor, ceiling: palette.ceiling, pictureRail: railY })),
    ...ceilingPanel(blueprint, { ceiling: palette.ceiling, inset: Math.max(1, Math.min(W, D) * 0.14) }),
  );

  const lighting = {
    id: `${blueprint.id}_LIGHT`,
    // `scale` dims the panel's global fill for this room. Gas-lit interiors
    // need very little ambient — the flat corner glow is what makes a room
    // read as fake, so the lamps and windows do nearly all the work.
    ambient: { color: '#6b6558', intensity: 0.38, scale: 0.3 },
    // `groundColor` lights every downward-facing surface in the room, and
    // the ceiling is the largest of them. A saturated brown here — however
    // well it stands for bounce off the boards — stains a whitened ceiling
    // tan whatever colour it is painted. Keep it warm but near-grey.
    hemisphere: { skyColor: '#8e9ab5', groundColor: '#5e574f', intensity: 0.55, scale: 0.3 },
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

  // `interior` carries what the scene needs but the blueprint schema does
  // not model: window dressing keys off wealth, and the window view needs
  // the building's real place and facing in the world. `viewAnchor` is the
  // point in this room that the exterior capture is taken from — the middle
  // of the street wall at window height — which is what the parallax
  // correction measures against.
  return {
    blueprint,
    lighting,
    // A hall boy stands in a house grand enough to keep one; lobbyStaff.js
    // decides from the room's own size, so a humble flat gets nobody.
    features: grand ? ['lobby-staff'] : [],
    interior: {
      wealth,
      size,
      seed,
      building,
      // Generated interiors are all street-front rooms, so all parlors.
      role: 'parlor',
      viewAnchor: [0, round(1.1 + winH / 2), round(D / 2)],
    },
  };
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

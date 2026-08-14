// Facade grid shared by the painted texture, the instanced window geometry,
// and the interior generator, so exterior windows, painted openings, and
// interior rooms all agree on where the door and windows sit.
// One column per ~2.8m of width, one floor per ~3.4m of height. Openings stay
// narrow enough to leave the broad masonry piers characteristic of 1890s
// row houses; the street-floor sash is raised above the stoop/basement zone.
// `doorColumn` is optional so texture and unit tests can still ask for the
// neutral centred grid, while a real building can carry its seeded entrance.
export function facadeLayout(widthM, heightM, doorColumn = null) {
  const floors = Math.min(8, Math.max(2, Math.round((heightM - 2) / 3.4)));
  const cols = Math.min(6, Math.max(2, Math.round(widthM / 2.8)));
  const doorCol = Math.min(cols - 1, Math.max(0, doorColumn ?? Math.floor(cols / 2)));
  const unit = 52;
  const texW = cols * unit + 16;
  const texH = floors * unit + 22;
  const upper = [];
  for (let floor = 0; floor < floors - 1; floor += 1) {
    for (let col = 0; col < cols; col += 1) {
      upper.push({ col, floor, x: 19 + col * unit, y: 29 + floor * unit, w: 18, h: 28 });
    }
  }
  const groundBandY = texH - unit - 4;
  const ground = [];
  for (let col = 0; col < cols; col += 1) {
    const isDoor = col === doorCol;
    ground.push({
      col, x: 19 + col * unit, y: groundBandY + 8, w: 18, h: 28, isDoor,
      // The same bay record locates the street entrance, but the door keeps
      // its broader original width. End elevations treat this as a window.
      ...(isDoor ? { doorW: 24 } : {}),
    });
  }
  return { floors, cols, unit, texW, texH, upper, ground, groundBandY };
}

// Outward normal and the axis u runs along for each box face, matching
// BoxGeometry UVs (side faces mirror horizontally).
export const FACES = {
  '+z': { normal: [0, 0, 1], right: [1, 0, 0], yaw: 0 },
  '-z': { normal: [0, 0, -1], right: [-1, 0, 0], yaw: Math.PI },
  '+x': { normal: [1, 0, 0], right: [0, 0, -1], yaw: Math.PI / 2 },
  '-x': { normal: [-1, 0, 0], right: [0, 0, 1], yaw: -Math.PI / 2 },
};

export function facadeWidth(size, token = '+z') {
  return token === '+z' || token === '-z' ? size[0] : size[2];
}

function idHash(id = '') {
  let total = 0;
  for (let index = 0; index < id.length; index += 1) {
    total = (total * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(total);
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Attached houses characteristically put the door in a side bay. Keep a
// smaller centred minority so a generated row does not exchange one repeated
// pattern for another. Authored landmarks retain their documented builders.
function facadeDoorColumn(building, cols) {
  if (!building.frontageFamily || building.landmarkModel) return Math.floor(cols / 2);
  const seed = idHash(building.id);
  if (cols === 2) return hash01(seed * 0.73) < 0.5 ? 0 : 1;
  const roll = hash01(seed * 0.73);
  if (roll < 0.4) return 0;
  if (roll < 0.8) return cols - 1;
  return Math.floor(cols / 2);
}

export function facadeLayoutForFace(building, token = building.windowFaces?.[0] ?? '+z') {
  const width = facadeWidth(building.size, token);
  const neutral = facadeLayout(width, building.size[1]);
  const faceIndex = building.windowFaces?.indexOf(token) ?? 0;
  if (facadeFaceRole(building, token, faceIndex) !== 'front') return neutral;
  return facadeLayout(width, building.size[1], facadeDoorColumn(building, neutral.cols));
}

export function facadeFaceRole(building, token, faceIndex = building.windowFaces?.indexOf(token) ?? 0) {
  return building.facadeRoles?.[token] ?? (faceIndex === 0 ? 'front' : 'formal');
}

function centeredScale(entry, widthScale, heightScale) {
  const w = entry.w * widthScale;
  const h = entry.h * heightScale;
  return {
    ...entry,
    x: entry.x + (entry.w - w) / 2,
    y: entry.y + (entry.h - h) / 2,
    w,
    h,
  };
}

// Formal fronts use the full grid. Rear and end elevations use two smaller
// stacks near the center: enough to read as occupied, but clearly secondary
// to the street frontage. Rear ground floors keep only one irregularly placed
// opening, while exposed ends retain both.
export function facadeWindowEntries(layout, role = 'front') {
  if (role === 'front') {
    return [...layout.upper, ...layout.ground.filter((entry) => !entry.isDoor)];
  }
  if (role === 'rear' || role === 'end') {
    const center = (layout.cols - 1) / 2;
    const columns = [...Array(layout.cols).keys()]
      .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
      .slice(0, Math.min(2, layout.cols));
    const ground = layout.ground.filter(
      (entry) => columns.includes(entry.col)
        && (role === 'end' || (entry.col + layout.floors) % 2 === 0),
    );
    const scale = role === 'rear' ? [0.68, 0.78] : [0.72, 0.82];
    return [...layout.upper.filter((entry) => columns.includes(entry.col)), ...ground]
      .map((entry) => centeredScale(entry, scale[0], scale[1]));
  }
  return [...layout.upper, ...layout.ground];
}

const RAISED_STOOP_STYLES = new Set([0, 3, 5]);

function facadeQuaternion(yaw, pitch = 0) {
  // World-Y yaw followed by local-X pitch. Returning the quaternion keeps the
  // Rapier ramp on the same outward axis for all four facade orientations.
  const halfYaw = yaw / 2;
  const halfPitch = pitch / 2;
  const cy = Math.cos(halfYaw);
  const sy = Math.sin(halfYaw);
  const cp = Math.cos(halfPitch);
  const sp = Math.sin(halfPitch);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}

// The one source of truth for procedural entrance visuals and collision.
// Records are in world coordinates because both WindowField and the fixed
// street collider body consume them. Small decorative choices are returned as
// flags; they remain instances in WindowField and create no extra draw calls.
export function facadeEntranceLayout(building, requestedToken = null) {
  const faces = building.windowFaces ?? [];
  const frontIndex = requestedToken
    ? faces.indexOf(requestedToken)
    : faces.findIndex((token, index) => facadeFaceRole(building, token, index) === 'front');
  const token = requestedToken ?? faces[frontIndex >= 0 ? frontIndex : 0];
  const faceIndex = faces.indexOf(token);
  const face = FACES[token];
  if (!face || facadeFaceRole(building, token, Math.max(0, faceIndex)) !== 'front') return null;

  const [cx, cy, cz] = building.position;
  const [sx, sy, sz] = building.size;
  const faceWidth = facadeWidth(building.size, token);
  const halfDepth = face.normal[2] !== 0 ? sz / 2 : sx / 2;
  const layout = facadeLayoutForFace(building, token);
  const door = layout.ground.find((entry) => entry.isDoor);
  if (!door) return null;

  const seed = idHash(building.id);
  const roll = (salt) => hash01(seed * salt + faceIndex * 17.3);
  const u = (door.x + door.w / 2) / layout.texW;
  const baseY = cy - sy / 2;
  const raised = RAISED_STOOP_STYLES.has(building.facadeStyle ?? seed % 4);
  const stepCount = raised ? 4 + Math.floor(roll(0.37) * 3) : 1 + (roll(0.37) > 0.34 ? 1 : 0);
  const riser = raised ? 0.175 + Math.floor(roll(0.61) * 3) * 0.01 : 0.16;
  const rise = stepCount * riser;
  const depth = raised
    ? 1.35 + roll(0.83) * 0.34
    : 0.78 + stepCount * 0.16 + roll(0.83) * 0.12;
  const doorWidth = ((door.doorW ?? door.w) / layout.texW) * faceWidth * (0.94 + roll(1.07) * 0.12);
  const stepWidth = doorWidth * (raised ? 1.48 + roll(1.31) * 0.32 : 1.92 + roll(1.31) * 0.34);
  const landingDepth = Math.min(depth * 0.42, raised ? 0.48 : 0.55);
  const tread = stepCount > 1 ? (depth - landingDepth) / (stepCount - 1) : 0;
  const railStyle = raised && roll(1.57) < 0.52 ? 'iron' : raised ? 'stone' : 'none';
  const surround = ['plain', 'corniced', 'transom'][Math.floor(roll(1.91) * 3)];
  const panelRows = [
    [0.28, 0.68],
    [0.22, 0.5, 0.78],
    [0.34, 0.58, 0.82],
  ][Math.floor(roll(2.17) * 3)];
  const doorHeight = raised ? 2.32 + roll(2.43) * 0.24 : 2.68 + roll(2.43) * 0.2;
  const transomHeight = surround === 'transom' ? 0.42 : 0;
  const railHeight = 0.72 + roll(2.69) * 0.1;
  const angle = Math.atan2(rise, depth);
  const slopeLength = Math.hypot(depth, rise);

  const point = (atU, out, y) => [
    cx + face.right[0] * (atU - 0.5) * faceWidth + face.normal[0] * (halfDepth + out),
    y,
    cz + face.right[2] * (atU - 0.5) * faceWidth + face.normal[2] * (halfDepth + out),
  ];

  const steps = [];
  for (let index = 0; index < stepCount; index += 1) {
    const stepDepth = depth - index * tread;
    const height = (rise * (index + 1)) / stepCount;
    steps.push({
      position: point(u, stepDepth / 2, baseY + height / 2),
      size: [stepWidth, height, stepDepth],
      yaw: face.yaw,
    });
  }

  const rails = [];
  const stoneCheeks = [];
  const colliders = [];
  const rampThickness = 0.14;
  colliders.push({
    role: 'ramp',
    position: point(
      u,
      depth / 2,
      baseY + rise / 2 - (rampThickness / 2) * Math.cos(angle),
    ),
    size: [stepWidth * 0.92, rampThickness, slopeLength],
    quaternion: facadeQuaternion(face.yaw, angle),
  });

  if (railStyle === 'iron') {
    for (const side of [-1, 1]) {
      const sideU = u + (side * (stepWidth / 2 + 0.045)) / faceWidth;
      for (const offset of [0, -0.3]) {
        rails.push({
          position: point(sideU, depth / 2, baseY + rise / 2 + railHeight + offset),
          size: [0.045, 0.045, slopeLength],
          yaw: face.yaw,
          pitch: angle,
        });
      }
      const postCount = stepCount >= 6 ? 4 : 3;
      for (let post = 0; post < postCount; post += 1) {
        const out = depth * (0.08 + (post / (postCount - 1)) * 0.84);
        const surface = rise * (1 - out / depth);
        rails.push({
          position: point(sideU, out, baseY + surface + railHeight / 2),
          size: [0.04, railHeight, 0.04],
          yaw: face.yaw,
          pitch: 0,
        });
      }
      colliders.push({
        role: side < 0 ? 'left-rail' : 'right-rail',
        position: point(sideU, depth / 2, baseY + rise / 2 + railHeight),
        size: [0.1, 0.16, slopeLength],
        quaternion: facadeQuaternion(face.yaw, angle),
      });
    }
  } else if (railStyle === 'stone') {
    const cheekHeight = rise + 0.28;
    const outerHeight = cheekHeight * 0.2;
    const cheekPitch = Math.atan2(cheekHeight - outerHeight, depth);
    const cheekLength = Math.hypot(depth, cheekHeight - outerHeight);
    for (const side of [-1, 1]) {
      const sideU = u + (side * (stepWidth / 2 + 0.07)) / faceWidth;
      stoneCheeks.push({
        position: point(sideU, depth / 2, baseY),
        size: [0.18, cheekHeight, depth],
        yaw: face.yaw,
      });
      colliders.push({
        role: side < 0 ? 'left-cheek' : 'right-cheek',
        position: point(
          sideU,
          depth / 2,
          baseY + (cheekHeight + outerHeight) / 2,
        ),
        // The character capsule catches this sloped cap like a solid cheek
        // wall, without the invisible overhang a full cuboid wedge creates.
        size: [0.22, 0.2, cheekLength],
        quaternion: facadeQuaternion(face.yaw, cheekPitch),
      });
    }
  }

  return {
    token,
    face,
    faceWidth,
    layout,
    door,
    u,
    baseY,
    raised,
    stepCount,
    rise,
    depth,
    doorWidth,
    stepWidth,
    railStyle,
    surround,
    panelRows,
    panelColumns: roll(2.93) < 0.72 ? 2 : 1,
    doorHeight,
    transomHeight,
    doorColor: Math.floor(roll(3.19) * 5),
    brassSide: roll(3.47) < 0.5 ? -1 : 1,
    bootScraper: raised && roll(3.71) < 0.42,
    hood: !raised && roll(3.97) < 0.28,
    steps,
    rails,
    stoneCheeks,
    colliders,
  };
}

// World position of a building's street door: on the face plane, `out`
// meters along the outward normal.
export function doorWorld(building, out = 0) {
  const token = building.windowFaces?.[0] ?? '+z';
  const face = FACES[token];
  const [sx, sy, sz] = building.size;
  const faceWidth = facadeWidth(building.size, token);
  const halfDepth = (face.normal[2] !== 0 ? sz : sx) / 2;
  const layout = facadeLayoutForFace(building, token);
  const door = layout.ground.find((win) => win.isDoor);
  const u = (door.x + door.w / 2) / layout.texW;
  return {
    x: building.position[0] + face.right[0] * (u - 0.5) * faceWidth + face.normal[0] * (halfDepth + out),
    z: building.position[2] + face.right[2] * (u - 0.5) * faceWidth + face.normal[2] * (halfDepth + out),
    u,
    normal: face.normal,
  };
}

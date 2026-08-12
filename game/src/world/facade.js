// Facade grid shared by the painted texture, the instanced window geometry,
// and the interior generator, so exterior windows, painted openings, and
// interior rooms all agree on where the door and windows sit.
// One column per ~2.8m of width, one floor per ~3.4m of height. Openings stay
// narrow enough to leave the broad masonry piers characteristic of 1890s
// row houses; the street-floor sash is raised above the stoop/basement zone.
export function facadeLayout(widthM, heightM) {
  const floors = Math.min(8, Math.max(2, Math.round((heightM - 2) / 3.4)));
  const cols = Math.min(6, Math.max(2, Math.round(widthM / 2.8)));
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
    const isDoor = col === Math.floor(cols / 2);
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

export function facadeLayoutForFace(building, token = building.windowFaces?.[0] ?? '+z') {
  return facadeLayout(facadeWidth(building.size, token), building.size[1]);
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

// World position of a building's street door: on the face plane, `out`
// meters along the outward normal.
export function doorWorld(building, out = 0) {
  const face = FACES[building.windowFaces?.[0] ?? '+z'];
  const [sx, sy, sz] = building.size;
  const faceWidth = facadeWidth(building.size, building.windowFaces?.[0] ?? '+z');
  const halfDepth = (face.normal[2] !== 0 ? sz : sx) / 2;
  const layout = facadeLayout(faceWidth, sy);
  const door = layout.ground.find((win) => win.isDoor);
  const u = (door.x + door.w / 2) / layout.texW;
  return {
    x: building.position[0] + face.right[0] * (u - 0.5) * faceWidth + face.normal[0] * (halfDepth + out),
    z: building.position[2] + face.right[2] * (u - 0.5) * faceWidth + face.normal[2] * (halfDepth + out),
    u,
    normal: face.normal,
  };
}

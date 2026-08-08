// Facade grid shared by the painted texture, the instanced window geometry,
// and the interior generator, so exterior windows, painted openings, and
// interior rooms all agree on where the door and windows sit.
// One column per ~2.8m of width, one floor per ~3.4m of height; a 52px unit
// is ~2.8m, so a 20px opening is a ~1.1m sash about two panes high.
export function facadeLayout(widthM, heightM) {
  const floors = Math.min(8, Math.max(2, Math.round((heightM - 2) / 3.4)));
  const cols = Math.min(6, Math.max(2, Math.round(widthM / 2.8)));
  const unit = 52;
  const texW = cols * unit + 16;
  const texH = floors * unit + 22;
  const upper = [];
  for (let floor = 0; floor < floors - 1; floor += 1) {
    for (let col = 0; col < cols; col += 1) {
      upper.push({ col, floor, x: 18 + col * unit, y: 26 + floor * unit, w: 20, h: 34 });
    }
  }
  const groundBandY = texH - unit - 4;
  const ground = [];
  for (let col = 0; col < cols; col += 1) {
    ground.push({ col, x: 16 + col * unit, y: groundBandY + 4, w: 24, h: unit - 10, isDoor: col === Math.floor(cols / 2) });
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

// World position of a building's street door: on the face plane, `out`
// meters along the outward normal.
export function doorWorld(building, out = 0) {
  const face = FACES[building.windowFaces?.[0] ?? '+z'];
  const [sx, sy, sz] = building.size;
  const faceWidth = face.normal[2] !== 0 ? sx : sz;
  const halfDepth = (face.normal[2] !== 0 ? sz : sx) / 2;
  const layout = facadeLayout(sx, sy);
  const door = layout.ground.find((win) => win.isDoor);
  const u = (door.x + door.w / 2) / layout.texW;
  return {
    x: building.position[0] + face.right[0] * (u - 0.5) * faceWidth + face.normal[0] * (halfDepth + out),
    z: building.position[2] + face.right[2] * (u - 0.5) * faceWidth + face.normal[2] * (halfDepth + out),
    u,
    normal: face.normal,
  };
}

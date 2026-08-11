// The Dairy (Vaux, 1870), framework-free and deterministic. One long block
// under a continuous steep roof: the eastern half a grey stone cottage with
// buff quoins and pointed windows, the western half the open painted-timber
// loggia. Meshes are in the local frame (x along the ridge, loggia west,
// y from the pad); colliders come out in world coordinates.

import { terrainHeight } from './terrain.js';

export const DAIRY = { x: 29, z: -48, yaw: 0.15 };

const WIDTH = 5.2;
const EAVE = 2.95;
const RIDGE = 5.95;
const COTTAGE = [-0.1, 6.4]; // x span of the stone half
const LOGGIA = [-6.2, -0.1];

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function stoneTint(seed) {
  const t = hash01(seed) * 0.16;
  return [0.82 + t, 0.8 + t, 0.75 + t];
}

export function buildDairy() {
  const stone = [];
  const cream = [];
  const dark = [];
  const planks = [];
  let n = 0;
  const box = (list, x, y, z, sx, sy, sz, tint) => {
    n += 1;
    list.push({ p: [x, y, z], s: [sx, sy, sz], tint: tint ?? stoneTint(n * 2.3) });
  };

  // Cottage walls. The half-height z-walls leave the window strip open;
  // window and trim boxes fill it.
  const [c0, c1] = COTTAGE;
  const cx = (c0 + c1) / 2;
  const clen = c1 - c0;
  const half = WIDTH / 2;
  for (const side of [-1, 1]) {
    // Long walls in three lifts so the tint breaks like coursed masonry.
    box(stone, cx, 0.55, side * (half - 0.15), clen, 1.1, 0.3);
    box(stone, cx, 1.85, side * (half - 0.15), clen, 1.5, 0.3);
    box(stone, cx, 2.75, side * (half - 0.15), clen, 0.5, 0.3);
  }
  box(stone, c1 - 0.15, EAVE / 2, 0, 0.3, EAVE, WIDTH - 0.1);
  box(stone, c0 + 0.15, EAVE / 2, 0, 0.3, EAVE, WIDTH - 0.1);

  // Buff quoins up the cottage's visible corners.
  for (const [qx, qz] of [[c1 - 0.2, half - 0.14], [c1 - 0.2, -half + 0.14], [c0 + 0.2, half - 0.14], [c0 + 0.2, -half + 0.14]]) {
    for (let i = 0; i < 5; i += 1) {
      box(cream, qx, 0.35 + i * 0.62, qz, i % 2 ? 0.38 : 0.52, 0.34, 0.36, [0.92, 0.88, 0.76]);
    }
  }

  // Pointed windows: dark recess, cream sill, two raked header boards.
  const windows = [
    [1.4, half], [4.6, half], [1.4, -half], [4.6, -half],
  ];
  for (const [wx, wz] of windows) {
    const sign = Math.sign(wz);
    const face = wz - sign * 0.02;
    box(dark, wx, 1.7, face, 0.78, 1.6, 0.3, [0.1, 0.11, 0.11]);
    // Frame: sill, jambs, raked headers, and a sash cross proud of the pane.
    box(cream, wx, 0.86, face, 0.98, 0.12, 0.34, [0.92, 0.88, 0.76]);
    for (const jamb of [-1, 1]) {
      box(cream, wx + jamb * 0.44, 1.7, face, 0.1, 1.72, 0.34, [0.92, 0.88, 0.76]);
    }
    box(cream, wx, 1.7, face + sign * 0.16, 0.06, 1.5, 0.05, [0.9, 0.87, 0.78]);
    box(cream, wx, 1.98, face + sign * 0.16, 0.72, 0.06, 0.05, [0.9, 0.87, 0.78]);
    for (const rake of [-1, 1]) {
      n += 1;
      cream.push({
        p: [wx + rake * 0.24, 2.62 + 0.1, face],
        r: [0, 0, rake * -0.85],
        s: [0.62, 0.1, 0.34],
        tint: [0.92, 0.88, 0.76],
      });
    }
  }
  // East window and the door into the loggia end of the cottage.
  box(dark, c1 - 0.12, 1.8, 0, 0.3, 1.7, 0.9, [0.1, 0.11, 0.11]);
  box(dark, c0 + 0.12, 1.15, 0.9, 0.34, 2.2, 0.95, [0.16, 0.13, 0.1]);

  // Chimney with a corbelled cap.
  box(stone, 4.7, 5.5, 0, 0.72, 2.6, 0.72);
  box(cream, 4.7, 6.85, 0, 0.95, 0.16, 0.95, [0.88, 0.84, 0.74]);

  // Loggia: painted posts, pointed-arch spandrels, low rail, plank floor.
  const [l0, l1] = LOGGIA;
  const postXs = [l1 - 0.25, (l0 + l1) / 2 + 0.95, (l0 + l1) / 2 - 0.95, l0 + 0.25];
  const postTint = [0.9, 0.86, 0.72];
  for (const side of [-1, 1]) {
    for (const px of postXs) {
      box(cream, px, EAVE / 2, side * (half - 0.2), 0.18, EAVE, 0.18, postTint);
    }
    // Frieze beam and arch boards per bay; the center south bay stays open
    // as the entry, and every bay keeps its pointed arch.
    box(cream, (l0 + l1) / 2, EAVE - 0.14, side * (half - 0.2), l1 - l0, 0.24, 0.14, postTint);
    for (let bay = 0; bay < 3; bay += 1) {
      const x1 = postXs[bay];
      const x2 = postXs[bay + 1];
      const mid = (x1 + x2) / 2;
      for (const rake of [-1, 1]) {
        n += 1;
        cream.push({
          p: [mid + rake * (Math.abs(x2 - x1) / 4), EAVE - 0.62, side * (half - 0.2)],
          r: [0, 0, rake * 0.72],
          s: [Math.abs(x2 - x1) * 0.62, 0.09, 0.12],
          tint: postTint,
        });
      }
      box(cream, mid, EAVE - 0.98, side * (half - 0.2), 0.1, 0.34, 0.1, postTint);
      const entry = side > 0 && bay === 1;
      if (!entry) {
        box(cream, mid, 0.78, side * (half - 0.2), Math.abs(x2 - x1) - 0.2, 0.09, 0.12, postTint);
        box(cream, mid, 0.42, side * (half - 0.2), Math.abs(x2 - x1) - 0.2, 0.07, 0.1, postTint);
      }
    }
  }
  // West end: two mid posts closing the gable end.
  for (const wz of [-half + 1.1, half - 1.1]) {
    box(cream, l0 + 0.25, EAVE / 2, wz, 0.18, EAVE, 0.18, postTint);
  }
  box(planks, (l0 + l1) / 2, 0.1, 0, l1 - l0 + 0.2, 0.16, WIDTH, [0.72, 0.66, 0.55]);
  // Benches along the north side of the loggia.
  box(planks, (l0 + l1) / 2, 0.55, -half + 0.65, (l1 - l0) * 0.7, 0.07, 0.45, [0.7, 0.63, 0.5]);

  const roof = {
    // Continuous over cottage and loggia, overhanging each gable end.
    x0: l0 - 0.55,
    x1: c1 + 0.55,
    width: WIDTH + 1.1,
    eaveY: EAVE - 0.05,
    ridgeY: RIDGE,
    gables: [c1 + 0.54, l0 - 0.54],
  };

  // Bargeboards: cream rakes with pendant drops at both gable ends. Boards
  // run along z, so the rake is one rotation about x: rotX maps +z to
  // y = -sin, so each side takes +side * angle to slope down toward its eave.
  for (const gx of roof.gables) {
    const rise = roof.ridgeY - roof.eaveY;
    const run = Math.hypot(roof.width / 2, rise);
    const angle = Math.atan2(rise, roof.width / 2);
    for (const side of [-1, 1]) {
      n += 1;
      cream.push({
        p: [gx, (roof.eaveY + roof.ridgeY) / 2 + 0.08, side * roof.width / 4],
        r: [side * angle, 0, 0],
        s: [0.09, 0.14, run],
        tint: [0.9, 0.86, 0.72],
      });
      box(cream, gx, roof.eaveY + rise * 0.5, side * roof.width * 0.27, 0.09, 0.34, 0.09, [0.9, 0.86, 0.72]);
    }
    box(cream, gx, roof.ridgeY - 0.5, 0, 0.09, 0.55, 0.09, [0.9, 0.86, 0.72]);
  }

  // King-post truss in the open west gable, so the dark triangle reads as
  // roof framing rather than a hole.
  {
    const gx = LOGGIA[0] - 0.3;
    const rise = roof.ridgeY - roof.eaveY;
    box(cream, gx, roof.eaveY + 0.06, 0, 0.14, 0.2, WIDTH - 0.4, postTint);
    box(cream, gx, (roof.eaveY + roof.ridgeY - 0.2) / 2, 0, 0.12, rise - 0.3, 0.14, postTint);
    const strutAngle = Math.atan2(rise, roof.width / 2);
    for (const side of [-1, 1]) {
      n += 1;
      cream.push({
        p: [gx, roof.eaveY + rise * 0.34, side * roof.width * 0.17],
        r: [side * strutAngle, 0, 0],
        s: [0.1, 0.12, Math.hypot(roof.width / 2, rise) * 0.42],
        tint: postTint,
      });
    }
  }

  // Colliders in world coordinates: loggia posts, floor, and rails. The
  // stone cottage keeps its collider box in centralPark.js.
  const ground = terrainHeight(DAIRY.x, DAIRY.z);
  const cos = Math.cos(DAIRY.yaw);
  const sin = Math.sin(DAIRY.yaw);
  const toWorld = (lx, lz) => [DAIRY.x + lx * cos + lz * sin, DAIRY.z - lx * sin + lz * cos];
  const colliders = [];
  for (const side of [-1, 1]) {
    for (const px of postXs) {
      const [wx, wz] = toWorld(px, side * (half - 0.2));
      colliders.push({ type: 'cylinder', p: [wx, ground + EAVE / 2, wz], radius: 0.14, height: EAVE });
    }
  }
  const [fx, fz] = toWorld((l0 + l1) / 2, 0);
  colliders.push({ type: 'box', p: [fx, ground + 0.1, fz], size: [l1 - l0 + 0.2, 0.16, WIDTH], yaw: DAIRY.yaw });
  for (const side of [-1, 1]) {
    for (let bay = 0; bay < 3; bay += 1) {
      if (side > 0 && bay === 1) continue;
      const mid = (postXs[bay] + postXs[bay + 1]) / 2;
      const [wx, wz] = toWorld(mid, side * (half - 0.2));
      colliders.push({
        type: 'box',
        p: [wx, ground + 0.6, wz],
        size: [Math.abs(postXs[bay + 1] - postXs[bay]) - 0.2, 0.9, 0.14],
        yaw: DAIRY.yaw,
      });
    }
  }

  return { stone, cream, dark, planks, roof, colliders, ground };
}

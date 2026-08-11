// Placement helper for exterior set dressing. Models are converted by
// scripts/models/convert-pack.mjs, which puts each piece upright with its long
// axis on x and its base at y=0; modelPacks resolves where it loads from.

import { modelSize } from './modelPacks.js';

// The gas lamp, shared by the park walks and the street grid. Its origin is
// the foot of the post; the lantern hangs off an arm, so its burner is offset
// in the model's own frame and turns with the placement.
//
// Measured off the converted model: post on the origin, and the lantern's
// glass a tapered prism 0.54m out, spanning 2.75-2.95m and 0.19m across at
// mid-height. The flame goes inside that, so it lights the panes from within
// rather than hanging beside them — hence the small radius.
export const LAMP_MODEL = 'low-poly_lamp_post';
const LAMP_BURNER = [-0.537, 2.87, 0];
const LAMP_FLAME_SIZE = 0.14;

// Post plus the emissive globe that sits inside its lantern glass. `yaw` turns
// the arm out over the road or the walk.
export function gasLamp(id, x, z, yaw = 0, options = {}) {
  const baseY = options.y ?? 0;
  const [bx, by, bz] = LAMP_BURNER;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    parkProp(`${id}-post`, LAMP_MODEL, x, z, yaw, {
      ...options,
      collider: [0.3, modelSize(LAMP_MODEL)[1], 0.3],
    }),
    {
      id: `${id}-globe`,
      kind: 'furniture',
      shape: 'sphere',
      position: [x + bx * cos + bz * sin, baseY + by, z - bx * sin + bz * cos],
      size: [LAMP_FLAME_SIZE, LAMP_FLAME_SIZE, LAMP_FLAME_SIZE],
      yaw: 0,
      color: '#ffe6b8',
      collider: false,
      emissive: '#ffc57a',
      absoluteY: options.absoluteY ?? false,
    },
  ];
}

// One placement. Position is the ground-contact point; the zone adds terrain
// height. yaw 0 faces +z (south), matching the converted models.
export function parkProp(id, model, x, z, yaw = 0, options = {}) {
  const [sx, sy, sz] = modelSize(model);
  const item = {
    id,
    kind: 'furniture',
    model,
    position: [x, options.y ?? 0, z],
    size: [sx, sy, sz],
    yaw,
  };
  // Some pieces are mostly air: a lamppost's crossarm makes its footprint a
  // metre wide, which is not what you should bump into.
  if (options.collider === false) item.collider = false;
  else if (options.collider) item.colliderSize = options.collider;
  if (options.absoluteY) item.absoluteY = true;
  return item;
}

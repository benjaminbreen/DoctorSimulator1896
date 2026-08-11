// Collider boxes for furniture, shared by the static collider list and the
// dynamic bodies. Framework-free so tests can read it.

import { modelColliders } from '../world/victorianCatalog.js';

const half = (size) => [size[0] / 2, size[1] / 2, size[2] / 2];

// Boxes for one item, in metres, relative to the item's own origin. Catalog
// models with a hand-authored compound get it; everything else gets one box
// from its footprint. A model's position is its floor contact point, a
// placeholder's is its box centre, hence the difference in y.
export function itemBoxes(item) {
  if (item.model) {
    // An explicit size wins: pieces that are mostly air (a lamppost's
    // crossarm) should not be solid to their whole footprint.
    if (item.colliderSize) {
      return [{ center: [0, item.colliderSize[1] / 2, 0], half: half(item.colliderSize) }];
    }
    const boxes = modelColliders(item.model, item.modelScale ?? 1);
    if (boxes) return boxes;
    return [{ center: [0, item.size[1] / 2, 0], half: half(item.size) }];
  }
  return [{ center: [0, 0, 0], half: half(item.size) }];
}

// Uniform density giving a body of these boxes the intended mass. Child
// colliders inherit it from the body, so mass and inertia both come out right.
export function boxDensity(boxes, mass) {
  let volume = 0;
  for (const box of boxes) volume += 8 * box.half[0] * box.half[1] * box.half[2];
  return volume > 0 ? mass / volume : 1;
}

// A local offset placed in world space around a yaw-rotated item.
export function rotateOffset(position, center, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [
    position[0] + center[0] * cos + center[2] * sin,
    position[1] + center[1],
    position[2] - center[0] * sin + center[2] * cos,
  ];
}

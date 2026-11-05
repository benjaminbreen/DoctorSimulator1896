// What stands on the street roofs, framework-free: brick chimney stacks on
// the side (party) walls with clay pots, a wooden water tank on some of the
// taller apartment houses, stair bulkheads and skylights. Placed in each
// building's front-face frame, so `along` runs the facade and `back` runs
// from the front wall toward the rear.

import { facadeEntranceLayout, facadeWidth, FACES } from './facade.js';
import { streetItems } from './streetGrid.js';

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function idHash(id) {
  let total = 0;
  for (let i = 0; i < id.length; i += 1) total = (total * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(total);
}

export function rooftops(items = streetItems) {
  const stacks = [];
  const pots = [];
  const tanks = [];
  const bulkheads = [];
  const skylights = [];

  for (const item of items) {
    if (item.kind !== 'backdrop' || !item.frontageFamily || item.landmarkLabel) continue;
    const token = item.windowFaces?.[0];
    const face = facadeEntranceLayout(item)?.face ?? FACES[token];
    if (!face) continue;
    const faceToken = Object.keys(FACES).find((key) => FACES[key] === face) ?? token;
    const width = facadeWidth(item.size, faceToken);
    const depth = face.normal[2] !== 0 ? item.size[2] : item.size[0];
    const [cx, cy, cz] = item.position;
    // Top of the roof cap that Furniture.jsx lays over every mass.
    const roof = cy + item.size[1] / 2 + 0.5;
    const seed = idHash(item.id);
    const roll = (salt) => hash01(seed * 0.013 + salt);
    const at = (along, back) => [
      cx + face.right[0] * along + face.normal[0] * (depth / 2 - back),
      cz + face.right[2] * along + face.normal[2] * (depth / 2 - back),
    ];
    const mansard = item.roof === 'mansard';

    // Party-wall stacks: one or two per side wall, each a long brick mass
    // carrying a row of pots, one flue to a pot.
    for (const side of [-1, 1]) {
      const count = depth > 11 && roll(side * 3.1) < 0.6 ? 2 : 1;
      for (let index = 0; index < count; index += 1) {
        const length = 0.9 + roll(side + index * 5.7) * 1.0;
        const back = count === 1
          ? depth * (0.3 + roll(side * 7.3) * 0.35)
          : depth * (index === 0 ? 0.2 : 0.7);
        const [x, z] = at(side * (width / 2 - 0.32), back);
        const height = (mansard ? 3.4 : 1.2) + roll(side * 2.2 + index) * 1.1;
        stacks.push({ x, y: roof - 0.1, z, yaw: face.yaw, width: 0.6, height, length });
        const flues = Math.max(2, Math.round(length / 0.36));
        for (let flue = 0; flue < flues; flue += 1) {
          if (roll(side * 11 + index * 3 + flue) < 0.12) continue;
          const offset = ((flue + 0.5) / flues - 0.5) * (length - 0.2);
          const px = x + face.normal[0] * offset;
          const pz = z + face.normal[2] * offset;
          pots.push({
            x: px, y: roof - 0.1 + height + 0.12, z: pz,
            height: 0.3 + roll(flue * 1.9 + side) * 0.3,
            radius: 0.1 + roll(flue * 2.7 + side) * 0.04,
          });
        }
      }
    }
    if (mansard) continue;

    // Stair bulkhead toward the rear, its door facing forward.
    if (roll(4.4) < 0.75) {
      const along = (roll(4.9) - 0.5) * width * 0.4;
      const [x, z] = at(along, depth * (0.62 + roll(5.3) * 0.15));
      bulkheads.push({ x, y: roof, z, yaw: face.yaw, width: 1.7, height: 2.3, length: 2.4 });
    }
    // Skylight over the stair well.
    if (roll(6.1) < 0.6) {
      const [x, z] = at((roll(6.7) - 0.5) * width * 0.3, depth * 0.38);
      skylights.push({ x, y: roof, z, yaw: face.yaw, width: 1.1, length: 1.5 });
    }
    // Wooden tanks stand on the taller apartment houses, where street
    // pressure did not reach the upper floors.
    if (item.frontageFamily === 'apartment' && item.size[1] > 18 && roll(8.3) < 0.55) {
      const along = (roll(8.9) < 0.5 ? -1 : 1) * width * (0.12 + roll(9.4) * 0.15);
      const [x, z] = at(along, depth * (0.55 + roll(9.9) * 0.2));
      tanks.push({
        x, y: roof, z,
        radius: 1.5 + roll(10.3) * 0.5,
        height: 2.6 + roll(10.9) * 0.7,
        legs: 2.2 + roll(11.5) * 0.8,
      });
    }
  }
  return { stacks, pots, tanks, bulkheads, skylights };
}

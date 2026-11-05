// Where objects meet the ground, framework-free: dark contact patches and
// mud rings at the foot of posts, lamps, steps, benches and trees; dirt lines
// along the base of the house fronts and stoops; and the leaves, scraps and
// weeds that collect against them. All of it is flat dressing on the ground.

import { facadeEntranceLayout } from './facade.js';
import { insideGrandArmyConstruction } from './heroStreetLayout.js';
import { LAMP_MODEL } from './parkCatalog.js';
import { parkItems } from './centralPark.js';
import { STREET_LAMP_SITES, WALK_TOP, streetItems } from './streetGrid.js';
import { streetIronwork } from './streetIronwork.js';
import { terrainHeight } from './terrain.js';

const LIFT = 0.012;

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Park ground height under a patch. The highest of a few samples, so a patch
// on a slope floats at its low edge rather than sinking into the turf.
function parkGround(x, z, radius) {
  if (insideGrandArmyConstruction(x, z)) return WALK_TOP + LIFT;
  let top = -Infinity;
  for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
    top = Math.max(top, terrainHeight(x + dx * 0.7, z + dz * 0.7));
  }
  return top + 0.03;
}

export function groundGrime(items = streetItems, park = parkItems) {
  const spots = [];
  const strips = [];
  const debris = [];
  const weeds = [];
  let seed = 1;
  const next = () => hash01((seed += 1) * 1.37);

  // A few bits of litter blown up against a thing.
  const scatter = (x, y, z, reach, count, kinds) => {
    for (let index = 0; index < count; index += 1) {
      const angle = next() * Math.PI * 2;
      const out = reach * (0.6 + next() * 0.6);
      debris.push({
        x: x + Math.cos(angle) * out, y: y + 0.002, z: z + Math.sin(angle) * out,
        yaw: next() * Math.PI * 2, size: 0.12 + next() * 0.14, kind: kinds[Math.floor(next() * kinds.length)],
      });
    }
  };
  const spot = (x, y, z, rx, rz, yaw, kind, strength = 1) => spots.push({ x, y, z, rx, rz, yaw, kind, strength });

  // Street ironwork and lamps.
  const iron = streetIronwork(items);
  const walk = WALK_TOP + LIFT;
  for (const post of [...iron.hitchingPosts, ...iron.ballPosts]) {
    spot(post.x, walk, post.z, 0.42, 0.42, next() * 6, 'post');
    if (next() < 0.5) scatter(post.x, walk, post.z, 0.18, 1 + Math.floor(next() * 2), ['leaf', 'paper', 'straw']);
    if (next() < 0.15) weeds.push({ x: post.x + 0.1, y: walk, z: post.z - 0.08, yaw: next() * 6, size: 0.18 + next() * 0.1 });
  }
  for (const hydrant of iron.hydrants) {
    spot(hydrant.x, walk, hydrant.z, 0.6, 0.6, next() * 6, 'post', 1.2);
    scatter(hydrant.x, walk, hydrant.z, 0.3, 2, ['leaf', 'straw']);
  }
  for (const step of iron.carriageSteps) {
    spot(step.x, walk, step.z, 0.75, 0.6, step.yaw, 'block');
    if (next() < 0.4) weeds.push({ x: step.x + Math.cos(step.yaw) * 0.5, y: walk, z: step.z - Math.sin(step.yaw) * 0.5, yaw: next() * 6, size: 0.15 });
  }
  for (const scraper of iron.bootScrapers) spot(scraper.x, walk, scraper.z, 0.35, 0.25, scraper.yaw, 'post', 0.8);
  for (const site of STREET_LAMP_SITES) {
    const y = insideGrandArmyConstruction(site.x, site.z) || site.x > 96 || site.z > 84 ? walk : parkGround(site.x, site.z, 0.4);
    spot(site.x, y, site.z, 0.5, 0.5, next() * 6, 'post');
    if (next() < 0.6) scatter(site.x, y, site.z, 0.22, 1 + Math.floor(next() * 3), ['leaf', 'paper', 'straw']);
  }

  // House fronts: a dirt line along the base of the wall, around the stoop
  // foot, and the litter and odd weed that the wind leaves there.
  for (const building of items) {
    if (building.kind !== 'backdrop' || !building.frontageFamily || building.landmarkModel) continue;
    const entrance = facadeEntranceLayout(building);
    if (!entrance) continue;
    const { face, faceWidth, u, depth, stepWidth } = entrance;
    const [cx, , cz] = building.position;
    const halfDepth = face.normal[2] !== 0 ? building.size[2] / 2 : building.size[0] / 2;
    const at = (along, out) => [
      cx + face.right[0] * along + face.normal[0] * (halfDepth + out),
      cz + face.right[2] * along + face.normal[2] * (halfDepth + out),
    ];
    // Strip frame: +z points away from the wall.
    const yaw = Math.atan2(face.normal[0], face.normal[2]);
    const across = Math.atan2(face.right[0], face.right[2]);
    // Set-back houses stand on their lot paving, a little below the walk.
    const y = (building.frontageFamily === 'mansion' ? WALK_TOP - 0.015 : WALK_TOP) + LIFT;
    for (let along = -faceWidth / 2; along < faceWidth / 2 - 0.3; along += 1.8) {
      const length = Math.min(2.2, faceWidth / 2 - along + 0.1);
      const [x, z] = at(along + length / 2, 0.22);
      strips.push({ x, y, z, length, width: 0.45 + next() * 0.15, yaw });
      if (next() < 0.55) {
        const [dx, dz] = at(along + next() * length, 0.06 + next() * 0.25);
        debris.push({ x: dx, y: y + 0.002, z: dz, yaw: next() * 6, size: 0.12 + next() * 0.14, kind: ['leaf', 'paper', 'leaf', 'straw'][Math.floor(next() * 4)] });
      }
      if (next() < 0.12) {
        const [wx, wz] = at(along + next() * length, 0.05);
        weeds.push({ x: wx, y, z: wz, yaw: next() * 6, size: 0.14 + next() * 0.14 });
      }
    }
    const doorAlong = (u - 0.5) * faceWidth;
    const [fx, fz] = at(doorAlong, depth + 0.12);
    strips.push({ x: fx, y, z: fz, length: stepWidth + 0.2, width: 0.35, yaw: yaw + Math.PI });
    for (const side of [-1, 1]) {
      const [sx, sz] = at(doorAlong + side * (stepWidth / 2 + 0.14), depth / 2);
      strips.push({ x: sx, y, z: sz, length: depth, width: 0.3, yaw: across + (side > 0 ? 0 : Math.PI) });
    }
  }

  // The park: lamps and benches on the walks, trees on the lawns.
  for (const item of park) {
    const [x, , z] = item.position;
    if (item.model === LAMP_MODEL) {
      const y = parkGround(x, z, 0.4);
      spot(x, y, z, 0.5, 0.5, next() * 6, 'post');
      scatter(x, y, z, 0.25, 2, ['leaf', 'paper']);
    } else if (/bench/.test(item.model ?? '')) {
      // Worn ground under the seat, and what the sitters drop.
      const y = parkGround(x, z, 1);
      spot(x, y, z, item.size[0] * 0.55, 0.7, (item.yaw ?? 0) + Math.PI / 2, 'block', 0.9);
      scatter(x, y, z, 0.5, 2 + Math.floor(next() * 3), ['paper', 'leaf', 'paper']);
    } else if (item.kind === 'tree') {
      const radius = Math.max(0.7, item.size[0] * 1.1);
      const y = parkGround(x, z, radius);
      spot(x, y, z, radius, radius * (0.85 + next() * 0.3), next() * 6, 'tree');
      scatter(x, y, z, radius * 1.2, 4 + Math.floor(next() * 5), ['leaf']);
    }
  }

  return { spots, strips, debris, weeds };
}

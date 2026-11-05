// Street ironwork and stone around the park, framework-free: horse-head
// hitching posts and carriage steps at the mansion doors, boot scrapers at
// stoop feet, coal-hole covers in the sidewalks, Croton and sewer manholes in
// the roadways, drain gratings at the corners, and letter boxes on lamps.

import { facadeEntranceLayout } from './facade.js';
import {
  ROADS,
  SIDEWALK_WIDTH,
  STREET_HITCHING_POSTS,
  STREET_HYDRANTS,
  STREET_LAMP_SITES,
  STREET_SURFACES,
  streetItems,
} from './streetGrid.js';

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function inRoad(x, z, roads) {
  return roads.some((road) => {
    const across = road.axis === 'z' ? z : x;
    const along = road.axis === 'z' ? x : z;
    return across >= road.lo && across <= road.hi && along >= road.from && along <= road.to;
  });
}

// Lamps, poles and the older posts and hydrants, kept clear of new pieces.
function occupiedSpots(items) {
  const spots = [
    ...STREET_LAMP_SITES.map((site) => [site.x, site.z]),
    ...STREET_HITCHING_POSTS,
    ...STREET_HYDRANTS,
  ];
  for (const item of items) {
    if (/-pole$/.test(item.id)) spots.push([item.position[0], item.position[2]]);
  }
  return spots;
}

function clearOf(spots, x, z, distance = 1.3) {
  return spots.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > distance);
}

function doorways(items, roads, spots) {
  const hitchingPosts = [];
  const carriageSteps = [];
  const bootScrapers = [];
  const coalHoles = [];
  items
    .filter((item) => item.kind === 'backdrop' && item.frontageFamily && !item.landmarkModel)
    .forEach((building, index) => {
      const entrance = facadeEntranceLayout(building);
      if (!entrance) return;
      const { face, faceWidth, u, depth, stepWidth } = entrance;
      const [cx, , cz] = building.position;
      const halfDepth = face.normal[2] !== 0 ? building.size[2] / 2 : building.size[0] / 2;
      // `along` runs the facade, `out` away from it.
      const at = (along, out) => [
        cx + face.right[0] * ((u - 0.5) * faceWidth + along) + face.normal[0] * (halfDepth + out),
        cz + face.right[2] * ((u - 0.5) * faceWidth + along) + face.normal[2] * (halfDepth + out),
      ];
      const onFace = (along) => Math.abs((u - 0.5) * faceWidth + along) < faceWidth / 2 - 0.4;
      // Faces point the way the normal does; the pieces face the street.
      const yaw = Math.atan2(face.normal[0], face.normal[2]);
      const seed = index * 7.13 + 1;

      // The curb: walk out from the facade until the roadway begins.
      let curb = null;
      for (let out = 1; out < 9; out += 0.1) {
        const [x, z] = at(0, out);
        if (inRoad(x, z, roads)) {
          curb = out - 0.1;
          break;
        }
      }

      const grand = building.frontageFamily === 'mansion' || building.frontageFamily === 'marble';
      if (curb !== null && (grand || hash01(seed) < 0.3)) {
        const side = hash01(seed * 2.3) < 0.5 ? -1 : 1;
        const [hx, hz] = at(side * (1.4 + hash01(seed * 3.1) * 0.8), curb - 0.32);
        if (clearOf(spots, hx, hz)) {
          hitchingPosts.push({ x: hx, z: hz, yaw: yaw + (hash01(seed * 4.7) - 0.5) * 0.6 });
          spots.push([hx, hz]);
        }
        if (grand) {
          const [bx, bz] = at(-side * 0.3, curb - 0.3);
          if (clearOf(spots, bx, bz, 1.0)) {
            carriageSteps.push({ x: bx, z: bz, yaw });
            spots.push([bx, bz]);
          }
        }
      }

      // The facade code already puts a scraper by some doors on the landing;
      // the rest of the raised stoops get one at the foot.
      if (entrance.raised && !entrance.bootScraper && hash01(seed * 5.9) < 0.6) {
        const side = hash01(seed * 6.1) < 0.5 ? -1 : 1;
        const [sx, sz] = at(side * (stepWidth / 2 + 0.28), depth - 0.25);
        bootScrapers.push({ x: sx, z: sz, yaw });
      }

      // A coal hole beside the stoop, close to the house.
      const coalSide = hash01(seed * 7.7) < 0.5 ? -1 : 1;
      const coalAlong = coalSide * (stepWidth / 2 + 0.8 + hash01(seed * 8.3) * 0.8);
      if (onFace(coalAlong)) {
        const [kx, kz] = at(coalAlong, 0.65);
        coalHoles.push({ x: kx, z: kz, yaw: hash01(seed * 9.1) * Math.PI });
      }
    });
  return { hitchingPosts, carriageSteps, bootScrapers, coalHoles };
}

// Down the crown of each road at irregular spacing, alternating the water
// department's Croton covers with sewer covers.
function manholes(roads) {
  const covers = [];
  roads.forEach((road, roadIndex) => {
    const centre = (road.lo + road.hi) / 2;
    let along = road.from + 8 + hash01(roadIndex * 3.3) * 20;
    let index = 0;
    while (along < road.to - 4) {
      const seed = roadIndex * 100 + index;
      const across = centre + (hash01(seed * 1.7) - 0.5) * 1.2;
      covers.push({
        x: road.axis === 'z' ? along : across,
        z: road.axis === 'z' ? across : along,
        yaw: hash01(seed * 2.9) * Math.PI * 2,
        kind: hash01(seed * 4.1) < 0.5 ? 'croton' : 'sewer',
      });
      along += 32 + hash01(seed * 5.3) * 26;
      index += 1;
    }
  });
  return covers;
}

// One storm grating in the side street's gutter just past each corner.
function gratings(roads) {
  const list = [];
  for (const corner of STREET_SURFACES.corners) {
    const [sx, sz] = corner.streetCorner;
    const xSide = Math.sign(corner.center[0] - sx);
    const zSide = Math.sign(corner.center[1] - sz);
    const x = sx + xSide * (SIDEWALK_WIDTH + 0.7);
    const z = sz - zSide * 0.24;
    if (inRoad(x, z, roads.filter((road) => road.axis === 'z'))) list.push({ x, z, yaw: 0 });
  }
  return list;
}

// Every third lamp on the built side of the streets carries a letter box,
// on the sidewalk side of the post (the lantern arm reaches the other way).
function letterBoxes() {
  return STREET_LAMP_SITES
    .filter((site) => /built/.test(site.id))
    .filter((_, index) => index % 3 === 1)
    .map((site) => {
      const out = [Math.cos(site.yaw), -Math.sin(site.yaw)];
      return { x: site.x + out[0] * 0.17, z: site.z + out[1] * 0.17, yaw: Math.atan2(out[0], out[1]) };
    });
}

export function streetIronwork(items = streetItems, roads = ROADS) {
  const spots = occupiedSpots(items);
  return {
    ...doorways(items, roads, spots),
    manholes: manholes(roads),
    gratings: gratings(roads),
    letterBoxes: letterBoxes(),
    ballPosts: STREET_HITCHING_POSTS.map(([x, z]) => ({ x, z, yaw: 0 })),
    hydrants: STREET_HYDRANTS.map(([x, z], index) => ({ x, z, yaw: index * 1.3 })),
  };
}

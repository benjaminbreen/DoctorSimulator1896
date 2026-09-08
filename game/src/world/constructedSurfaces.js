// Exact terrain undercoat mask for authored roads and plazas. It follows the
// same deterministic layout as the visible meshes, so lawn cannot leak
// through a paving seam.

import { STREET_SURFACES } from './streetGrid.js';
import { GRAND_ARMY_APRON, pointInPolygon } from './heroStreetLayout.js';

function insideRect(x, z, surface, margin = 0.06) {
  return Math.abs(x - surface.x) <= surface.sx / 2 + margin
    && Math.abs(z - surface.z) <= surface.sz / 2 + margin;
}

// Authored surfaces are immutable. Index their bounds once instead of scanning
// every city corner for each terrain vertex.
const cells = new Map();
function indexSurface(surface, polygon) {
  const minX = polygon ? Math.min(...polygon.map(p => p[0])) : surface.x - surface.sx / 2 - 0.06;
  const maxX = polygon ? Math.max(...polygon.map(p => p[0])) : surface.x + surface.sx / 2 + 0.06;
  const minZ = polygon ? Math.min(...polygon.map(p => p[1])) : surface.z - surface.sz / 2 - 0.06;
  const maxZ = polygon ? Math.max(...polygon.map(p => p[1])) : surface.z + surface.sz / 2 + 0.06;
  const entry = { surface, polygon, minX, maxX, minZ, maxZ };
  for (let x = Math.floor(minX / 32); x <= Math.floor(maxX / 32); x++) {
    for (let z = Math.floor(minZ / 32); z <= Math.floor(maxZ / 32); z++) {
      const key = `${x},${z}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(entry);
    }
  }
}
for (const surface of [...STREET_SURFACES.roads, ...STREET_SURFACES.intersections,
  ...STREET_SURFACES.sidewalks, ...STREET_SURFACES.gutters]) indexSurface(surface);
for (const corner of STREET_SURFACES.corners) {
  indexSurface(null, corner.road);
  indexSurface(null, corner.sidewalk);
}
for (const polygon of [GRAND_ARMY_APRON.outer, GRAND_ARMY_APRON.driveThroat,
  GRAND_ARMY_APRON.streetMouth]) indexSurface(null, polygon);

export function constructedSurfaceAt(x, z) {
  const candidates = cells.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`);
  if (!candidates) return 0;
  for (const entry of candidates) {
    if (x < entry.minX || x > entry.maxX || z < entry.minZ || z > entry.maxZ) continue;
    if (entry.polygon ? pointInPolygon(x, z, entry.polygon) : insideRect(x, z, entry.surface)) return 1;
  }
  return 0;
}

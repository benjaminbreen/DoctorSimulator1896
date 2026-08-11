// Exact terrain undercoat mask for authored roads and plazas. It follows the
// same deterministic layout as the visible meshes, so lawn cannot leak
// through a paving seam.

import { STREET_SURFACES } from './streetGrid.js';
import { insideGrandArmyConstruction, pointInPolygon } from './heroStreetLayout.js';

function insideRect(x, z, surface, margin = 0.06) {
  return Math.abs(x - surface.x) <= surface.sx / 2 + margin
    && Math.abs(z - surface.z) <= surface.sz / 2 + margin;
}

export function constructedSurfaceAt(x, z) {
  const rectangles = [
    ...STREET_SURFACES.roads,
    ...STREET_SURFACES.intersections,
    ...STREET_SURFACES.sidewalks,
    ...STREET_SURFACES.gutters,
  ];
  if (rectangles.some((surface) => insideRect(x, z, surface))) return 1;
  for (const corner of STREET_SURFACES.corners) {
    if (pointInPolygon(x, z, corner.road) || pointInPolygon(x, z, corner.sidewalk)) return 1;
  }
  return insideGrandArmyConstruction(x, z) ? 1 : 0;
}

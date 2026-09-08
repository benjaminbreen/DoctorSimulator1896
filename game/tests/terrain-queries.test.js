import test from 'node:test';
import assert from 'node:assert/strict';
import { PATHS } from '../src/world/centralPark.js';
import { STREET_SURFACES } from '../src/world/streetGrid.js';
import { pointInPolygon, insideGrandArmyConstruction } from '../src/world/heroStreetLayout.js';
import { constructedSurfaceAt } from '../src/world/constructedSurfaces.js';
import { pathsDistance } from '../src/world/terrain.js';

const rectangles = ['roads', 'intersections', 'sidewalks', 'gutters'].flatMap(key => STREET_SURFACES[key]);
function fullMask(x, z) {
  return Number(rectangles.some(s => Math.abs(x - s.x) <= s.sx / 2 + .06 && Math.abs(z - s.z) <= s.sz / 2 + .06)
    || STREET_SURFACES.corners.some(c => pointInPolygon(x, z, c.road) || pointInPolygon(x, z, c.sidewalk))
    || insideGrandArmyConstruction(x, z));
}
function fullPathDistance(x, z) {
  let nearest = Infinity;
  for (const path of PATHS) for (let i = 1; i < path.points.length; i++) {
    const [ax, az] = path.points[i - 1], [bx, bz] = path.points[i];
    const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    nearest = Math.min(nearest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - path.width / 2);
  }
  return Math.max(0, nearest);
}

test('bounded terrain queries preserve exact road masks and path distances', () => {
  const points = Array.from({ length: 1500 }, (_, i) => [Math.sin(i * 12.3) * 290, Math.cos(i * 7.7) * 230]);
  for (const s of rectangles) for (const offset of [-.001, 0, .001]) {
    points.push([s.x + s.sx / 2 + .06 + offset, s.z]);
    points.push([s.x, s.z - s.sz / 2 - .06 + offset]);
  }
  for (const [x, z] of points) {
    assert.equal(constructedSurfaceAt(x, z), fullMask(x, z), `surface at ${x}, ${z}`);
    assert.equal(pathsDistance(x, z), fullPathDistance(x, z), `path at ${x}, ${z}`);
  }
});

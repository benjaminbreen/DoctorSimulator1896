import * as THREE from 'three';

// A tiny faceted body with two wings. Segment colours are shader attributes,
// so every bee still fits in one instanced mesh and one material.
export function buildBeeGeometry() {
  const positions = [];
  const parts = [];
  const wingSides = [];

  function triangle(a, b, c, part = 0, wingSide = 0) {
    positions.push(...a, ...b, ...c);
    parts.push(part, part, part);
    wingSides.push(wingSide, wingSide, wingSide);
  }

  function octahedron([x, y, z], [rx, ry, rz], part) {
    const front = [x, y, z + rz];
    const back = [x, y, z - rz];
    const top = [x, y + ry, z];
    const bottom = [x, y - ry, z];
    const left = [x - rx, y, z];
    const right = [x + rx, y, z];
    triangle(front, top, right, part);
    triangle(front, left, top, part);
    triangle(front, bottom, left, part);
    triangle(front, right, bottom, part);
    triangle(back, right, top, part);
    triangle(back, top, left, part);
    triangle(back, left, bottom, part);
    triangle(back, bottom, right, part);
  }

  octahedron([0, 0, 0.024], [0.011, 0.011, 0.011], 0);
  octahedron([0, 0, 0.005], [0.017, 0.015, 0.017], 0);
  octahedron([0, 0, -0.021], [0.016, 0.013, 0.016], 1);
  octahedron([0, 0, -0.047], [0.013, 0.011, 0.018], 0);

  triangle([-0.006, 0.009, 0.008], [-0.047, 0.011, 0.003], [-0.032, 0.008, -0.034], 2, -1);
  triangle([-0.006, 0.009, 0.008], [-0.032, 0.008, -0.034], [-0.011, 0.008, -0.016], 2, -1);
  triangle([0.006, 0.009, 0.008], [0.032, 0.008, -0.034], [0.047, 0.011, 0.003], 2, 1);
  triangle([0.006, 0.009, 0.008], [0.011, 0.008, -0.016], [0.032, 0.008, -0.034], 2, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.setAttribute('aWingSide', new THREE.Float32BufferAttribute(wingSides, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

import * as THREE from 'three';

// Twelve triangles make a readable two-wing silhouette. Local +z is forward;
// aWingSide lets the shader flap the two halves around the body.
export function buildButterflyGeometry() {
  const positions = [];
  const wingSides = [];
  const parts = [];

  function triangle(a, b, c, wingSide = 0, part = 0) {
    positions.push(...a, ...b, ...c);
    wingSides.push(wingSide, wingSide, wingSide);
    parts.push(part, part, part);
  }

  // Slim faceted body and two short antennae.
  triangle([0, 0.012, 0.055], [-0.01, 0, 0], [0.01, 0, 0], 0, 0);
  triangle([0, -0.012, 0.055], [0.01, 0, 0], [-0.01, 0, 0], 0, 0);
  triangle([0, 0.01, -0.055], [0.01, 0, 0], [-0.01, 0, 0], 0, 0);
  triangle([0, -0.01, -0.055], [-0.01, 0, 0], [0.01, 0, 0], 0, 0);

  // Broad forewings and smaller scalloped hindwings.
  triangle([-0.006, 0, 0.035], [-0.085, 0, 0.058], [-0.066, 0, -0.006], -1, 1);
  triangle([-0.006, 0, 0.035], [-0.066, 0, -0.006], [-0.01, 0, -0.02], -1, 1);
  triangle([-0.01, 0, -0.018], [-0.066, 0, -0.006], [-0.055, 0, -0.065], -1, 2);
  triangle([-0.01, 0, -0.018], [-0.055, 0, -0.065], [-0.004, 0, -0.052], -1, 2);
  triangle([0.006, 0, 0.035], [0.066, 0, -0.006], [0.085, 0, 0.058], 1, 1);
  triangle([0.006, 0, 0.035], [0.01, 0, -0.02], [0.066, 0, -0.006], 1, 1);
  triangle([0.01, 0, -0.018], [0.055, 0, -0.065], [0.066, 0, -0.006], 1, 2);
  triangle([0.01, 0, -0.018], [0.004, 0, -0.052], [0.055, 0, -0.065], 1, 2);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWingSide', new THREE.Float32BufferAttribute(wingSides, 1));
  geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

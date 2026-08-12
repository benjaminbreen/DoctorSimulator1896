import * as THREE from 'three';

// One small mesh carries the head, its radial seams, and six outer leaves.
// All cabbages share it; size and rotation supply the variation at placement.
export function createCabbageGeometry() {
  const segments = 18;
  const rings = [
    { radius: 0.16, y: -0.46, lobe: 0.015 },
    { radius: 0.36, y: -0.35, lobe: 0.025 },
    { radius: 0.48, y: -0.13, lobe: 0.035 },
    { radius: 0.50, y: 0.07, lobe: 0.045 },
    { radius: 0.43, y: 0.23, lobe: 0.065 },
    { radius: 0.28, y: 0.31, lobe: 0.09 },
  ];
  const positions = [];
  const colors = [];
  const indices = [];

  const vertex = (x, y, z, shade) => {
    positions.push(x, y, z);
    // Vertex colour multiplies the selected cabbage colour. A narrow dark
    // line at each radial valley reads as a leaf seam without another mesh.
    colors.push(shade * 0.97, shade, shade * 0.91);
    return positions.length / 3 - 1;
  };

  const bottom = vertex(0, -0.48, 0, 0.72);
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    for (let segment = 0; segment < segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      const leafCentre = (1 - Math.cos(theta * 6)) / 2;
      const wobble = 1
        + Math.sin(theta * 5 + 0.7) * 0.012
        + Math.sin(theta * 7 - 0.4) * 0.009;
      const radius = ring.radius * wobble * (1 + ring.lobe * leafCentre);
      const crownLift = ringIndex >= 3 ? leafCentre * 0.012 * (ringIndex - 2) : 0;
      const shade = 0.76 + leafCentre * 0.23 + ringIndex * 0.007;
      vertex(Math.cos(theta) * radius, ring.y + crownLift, Math.sin(theta) * radius, shade);
    }
  }
  const crown = vertex(0, 0.18, 0, 0.63);

  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(bottom, 1 + segment, 1 + next);
  }
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const lower = 1 + ringIndex * segments;
    const upper = lower + segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(
        lower + segment, upper + segment, lower + next,
        lower + next, upper + segment, upper + next,
      );
    }
  }
  const topRing = 1 + (rings.length - 1) * segments;
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(topRing + segment, crown, topRing + next);
  }

  // Six broad outer leaves sit just above the head surface. They share the
  // same geometry and material, so their overlap adds triangles, not draws.
  for (let leaf = 0; leaf < 6; leaf += 1) {
    const angle = (leaf / 6) * Math.PI * 2 + 0.08;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const point = (radius, y, across, shade) => vertex(
      radial.x * radius + tangent.x * across,
      y,
      radial.z * radius + tangent.z * across,
      shade,
    );
    const root = point(0.38, -0.32, 0, 0.72);
    const lowerLeft = point(0.49, -0.18, -0.15, 0.78);
    const upperLeft = point(0.515, 0.08, -0.17, 0.84);
    const tip = point(0.45, 0.24, 0, 0.74);
    const upperRight = point(0.515, 0.08, 0.17, 0.84);
    const lowerRight = point(0.49, -0.18, 0.15, 0.78);
    const centre = point(0.535, -0.01, 0, 1.03);
    indices.push(
      centre, lowerRight, root,
      centre, upperRight, lowerRight,
      centre, tip, upperRight,
      centre, upperLeft, tip,
      centre, lowerLeft, upperLeft,
      centre, root, lowerLeft,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'shared-low-poly-cabbage';
  return geometry;
}

// Primitive geometries are safe to share between meshes and are not disposed
// by react-three-fiber. This avoids rebuilding the same leaves for every head.
export const CABBAGE_GEOMETRY = createCabbageGeometry();

import * as THREE from 'three';

// Procedural 1896 hats, built from primitives the way the gaslight fixtures
// are. Women kept their hats on when paying calls, patients included, so a
// hat is part of the consultation costume, not street dressing.
//
// Styles:
//   'toque'      — a tallish, nearly brimless hat trimmed upright; worn by
//                  women in middle life for errands and calls.
//   'widow-cap'  — a close dark capote with a modest front bow, right for
//                  an older widow.

const FELT = { roughness: 0.94, metalness: 0 };
const RIBBON = { roughness: 0.55, metalness: 0 };

// The radius the hat geometry below is modelled at. Fitting scales the whole
// hat so this radius clears the measured skull-and-hair radius.
export const HAT_DESIGN_RADIUS = 0.095;

// Measure the head in actor-root space at bind pose, where up is simply +Y
// and units are metres: skinned glTF geometry is stored in bind pose, so
// mesh matrixWorld alone lands each vertex where the T-posed figure stands.
// Returns the crown height, the skull-and-hair radius, and its centre.
export function fitPatientHat(root, headBone) {
  root.updateMatrixWorld(true);
  let best = null;
  root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    const bones = object.skeleton?.bones || [];
    const headIndex = bones.indexOf(headBone);
    if (headIndex < 0) return;
    const geometry = object.geometry;
    const position = geometry?.attributes?.position;
    const skinIndex = geometry?.attributes?.skinIndex;
    const skinWeight = geometry?.attributes?.skinWeight;
    if (!position || !skinIndex || !skinWeight) return;
    const points = [];
    const point = new THREE.Vector3();
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      let weight = 0;
      if (skinIndex.getX(vertex) === headIndex) weight += skinWeight.getX(vertex);
      if (skinIndex.getY(vertex) === headIndex) weight += skinWeight.getY(vertex);
      if (skinIndex.getZ(vertex) === headIndex) weight += skinWeight.getZ(vertex);
      if (skinIndex.getW(vertex) === headIndex) weight += skinWeight.getW(vertex);
      if (weight < 0.6) continue;
      points.push(point.fromBufferAttribute(position, vertex).applyMatrix4(object.matrixWorld).clone());
    }
    if (points.length < 60) return;
    if (!best || points.length > best.length) best = points;
  });
  if (!best) return null;

  // Everything below is relative: rigs disagree wildly about root units, so
  // no absolute lengths appear anywhere. The placement math is consistent as
  // long as fit, worldToLocal, and bone scale share this same frame.
  let topY = -Infinity;
  let minY = Infinity;
  let centerX = 0;
  let centerZ = 0;
  for (const entry of best) {
    topY = Math.max(topY, entry.y);
    minY = Math.min(minY, entry.y);
    centerX += entry.x;
    centerZ += entry.z;
  }
  centerX /= best.length;
  centerZ /= best.length;
  const span = topY - minY;
  if (!(span > 0)) return null;
  let radius = 0;
  for (const entry of best) {
    // Width from the upper third only: jaw and neck should not size a hat.
    if (entry.y > topY - span * 0.35) {
      radius = Math.max(radius, Math.hypot(entry.x - centerX, entry.z - centerZ));
    }
  }
  if (!(radius > 0)) return null;
  return { topY, radius, centerX, centerZ };
}

export function buildPatientHat({ style = 'toque', color = '#241f1d', band = '#3a3434' } = {}) {
  const group = new THREE.Group();
  group.name = 'PatientHat';
  const felt = new THREE.MeshStandardMaterial({ color, ...FELT });
  const ribbon = new THREE.MeshStandardMaterial({ color: band, ...RIBBON });

  const add = (geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // All geometry modelled around HAT_DESIGN_RADIUS = 0.095 at the brim.
  if (style === 'widow-cap') {
    // A close capote: flattened dome, gathered ribbon edge, stiff bows fore
    // and aft. Sits down over the crown once fitted.
    const dome = new THREE.SphereGeometry(0.095, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
    add(dome, felt, [0, 0, 0]).scale.set(1, 0.66, 1.06);
    add(new THREE.TorusGeometry(0.093, 0.012, 10, 28), ribbon, [0, 0.002, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.09, 0.007, 8, 28), felt, [0, 0.018, 0], [Math.PI / 2, 0, 0]);
    // Front bow: two loops and a knot; a smaller echo behind.
    add(new THREE.TorusGeometry(0.014, 0.006, 8, 14), ribbon, [0.017, 0.03, 0.09], [0.3, 0, 0.9]);
    add(new THREE.TorusGeometry(0.014, 0.006, 8, 14), ribbon, [-0.017, 0.03, 0.09], [0.3, 0, -0.9]);
    add(new THREE.SphereGeometry(0.008, 10, 8), ribbon, [0, 0.026, 0.094]);
    add(new THREE.TorusGeometry(0.011, 0.005, 8, 12), ribbon, [0, 0.03, -0.09], [-0.4, 0, 0]);
  } else {
    // The toque: a tapered pleated crown, rolled brim, banded, trimmed with
    // ribbon loops and a pair of quills on the left side.
    add(new THREE.CylinderGeometry(0.07, 0.088, 0.085, 24), felt, [0, 0.042, 0]);
    const cap = new THREE.SphereGeometry(0.07, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    add(cap, felt, [0, 0.085, 0]).scale.set(1, 0.5, 1);
    add(new THREE.TorusGeometry(0.092, 0.015, 12, 30), felt, [0, 0.004, 0], [Math.PI / 2, 0, 0]);
    // Pleated band: a wide ribbon with a thin cord above it.
    add(new THREE.CylinderGeometry(0.0905, 0.0925, 0.03, 24, 1, true), ribbon, [0, 0.026, 0]);
    add(new THREE.TorusGeometry(0.0895, 0.004, 8, 28), ribbon, [0, 0.045, 0], [Math.PI / 2, 0, 0]);
    // Ribbon loops clustered on the left, the way milliners dressed a toque.
    add(new THREE.TorusGeometry(0.016, 0.007, 8, 14), ribbon, [0.08, 0.045, 0.03], [0.2, 0.5, 0.9]);
    add(new THREE.TorusGeometry(0.016, 0.007, 8, 14), ribbon, [0.088, 0.04, -0.015], [0.1, -0.4, -0.9]);
    add(new THREE.TorusGeometry(0.012, 0.006, 8, 12), ribbon, [0.07, 0.06, 0.01], [0.9, 0.2, 0]);
    // Two stiff quills, raked back.
    add(new THREE.ConeGeometry(0.005, 0.105, 6), felt, [0.078, 0.1, -0.01], [-0.25, 0, -0.4]);
    add(new THREE.ConeGeometry(0.004, 0.085, 6), felt, [0.084, 0.09, 0.015], [0.15, 0, -0.5]);
  }

  return group;
}

export function disposePatientHat(hat) {
  hat?.traverse((object) => {
    object.geometry?.dispose?.();
  });
}

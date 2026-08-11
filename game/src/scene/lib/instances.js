// The one way to fill an InstancedMesh. Entries carry `p` (position),
// `r` (euler) or `q` (quaternion), `s` (scale), and `color` or `tint`
// ([r,g,b] floats). Every scene component uses this instead of its own
// copy: the instance-aware bounding sphere at the end is a hard-won
// lesson (culling otherwise judges the whole batch by the base geometry
// at the origin, and meshes flicker with the camera).

import * as THREE from 'three';

const scratch = new THREE.Object3D();
const scratchColor = new THREE.Color();

export function fillInstances(mesh, entries, { cast = true, receive = true } = {}) {
  entries.forEach((entry, index) => {
    scratch.position.set(...entry.p);
    if (entry.q) scratch.quaternion.set(...entry.q);
    else scratch.rotation.set(...(entry.r ?? [0, 0, 0]));
    scratch.scale.set(...(entry.s ?? [1, 1, 1]));
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
    const paint = entry.color ?? entry.tint;
    if (paint) mesh.setColorAt(index, scratchColor.setRGB(...paint));
  });
  scratch.quaternion.identity();
  scratch.rotation.set(0, 0, 0);
  scratch.scale.set(1, 1, 1);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.computeBoundingSphere?.();
  return mesh;
}

export function instanced(geometry, material, entries, options) {
  return fillInstances(new THREE.InstancedMesh(geometry, material, entries.length), entries, options);
}

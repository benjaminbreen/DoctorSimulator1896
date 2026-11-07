import * as THREE from 'three';

// Mixamo rigs have no forearm twist bone, and some seated clips roll the hand
// almost 180 degrees about the forearm. Skin weighted to both bones then
// collapses into a thin neck at the wrist. Hand half of that roll to the
// forearm, which turns about its own axis without moving the hand.
const SHARE = .5;

function bindLocal(bone, mesh) {
  const index = mesh.skeleton.bones.indexOf(bone), parent = mesh.skeleton.bones.indexOf(bone.parent);
  if (index < 0 || parent < 0) return null;
  const world = mesh.skeleton.boneInverses[index].clone().invert();
  const parentWorld = mesh.skeleton.boneInverses[parent].clone().invert();
  return new THREE.Quaternion().setFromRotationMatrix(parentWorld.invert().multiply(world));
}

export function createWristTwist(root) {
  let mesh = null;
  root.traverse(object => { if (!mesh && object.isSkinnedMesh) mesh = object; });
  const bones = {};
  root.traverse(object => { if (object.isBone) bones[object.name.toLowerCase().replace(/^mixamorig:?/, '')] = object; });
  const arms = [];
  for (const side of ['left', 'right']) {
    const forearm = bones[`${side}forearm`], hand = bones[`${side}hand`];
    const rest = mesh && hand && forearm && hand.parent === forearm ? bindLocal(hand, mesh) : null;
    if (rest) arms.push({ forearm, hand, rest, axis: hand.position.clone().normalize() });
  }
  const delta = new THREE.Quaternion(), roll = new THREE.Quaternion(), along = new THREE.Vector3();
  return {
    update() {
      for (const { forearm, hand, rest, axis } of arms) {
        delta.copy(hand.quaternion).multiply(roll.copy(rest).invert());
        along.set(delta.x, delta.y, delta.z).projectOnVector(axis);
        roll.set(along.x, along.y, along.z, delta.w).normalize();
        if (roll.w < 0) roll.set(-roll.x, -roll.y, -roll.z, -roll.w);
        roll.slerp(delta.identity(), 1 - SHARE);
        forearm.quaternion.multiply(roll);
        hand.quaternion.premultiply(roll.invert());
        forearm.updateMatrixWorld(true);
      }
    },
  };
}

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

// Wrist to middle fingertip, metres. The Tripo hands come out about a
// quarter too long, which makes a normal wrist look pinched beneath them.
const HAND_LENGTH = { men: .19, women: .175 };

export function createWristTwist(root, { cohort = 'women' } = {}) {
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
  const bindPosition = bone => new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(bone)].clone().invert());
  const hands = [];
  for (const { hand } of arms) {
    const side = hand.name.toLowerCase().includes('left') ? 'left' : 'right';
    const tip = bones[`${side}handmiddle4`] || bones[`${side}handmiddle3`];
    if (!tip || mesh.skeleton.bones.indexOf(tip) < 0) continue;
    const length = bindPosition(hand).distanceTo(bindPosition(tip)) + .012;
    hands.push({ hand, scale: THREE.MathUtils.clamp((HAND_LENGTH[cohort] ?? HAND_LENGTH.women) / length, .75, 1) });
  }
  return {
    // Call after the mixer: the clips write a scale onto every hand bone.
    scaleHands() {
      for (const { hand, scale } of hands) hand.scale.setScalar(scale);
    },
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

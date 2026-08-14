import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const gripWorld = new THREE.Vector3();
const gripLocal = new THREE.Vector3();
const tipLocal = new THREE.Vector3();
const direction = new THREE.Vector3();
const midpoint = new THREE.Vector3();

export function findMixamoBone(root, suffix) {
  let found = null;
  root.traverse((node) => {
    if (!found && node.isBone && node.name.replaceAll(':', '').endsWith(suffix)) found = node;
  });
  return found;
}

// A restrained late-century gentleman's cane: dark hardwood, a small brass
// collar, and a rounded brass pommel. It is a separate prop so the same body
// and motion pack remain reusable without permanently altering the FBX.
export function buildWalkingStick() {
  const wood = new THREE.MeshStandardMaterial({
    color: '#25170e',
    roughness: 0.5,
    metalness: 0,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: '#9c762f',
    roughness: 0.27,
    metalness: 0.72,
  });
  const group = new THREE.Group();
  group.name = 'walking-stick';

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 1, 10), wood);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.055, 10), brass);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.019, 0.055, 12), brass);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.043, 14, 10), brass);
  for (const mesh of [shaft, ferrule, collar, knob]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  function update(hand, actorRoot, floorY = 0.025) {
    if (!hand || !actorRoot) {
      group.visible = false;
      return;
    }
    group.visible = true;
    actorRoot.updateWorldMatrix(true, true);
    hand.getWorldPosition(gripWorld);
    gripLocal.copy(gripWorld);
    actorRoot.worldToLocal(gripLocal);
    tipLocal.set(gripLocal.x, floorY, gripLocal.z);
    direction.copy(gripLocal).sub(tipLocal);
    const length = Math.max(0.2, direction.length());
    direction.multiplyScalar(1 / length);

    midpoint.copy(tipLocal).lerp(gripLocal, 0.5);
    shaft.position.copy(midpoint);
    shaft.quaternion.setFromUnitVectors(UP, direction);
    shaft.scale.set(1, length, 1);

    ferrule.position.copy(tipLocal).addScaledVector(direction, 0.0275);
    ferrule.quaternion.copy(shaft.quaternion);
    collar.position.copy(gripLocal).addScaledVector(direction, -0.0275);
    collar.quaternion.copy(shaft.quaternion);
    knob.position.copy(gripLocal).addScaledVector(direction, 0.025);
  }

  function dispose() {
    shaft.geometry.dispose();
    ferrule.geometry.dispose();
    collar.geometry.dispose();
    knob.geometry.dispose();
    wood.dispose();
    brass.dispose();
  }

  return { group, meshes: [shaft, ferrule, collar, knob], update, dispose };
}

import * as THREE from 'three';

export function buildWateringCan() {
  const group = new THREE.Group();
  group.name = 'galvanized-watering-can';
  const metal = new THREE.MeshStandardMaterial({
    color: '#d7dfe1', metalness: 0.88, roughness: 0.2,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: '#879194', metalness: 0.8, roughness: 0.28,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.34, 16), metal);
  body.position.y = -0.31;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.018, 8, 20), darkMetal);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.13;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.026, 8, 24), darkMetal);
  handle.position.y = -0.13;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.48, 12), metal);
  spout.rotation.z = -Math.PI / 2;
  spout.position.set(0.39, -0.27, 0);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, 0.08, 16), darkMetal);
  rose.rotation.z = -Math.PI / 2;
  rose.position.set(0.65, -0.27, 0);
  const base = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 8, 20), darkMetal);
  base.rotation.x = Math.PI / 2;
  base.position.y = -0.48;
  const meshes = [body, rim, handle, spout, rose, base];
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const handPosition = new THREE.Vector3();
  const handQuaternion = new THREE.Quaternion();
  const wrapperQuaternion = new THREE.Quaternion();
  return {
    group,
    meshes,
    update(hand, wrapper) {
      if (!hand || !wrapper) return;
      hand.getWorldPosition(handPosition);
      hand.getWorldQuaternion(handQuaternion);
      wrapper.getWorldQuaternion(wrapperQuaternion).invert();
      group.position.copy(wrapper.worldToLocal(handPosition.clone()));
      group.quaternion.copy(wrapperQuaternion).multiply(handQuaternion);
    },
    dispose() {
      for (const mesh of meshes) mesh.geometry.dispose();
      metal.dispose();
      darkMetal.dispose();
    },
  };
}

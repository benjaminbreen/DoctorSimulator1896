import * as THREE from 'three';

export const STROLLER_WHEEL_RADIUS = 0.25;

const PALETTES = Object.freeze({
  navy: Object.freeze({ wicker: '#9b7b49', fabric: '#24364c', blanket: '#d8c9aa' }),
  green: Object.freeze({ wicker: '#72583a', fabric: '#31483c', blanket: '#c7b894' }),
});

function mesh(geometry, material, position, rotation = [0, 0, 0]) {
  const out = new THREE.Mesh(geometry, material);
  out.position.set(...position);
  out.rotation.set(...rotation);
  out.castShadow = true;
  out.receiveShadow = true;
  return out;
}

function rodBetween(from, to, radius, material) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const out = mesh(
    new THREE.CylinderGeometry(radius, radius, direction.length(), 7),
    material,
    start.add(end).multiplyScalar(0.5).toArray(),
  );
  out.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return out;
}

function buildWheel(radius, material) {
  const wheel = new THREE.Group();
  wheel.add(mesh(
    new THREE.TorusGeometry(radius, 0.018, 6, 24),
    material,
    [0, 0, 0],
    [0, Math.PI / 2, 0],
  ));
  wheel.add(mesh(
    new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10),
    material,
    [0, 0, 0],
    [0, 0, Math.PI / 2],
  ));
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2;
    const spoke = mesh(
      new THREE.CylinderGeometry(0.006, 0.006, radius * 0.86, 5),
      material,
      [0, Math.cos(angle) * radius * 0.43, Math.sin(angle) * radius * 0.43],
      [angle, 0, 0],
    );
    wheel.add(spoke);
  }
  return wheel;
}

// A compact 1890s perambulator: wicker bassinet, folding hood, tall push
// handle, sprung iron frame, and four large spoked wheels. The local +z axis
// is forward so it can live under the same yaw wrapper as its pusher.
export function buildPeriodStroller(variant = 'navy') {
  const palette = PALETTES[variant] ?? PALETTES.navy;
  const root = new THREE.Group();
  root.name = `period-stroller-${variant}`;
  const materials = {
    wicker: new THREE.MeshStandardMaterial({ color: palette.wicker, roughness: 0.86 }),
    wickerTrim: new THREE.MeshStandardMaterial({ color: '#5f472d', roughness: 0.9 }),
    iron: new THREE.MeshStandardMaterial({ color: '#24282a', roughness: 0.46, metalness: 0.58 }),
    fabric: new THREE.MeshStandardMaterial({ color: palette.fabric, roughness: 0.92, side: THREE.DoubleSide }),
    blanket: new THREE.MeshStandardMaterial({ color: palette.blanket, roughness: 0.96 }),
    skin: new THREE.MeshStandardMaterial({ color: '#b98368', roughness: 0.9 }),
  };

  const wheels = [];
  for (const x of [-0.38, 0.38]) {
    for (const z of [0.52, 1.12]) {
      const wheel = buildWheel(STROLLER_WHEEL_RADIUS, materials.iron);
      wheel.position.set(x, STROLLER_WHEEL_RADIUS, z);
      wheels.push(wheel);
      root.add(wheel);
    }
  }

  // Undercarriage and the two spring braces supporting the basket.
  root.add(rodBetween([-0.34, 0.31, 0.52], [-0.34, 0.31, 1.12], 0.018, materials.iron));
  root.add(rodBetween([0.34, 0.31, 0.52], [0.34, 0.31, 1.12], 0.018, materials.iron));
  root.add(rodBetween([-0.34, 0.31, 0.76], [0, 0.59, 0.84], 0.017, materials.iron));
  root.add(rodBetween([0.34, 0.31, 0.76], [0, 0.59, 0.84], 0.017, materials.iron));

  // Wicker body: a low base with splayed side panels and closed ends.
  root.add(mesh(new THREE.BoxGeometry(0.56, 0.08, 0.82), materials.wicker, [0, 0.62, 0.82]));
  root.add(mesh(new THREE.BoxGeometry(0.055, 0.34, 0.9), materials.wicker, [-0.31, 0.79, 0.82], [0, 0, -0.1]));
  root.add(mesh(new THREE.BoxGeometry(0.055, 0.34, 0.9), materials.wicker, [0.31, 0.79, 0.82], [0, 0, 0.1]));
  root.add(mesh(new THREE.BoxGeometry(0.62, 0.34, 0.055), materials.wicker, [0, 0.79, 0.36], [-0.08, 0, 0]));
  root.add(mesh(new THREE.BoxGeometry(0.62, 0.3, 0.055), materials.wicker, [0, 0.77, 1.28], [0.08, 0, 0]));
  root.add(mesh(new THREE.BoxGeometry(0.51, 0.045, 0.72), materials.blanket, [0, 0.72, 0.84]));
  for (const y of [0.69, 0.79, 0.89]) {
    root.add(mesh(new THREE.BoxGeometry(0.014, 0.018, 0.84), materials.wickerTrim, [-0.342, y, 0.82]));
    root.add(mesh(new THREE.BoxGeometry(0.014, 0.018, 0.84), materials.wickerTrim, [0.342, y, 0.82]));
    root.add(mesh(new THREE.BoxGeometry(0.56, 0.018, 0.014), materials.wickerTrim, [0, y, 1.313]));
  }

  // Hood ribs and fabric crown over the head end nearest the pusher.
  for (const z of [0.38, 0.5, 0.62]) {
    root.add(mesh(
      new THREE.TorusGeometry(0.31, 0.012, 5, 18, Math.PI),
      materials.iron,
      [0, 0.84, z],
    ));
  }
  const hood = mesh(
    new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI, 0, Math.PI / 2),
    materials.fabric,
    [0, 0.83, 0.48],
  );
  hood.scale.set(1, 1, 0.78);
  root.add(hood);

  // A swaddled infant gives the carriage a readable purpose without adding
  // another animated rig.
  root.add(mesh(new THREE.CapsuleGeometry(0.12, 0.26, 4, 8), materials.blanket, [0, 0.84, 0.91], [Math.PI / 2, 0, 0]));
  root.add(mesh(new THREE.SphereGeometry(0.105, 12, 8), materials.skin, [0, 0.85, 0.65]));

  // Paired handles meet the animation's forward hand position.
  root.add(rodBetween([-0.26, 0.68, 0.48], [-0.27, 0.91, 0.08], 0.018, materials.iron));
  root.add(rodBetween([0.26, 0.68, 0.48], [0.27, 0.91, 0.08], 0.018, materials.iron));
  root.add(rodBetween([-0.29, 0.91, 0.08], [0.29, 0.91, 0.08], 0.022, materials.iron));

  const meshes = [];
  root.traverse((node) => {
    if (node.isMesh) meshes.push(node);
  });
  return {
    group: root,
    wheels,
    meshes,
    wheelRadius: STROLLER_WHEEL_RADIUS,
    dispose() {
      const geometries = new Set(meshes.map((entry) => entry.geometry));
      geometries.forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}

import * as THREE from 'three';

const AUTHORED_HAIR_NAMES = ['Authored_Hair_Bun', 'hair_bun_brown'];

function findAuthoredHair(model) {
  let found = null;
  model?.traverse((object) => {
    if (found || !object.isMesh) return;
    const objectName = object.name?.toLowerCase() || '';
    const geometryName = object.geometry?.name?.toLowerCase() || '';
    if (AUTHORED_HAIR_NAMES.some((name) => {
      const term = name.toLowerCase();
      return objectName.includes(term) || geometryName.includes(term);
    })) found = object;
  });
  return found;
}

/**
 * Adapt an MPFB-fitted authored hairstyle to the small runtime contract used
 * by costume.js. The hair remains a skinned part of the exported character;
 * this controller only owns presentation, never its geometry or skeleton.
 */
export function createAuthoredHairSystem(model) {
  const mesh = findAuthoredHair(model);
  if (!mesh) return null;

  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const materials = list.filter(Boolean);
  for (const material of materials) {
    material.name = material.name || 'Authored_Hair_Bun_Material';
    material.side = THREE.DoubleSide;
    material.depthWrite = true;
    material.roughness = Math.max(material.roughness ?? 0.65, 0.62);
    material.needsUpdate = true;
  }
  mesh.name = 'Authored_Hair_Bun';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.visible = true;

  // Color variation will be layered onto the preserved strand texture in the
  // next authored-hair increment. For the first integration we deliberately
  // retain the artist's brown material instead of flattening it with a hex.
  const update = () => {};
  const fallbackMaterial = new THREE.MeshStandardMaterial({
    name: 'Authored_Hair_Bun_Fallback', color: '#513726', roughness: 0.72,
  });

  return {
    kind: 'authored-mhclo',
    materials: { base: materials[0] || fallbackMaterial, update },
    rebuild: update,
    invalidateScalp() {},
    dispose: () => fallbackMaterial.dispose(),
    pieces: () => [],
  };
}

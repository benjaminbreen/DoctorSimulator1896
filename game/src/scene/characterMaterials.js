// Tripo and Mixamo character exports sometimes mark their one skin-and-cloth
// atlas as fully metallic. Human skin, hair, and textiles are dielectrics: an
// all-metal material loses diffuse sky fill and turns faces black in shade.
export function normalizeNonmetallicCharacterMaterial(material) {
  if (!material || !('metalness' in material)) return material;
  material.metalness = 0;
  material.metalnessMap = null;
  material.needsUpdate = true;
  return material;
}

export function normalizeNonmetallicCharacterMaterials(root) {
  const visited = new Set();
  root.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || visited.has(material)) continue;
      visited.add(material);
      normalizeNonmetallicCharacterMaterial(material);
    }
  });
  return root;
}

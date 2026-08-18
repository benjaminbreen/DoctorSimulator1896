// Static scenery pays no per-frame matrix work. Both helpers run once after a
// subtree has fully mounted; neither touches shader-driven motion (wind,
// pennants) or InstancedMesh per-instance matrices, which stay live.

// Compose every transform once, then prune the subtree out of the scene's
// per-frame updateMatrixWorld walk. Only for content whose object transforms
// never change after build — anything moved later must not sit under `root`.
export function freezeStaticTransforms(root) {
  if (!root) return;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    object.matrixAutoUpdate = false;
  });
  root.matrixWorldAutoUpdate = false;
}

// A material shared by an InstancedMesh and a plain Mesh makes three re-init
// its program on every draw that alternates between the two kinds — hundreds
// of times a frame across the main, shadow, and mirror passes. Give the
// instanced users their own clone. Returns the clones for disposal.
export function splitMixedInstancedMaterials(root) {
  if (!root) return [];
  const uses = new Map();
  root.traverse((object) => {
    if (!object.material || !(object.isMesh || object.isSkinnedMesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      let use = uses.get(material);
      if (!use) uses.set(material, (use = { instanced: [], plain: 0 }));
      if (object.isInstancedMesh) use.instanced.push(object);
      else use.plain += 1;
    }
  });
  const twins = [];
  for (const [material, use] of uses) {
    if (use.instanced.length === 0 || use.plain === 0) continue;
    const twin = material.clone();
    // clone() drops these two, and losing them would lose the patched shader.
    twin.onBeforeCompile = material.onBeforeCompile;
    twin.customProgramCacheKey = material.customProgramCacheKey;
    for (const mesh of use.instanced) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((entry) => (entry === material ? twin : entry))
        : twin;
    }
    twins.push(twin);
  }
  return twins;
}

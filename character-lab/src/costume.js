import { createCostumeShell, findBones, sampleTorsoFit } from '../../shared/characters/costumeShell.js';
import { createHairSystem } from './hair/index.js';
import { createMhrHairFormSystem } from './mhr-hair-forms.js';

/* Lab wrapper around the shared garment shell: the geometry, binding, and
   sway live in shared/characters/costumeShell.js so the game can dress its
   patients from the same generator. The lab adds live hair on top. */

export { findBones, sampleTorsoFit };

export function createCostume(scene, bones, model = null) {
  // The comparison GLB carries a legacy fitted bun, but it is identity-specific
  // and cannot respond to hairstyle, volume, hairline, greying, or texture
  // controls. Keeping it visible made every MHR subject inherit the same bald
  // crown. Hide that source asset and use the live, scalp-fitted system for A
  // and MHR. Renderer C already carries fitted, identity-switched hair, so its
  // embedded asset stays on the rig and only receives live colour changes.
  const rendererCHairs = [];
  model?.traverse((object) => {
    if (object.name?.startsWith('RendererC_Hair')) rendererCHairs.push(object);
  });
  if (!rendererCHairs.length) model?.traverse((object) => {
    const name = `${object.name || ''} ${object.geometry?.name || ''}`.toLowerCase();
    if (name.includes('authored_hair_bun') || name.includes('hair_bun_brown')) object.visible = false;
  });
  const embeddedHairMaterials = [];
  for (const rendererCHair of rendererCHairs) rendererCHair.traverse((object) => {
    if (!object.isMesh) return;
    embeddedHairMaterials.push(...(Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean));
  });
  const updateEmbeddedHair = (values) => {
    for (const material of embeddedHairMaterials) {
      material.color?.set(values.hairColor);
      material.roughness = 0.88;
      material.needsUpdate = true;
    }
  };
  const hairSystem = rendererCHairs.length ? {
    materials: { base: embeddedHairMaterials[0], update: updateEmbeddedHair },
    rebuild: updateEmbeddedHair,
    dispose() {},
    pieces: () => [],
    invalidateScalp() {},
  } : model?.getObjectByName?.('body_mesh')
    ? createMhrHairFormSystem(scene, bones, model)
    : createHairSystem(scene, bones, model);

  const shell = createCostumeShell(scene, bones, model);
  const materials = { ...shell.materials, hair: hairSystem.materials.base };

  return {
    rebuild(values) {
      shell.rebuild(values);
      hairSystem.rebuild(values);
    },
    dispose() {
      shell.dispose();
      hairSystem.dispose();
    },
    update: shell.update,
    updateMaterials: shell.updateMaterials,
    materials,
    updateHair: (values) => hairSystem.materials.update(values),
    invalidateFit: () => hairSystem.invalidateScalp?.(),
    pieces: () => [...shell.pieces(), ...hairSystem.pieces().map((mesh) => ({ mesh, bone: bones.head }))],
  };
}

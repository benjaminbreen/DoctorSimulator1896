import { stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { prune, resample } from '@gltf-transform/functions';
import { createIO, contract, assertSameCharacter, conservativeDedup, compressCharacterTextures, compressAccessors, CHARACTER_QUANTIZATION, dropMorphTargetNormals } from '../lib/glb-pipeline.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const files = process.argv.slice(2);
if (!files.length) files.push('game/public/models/characters/carmela-russo.glb', 'game/public/models/characters/seamstress-prototype.glb');
const io = await createIO();
const reports = [];
for (const relative of files) {
  const file = path.resolve(root, relative);
  const beforeBytes = (await stat(file)).size;
  const document = await io.read(file);
  for (const material of document.getRoot().listMaterials()) {
    if (['Patient_MaleFabric','Patient_MaleShirt','Patient_MaleCollar','Patient_MaleBoots'].includes(material.getName())) material.setDoubleSided(false);
    if (material.getName() === 'Patient_FacialHair') material.setAlphaMode('MASK').setAlphaCutoff(.2).setDoubleSided(true);
    if (material.getName() === 'Carmela_HairStrands') material.setAlphaMode('MASK').setAlphaCutoff(.35).setDoubleSided(true);
  }
  const before = contract(document);
  const targets = (doc) => doc.getRoot().listMeshes().map((mesh) => [mesh.getName(), mesh.listPrimitives().map((primitive) => primitive.listTargets().map((target) => target.getName()))]);
  const beforeTargets = JSON.stringify(targets(document));
  const movingNormals = document.getRoot().listMeshes().filter(mesh => mesh.getName().startsWith('Carmela_Lid_') || mesh.getName()==='Carmela_Lips' || mesh.getName().startsWith('Patient_WorkApron'))
    .flatMap(mesh => mesh.listPrimitives().flatMap(primitive => primitive.listTargets().map(target => ({target,normal:target.getAttribute('NORMAL')}))));
  dropMorphTargetNormals(document);
  // Lids and lips turn as they close. Their rest normals leave dark shelves
  // across the moving surface, so retain these small meshes' posed normals.
  for (const {target,normal} of movingNormals) if (normal) target.setAttribute('NORMAL',normal);
  for (const texture of document.getRoot().listTextures()) {
    if (Math.max(...texture.getSize()) <= 2048) continue;
    texture.setImage(await sharp(texture.getImage()).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).png().toBuffer());
    texture.setMimeType('image/png');
  }
  await document.transform(resample({ tolerance: 1e-4 }), conservativeDedup(), prune({ keepAttributes: true, keepSolidTextures: true, keepLeaves: true }));
  await compressCharacterTextures(document);
  await compressAccessors(document, { ...CHARACTER_QUANTIZATION, quantizationVolume: 'scene' });
  assertSameCharacter(before, document, relative);
  if (beforeTargets !== JSON.stringify(targets(document))) throw new Error(`${relative}: facial controls changed`);
  await io.write(file, document);
  const reloaded = await io.read(file);
  const after = assertSameCharacter(before, reloaded, relative);
  if (beforeTargets !== JSON.stringify(targets(reloaded))) throw new Error(`${relative}: facial controls did not survive export`);
  const afterBytes = (await stat(file)).size;
  reports.push({ file: relative, beforeBytes, afterBytes, ...after });
  console.log(`${path.basename(file)}: ${(beforeBytes/1048576).toFixed(2)} MB → ${(afterBytes/1048576).toFixed(2)} MB`);
}
const reportDirectory = path.join(root, files.some(file=>/male-worker-template/.test(file)) ? 'artifacts/characters/worker-template' : files.some(file=>/male-(lean|broad)-template/.test(file)) ? 'artifacts/characters/modular-men' : 'artifacts/characters/carmela-prototype');
await mkdir(reportDirectory, { recursive: true });
await writeFile(path.join(reportDirectory, 'asset-report.json'), JSON.stringify(reports, null, 2));

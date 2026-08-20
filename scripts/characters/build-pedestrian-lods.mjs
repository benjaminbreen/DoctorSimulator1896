// Build geometry-only far LODs for the outdoor pedestrian cast.
// They retain the source skin and vertex weights, but the game reuses the
// full model's skeleton and materials when it swaps geometry at runtime.
//
//   node scripts/characters/build-pedestrian-lods.mjs

import { rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  quantize,
  reorder,
  simplify,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import {
  CHARACTER_QUANTIZATION,
  contract,
  createIO,
} from '../lib/glb-pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL_DIR = path.join(ROOT, 'game/public/models');
const MODEL_NAMES = Object.freeze([
  'pedestrian-b',
  'pedestrian-c',
  'pedestrian-d',
  'pedestrian-e',
  'pedestrian-f',
  'strawhat-pedestrian',
  'nursemaid',
  'lilac-dress-woman',
  'rational-dress-woman',
  'hotel-maid',
  'hotel-bellhop',
]);
const FAR_RATIO = 0.35;
const FAR_ERROR = 0.025;

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function removeAnimationAccessors(root) {
  const keep = new Set();
  for (const skin of root.listSkins()) keep.add(skin.getInverseBindMatrices());
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      keep.add(primitive.getIndices());
      for (const attribute of primitive.listAttributes()) keep.add(attribute);
      for (const target of primitive.listTargets()) {
        for (const attribute of target.listAttributes()) keep.add(attribute);
      }
    }
  }
  for (const accessor of root.listAccessors()) {
    if (!keep.has(accessor)) accessor.dispose();
  }
}

function validate(document, source, name) {
  const root = document.getRoot();
  const result = contract(document);
  if (result.meshes !== source.meshes || root.listSkins().length !== 1) {
    throw new Error(`${name}: model/skin count changed`);
  }
  if (!sameValues(result.joints, source.joints)) {
    throw new Error(`${name}: skeleton contract changed`);
  }
  // UV and garment seams stop some figures before the requested 35% ratio.
  // Every cast member must still shed at least a third of its triangles.
  if (result.triangles >= source.triangles * 0.67) {
    throw new Error(`${name}: far geometry did not reach its triangle budget`);
  }
  if (root.listAnimations().length !== 0 || root.listTextures().length !== 0) {
    throw new Error(`${name}: geometry LOD retained animation or texture data`);
  }
  if (root.listAccessors().length > 7) {
    throw new Error(`${name}: geometry LOD retained unused accessors`);
  }
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (!primitive.getAttribute('JOINTS_0') || !primitive.getAttribute('WEIGHTS_0')) {
        throw new Error(`${name}: simplified mesh lost its skin weights`);
      }
    }
  }
  return result;
}

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = await createIO();

for (const name of MODEL_NAMES) {
  const sourcePath = path.join(MODEL_DIR, `${name}.glb`);
  const outputPath = path.join(MODEL_DIR, `${name}-lod.glb`);
  const tempPath = path.join(MODEL_DIR, `${name}-lod.building.glb`);
  const document = await io.read(sourcePath);
  const source = contract(document);

  const root = document.getRoot();
  for (const animation of root.listAnimations()) animation.dispose();
  removeAnimationAccessors(root);
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) primitive.setMaterial(null);
  }
  await document.transform(
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: FAR_RATIO,
      error: FAR_ERROR,
    }),
    dedup(),
    prune({ keepAttributes: true }),
    quantize({ quantizationVolume: 'mesh', ...CHARACTER_QUANTIZATION }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
  );

  const meshopt = document.getRoot().listExtensionsUsed()
    .find((extension) => extension.extensionName === EXTMeshoptCompression.EXTENSION_NAME)
    ?? document.createExtension(EXTMeshoptCompression);
  meshopt
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  validate(document, source, name);
  await io.write(tempPath, document);
  const written = await io.read(tempPath);
  const result = validate(written, source, name);
  await rename(tempPath, outputPath);

  const outputBytes = (await stat(outputPath)).size;
  console.log(
    `${name}: ${source.triangles.toLocaleString()} -> ${result.triangles.toLocaleString()} tris, `
    + `${Math.round(outputBytes / 1024)}KiB`,
  );
}

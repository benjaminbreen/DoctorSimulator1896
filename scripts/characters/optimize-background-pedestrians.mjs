// Build phone-sized variants of the six background pedestrian archetypes.
//
// Desktop keeps the authored models. Phones use the same rigs and clips with
// a conservative mesh LOD and 512px costume atlases, cutting decoded texture
// memory without reducing the population of Central Park.
//
//   node scripts/characters/optimize-background-pedestrians.mjs


import { rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  reorder,
  resample,
  simplify,
  textureCompress,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL_DIR = path.join(ROOT, 'game/public/models');
const MODEL_NAMES = Object.freeze([
  'pedestrian-b',
  'pedestrian-c',
  'pedestrian-d',
  'pedestrian-e',
  'pedestrian-f',
  'strawhat-pedestrian',
]);
const MOBILE_RATIO = 0.68;
const MOBILE_ERROR = 0.003;

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function triangleCount(root) {
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getIndices()?.getCount()
        ?? primitive.getAttribute('POSITION')?.getCount()
        ?? 0;
      triangles += count / 3;
    }
  }
  return Math.round(triangles);
}

function contract(document) {
  const root = document.getRoot();
  return {
    clips: root.listAnimations().map((clip) => clip.getName()).sort(),
    joints: root.listSkins()[0]?.listJoints().map((joint) => joint.getName()) ?? [],
    meshes: root.listMeshes().length,
    triangles: triangleCount(root),
  };
}

async function validate(document, source, name) {
  const root = document.getRoot();
  const result = contract(document);
  if (result.meshes !== source.meshes || root.listSkins().length !== 1) {
    throw new Error(`${name}: model/skin count changed`);
  }
  if (!sameValues(result.clips, source.clips) || !sameValues(result.joints, source.joints)) {
    throw new Error(`${name}: animation or skeleton contract changed`);
  }
  if (result.triangles >= source.triangles) {
    throw new Error(`${name}: mobile geometry was not simplified`);
  }
  const nodeNames = new Set(root.listNodes().map((node) => node.getName()));
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode()?.getName();
      if (!target || !nodeNames.has(target)) {
        throw new Error(`${name}: ${animation.getName()} has a missing target`);
      }
    }
    for (const sampler of animation.listSamplers()) {
      for (const accessor of [sampler.getInput(), sampler.getOutput()]) {
        const values = accessor?.getArray();
        if (values && Array.from(values).some((value) => !Number.isFinite(value))) {
          throw new Error(`${name}: ${animation.getName()} contains a non-finite keyframe`);
        }
      }
    }
  }
  for (const texture of root.listTextures()) {
    const metadata = await sharp(texture.getImage()).metadata();
    if ((metadata.width ?? 0) > 512 || (metadata.height ?? 0) > 512) {
      throw new Error(`${name}: texture exceeds the 512px mobile budget`);
    }
  }
  return result;
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

for (const name of MODEL_NAMES) {
  const sourcePath = path.join(MODEL_DIR, `${name}.glb`);
  const outputPath = path.join(MODEL_DIR, `${name}-mobile.glb`);
  const tempPath = path.join(MODEL_DIR, `${name}-mobile.optimized.glb`);
  const sourceBytes = (await stat(sourcePath)).size;
  const document = await io.read(sourcePath);
  const source = contract(document);

  await document.transform(
    resample({ tolerance: 1e-4 }),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: MOBILE_RATIO,
      error: MOBILE_ERROR,
    }),
    dedup(),
    prune({ keepAttributes: true, keepSolidTextures: true }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [512, 512],
      quality: 88,
      effort: 6,
    }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
  );

  const meshopt = document.getRoot().listExtensionsUsed()
    .find((extension) => extension.extensionName === EXTMeshoptCompression.EXTENSION_NAME)
    ?? document.createExtension(EXTMeshoptCompression);
  meshopt
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  await validate(document, source, name);
  await io.write(tempPath, document);
  const written = await io.read(tempPath);
  const result = await validate(written, source, name);
  await rename(tempPath, outputPath);

  const outputBytes = (await stat(outputPath)).size;
  console.log(
    `${name}: ${source.triangles.toLocaleString()} -> ${result.triangles.toLocaleString()} tris, `
    + `${Math.round(sourceBytes / 1024)}KiB -> ${Math.round(outputBytes / 1024)}KiB`,
  );
}

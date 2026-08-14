// Post-process the Blender-authored player GLB for the web build.
//
// The source export deliberately favors compatibility: textures are PNG,
// animation is densely baked, and accessors are uncompressed. This pass keeps
// the mesh, texture resolution, rig, and every clip while reducing transfer,
// parse, and GPU upload cost.
//
//   node scripts/characters/optimize-tripo-player.mjs


import { rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import {
  cloneDocument,
  dedup,
  prune,
  quantize,
  reorder,
  resample,
  simplify,
  textureCompress,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAYER = path.join(ROOT, 'game/public/models/tripo-victorian-player.glb');
const TEMP = path.join(ROOT, 'game/public/models/tripo-victorian-player.optimized.glb');
const MOBILE_PLAYER = path.join(ROOT, 'game/public/models/tripo-victorian-player-mobile.glb');
const MOBILE_TEMP = path.join(ROOT, 'game/public/models/tripo-victorian-player-mobile.optimized.glb');

const EXPECTED_CLIPS = Object.freeze([
  'CarryIdle',
  'CarryRun',
  'CarryWalk',
  'ClimbCarriage',
  'EdgeSlip',
  'FallenIdle',
  'FallGeneric',
  'FallShoulder',
  'FormalBow',
  'Handshake',
  'Jump',
  'PickUp',
  'RiseFromFall',
  'Run',
  'Smoking',
  'StandingIdle',
  'StandingJump',
  'Throw',
  'ThrowReady',
  'Walk',
]);

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

function assertPlayer(document, expectedTriangles = null) {
  const root = document.getRoot();
  const clips = root.listAnimations().map((clip) => clip.getName()).sort();
  if (!sameValues(clips, [...EXPECTED_CLIPS].sort())) {
    throw new Error(`Unexpected player clips: ${clips.join(', ')}`);
  }
  if (root.listMeshes().length !== 1 || root.listSkins().length !== 1) {
    throw new Error(`Player must contain one mesh and one skin; found ${root.listMeshes().length} and ${root.listSkins().length}`);
  }
  const triangles = triangleCount(root);
  if (expectedTriangles !== null && triangles !== expectedTriangles) {
    throw new Error(`Player triangle count changed: ${expectedTriangles} -> ${triangles}`);
  }
  const nodeNames = new Set(root.listNodes().map((node) => node.getName()));
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode()?.getName();
      if (!target || !nodeNames.has(target)) {
        throw new Error(`${animation.getName()} has a missing animation target`);
      }
    }
    for (const sampler of animation.listSamplers()) {
      for (const accessor of [sampler.getInput(), sampler.getOutput()]) {
        const values = accessor?.getArray();
        if (values && Array.from(values).some((value) => !Number.isFinite(value))) {
          throw new Error(`${animation.getName()} contains a non-finite keyframe`);
        }
      }
    }
  }
  return { clips: clips.length, triangles };
}

async function compressTextures(document, mobile) {
  await document.transform(
    // Only the visible color map is lossy. Normal and roughness data remain
    // lossless so compression cannot introduce lighting shimmer.
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: /^baseColorTexture$/,
      resize: mobile ? [1024, 1024] : undefined,
      quality: 90,
      effort: 6,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: /^(normalTexture|metallicRoughnessTexture)$/,
      resize: mobile ? [512, 512] : undefined,
      lossless: true,
      effort: 6,
    }),
  );
}

async function compressAccessors(document) {
  await document.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    // Use more precision than the generic web preset for the close-up player.
    quantize({
      quantizationVolume: 'mesh',
      quantizePosition: 16,
      quantizeNormal: 12,
      quantizeTexcoord: 14,
      quantizeColor: 10,
      quantizeWeight: 12,
      quantizeGeneric: 16,
    }),
  );
  document.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

const beforeBytes = (await stat(PLAYER)).size;
const document = await io.read(PLAYER);
const expectedTriangles = triangleCount(document.getRoot());
assertPlayer(document, expectedTriangles);

await document.transform(
  // Blender bakes every bone on every frame. Removing interpolatable middle
  // keys saves animation bytes while retaining the evaluated curves.
  resample({ tolerance: 1e-4 }),
  dedup(),
  prune({ keepAttributes: true, keepSolidTextures: true }),
);

// Phones get a separate asset because decoded texture memory and skinning cost,
// not just transfer bytes, caused the WebKit travel instability. The desktop
// model keeps every authored triangle and full texture resolution.
const mobileDocument = cloneDocument(document);
await mobileDocument.transform(
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.65, error: 0.001 }),
);
const mobileTriangles = triangleCount(mobileDocument.getRoot());
if (mobileTriangles >= expectedTriangles) {
  throw new Error(`Mobile simplification made no progress: ${mobileTriangles} triangles`);
}

await Promise.all([
  compressTextures(document, false),
  compressTextures(mobileDocument, true),
]);
await Promise.all([
  compressAccessors(document),
  compressAccessors(mobileDocument),
]);

assertPlayer(document, expectedTriangles);
assertPlayer(mobileDocument, mobileTriangles);
await io.write(TEMP, document);
await io.write(MOBILE_TEMP, mobileDocument);

// Read the serialized result through the same decoder used by the game before
// replacing the tracked asset. This catches invalid extension output early.
const [written, writtenMobile] = await Promise.all([io.read(TEMP), io.read(MOBILE_TEMP)]);
const result = assertPlayer(written, expectedTriangles);
const mobileResult = assertPlayer(writtenMobile, mobileTriangles);
await rename(TEMP, PLAYER);
await rename(MOBILE_TEMP, MOBILE_PLAYER);

const afterBytes = (await stat(PLAYER)).size;
const mobileBytes = (await stat(MOBILE_PLAYER)).size;
const saved = 100 * (1 - afterBytes / beforeBytes);
console.log(
  `player: ${result.triangles.toLocaleString()} tris, ${result.clips} clips, `
  + `${(beforeBytes / 1048576).toFixed(2)}MB -> ${(afterBytes / 1048576).toFixed(2)}MB `
  + `(${saved.toFixed(1)}% smaller)`,
);
console.log(
  `mobile player: ${mobileResult.triangles.toLocaleString()} tris, ${mobileResult.clips} clips, `
  + `${(mobileBytes / 1048576).toFixed(2)}MB`,
);

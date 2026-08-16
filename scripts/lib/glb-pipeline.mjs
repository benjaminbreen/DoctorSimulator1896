// Shared gltf-transform passes for the game's web GLBs. Two rules throughout:
// visible colour maps may be lossy but data maps stay lossless, and a pass
// must leave the model's runtime contract (clips, joints, node and material
// names) untouched.

import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, quantize, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

// Close-up character precision, matching optimize-tripo-player.mjs.
export const CHARACTER_QUANTIZATION = Object.freeze({
  quantizePosition: 16,
  quantizeNormal: 12,
  quantizeTexcoord: 14,
  quantizeColor: 10,
  quantizeWeight: 12,
  quantizeGeneric: 16,
});

export async function createIO() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}

export function triangleCount(root) {
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

export function contract(document) {
  const root = document.getRoot();
  const primitiveMaterials = [];
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      primitiveMaterials.push(primitive.getMaterial()?.getName() ?? '');
    }
  }
  return {
    clips: root.listAnimations().map((clip) => clip.getName()).sort(),
    joints: root.listSkins().flatMap((skin) => skin.listJoints().map((joint) => joint.getName())),
    nodes: root.listNodes().map((node) => node.getName()).sort(),
    meshes: root.listMeshes().length,
    primitiveMaterials: primitiveMaterials.sort(),
    triangles: triangleCount(root),
    images: root.listTextures().length,
  };
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertAnimationsPlayable(document, name) {
  const root = document.getRoot();
  const nodeNames = new Set(root.listNodes().map((node) => node.getName()));
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode()?.getName();
      if (!target || !nodeNames.has(target)) {
        throw new Error(`${name}: ${animation.getName()} has a missing animation target`);
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
}

// Characters keep every clip, joint, and named node: the wardrobe and face
// controllers look nodes and materials up by name at runtime.
export function assertSameCharacter(before, document, name) {
  const after = contract(document);
  if (!sameValues(after.clips, before.clips)) throw new Error(`${name}: clips changed`);
  if (!sameValues(after.joints, before.joints)) throw new Error(`${name}: skeleton changed`);
  if (!sameValues(after.nodes, before.nodes)) throw new Error(`${name}: node names changed`);
  if (!sameValues(after.primitiveMaterials, before.primitiveMaterials)) {
    throw new Error(`${name}: materials changed`);
  }
  if (after.triangles !== before.triangles) {
    throw new Error(`${name}: triangles ${before.triangles} -> ${after.triangles}`);
  }
  assertAnimationsPlayable(document, name);
  return after;
}

// Static pack pieces: geometry and referenced materials survive exactly.
export function assertSamePack(before, document, name) {
  const after = contract(document);
  if (after.meshes !== before.meshes) throw new Error(`${name}: mesh count changed`);
  if (after.triangles !== before.triangles) {
    throw new Error(`${name}: triangles ${before.triangles} -> ${after.triangles}`);
  }
  if (!sameValues(after.primitiveMaterials, before.primitiveMaterials)) {
    throw new Error(`${name}: materials changed`);
  }
  if (after.images !== before.images) throw new Error(`${name}: texture count changed`);
  return after;
}

// dedup limited to accessors and textures: merging meshes or materials could
// collapse the distinct names the runtime looks up.
export function conservativeDedup() {
  return dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] });
}

// Every character texture becomes webp: colour lossy, data maps lossless.
export async function compressCharacterTextures(document) {
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: /^(baseColorTexture|emissiveTexture)$/,
      quality: 90,
      effort: 6,
    }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      slots: /^(?!(?:baseColorTexture|emissiveTexture)$).+/,
      lossless: true,
      effort: 6,
    }),
  );
}

// Morph targets carry a POSITION delta and a NORMAL delta per vertex, and on
// the Renderer C cohorts those two are 89% of the file, split exactly in half.
// Dropping the normal deltas halves it: three then lights a morphed face with
// the base mesh's normals, which costs a little shading definition on deep
// expressions and nothing at all on the anchors.
//
// Measured on the published masters — women 13.8MB -> 7.6MB, men 21.7 ->
// 13.2MB. Sparse accessors were the obvious alternative and are worse: meshopt
// cannot compress them, so the files grew.
export function dropMorphTargetNormals(document) {
  let dropped = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const target of primitive.listTargets()) {
        for (const semantic of target.listSemantics()) {
          if (semantic === 'POSITION') continue;
          target.setAttribute(semantic, null);
          dropped += 1;
        }
      }
    }
  }
  return dropped;
}

// Reorder + quantize + meshopt. Files that already carry the extension keep it.
// Pass quantization=null to skip attribute quantization: re-quantizing a file
// whose many wardrobe meshes share one skin clones that skin per mesh.
export async function compressAccessors(document, quantization = {}) {
  const transforms = [reorder({ encoder: MeshoptEncoder, target: 'size' })];
  if (quantization) transforms.push(quantize({ quantizationVolume: 'mesh', ...quantization }));
  await document.transform(...transforms);
  const root = document.getRoot();
  const existing = root.listExtensionsUsed()
    .find((extension) => extension.extensionName === EXTMeshoptCompression.EXTENSION_NAME);
  (existing ?? document.createExtension(EXTMeshoptCompression))
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}

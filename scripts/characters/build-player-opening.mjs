// Generate a light opening mesh and a mesh-only detail tier from the shipped rig.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, reorder, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const models = new URL('../../game/public/models/', import.meta.url);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

async function read(suffix = '') {
  return io.read(fileURLToPath(new URL(`tripo-victorian-player${suffix}.glb`, models)));
}

async function write(document, suffix, gzip = false) {
  document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const binary = await io.writeBinary(document);
  const bytes = gzip ? gzipSync(binary, { level: 9 }) : binary;
  await writeFile(new URL(`tripo-victorian-player${suffix}.glb${gzip ? '.gz' : ''}`, models), bytes);
  console.log(suffix, bytes.length);
}

function restTrack(channel) {
  const node = channel.getTargetNode();
  const sampler = channel.getSampler();
  const output = sampler.getOutput();
  const bind = {
    translation: node.getTranslation(),
    rotation: node.getRotation(),
    scale: node.getScale(),
  }[channel.getTargetPath()];
  return bind && sampler.getInterpolation() !== 'CUBICSPLINE'
    && output.getArray().every((value, i) => Math.abs(value - bind[i % bind.length]) <= 0.00001);
}

function stripRestTracks(document) {
  const clips = document.getRoot().listAnimations();
  const duration = clip => Math.max(...clip.listSamplers().map(sampler => sampler.getInput().getArray().at(-1)));
  const moving = new Map();
  // Drop a channel only when every clip leaves that property in its rest pose.
  for (const clip of clips) for (const channel of clip.listChannels()) {
    const node = channel.getTargetNode();
    if (!moving.has(node)) moving.set(node, new Set());
    if (!restTrack(channel)) moving.get(node).add(channel.getTargetPath());
  }
  for (const clip of clips) {
    const seconds = duration(clip);
    for (const channel of clip.listChannels()) {
      if (!moving.get(channel.getTargetNode()).has(channel.getTargetPath())) channel.dispose();
    }
    const used = new Set(clip.listChannels().map(channel => channel.getSampler()));
    for (const sampler of clip.listSamplers()) if (!used.has(sampler)) sampler.dispose();
    assert.ok(clip.listChannels().length, `Empty clip: ${clip.getName()}`);
    assert.equal(duration(clip), seconds, `Changed clip length: ${clip.getName()}`);
  }
}

const opening = await read();
stripRestTracks(opening);
await opening.transform(
  prune({ keepAttributes: true, keepSolidTextures: true }),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.24, error: 0.004 }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColorTexture$/, resize: [512, 512], quality: 88 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(normalTexture|metallicRoughnessTexture)$/,
    resize: [256, 256], lossless: true }),
);
await write(opening, '-opening', true);

for (const suffix of ['', '-mobile']) {
  const detail = await read(suffix);
  for (const clip of detail.getRoot().listAnimations()) {
    for (const sampler of clip.listSamplers()) sampler.dispose();
    clip.dispose();
  }
  await detail.transform(prune({ keepAttributes: true, keepSolidTextures: true }));
  const [openingSkin] = opening.getRoot().listSkins();
  const [detailSkin] = detail.getRoot().listSkins();
  assert.deepEqual(detailSkin.listJoints().map(joint => joint.getName()), openingSkin.listJoints().map(joint => joint.getName()));
  detailSkin.listJoints().forEach((joint, index) => {
    assert.deepEqual(joint.getMatrix(), openingSkin.listJoints()[index].getMatrix());
  });
  await write(detail, `${suffix}-detail`);
}

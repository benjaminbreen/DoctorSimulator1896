// Cut the game's player figure out of the Renderer C master.
//
//   node scripts/characters/export-player-figure.mjs
//
// The master (character-lab/public/models/renderer-c-men.glb) carries one body
// on the Mixamo rig with eight head variants, two suits, and ten clips. The
// game wants one dressed figure that stands and walks, so this keeps a single
// variant of each slot and the two locomotion clips, then compresses.
//
// Hips translation is dropped from the clips: the physics capsule moves the
// player, and a clip that also travels would slide the figure off it.

import { statSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SOURCE = path.join(ROOT, 'character-lab', 'public', 'models', 'renderer-c-men.glb');
const OUT = path.join(ROOT, 'game', 'public', 'models', 'player-placeholder.glb');

// One of each slot family. The master repeats brows, eyes, hair, lashes and
// teeth once per cohort anchor; they sit in the same place, so keeping the
// first of each gives a complete face.
const KEEP_MESHES = new Set([
  'base.001',
  'male_casualsuit01',
  'shoes05',
  'short01',
  'eyebrow003',
  'eyelashes01',
  'high-poly',
  'teeth_base',
]);
const KEEP_CLIPS = new Set(['StandingIdle', 'Walk']);

// Meshes whose texture alpha is real: hair, brow and lash cards, plus the eye's
// clear cornea layer. Everything else the master marks alphaBlend is solid.
const CUTOUT_MESHES = new Set(['short01', 'eyebrow003', 'eyelashes01', 'high-poly']);
// Only the flat cards need their back faces.
const TWO_SIDED_MESHES = new Set(['short01', 'eyebrow003', 'eyelashes01']);
// Soft hair and brow edges vanish at the usual 0.5.
const CUTOFF = 0.35;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const document = await io.read(SOURCE);
const root = document.getRoot();

for (const animation of root.listAnimations()) {
  if (!KEEP_CLIPS.has(animation.getName())) {
    animation.dispose();
    continue;
  }
  // In-place: keep every rotation, drop the root's travel.
  for (const channel of animation.listChannels()) {
    const target = channel.getTargetNode()?.getName() ?? '';
    if (channel.getTargetPath() === 'translation' && /hips/i.test(target)) channel.dispose();
  }
}

let dropped = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  if (KEEP_MESHES.has(mesh.getName())) continue;
  node.setMesh(null);
  dropped += 1;
}

// MPFB writes every skin material as alphaBlend, and GLTFLoader answers that
// with depthWrite: false, so the face draws no depth and the inside of the
// mouth shows through it. Cutout keeps the alpha the cards need and the depth
// everything needs.
// Kept nodes, not every mesh: the cohort variants dropped above still hold
// their meshes until prune, and share these materials.
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const cutout = CUTOUT_MESHES.has(mesh.getName());
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    if (!material) continue;
    material.setAlphaMode(cutout ? 'MASK' : 'OPAQUE');
    material.setAlphaCutoff(CUTOFF);
    material.setDoubleSided(TWO_SIDED_MESHES.has(mesh.getName()));
  }
}

// Face morphs are the master's cohort anchors — the game picks no anchor, and
// they are most of the file.
let morphs = 0;
for (const mesh of root.listMeshes()) {
  mesh.setWeights([]);
  for (const primitive of mesh.listPrimitives()) {
    for (const target of primitive.listTargets()) {
      primitive.removeTarget(target);
      target.dispose();
      morphs += 1;
    }
  }
}

await document.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  reorder({ encoder: MeshoptEncoder }),
  quantize(),
);
document
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

let tris = 0;
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const indices = primitive.getIndices();
    tris += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
  }
}

// Meshopt-compressed, like the lab's own game exports: the loader wires the
// decoder in, and it is the difference between a 26MB player and a 3MB one.
await io.write(OUT, document);

const size = (statSync(OUT).size / 1048576).toFixed(1);
const clips = root.listAnimations().map((a) => `${a.getName()} (${a.listChannels().length}ch)`);
console.log(`kept ${root.listMeshes().length} meshes, dropped ${dropped} variant nodes, ${morphs} morphs`);
console.log(`clips: ${clips.join(', ')}`);
console.log(`${path.relative(ROOT, OUT)}: ${Math.round(tris).toLocaleString()} tris, ${size}MB`);

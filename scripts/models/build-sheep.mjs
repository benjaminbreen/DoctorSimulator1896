// Build the flock's sheep from the Sketchfab source (see docs/credits.md).
// The source is one 85k-triangle sheep split into four chunks; a flock of
// twenty needs far fewer. Grazing and walking are posed in code
// (SheepFlock.jsx), so no clips are kept.
//
//   node scripts/models/build-sheep.mjs

import path from 'node:path';
import { normals, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import {
  CHARACTER_QUANTIZATION,
  compressAccessors,
  compressCharacterTextures,
  createIO,
  triangleCount,
} from '../lib/glb-pipeline.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SOURCE = path.join(ROOT, 'assets-local/sheep/sheep-test_non-commercial.glb');
const OUT = path.join(ROOT, 'game/public/models/sheep.glb');
const TARGET_TRIANGLES = 15000;
const ATTRIBUTES = ['POSITION', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];

const io = await createIO();
const document = await io.read(SOURCE);
const root = document.getRoot();
for (const animation of root.listAnimations()) animation.dispose();
const before = triangleCount(root);

// The four chunks are interleaved across the whole body, so simplified apart
// their shared edges drift and open cracks everywhere. Merge them into the
// first chunk. Each triangle also has its own vertices and a face normal, so
// the normals are dropped here and the mesh welded on what remains.
const [keep, ...rest] = root.listNodes().filter((node) => node.getMesh());
const target = keep.getMesh().listPrimitives()[0];
const parts = [target, ...rest.map((node) => node.getMesh().listPrimitives()[0])];
// Index buffers first, offset by each chunk's place in the merged vertices.
const indexArrays = [];
let vertexOffset = 0;
for (const part of parts) {
  indexArrays.push(Array.from(part.getIndices().getArray(), (index) => index + vertexOffset));
  vertexOffset += part.getAttribute('POSITION').getCount();
}
target.getIndices().setArray(Uint32Array.from(indexArrays.flat()));
for (const name of ATTRIBUTES) {
  const sources = parts.map((part) => part.getAttribute(name).getArray());
  const merged = new sources[0].constructor(sources.reduce((sum, array) => sum + array.length, 0));
  sources.reduce((offset, array) => (merged.set(array, offset), offset + array.length), 0);
  target.getAttribute(name).setArray(merged);
}
target.getAttribute('NORMAL').dispose();
for (const node of rest) {
  node.getMesh().dispose();
  node.dispose();
}

await MeshoptSimplifier.ready;
await document.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: TARGET_TRIANGLES / before, error: 0.02 }),
  normals({ overwrite: true }),
  prune({ keepAttributes: true, keepLeaves: true }),
);
await compressCharacterTextures(document);
await compressAccessors(document, CHARACTER_QUANTIZATION);
await io.write(OUT, document);
console.log(`sheep: ${before} -> ${triangleCount(root)} triangles, wrote ${path.relative(ROOT, OUT)}`);

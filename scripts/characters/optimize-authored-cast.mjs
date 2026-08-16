// Compress the authored consultation cast in place: webp textures, meshopt
// geometry, resampled clips. The clip, joint, and node-name contract must
// come through unchanged.
//
//   node scripts/characters/optimize-authored-cast.mjs

import { rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { prune, resample } from '@gltf-transform/functions';
import {
  CHARACTER_QUANTIZATION,
  assertSameCharacter,
  compressAccessors,
  compressCharacterTextures,
  conservativeDedup,
  contract,
  createIO,
} from '../lib/glb-pipeline.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const FILES = [
  'game/public/models/characters/nora-byrne.glb',
  'game/public/models/characters/nora-byrne-motions.glb',
];

const io = await createIO();
for (const relative of FILES) {
  const file = path.join(ROOT, relative);
  const name = path.basename(file);
  const beforeBytes = (await stat(file)).size;
  const document = await io.read(file);
  const before = contract(document);

  await document.transform(
    resample({ tolerance: 1e-4 }),
    conservativeDedup(),
    prune({ keepAttributes: true, keepSolidTextures: true, keepLeaves: true }),
  );
  await compressCharacterTextures(document);
  await compressAccessors(document, CHARACTER_QUANTIZATION);
  assertSameCharacter(before, document, name);

  const temp = file.replace(/\.glb$/, '.optimized.glb');
  await io.write(temp, document);
  assertSameCharacter(before, await io.read(temp), name);
  await rename(temp, file);

  const afterBytes = (await stat(file)).size;
  console.log(
    `${name}: ${(beforeBytes / 1048576).toFixed(2)}MB -> ${(afterBytes / 1048576).toFixed(2)}MB`,
  );
}

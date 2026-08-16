// Compress the horse-drawn traffic pair in place. Both shipped with 1024px
// PNG maps that the texture pass never reached — 1.4MB and 1.6MB of image
// data on models that Central Park loads in its last boot stage.
//
//   node scripts/models/optimize-park-traffic.mjs

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
// carriage-driver is already quantized; running quantize over it a second
// time compounds the rounding error for no further saving.
const FILES = [
  { file: 'game/public/models/horse.glb', quantization: CHARACTER_QUANTIZATION },
  { file: 'game/public/models/carriage-driver.glb', quantization: null },
];

const io = await createIO();
for (const { file: relative, quantization } of FILES) {
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
  await compressAccessors(document, quantization);
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

// Meshopt-compress every static model-pack piece in place. Textures are
// already webp or jpeg and are left untouched; only geometry encoding
// changes, so the pass is lossless to the eye.
//
//   node scripts/models/optimize-packs.mjs

import { readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { prune } from '@gltf-transform/functions';
import {
  assertSamePack,
  compressAccessors,
  conservativeDedup,
  contract,
  createIO,
} from '../lib/glb-pipeline.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PACKS = ['victorian', 'park', 'props'];

const io = await createIO();
for (const pack of PACKS) {
  const dir = path.join(ROOT, 'game/public/models', pack);
  const files = (await readdir(dir)).filter((name) => name.endsWith('.glb')).sort();
  let beforeTotal = 0;
  let afterTotal = 0;
  for (const name of files) {
    const file = path.join(dir, name);
    const beforeBytes = (await stat(file)).size;
    const document = await io.read(file);
    const root = document.getRoot();
    if (root.listAnimations().length || root.listSkins().length) {
      throw new Error(`${pack}/${name}: pack pieces must be static`);
    }
    const before = contract(document);
    await document.transform(
      conservativeDedup(),
      prune({ keepAttributes: true, keepSolidTextures: true }),
    );
    // No attribute quantization: PropModels and TreeField bake node matrices
    // into the geometry, which normalized quantized attributes do not survive.
    await compressAccessors(document, null);
    assertSamePack(before, document, name);

    const temp = file.replace(/\.glb$/, '.optimized.glb');
    await io.write(temp, document);
    assertSamePack(before, await io.read(temp), name);
    await rename(temp, file);

    beforeTotal += beforeBytes;
    afterTotal += (await stat(file)).size;
  }
  console.log(
    `${pack}: ${files.length} pieces, `
    + `${(beforeTotal / 1048576).toFixed(1)}MB -> ${(afterTotal / 1048576).toFixed(1)}MB`,
  );
}

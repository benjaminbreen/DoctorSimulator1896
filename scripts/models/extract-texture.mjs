// Pull the images out of a GLB that is really just a material sample, and
// write them as surface textures the room shell can use.
//
//   node scripts/models/extract-texture.mjs \
//     assets-src/textures/vintage_wallpaper_texture.glb props/Wallpaper_Vintage
//
// The second argument is the surface name the game refers to, relative to
// game/public/textures/. Files come out named for the slot they fill, matching
// the Victorian pack's convention: <name>_AlbedoTransparency.jpg, <name>_Normal.jpg.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SIZE = 1024;

const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error('usage: extract-texture.mjs <glb> <pack/Name>');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(path.join(ROOT, source));
const root = document.getRoot();

// Which material slot each texture fills; that is what names the file.
const SLOTS = [
  ['AlbedoTransparency', (material) => material.getBaseColorTexture()],
  ['Normal', (material) => material.getNormalTexture()],
];

const out = path.join(ROOT, 'game', 'public', 'textures', path.dirname(target));
await mkdir(out, { recursive: true });
const name = path.basename(target);
let written = 0;

for (const [slot, get] of SLOTS) {
  for (const material of root.listMaterials()) {
    const texture = get(material);
    if (!texture) continue;
    const file = path.join(out, `${name}_${slot}.jpg`);
    const image = await sharp(Buffer.from(texture.getImage()))
      .resize(SIZE, SIZE, { fit: 'fill' })
      .jpeg({ quality: 88 })
      .toBuffer();
    await writeFile(file, image);
    console.log(`${path.relative(ROOT, file)}  ${(image.byteLength / 1024).toFixed(0)}kB`);
    written += 1;
    break;
  }
}

const extras = root.getAsset().extras ?? {};
if (extras.author) console.log(`credit: ${extras.title} — ${extras.author} — ${extras.license}`);
if (written === 0) throw new Error('no base colour texture found');

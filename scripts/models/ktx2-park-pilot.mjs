// Pilot: re-encode the park pack's textures as KTX2 so the GPU can hold them
// compressed instead of expanded to raw pixels.
//
// A 1024x1024 texture costs ~5.3MB of video memory as RGBA with mipmaps, no
// matter how small its webp was. As KTX2/UASTC it stays compressed on the GPU
// at roughly a quarter of that. Central Park was 557MB of texture memory after
// the duplicate-upload fix, and 83 textures at 1024 accounted for 440MB of it.
//
// UASTC throughout rather than the smaller ETC1S: the plants are alpha-cut
// foliage, and ETC1S is at its worst on alpha edges. ETC1S would roughly halve
// this again if the leaves turn out to tolerate it.
//
//   node scripts/models/ktx2-park-pilot.mjs uastc
//   node scripts/models/ktx2-park-pilot.mjs etc1s
//   node scripts/models/ktx2-park-pilot.mjs mixed
//
// Reverts with: git checkout game/public/models/park

import { readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { assertSamePack, contract, createIO } from '../lib/glb-pipeline.mjs';

// The encoder wants raw RGBA; in Node it has no browser image decoder to call.
async function imageDecoder(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const DIR = path.join(ROOT, 'game/public/models/park');

// UASTC is high quality and 8 bits per pixel; ETC1S is a quarter of that and
// blocky where detail is fine. Colour survives ETC1S well, normal maps do not —
// an error there becomes visibly wrong shading rather than a slightly wrong hue.
const COLOR_SLOTS = /^(baseColorTexture|emissiveTexture)$/;
const MODES = {
  uastc: [{ isUASTC: true, needSupercompression: true, uastcLDRQualityLevel: 2 }],
  etc1s: [{ isUASTC: false, qualityLevel: 200 }],
  mixed: [
    { slots: COLOR_SLOTS, isUASTC: false, qualityLevel: 200 },
    { slots: new RegExp(`^(?!${COLOR_SLOTS.source.slice(1, -1)}$).+`), isUASTC: true, needSupercompression: true, uastcLDRQualityLevel: 2 },
  ],
};

const mode = process.argv[2] ?? 'mixed';
if (!MODES[mode]) throw new Error(`unknown mode ${mode}; use ${Object.keys(MODES).join('|')}`);
console.log(`mode: ${mode}\n`);

const io = await createIO();
const files = (await readdir(DIR)).filter((name) => name.endsWith('.glb')).sort();

let beforeTotal = 0;
let afterTotal = 0;
let converted = 0;
const failures = [];

for (const name of files) {
  const file = path.join(DIR, name);
  const beforeBytes = (await stat(file)).size;
  const document = await io.read(file);
  const before = contract(document);
  if (before.images === 0) continue;

  try {
    await document.transform(...MODES[mode].map((pass) => ktx2({ ...pass, imageDecoder })));
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    continue;
  }

  assertSamePack(before, document, name);
  const temp = file.replace(/\.glb$/, '.ktx2.glb');
  await io.write(temp, document);
  assertSamePack(before, await io.read(temp), name);
  await rename(temp, file);

  const afterBytes = (await stat(file)).size;
  beforeTotal += beforeBytes;
  afterTotal += afterBytes;
  converted += 1;
  console.log(`${name.padEnd(46)} ${(beforeBytes / 1024).toFixed(0).padStart(5)}KB -> ${(afterBytes / 1024).toFixed(0).padStart(5)}KB`);
}

console.log(
  `\n${converted} files converted: `
  + `${(beforeTotal / 1048576).toFixed(1)}MB -> ${(afterTotal / 1048576).toFixed(1)}MB on disk`,
);
if (failures.length) {
  console.log(`\n${failures.length} failed:`);
  for (const failure of failures) console.log(`  ${failure}`);
}

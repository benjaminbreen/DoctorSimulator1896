// Re-encode character GLB textures as KTX2 so the GPU holds them compressed
// instead of expanded to raw RGBA — the renderer-c cohorts alone were ~234MB
// of decoded texture memory, which is what tips iOS Safari into dropping
// textures (the all-black figure bug) and restarting the page.
//
// Close-up figures (player, renderer-c) keep UASTC colour; background
// pedestrians take ETC1S, whose block artefacts are invisible at park
// distances. Data maps are UASTC with a linear transfer function: an sRGB
// flag there would make the GPU sRGB-decode normal-map texels into wrong
// shading.
//
// The renderer-c *_eye atlases stay webp: tintCombinedEyeTexture draws them
// into a 2D canvas per actor, which a compressed texture cannot do.
//
//   node scripts/characters/ktx2-characters.mjs
//
// Reverts with: git checkout game/public/models

import { rename, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { assertSameCharacter, contract, createIO } from '../lib/glb-pipeline.mjs';

// The encoder wants raw RGBA; in Node it has no browser image decoder to call.
async function imageDecoder(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const MODELS = path.join(ROOT, 'game/public/models');

const COLOR_SLOTS = /^(baseColorTexture|emissiveTexture)$/;
const DATA_SLOTS = /^(?!(?:baseColorTexture|emissiveTexture)$).+/;

const UASTC = { isUASTC: true, needSupercompression: true, uastcLDRQualityLevel: 2 };
const UASTC_LINEAR = {
  ...UASTC,
  isInputSRGB: false,
  isSetKTX2SRGBTransferFunc: false,
  isPerceptual: false,
};
const ETC1S = { isUASTC: false, qualityLevel: 200 };

const CLOSE_UP = ['tripo-victorian-player', 'tripo-victorian-player-mobile'];
const BACKGROUND = [
  'pedestrian-b', 'pedestrian-c', 'pedestrian-d', 'pedestrian-e', 'pedestrian-f',
  'strawhat-pedestrian',
].flatMap((name) => [name, `${name}-mobile`]);

const FILES = [
  ...CLOSE_UP.map((name) => ({ file: `${name}.glb`, color: UASTC })),
  ...['renderer-c-men', 'renderer-c-women'].map((name) => ({
    file: `characters/${name}.glb`,
    color: UASTC,
    keepWebp: /_eye$/,
  })),
  ...BACKGROUND.map((name) => ({ file: `${name}.glb`, color: ETC1S })),
];

const io = await createIO();
let beforeTotal = 0;
let afterTotal = 0;

for (const { file, color, keepWebp } of FILES) {
  const filePath = path.join(MODELS, file);
  const beforeBytes = (await stat(filePath)).size;
  const document = await io.read(filePath);
  const before = contract(document);
  if (document.getRoot().listTextures().some((t) => t.getMimeType() === 'image/ktx2')) {
    console.log(`${file.padEnd(40)} already KTX2, skipped`);
    continue;
  }

  // The transform's pattern option cannot exclude embedded textures (their
  // empty URI matches any negative lookahead), so park the kept textures on a
  // mime type the encoder does not recognise and restore it afterwards.
  const kept = keepWebp
    ? document.getRoot().listTextures().filter((t) => keepWebp.test(t.getName()))
    : [];
  const keptMimes = kept.map((t) => t.getMimeType());
  for (const texture of kept) texture.setMimeType('image/webp-keep');

  await document.transform(
    ktx2({ ...color, slots: COLOR_SLOTS, imageDecoder }),
    ktx2({ ...UASTC_LINEAR, slots: DATA_SLOTS, imageDecoder }),
  );
  kept.forEach((texture, index) => texture.setMimeType(keptMimes[index]));

  assertSameCharacter(before, document, file);
  const stillWebp = document.getRoot().listTextures()
    .filter((t) => t.getMimeType() !== 'image/ktx2').length;
  if (stillWebp !== kept.length) {
    throw new Error(`${file}: ${stillWebp} textures not converted, expected ${kept.length}`);
  }

  const temp = filePath.replace(/\.glb$/, '.ktx2.glb');
  await io.write(temp, document);
  assertSameCharacter(before, await io.read(temp), file);
  await rename(temp, filePath);

  const afterBytes = (await stat(filePath)).size;
  beforeTotal += beforeBytes;
  afterTotal += afterBytes;
  console.log(
    `${file.padEnd(40)} ${(beforeBytes / 1048576).toFixed(2)}MB -> ${(afterBytes / 1048576).toFixed(2)}MB`,
  );
}

console.log(
  `\ntotal ${(beforeTotal / 1048576).toFixed(1)}MB -> ${(afterTotal / 1048576).toFixed(1)}MB on disk`,
);

// A rebuild encodes normal maps from Blender's PNGs, up to four times larger
// than the published ones, which were re-encoded from lossless webp. This
// repeats that step so a rebuilt model reuses the shared texture files.
// Usage: node scripts/characters/reencode-normal-maps.mjs files... (then share-character-textures)
import path from 'node:path';
import sharp from 'sharp';
import {createIO} from '../lib/glb-pipeline.mjs';

const io=await createIO();
for(const file of process.argv.slice(2)){
  const document=await io.read(path.resolve(file)),done=new Set();
  for(const material of document.getRoot().listMaterials()){
    const texture=material.getNormalTexture();
    if(!texture||done.has(texture))continue;
    done.add(texture);
    texture.setImage(new Uint8Array(await sharp(texture.getImage()).webp({nearLossless:true,quality:60,effort:6}).toBuffer())).setMimeType('image/webp');
  }
  await io.write(path.resolve(file),document);
}

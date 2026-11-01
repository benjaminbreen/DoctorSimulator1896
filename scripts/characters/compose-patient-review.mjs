import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MODULAR_IDENTITIES } from '../../shared/characters/modularIdentity.js';

const escape = (text) => String(text).replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[value]));
function label(text, width, height, size = 14) {
  return Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#20242a"/><text x="10" y="${height-12}" font-family="Arial" font-size="${size}" fill="#e8e5dc">${escape(text)}</text></svg>`);
}

export async function composeReview(directory) {
  const data = JSON.parse(await readFile(path.join(directory, 'review.json')));
  const outputs = [];
  for (const blink of [0, .5, 1]) {
    const layers = [{ input: label(`Shared body rig · ${data.models.length*7} structural presets · blink ${blink}`, 1568, 50, 20), left: 0, top: 0 }];
    for (let row = 0; row < data.models.length; row += 1) {
      for (let column = 0; column < 7; column += 1) {
        const filename = `${data.models[row]}-identity-${column}-blink-${blink}.png`;
        if (!data.captures.some((capture) => capture.filename === filename)) continue;
        const portrait = await sharp(path.join(directory, filename)).extract({ left: 250, top: 190, width: 580, height: 700 }).resize(224, 270).toBuffer();
        layers.push({ input: portrait, left: column*224, top: 50+row*310 });
        layers.push({ input: label(`${row ? 'Seamstress' : 'Carmela'} · ${MODULAR_IDENTITIES[column]}`, 224, 40), left: column*224, top: 320+row*310 });
      }
    }
    const filename = blink === 0 ? 'identities.png' : blink === .5 ? 'half-blinks.png' : 'blinks.png';
    await sharp({ create: { width: 1568, height: 50+data.models.length*310, channels: 3, background: '#20242a' } }).composite(layers).png().toFile(path.join(directory, filename));
    outputs.push(filename);
  }
  const layers = [{ input: label('Shared wardrobe · two outfits · fabric changes preserve skin and collar', 1200, 50, 20), left: 0, top: 0 }];
  let index = 0;
  for (const model of data.models) {
    for (const outfit of ['day-dress', 'work-apron']) {
      for (const palette of ['original', 'forest']) {
        const filename = `${model}-${outfit}-${palette}.png`;
        const portrait = await sharp(path.join(directory, filename)).extract({ left: 170, top: 160, width: 700, height: 790 }).resize(300, 338).toBuffer();
        const left = (index % 4)*300, top = 50+Math.floor(index/4)*378;
        layers.push({ input: portrait, left, top });
        layers.push({ input: label(`${model.startsWith('carmela') ? 'Carmela' : 'Seamstress'} · ${outfit} · ${palette}`, 300, 40, 12), left, top: top+338 });
        index += 1;
      }
    }
  }
  await sharp({ create: { width: 1200, height: 50+Math.ceil(index/4)*378, channels: 3, background: '#20242a' } }).composite(layers).png().toFile(path.join(directory, 'wardrobe.png'));
  outputs.push('wardrobe.png');
  await writeFile(path.join(directory, 'contact-sheets.json'), JSON.stringify(outputs, null, 2));
  return outputs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(await composeReview(path.resolve(process.argv[2] || 'artifacts/characters/carmela-prototype/face-lab')));
}

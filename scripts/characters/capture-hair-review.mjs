import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';
import { MODULAR_HAIR_STYLES } from '../../shared/characters/modularHair.js';
import { createModularVariation } from '../../shared/characters/modularVariants.js';

const options = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const output = path.resolve(options.output || 'artifacts/characters/carmela-hair-over-ear/nape-review');
const quick = 'quick' in options;
const styles = options.styles ? options.styles.split(',') : Object.keys(MODULAR_HAIR_STYLES).filter(id=>!['short-side-part','receding-sweep','bald'].includes(id));
if (styles.some(style => !MODULAR_HAIR_STYLES[style])) throw new Error('Unknown hairstyle');
const captures = [], failures = [], sheets = {};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1 });
  if (options.asset) await page.route('**/models/characters/carmela-russo.glb', route => route.fulfill({ path: path.resolve(options.asset), contentType: 'model/gltf-binary' }));
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.location().url?.includes('favicon')) failures.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('favicon')) failures.push(`${response.status()}: ${response.url()}`); });
  async function capture(model, id, label, parameters) {
    const state = await page.evaluate(parameters => window.__faceLab.show(parameters), { features: { lowerFaceSize: -.6 }, ...parameters });
    const visible = state.hairMeshes.filter(mesh => mesh.visible);
    if (!visible.length || visible.some(mesh => !mesh.name.startsWith(`Carmela_HairStyle_${state.hairStyle.replaceAll('-', '_')}`))) throw new Error('The selected hairstyle did not replace the other styles');
    if (!visible.some(mesh => mesh.material === 'Carmela_HairStrands' && mesh.alphaTest > .3)) throw new Error('Hair strand cutouts did not survive export');
    const filename = `${model}-${id}.png`;
    await page.screenshot({ path: path.join(output, filename) });
    captures.push({ filename, ...state });
    return { filename, label };
  }
  for (const model of quick ? ['carmela-russo'] : ['carmela-russo', 'seamstress-prototype']) {
    await page.goto(`${options.url || 'http://127.0.0.1:5186'}/face-lab.html?model=${model}`);
    await page.waitForFunction(() => window.__faceLab, undefined, { timeout: 60000 });
    const rows = [];
    for (const [view, angle] of [['front', 0], ['quarter', .65], ['profile', 1.5], ['opposite-profile', -1.5], ['back-quarter', 2.25], ['rear', Math.PI]]) {
      const row = [];
      for (const style of styles) row.push(await capture(model, `${style}-${view}`, MODULAR_HAIR_STYLES[style], { hairStyle: style, angle }));
      rows.push(row);
    }
    sheets[`styles-${model}`] = rows;
    if (styles.length === 5) sheets[`over-ear-${model}`] = rows.map(row => row.slice(-2));
    if (!quick) {
      const row = [];
      for (const [id, label, parameters] of [
        ['compact', 'Compact', { hairVolume: -.4, hairWave: -.3 }],
        ['fuller', 'Fuller', { hairVolume: .8 }],
        ['wavier', 'Wavier', { hairWave: 1 }],
        ['high', 'Higher knot', { hairBunHeight: .8 }],
        ['side', 'Shifted part', { hairPartOffset: -.7 }],
        ['less-coverage', 'Less ear coverage', { hairStyle: 'curled-side-rolls', hairEarCoverage: -.7, angle: 1.4 }],
        ['more-coverage', 'More ear coverage', { hairStyle: 'curled-side-rolls', hairEarCoverage: 1, angle: 1.4 }],
      ]) row.push(await capture(model, `groom-${id}`, label, { hairStyle: 'soft-side-waves', angle: .7, ...parameters }));
      sheets[`grooming-${model}`] = [row];
      const cast = [];
      for (const seed of [1,2,5,6,7,11,15,27]) cast.push(await capture(model, `seed-${seed}`, `Seed ${seed}`, { ...createModularVariation(seed), angle: .5 }));
      (sheets.cast ||= []).push(cast);
      for (const [clip, time] of [['Walk', .3], ['SitDown', 1.4], ['SittingTalking', 1.4], ['SittingSelfSoothing', 2], ['StandUp', .8]]) {
        for (const hairStyle of styles) await capture(model, `${hairStyle}-${clip}`, clip, { clip, time, hairStyle, angle: .65, expression: 'relieved', speaking: true, faceTime: .085 });
      }
      for (const hairStyle of styles.filter(style => ['soft-side-waves', 'curled-side-rolls'].includes(style))) {
        await capture(model, `${hairStyle}-nape-tilt`, 'Nape during head tilt', { hairStyle, clip: 'SittingSelfSoothing', time: 2, angle: 2.25 });
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(output, 'review.json'), JSON.stringify({ captures, failures }, null, 2));
}
if (failures.length) throw new Error(failures.join('\n'));
for (const [name, rows] of Object.entries(sheets)) {
  const columns = Math.max(...rows.map(row => row.length)), width = columns > 5 ? 224 : 280, height = Math.round(width*700/580);
  const layers = [];
  for (const [r, row] of rows.entries()) for (const [c, item] of row.entries()) {
    const input = await sharp(path.join(output, item.filename)).extract({ left: 250, top: 190, width: 580, height: 700 }).resize(width, height).toBuffer();
    const caption = Buffer.from(`<svg width="${width}" height="38"><rect width="100%" height="100%" fill="#20242a"/><text x="8" y="25" font-family="Arial" font-size="16" fill="#eee">${item.label}</text></svg>`);
    layers.push({ input, left: c*width, top: r*(height+38) }, { input: caption, left: c*width, top: r*(height+38)+height });
  }
  await sharp({ create: { width: columns*width, height: rows.length*(height+38), channels: 3, background: '#20242a' } }).composite(layers).png().toFile(path.join(output, `${name}.png`));
}
console.log(JSON.stringify({ output, captures: captures.length, failures }));

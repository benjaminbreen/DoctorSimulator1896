import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const options = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const output = path.resolve(options.output || 'artifacts/characters/carmela-chin/review');
await mkdir(output, { recursive: true });
const captures = [], failures = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.location().url?.includes('favicon')) failures.push(message.text()); });
  await page.goto(`${options.url || 'http://127.0.0.1:5186'}/face-lab.html?model=carmela-russo`);
  await page.waitForFunction(() => window.__faceLab, undefined, { timeout: 60000 });
  for (const [view, angle] of [['front', .2], ['profile', 1.4]]) {
    for (const [id, parameters] of [
      ['neutral', { clip: 'ClinicIdle', time: 0 }],
      ['talk-neutral', { clip: 'SittingTalking', time: 1.4 }],
      ['talk-relieved', { clip: 'SittingTalking', time: 1.4, expression: 'relieved', speaking: true, faceTime: .25 }],
      ['talk-open', { clip: 'SittingTalking', time: 1.4, expression: 'relieved', speaking: true, faceTime: .085 }],
      ['disapproval', { clip: 'SittingDisapproval', time: 1.6, expression: 'frowning' }],
      ['disbelief', { clip: 'SittingDisbelief', time: 2, expression: 'anxious' }],
    ]) {
      const state = await page.evaluate(parameters => window.__faceLab.show(parameters), { ...parameters, features: { lowerFaceSize: -.6 }, angle });
      const filename = `${id}-${view}.png`;
      await page.screenshot({ path: path.join(output, filename) });
      captures.push({ filename, ...state });
    }
  }
} finally {
  await browser.close();
  await writeFile(path.join(output, 'review.json'), JSON.stringify({ captures, failures }, null, 2));
}
if (failures.length) throw new Error(failures.join('\n'));
if (options.compare) {
  const width = 280, height = Math.round(width * 700 / 580), layers = [];
  for (const [i, [directory, view, label]] of [
    [path.resolve(options.compare), 'front', 'Before · tilted head'], [output, 'front', 'Fixed · tilted head'],
    [path.resolve(options.compare), 'profile', 'Before · profile'], [output, 'profile', 'Fixed · profile'],
  ].entries()) {
    const input = await sharp(path.join(directory, `talk-relieved-${view}.png`)).extract({ left: 250, top: 190, width: 580, height: 700 }).resize(width, height).toBuffer();
    const caption = Buffer.from(`<svg width="${width}" height="40"><rect width="100%" height="100%" fill="#20242a"/><text x="10" y="27" font-family="Arial" font-size="17" fill="#eee">${label}</text></svg>`);
    layers.push({ input, left: i * width, top: 0 }, { input: caption, left: i * width, top: height });
  }
  await sharp({ create: { width: 4 * width, height: height + 40, channels: 3, background: '#20242a' } }).composite(layers).png().toFile(path.join(output, 'comparison.png'));
}
console.log(JSON.stringify({ output, captures: captures.length, failures }));

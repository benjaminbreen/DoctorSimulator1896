import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';

const options = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const output = path.resolve(options.output || 'artifacts/characters/carmela-emotions/review');
await mkdir(output, { recursive: true });
const captures = [], failures = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.location().url?.includes('favicon')) failures.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().includes('favicon')) failures.push(`${response.status()}: ${response.url()}`); });
  await page.goto(`${options.url || 'http://127.0.0.1:5186'}/face-lab.html?model=carmela-russo`);
  await page.waitForFunction(() => window.__faceLab, undefined, { timeout: 60000 });
  for (const speaking of [false, true]) {
    for (const expression of ['neutral', 'guarded', 'anxious', 'distressed', 'discouraged', 'frowning', 'relieved', 'smiling', 'fatigued', 'pained', 'ashamed']) {
      const state = await page.evaluate(parameters => window.__faceLab.show(parameters), {
        features: { lowerFaceSize: -.6 }, expression, speaking, faceTime: .085, angle: .2, legacyExpressions: 'legacy' in options,
      });
      const filename = `${expression}-${speaking ? 'speaking' : 'listening'}.png`;
      const shot = await page.screenshot({ path: path.join(output, filename) });
      if (expression === 'neutral' && !speaking) {
        await page.waitForTimeout(120);
        if (!shot.equals(await page.screenshot())) throw new Error('The frozen review pose moved between captures');
      }
      captures.push({ filename, ...state });
    }
  }
  for (const [i, weights] of [{ speechOpen: .30 }, { speechOpen: .20, speechRound: .26 }, { speechOpen: .30, mouthSmileLeft: .7, mouthSmileRight: .7 }].entries()) {
    const state = await page.evaluate(parameters => window.__faceLab.show(parameters), { features: { lowerFaceSize: -.6 }, weights, angle: .4 });
    const filename = `mouth-stress-${i}.png`;
    await page.screenshot({ path: path.join(output, filename) });
    captures.push({ filename, ...state });
  }
} finally {
  await browser.close();
  await writeFile(path.join(output, 'review.json'), JSON.stringify({ captures, failures }, null, 2));
}
if (failures.length) throw new Error(failures.join('\n'));
const columns = ['neutral', 'guarded', 'anxious', 'distressed', 'frowning', 'relieved'];
const label = (value, width, height, size = 18) => Buffer.from(`<svg width="${width}" height="${height}"><rect width="100%" height="100%" fill="#20242a"/><text x="10" y="${height-12}" font-family="Arial" font-size="${size}" fill="#eee">${value}</text></svg>`);
for (const speaking of [false, true]) {
  const rows = options.compare ? [path.resolve(options.compare), output] : [output];
  const width = 224, height = Math.round(width * 700 / 580), cell = height + 38;
  const layers = [{ input: label(speaking ? 'Speaking' : 'Listening', columns.length * width, 50, 22), top: 0, left: 0 }];
  for (const [row, directory] of rows.entries()) for (const [column, expression] of columns.entries()) {
    const file = path.join(directory, `${expression}-${speaking ? 'speaking' : 'listening'}.png`);
    const input = await sharp(file).extract({ left: 250, top: 190, width: 580, height: 700 }).resize(width, height).toBuffer();
    const caption = `${rows.length > 1 ? row ? 'After · ' : 'Before · ' : ''}${expression}`;
    layers.push({ input, left: column * width, top: 50 + row * cell }, { input: label(caption, width, 38), left: column * width, top: 50 + row * cell + height });
  }
  await sharp({ create: { width: columns.length * width, height: 50 + rows.length * cell, channels: 3, background: '#20242a' } }).composite(layers).png().toFile(path.join(output, speaking ? 'speaking.png' : 'listening.png'));
}
console.log(JSON.stringify({ output, captures: captures.length, failures }));

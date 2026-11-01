import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { composeReview } from './compose-patient-review.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const options = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
const models = (options.models || 'carmela-russo').split(',');
const output = path.resolve(root, options.output || 'artifacts/characters/carmela-prototype/face-lab');
const url = options.url || 'http://127.0.0.1:5186';
let server, browser;
const failures = [];
const results = [];
const studies = [
  ['neutral', {}],
  ['half-blink', { eyeBlinkLeft: .5, eyeBlinkRight: .5 }],
  ['blink', { eyeBlinkLeft: 1, eyeBlinkRight: 1 }],
  ['speech', { jawOpen: .04 }],
  ['concern', { browInnerUp: .35, mouthFrownLeft: .3, mouthFrownRight: .3 }],
  ['relief', { mouthSmileLeft: .46, mouthSmileRight: .46 }],
];
try {
  await mkdir(output, { recursive: true });
  if (!options.url) {
    server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'character-lab', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], { cwd: root, stdio: 'pipe' });
    server.stderr.on('data', (data) => process.stderr.write(data));
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error('Character Lab server exited');
      try { if ((await fetch(`${url}/face-lab.html`)).ok) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempt === 99) throw new Error('Character Lab did not start');
    }
  }
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url?.includes('/favicon.ico')) failures.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) failures.push(`${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  for (const model of models) {
    await page.goto(`${url}/face-lab.html?model=${encodeURIComponent(model)}`);
    await page.waitForFunction(() => window.__faceLab, undefined, { timeout: 60000 });
    const morphs = await page.evaluate(() => window.__faceLab.show().morphs);
    const modelStudies = morphs.includes('speechOpen')
      ? studies.filter(([name]) => name !== 'speech').concat([
        ['speech-open', { speechOpen: .30 }],
        ['speech-wide', { speechOpen: .23, speechWide: .20 }],
        ['speech-round', { speechOpen: .20, speechRound: .26 }],
      ]) : studies;
    for (const angle of [0, .55]) {
      for (const [name, weights] of modelStudies) {
        const state = await page.evaluate((parameters) => window.__faceLab.show(parameters), { weights, angle });
        if (state.head.some((value) => !Number.isFinite(value) || Math.abs(value) > 2.5)) throw new Error(`${model}/${name}: invalid head position`);
        const filename = `${model}-${name}-${angle ? 'quarter' : 'front'}.png`;
        await page.screenshot({ path: path.join(output, filename) });
        results.push({ filename, ...state });
      }
    }
    for (const [clip, time] of [['StandingIdle', 0], ['Walk', .3], ['SitDown', 0], ['SitDown', 1.4], ['SitDown', 2.7], ['ClinicIdle', 1], ['SittingTalking', 3], ['SittingSelfSoothing', 2], ['SittingDisapproval', 1], ['SittingDisbelief', 1], ['StandUp', 0], ['StandUp', .8], ['StandUp', 1.6], ['StandUp', 2.2]]) {
      const state = await page.evaluate((parameters) => window.__faceLab.show(parameters), { clip, time, view: 'body', angle: .25 });
      const filename = `${model}-${clip}-${time}.png`;
      await page.screenshot({ path: path.join(output, filename) });
      results.push({ filename, ...state });
    }
    for (const [name, angle] of [['profile', 1.4], ['rear', Math.PI]]) {
      const state = await page.evaluate((parameters) => window.__faceLab.show(parameters), { clip: 'StandingIdle', time: 1, angle });
      const filename = `${model}-hair-${name}.png`;
      await page.screenshot({ path: path.join(output, filename) });
      results.push({ filename, ...state });
    }
    for (const outfit of ['day-dress', 'work-apron']) {
      for (const palette of ['original', 'navy', 'forest', 'taupe']) {
        const state = await page.evaluate((parameters) => window.__faceLab.show(parameters), { outfit, palette, view: 'body', angle: .3 });
        const filename = `${model}-${outfit}-${palette}.png`;
        await page.screenshot({ path: path.join(output, filename) });
        results.push({ filename, ...state });
      }
    }
    if ('gallery' in options) {
      for (let identityVariant = 0; identityVariant < 7; identityVariant += 1) {
        for (const blink of [0, .5, 1]) {
          const weights = { eyeBlinkLeft: blink, eyeBlinkRight: blink };
          const state = await page.evaluate((parameters) => window.__faceLab.show(parameters), { identityVariant, weights, angle: .2 });
          const filename = `${model}-identity-${identityVariant}-blink-${blink}.png`;
          await page.screenshot({ path: path.join(output, filename) });
          results.push({ filename, ...state });
        }
      }
    }
  }
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
  await writeFile(path.join(output, 'review.json'), JSON.stringify({ models, failures, captures: results }, null, 2));
}
if (failures.length) throw new Error(failures.join('\n'));
if ('gallery' in options) await composeReview(output);
console.log(JSON.stringify({ output, captures: results.length, failures }, null, 2));

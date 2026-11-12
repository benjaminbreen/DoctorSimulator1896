#!/usr/bin/env node
// Captures a fixed set of viewpoints and writes a page that shows each one
// beside its baseline. Run it before and after a graphics change.
//
//   node game/scripts/looks.mjs --baseline     save the "before" set
//   node game/scripts/looks.mjs                capture "after", write the page
//   node game/scripts/looks.mjs --only=pond,office-desk
//
// Output is artifacts/looks/index.html. See docs/gameplay-testing.md.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { ensureGame } from '../../tools/hopper/runner.mjs';

// at: where the physician stands (x, z); the floor height is looked up.
// yaw 0 faces north (-z), positive turns left (west). pitch is radians up.
// hud: keep the interface in the picture. patient: open that consultation.
const VIEWPOINTS = [
  { id: 'park-start', zone: 'central-park', at: [82, 68], yaw: 0.785 },
  { id: 'park-start-hud', zone: 'central-park', at: [82, 68], yaw: 0.785, hud: true, camera: 'shoulder' },
  { id: 'pond', zone: 'central-park', at: [38, 62], yaw: 1.2, pitch: -0.05 },
  { id: 'plaza-hotel', zone: 'central-park', at: [88, 78], yaw: -1.35, pitch: 0.25 },
  { id: 'fifth-avenue', zone: 'central-park', at: [104, 40], yaw: -0.5, pitch: 0.1 },
  { id: 'park-edge', zone: 'central-park', at: [96, 30], yaw: 3.14, pitch: 0.08 },
  { id: 'dairy', zone: 'central-park', at: [34, -30], yaw: 0.3, pitch: 0.05 },
  { id: 'carousel', zone: 'central-park', at: [14, -38], yaw: 0.45, pitch: 0.05 },
  { id: 'park-dusk', zone: 'central-park', at: [82, 68], yaw: 0.785, hour: 19.6 },
  { id: 'park-night', zone: 'central-park', at: [88, 78], yaw: -1.35, pitch: 0.2, hour: 22 },
  { id: 'office', zone: 'consulting-office', at: [1.2, 1.2], yaw: 0 },
  { id: 'office-back', zone: 'consulting-office', at: [1.2, 1.2], yaw: Math.PI },
  { id: 'office-evening', zone: 'consulting-office', at: [1.2, 1.2], yaw: 0, hour: 20.5 },
  { id: 'waiting-room', zone: 'waiting-room', at: [1.4, 2.2], yaw: 0 },
  { id: 'laboratory', zone: 'cattell-lab', at: [1.2, 4.4], yaw: 0 },
  { id: 'consultation', zone: 'consulting-office', patient: 'Carmela Russo', hud: true },
];

const arg = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const only = arg('only', null)?.split(',');
const set = process.argv.includes('--baseline') ? 'baseline' : 'current';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'artifacts/looks');
const wanted = VIEWPOINTS.filter((view) => !only || only.includes(view.id));
if (!wanted.length) throw new Error(`No such viewpoint. Choose from: ${VIEWPOINTS.map((view) => view.id).join(', ')}`);
await mkdir(resolve(root, set), { recursive: true });

const server = arg('url', null) ? { url: arg('url'), stop() {} } : await ensureGame(5175);
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
// Fixed quality, so adaptive resolution cannot change a picture between runs.
await context.addInitScript(() => localStorage.setItem('ghosts-game.tuning.v1', JSON.stringify({
  schemaVersion: 6, values: { graphicsQuality: 'quality', pixelRatioCap: 1 },
})));
const page = await context.newPage();
page.setDefaultTimeout(120000);

// The same readiness test as gameplay-playtest.mjs; keep the two in step.
async function ready() {
  await page.waitForFunction(() => window.__game?.stats.boot.complete
    && __game.loadedZone === __game.tuning.zone
    && (__game.stats.parkStream?.idle ?? true)
    && __game.actors.requested.every((id) => __game.actors.loaded.includes(id)));
  await page.locator('.park-intro').waitFor({ state: 'detached' });
}

let loaded = null;
async function open(zone) {
  const url = new URL(server.url);
  for (const [key, value] of Object.entries({ playtest: 1, seed: 4, zone, parkNear: 1 })) url.searchParams.set(key, value);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await ready();
  loaded = zone;
}

try {
  for (const view of wanted) {
    const started = Date.now();
    // A consultation or a changed hour leaves state behind, so start clean.
    if (loaded !== view.zone || view.patient || view.hour !== undefined || loaded === null) await open(view.zone);
    if (view.patient) {
      await page.getByRole('button', { name: `Open the casebook for ${view.patient}`, exact: false }).click();
      await page.getByRole('button', { name: `Ask ${view.patient} to return`, exact: false }).click();
      await page.getByLabel('Ask in your own words', { exact: true }).waitFor();
      await ready();
      // The patient walks in and sits before the picture is taken.
      await page.waitForTimeout(20000);
      loaded = null;
    } else {
      // Leaving the opening camera, or changing the hour, resets the heading a
      // moment later, so both settle before the look is set.
      await page.evaluate(({ hour, camera = 'first' }) => {
        if (hour !== undefined) __game.set('timeOfDay', hour);
        __game.set('cameraMode', camera);
      }, view);
      await page.waitForTimeout(500);
      await page.evaluate(async ({ at: [x, z], yaw, pitch = 0 }) => {
        const { terrainHeight } = await import('/src/world/terrain.js');
        const floor = __game.tuning.zone === 'central-park' ? terrainHeight(x, z) : 0;
        __game.teleport(x, floor + 0.3, z);
        __game.pendingYaw = yaw;
        __game.setLook(yaw, pitch);
      }, view);
      if (view.hour !== undefined) loaded = null;
      // Let the teleport land and the stream notice the new position.
      await page.waitForTimeout(600);
      await ready();
    }
    // Lights, shadows and fine textures settle over the next few frames.
    await page.waitForTimeout(1500);
    const hide = view.hud ? null
      : await page.addStyleTag({ content: 'body *:not(canvas):not(:has(canvas)) { visibility: hidden !important; opacity: 0 !important; }' });
    await page.screenshot({ path: resolve(root, set, `${view.id}.png`) });
    await hide?.evaluate((node) => node.remove());
    console.log(`${view.id}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
} finally {
  await browser.close();
  server.stop();
}

const have = async (name) => new Set(await readdir(resolve(root, name)).catch(() => []));
const [before, after] = [await have('baseline'), await have('current')];
const cell = (name, file, present) => (present
  ? `<a href="${name}/${file}"><img loading="lazy" src="${name}/${file}?t=${Date.now()}"></a>`
  : '<p class="none">not captured</p>');
await writeFile(resolve(root, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Looks</title>
<style>
body { margin: 16px; background: #1b1b1b; color: #ddd; font: 14px system-ui; }
h2 { margin: 20px 0 6px; font-size: 15px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
img { width: 100%; display: block; }
.none { color: #888; }
</style>
<p>Left: baseline. Right: current. Click a picture for full size.</p>
${VIEWPOINTS.map(({ id }) => `<h2>${id}</h2><div class="row">${cell('baseline', `${id}.png`, before.has(`${id}.png`))}${cell('current', `${id}.png`, after.has(`${id}.png`))}</div>`).join('\n')}
`);
console.log(resolve(root, 'index.html'));

#!/usr/bin/env node

// Repeatable visual gate for the outdoor dusk/night pipeline. It uses one
// fixed street-and-park camera, the shipped outdoor preset, and no Hopper
// lighting overrides. Chrome is closed before the script exits.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { ensureGame, ensureZone } from './runner.mjs';
import { solarRamps, START_DAY_OF_YEAR } from '../../game/src/world/solar.js';
import { moonState } from '../../game/src/world/moon.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out', 'night-lighting-validation-2026-08-13');
const portFlag = process.argv.indexOf('--port');
const port = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 5175;

if (!Number.isFinite(port)) throw new Error('--port must be numeric');

const CAMERA = {
  position: [109.4147128846481, 2.3369942739703884, 62.00645279724495],
  yaw: 0.1370498157881326,
  pitch: -0.03859390140227922,
  fov: 28.790526458993554,
};

const CASES = [
  ...[17.8, 18.5, 19, 19.5, 20, 21.3, 23].map((time) => ({
    id: `opening-${String(time).replace('.', '-')}`,
    day: START_DAY_OF_YEAR,
    time,
    cloudCover: 0.52,
    cloudCumulus: 0.5,
  })),
  {
    id: 'visible-moon',
    day: 234,
    time: 22,
    cloudCover: 0.2,
    cloudCumulus: 0.55,
  },
  {
    id: 'cloudy-night',
    day: START_DAY_OF_YEAR,
    time: 21.3,
    cloudCover: 0.92,
    cloudCumulus: 0.25,
  },
];

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    let frames = 10;
    const tick = () => {
      frames -= 1;
      if (frames > 0) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  }));
  await page.waitForTimeout(80);
}

async function main() {
  await mkdir(path.join(OUT, 'frames'), { recursive: true });
  const game = await ensureGame(port);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  const manifest = [];
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
    await page.addInitScript(() => localStorage.removeItem('ghosts-game.tuning.v1'));
    page.on('pageerror', (error) => console.error(error.stack ?? error.message));
    await page.goto(`${game.url}?shot=1`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__shot?.ready, null, { timeout: 90000 });
    await ensureZone(page, 'central-park');
    const canvas = page.locator('canvas').first();

    for (const spec of CASES) {
      await page.evaluate((next) => {
        window.__game.set('dayOfYear', next.day);
        window.__shot.apply({
          camera: next.camera,
          figure: {
            position: [109, 47],
            yaw: -Math.PI / 2,
            visible: false,
            pose: 'still',
          },
          tuning: {
            timeOfDay: next.time,
            cloudCover: next.cloudCover,
            cloudCumulus: next.cloudCumulus,
            cloudSpeed: 0,
          },
          meta: { composition: 'architecture' },
        });
      }, { ...spec, camera: CAMERA });
      await settle(page);
      const file = `frames/${spec.id}.png`;
      await canvas.screenshot({ path: path.join(OUT, file), type: 'png' });
      const sun = solarRamps(spec.time, spec.day);
      const moon = moonState(spec.time, spec.day);
      manifest.push({
        ...spec,
        frame: file,
        sunAltitude: sun.altitude,
        twilight: sun.twilight,
        moonAltitude: moon.altitude,
        moonIllumination: moon.illumination,
        moonLight: moon.light,
      });
      console.log(`${spec.id}: sun ${sun.altitude.toFixed(1)}°, moon ${moon.altitude.toFixed(1)}°`);
    }
    await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ camera: CAMERA, cases: manifest }, null, 2));
  } finally {
    await browser.close();
    game.stop();
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});

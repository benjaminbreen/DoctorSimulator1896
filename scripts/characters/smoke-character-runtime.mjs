// Boot the game and verify that both Phase 1 Renderer C actors load.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const GAME_URL = 'http://127.0.0.1:5175/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function reachable() {
  try {
    const response = await fetch(GAME_URL, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await reachable())) {
  server = spawn('npm', ['--prefix', 'game', 'run', 'dev'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  for (let attempt = 0; attempt < 60 && !(await reachable()); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
if (!(await reachable())) throw new Error('game server did not start on port 5175');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
const failures = [];
page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
    failures.push(`console: ${message.text()}`);
  }
});
page.on('requestfailed', (request) => {
  if (!request.url().endsWith('/favicon.ico')) failures.push(`request: ${request.url()} ${request.failure()?.errorText || ''}`);
});

try {
  await page.addInitScript(() => localStorage.removeItem('ghosts-game.tuning.v1'));
  await page.goto(`${GAME_URL}?shot=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => Boolean(window.__game?.set), null, { timeout: 30000 });
  if (await page.evaluate(() => window.__game.tuning.zone !== 'consulting-office')) {
    await page.evaluate(() => window.__game.set('zone', 'consulting-office'));
  }
  try {
    await page.waitForFunction(
      () => window.__game?.actors?.requested?.length > 0
        && window.__game.actors.loaded.length === window.__game.actors.requested.length,
      null,
      { timeout: 30000 },
    );
  } catch (error) {
    const state = await page.evaluate(() => ({
      zone: window.__game?.tuning?.zone,
      actors: window.__game?.actors,
      resources: performance.getEntriesByType('resource')
        .filter((entry) => entry.name.includes('renderer-c'))
        .map((entry) => ({ name: entry.name, bytes: entry.transferSize, duration: entry.duration })),
      sceneNames: (() => {
        const names = [];
        window.__game?.scene?.traverse((object) => {
          if (object.name && /RendererC|Human_Body|Patient_Rig/.test(object.name)) names.push(object.name);
        });
        return names.slice(0, 30);
      })(),
    }));
    throw new Error(`${error.message}\n${JSON.stringify(state)}\n${failures.join('\n')}`);
  }
  await page.waitForTimeout(750);
  await page.evaluate(() => {
    window.__game.freeCamera = { position: [1.3, 1.9, 0.5], yaw: 0.83, pitch: -0.24 };
  });
  await page.waitForTimeout(250);
  const inspect = () => page.evaluate(() => {
    let skinnedMeshes = 0;
    let visibleMeshes = 0;
    window.__game.scene?.traverse((object) => {
      if (object.isSkinnedMesh) skinnedMeshes += 1;
      if (object.isMesh && object.visible) visibleMeshes += 1;
    });
    return { actors: window.__game.actors, skinnedMeshes, visibleMeshes };
  });
  const woman = await inspect();
  if (woman.skinnedMeshes < 1) failures.push(`woman: only ${woman.skinnedMeshes} skinned meshes found`);
  await page.locator('canvas').first().screenshot({ path: '/tmp/ghosts-phase1-woman.png' });

  const switched = await page.evaluate(() => window.__game.showActor('phase1-man'));
  if (!switched) failures.push('debug actor switch rejected phase1-man');
  await page.waitForFunction(
    () => window.__game?.actors?.requested?.[0] === 'phase1-man'
      && window.__game.actors.loaded.includes('phase1-man'),
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(500);
  const man = await inspect();
  if (man.skinnedMeshes < 1) failures.push(`man: only ${man.skinnedMeshes} skinned meshes found`);
  await page.locator('canvas').first().screenshot({ path: '/tmp/ghosts-phase1-man.png' });
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ woman, man, screenshots: ['/tmp/ghosts-phase1-woman.png', '/tmp/ghosts-phase1-man.png'] }));
} finally {
  await browser.close();
  server?.kill();
}

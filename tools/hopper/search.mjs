#!/usr/bin/env node
// Hopper shot search: render, score, keep the best.
//
// Random search over camera, figure and lighting, then a short hill-climb on
// the leaders. No policy network and no training — the reward is immediate,
// so the only thing worth doing is sampling the space well.
//
//   python3 tools/hopper/score_server.py &
//   node tools/hopper/search.mjs --samples 400
//
// Writes tools/hopper/out/<run>/ with the winning frames, their shot files,
// and a jsonl of every sample.

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { makeRng, sampleGroundPoints, assembleShot, perturb } from './space.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

function parseArgs(argv) {
  const args = {
    zone: 'consulting-office',
    samples: 300,
    climb: 6,
    keep: 12,
    seed: 1,
    width: 900,
    height: 600,
    gamePort: 5175,
    scorer: 'http://127.0.0.1:8777',
    headed: false,
    noFrames: false,
  };
  const flags = { headed: 'headed', 'no-frames': 'noFrames' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    if (flags[key]) {
      args[flags[key]] = true;
      continue;
    }
    const value = argv[i + 1];
    i += 1;
    args[key] = key in args && typeof args[key] === 'number' ? Number(value) : value;
  }
  return args;
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

// Reuse a dev server if one is already up; otherwise run our own and stop it
// on the way out.
async function ensureGame(port) {
  const url = `http://127.0.0.1:${port}/`;
  if (await reachable(url)) return { url, stop: () => {} };
  const child = spawn('npm', ['--prefix', 'game', 'run', 'dev'], { cwd: REPO, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (await reachable(url)) return { url, stop: () => child.kill() };
  }
  child.kill();
  throw new Error(`dev server did not come up on ${url}`);
}

async function score(scorerUrl, png, probe) {
  const response = await fetch(`${scorerUrl}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ png_b64: png.toString('base64'), probe }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`scorer: ${body.error}`);
  return body;
}

// The teleport consumes a frame on its own, the controller resolves on the
// next, and shadows and the avatar pose follow.
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 4;
        const tick = () => {
          frames -= 1;
          if (frames > 0) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.waitForTimeout(50);
}

async function render(page, canvas, shot) {
  await page.evaluate((s) => window.__shot.apply(s), shot);
  await settle(page);
  const probe = await page.evaluate(() => window.__shot.probe());
  const png = await canvas.screenshot({ type: 'png' });
  return { probe, png };
}

// A vite hot reload -- someone editing the game while a search runs -- tears
// down the page mid-shot. Reload and carry on rather than lose the run.
async function renderResilient(page, canvas, shot, url, zone) {
  try {
    return await render(page, canvas, shot);
  } catch (error) {
    if (!/context|destroyed|navigat|Target closed/i.test(error.message)) throw error;
    console.log('  page reloaded under us; recovering');
    await page.goto(`${url}?shot=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shot?.ready, null, { timeout: 90000 });
    await ensureZone(page, zone);
    return render(page, canvas, shot);
  }
}

async function ensureZone(page, zone) {
  if ((await page.evaluate(() => window.__shot.world().zone)) === zone) return;
  await page.evaluate((z) => window.__game.set('zone', z), zone);
  await page.waitForTimeout(600);
  await page.waitForFunction(
    (z) => window.__shot?.ready && window.__shot.world().zone === z,
    zone,
    { timeout: 90000 },
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(await reachable(`${args.scorer}/health`))) {
    throw new Error(`no scorer at ${args.scorer} — start tools/hopper/score_server.py first`);
  }
  const health = await (await fetch(`${args.scorer}/health`)).json();
  console.log(`scorer ready (clip: ${health.clip ?? 'off'})`);

  const game = await ensureGame(args.gamePort);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !args.headed,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
  // Stored tuning would carry state between runs; a run should depend only on
  // its seed.
  await page.addInitScript(() => localStorage.removeItem('ghosts-game.tuning.v1'));
  page.on('pageerror', (error) => console.error('page error:', error.message));

  await page.goto(`${game.url}?shot=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shot?.ready, null, { timeout: 60000 });

  const zoneList = String(args.zone).split(',').map((z) => z.trim()).filter(Boolean);
  const canvas = page.locator('canvas').first();
  const rng = makeRng(Number(args.seed));

  // Legality is decided in the page, where the collision boxes and the
  // terrain live. Outdoors, points far from any path are mostly thinned out:
  // the park is 330m across and most of it is lawn with nothing in frame.
  async function legalPoints(bounds, count, kind, exterior) {
    const wanted = [];
    let attempts = 0;
    while (wanted.length < count && attempts < 40) {
      attempts += 1;
      const batch = sampleGroundPoints(rng, bounds, count * 3);
      const probed = await page.evaluate(
        ([points, k]) => window.__shot.sample(points, k),
        [batch, kind],
      );
      batch.forEach(([x, z], i) => {
        const result = probed[i];
        if (!result.legal || wanted.length >= count) return;
        if (exterior && result.pathDistance > 10 && rng() > 0.25) return;
        wanted.push({ x, z, ground: result.ground });
      });
    }
    if (wanted.length < count) throw new Error(`only found ${wanted.length}/${count} legal ${kind} points`);
    return wanted;
  }

  const runId = `${zoneList.join('+')}-seed${args.seed}-${String(args.samples)}`;
  const outDir = path.join(HERE, 'out', runId);
  const frameDir = path.join(outDir, 'frames');
  await mkdir(frameDir, { recursive: true });
  // Every frame is kept, not just the winners: rating only the top of the
  // range teaches a reward model nothing about the bottom of it.
  let frameIndex = 0;
  const keepFrame = async (png) => {
    if (args.noFrames) return null;
    const name = `${String(frameIndex++).padStart(5, '0')}.png`;
    await writeFile(path.join(frameDir, name), png);
    return `frames/${name}`;
  };
  const log = [];
  const results = [];
  const started = Date.now();

  // Zones run one at a time, splitting the budget: a zone change remounts the
  // canvas, so switching per sample would cost more than the render.
  const perZone = Math.max(1, Math.round(Number(args.samples) / zoneList.length));
  for (const zone of zoneList) {
    await ensureZone(page, zone);
    const world = await page.evaluate(() => window.__shot.world());
    const { bounds, exterior } = world;
    console.log(
      `\nzone ${world.zone}${exterior ? ' (exterior)' : ''}: ${world.windows.length} windows, ` +
        `${(bounds.maxX - bounds.minX).toFixed(0)}x${(bounds.maxZ - bounds.minZ).toFixed(0)}m, ${perZone} samples`,
    );
    const cameraPoints = await legalPoints(bounds, perZone, 'camera', exterior);
    const figurePoints = await legalPoints(bounds, perZone, 'figure', exterior);

    for (let i = 0; i < perZone; i += 1) {
      const shot = assembleShot(rng, bounds, cameraPoints[i], figurePoints[i], exterior);
      const { probe, png } = await renderResilient(page, canvas, shot, game.url, zone);
      const scored = await score(args.scorer, png, probe);
      const frame = await keepFrame(png);
      results.push({ zone, bounds, shot, probe, ...scored, png });
      log.push(JSON.stringify({ zone, frame, total: scored.total, parts: scored.parts, shot }));
      if ((i + 1) % 25 === 0) {
        const rate = results.length / ((Date.now() - started) / 1000);
        console.log(`  ${i + 1}/${perZone}  best ${Math.max(...results.map((r) => r.total)).toFixed(3)}  ${rate.toFixed(1)}/s`);
      }
    }
  }

  // Hill-climb the leaders: random search finds the neighbourhood, this finds
  // the frame within it. Grouped by zone so the canvas remounts once, not
  // once per climber.
  results.sort((a, b) => b.total - a.total);
  const climbers = results.slice(0, Math.max(4, zoneList.length * 2));
  for (const zone of zoneList) {
    const forZone = climbers.filter((c) => c.zone === zone);
    if (forZone.length === 0) continue;
    await ensureZone(page, zone);
    for (const climber of forZone) {
      let current = climber;
      for (let step = 0; step < Number(args.climb); step += 1) {
        const scale = 1 - step / (Number(args.climb) + 1);
        const candidate = perturb(rng, current.shot, scale, climber.bounds);
        const { probe, png } = await renderResilient(page, canvas, candidate, game.url, zone);
        const scored = await score(args.scorer, png, probe);
        const frame = await keepFrame(png);
        const entry = { zone, bounds: climber.bounds, shot: candidate, probe, ...scored, png };
        results.push(entry);
        log.push(JSON.stringify({ zone, frame, climb: true, total: scored.total, parts: scored.parts, shot: candidate }));
        if (scored.total > current.total) current = entry;
      }
      console.log(`climbed ${zone} ${climber.total.toFixed(3)} -> ${current.total.toFixed(3)}`);
    }
  }

  // The hill-climb leaves clusters of near-identical frames at the top, which
  // makes a contact sheet of one shot eight times. Keep the best of each.
  results.sort((a, b) => b.total - a.total);
  const top = [];
  for (const entry of results) {
    if (top.length >= Number(args.keep)) break;
    const camera = entry.shot.camera;
    const duplicate = top.some((kept) => {
      const other = kept.shot.camera;
      const distance = Math.hypot(
        camera.position[0] - other.position[0],
        camera.position[1] - other.position[1],
        camera.position[2] - other.position[2],
      );
      const turn = Math.abs(((camera.yaw - other.yaw + Math.PI) % (Math.PI * 2)) - Math.PI);
      return kept.zone === entry.zone && distance < 1.5 && turn < 0.45;
    });
    if (!duplicate) top.push(entry);
  }
  await Promise.all(
    top.flatMap((entry, index) => {
      const stem = path.join(outDir, `top-${String(index + 1).padStart(2, '0')}`);
      return [
        writeFile(`${stem}.png`, entry.png),
        writeFile(
          `${stem}.json`,
          JSON.stringify({ zone: entry.zone, total: entry.total, parts: entry.parts, probe: entry.probe, shot: entry.shot }, null, 2),
        ),
      ];
    }),
  );
  await writeFile(path.join(outDir, 'all.jsonl'), `${log.join('\n')}\n`);

  console.log(`\ntop ${top.length} written to ${path.relative(REPO, outDir)}`);
  for (const [index, entry] of top.slice(0, 5).entries()) {
    const parts = Object.entries(entry.parts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(', ');
    console.log(`  ${index + 1}. ${entry.total.toFixed(3)}  ${entry.zone}  (${parts})`);
  }

  await browser.close();
  game.stop();

  await new Promise((resolve) => {
    const sheet = spawn('python3', [path.join(HERE, 'contact_sheet.py'), outDir], { stdio: 'inherit' });
    sheet.on('close', resolve);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

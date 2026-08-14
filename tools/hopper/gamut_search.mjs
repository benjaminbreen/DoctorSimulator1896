#!/usr/bin/env node
// Capture a balanced, resumable Hopper gamut without running CLIP at the same
// time as WebGL. Run four 15-frame batches, then score_gamut.py once Chrome is
// gone. Every screenshot is durable before the next one starts.

import { appendFile, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
  SHADOW_FAMILIES,
  SUN_AZIMUTH_SECTORS,
  TIME_BANDS,
  VIBE_FAMILIES,
  aimAt,
  assembleShot,
  makeRng,
  sampleElevatedCameraCandidates,
  sampleGroundPoints,
  sampleRooftopSubjectCandidates,
} from './space.mjs';
import { buildGamutPlan, familyTargets } from './gamut_plan.mjs';
import { ensureGame, ensureZone, renderResilient } from './runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    run: 'hopper-gamut-60',
    total: 60,
    batchIndex: 0,
    batchSize: 15,
    seed: 1,
    width: 900,
    height: 600,
    gamePort: 5176,
    reset: false,
    planOnly: false,
    replace: false,
  };
  const flags = { reset: 'reset', replace: 'replace', 'plan-only': 'planOnly' };
  const aliases = {
    'batch-index': 'batchIndex',
    'batch-size': 'batchSize',
    'game-port': 'gamePort',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index].replace(/^--/, '');
    if (flags[key]) {
      args[flags[key]] = true;
      continue;
    }
    const destination = aliases[key] ?? key;
    if (!(destination in args)) throw new Error(`unknown argument --${key}`);
    const value = argv[++index];
    if (value == null) throw new Error(`missing value for --${key}`);
    args[destination] = destination === 'run' ? value : Number(value);
  }
  for (const key of ['total', 'batchIndex', 'batchSize', 'seed', 'width', 'height', 'gamePort']) {
    if (!Number.isFinite(args[key])) throw new Error(`--${key} must be numeric`);
  }
  if (args.total <= 0 || args.batchSize <= 0 || args.batchIndex < 0) {
    throw new Error('total and batch size must be positive; batch index cannot be negative');
  }
  return args;
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length) % values.length];
}

async function legalRandomPoints(page, rng, bounds, count, kind, setting = null) {
  const found = [];
  for (let attempt = 0; attempt < 50 && found.length < count; attempt += 1) {
    const batch = sampleGroundPoints(rng, bounds, Math.max(18, count * 6));
    const probed = await page.evaluate(
      ([points, pointKind]) => window.__shot.sample(points, pointKind),
      [batch, kind],
    );
    batch.forEach(([x, z], index) => {
      const result = probed[index];
      if (!result.legal || found.length >= count) return;
      if (setting && result.setting !== setting) return;
      found.push({ x, z, ...result, stratum: 'ground' });
    });
  }
  if (found.length < count) throw new Error(`only found ${found.length}/${count} legal ${setting ?? ''} ${kind} points`);
  return found;
}

async function cameraNear(page, rng, bounds, target, setting = null) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidates = Array.from({ length: 24 }, () => {
      const angle = rng() * Math.PI * 2;
      const distance = 4.5 + rng() * (setting ? 18 : 8);
      return [
        target[0] + Math.sin(angle) * distance,
        target[2] + Math.cos(angle) * distance,
      ];
    });
    const probed = await page.evaluate(
      (points) => window.__shot.sample(points, 'camera'),
      candidates,
    );
    const legal = candidates.map(([x, z], index) => ({ x, z, ...probed[index], stratum: 'ground' }))
      .filter((point) => point.legal && (!setting || point.setting === setting));
    if (legal.length) return pick(rng, legal);
  }
  const [fallback] = await legalRandomPoints(page, rng, bounds, 1, 'camera', setting);
  return fallback;
}

async function windowFigure(page, rng, world) {
  const windows = [...world.windows].sort(() => rng() - 0.5);
  const candidates = [];
  for (const window of windows) {
    const [nx = 0, , nz = 0] = window.normal ?? [0, 0, 1];
    const length = Math.hypot(nx, nz) || 1;
    const normal = [nx / length, nz / length];
    const tangent = [-normal[1], normal[0]];
    // Rooms do not all leave the same clearance around their windows. Probe
    // several inward/outward distances so desks, radiators, and deep reveals
    // do not eliminate an otherwise useful window composition.
    for (const sign of [-1, 1]) {
      for (const distance of [0.8, 1.2, 1.7, 2.3]) {
        const side = (rng() * 2 - 1) * Math.min(0.7, window.width * 0.22);
        candidates.push({
          window,
          x: window.position[0] + normal[0] * sign * distance + tangent[0] * side,
          z: window.position[2] + normal[1] * sign * distance + tangent[1] * side,
        });
      }
    }
  }
  const probed = await page.evaluate(
    (points) => window.__shot.sample(points, 'figure'),
    candidates.map((candidate) => [candidate.x, candidate.z]),
  );
  const legal = candidates.map((candidate, index) => ({ ...candidate, ...probed[index] }))
    .filter((candidate) => candidate.legal);
  if (!legal.length) throw new Error(`zone ${world.zone} has no legal figure placement beside a window`);
  const selected = pick(rng, legal);
  const yaw = aimAt(
    [selected.x, selected.ground, selected.z],
    selected.window.position,
  ).yaw;
  return { ...selected, yaw };
}

async function elevatedCamera(page, rng, world, stratum) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidates = sampleElevatedCameraCandidates(rng, world.architecture, 24, stratum);
    const probed = await page.evaluate(
      (positions) => window.__shot.sampleCameraPositions(positions),
      candidates.map((candidate) => [candidate.x, candidate.y, candidate.z]),
    );
    const legal = candidates.map((candidate, index) => ({ ...candidate, ...probed[index] }))
      .filter((candidate) => candidate.legal);
    if (legal.length) return pick(rng, legal);
  }
  throw new Error(`could not place a legal ${stratum} camera in ${world.zone}`);
}

function doorwayFigure(rng, entrance) {
  const [x, ground, z] = entrance.position;
  const [nx = 0, , nz = 1] = entrance.normal ?? [0, 0, 1];
  // Turn partly toward the street rather than stare flat into the door. The
  // side alternation gives profile and three-quarter variants.
  const inward = [x - nx, ground + 0.9, z - nz];
  const inwardYaw = aimAt([x, ground + 0.9, z], inward).yaw;
  return {
    x,
    z,
    ground,
    yaw: inwardYaw + (rng() < 0.5 ? -1 : 1) * (0.38 + rng() * 0.42),
    entranceId: entrance.id,
    normal: [nx, nz],
  };
}

async function doorwayCamera(page, rng, figure) {
  const [nx, nz] = figure.normal;
  const tangent = [-nz, nx];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidates = Array.from({ length: 24 }, () => {
      const distance = 5 + rng() * 7;
      const side = (rng() * 2 - 1) * Math.min(3.2, distance * 0.28);
      return [
        figure.x + nx * distance + tangent[0] * side,
        figure.z + nz * distance + tangent[1] * side,
      ];
    });
    const probed = await page.evaluate(
      (points) => window.__shot.sample(points, 'camera'),
      candidates,
    );
    const legal = candidates
      .map(([x, z], index) => ({ x, z, ...probed[index], stratum: 'ground' }))
      .filter((candidate) => candidate.legal);
    if (legal.length) return pick(rng, legal);
  }
  return null;
}

async function doorwayPlacement(page, rng, world) {
  if (!world.entrances?.length) throw new Error(`zone ${world.zone} has no doorway anchors`);
  const shuffle = (rows) => {
    const result = [...rows];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  };
  // Raised stoops make the requested doorway/steps relationship legible.
  // Ground-level doors remain a fallback when their camera geometry is safer.
  const entrances = [
    ...shuffle(world.entrances.filter((entrance) => entrance.raised)),
    ...shuffle(world.entrances.filter((entrance) => !entrance.raised)),
  ];
  for (const entrance of entrances) {
    const figure = doorwayFigure(rng, entrance);
    const camera = await doorwayCamera(page, rng, figure);
    if (camera) return { figure, camera };
  }
  throw new Error(`zone ${world.zone} has no doorway with a legal exterior camera`);
}

function rooftopFigure(rng, world, camera) {
  const nearbyRoofs = world.architecture.filter((anchor) => {
    if (anchor.id === camera.anchorId) return false;
    const distance = Math.hypot(anchor.position[0] - camera.x, anchor.position[2] - camera.z);
    return distance >= 10 && distance <= 38 && Math.abs(anchor.roofY - camera.y) <= 12;
  });
  const sameRoof = world.architecture.filter((anchor) => anchor.id === camera.anchorId);
  const candidates = sampleRooftopSubjectCandidates(
    rng,
    nearbyRoofs.length ? nearbyRoofs : (sameRoof.length ? sameRoof : world.architecture),
    96,
  );
  if (!candidates.length) throw new Error(`zone ${world.zone} has no rooftop figure anchors`);
  const separated = candidates.filter((candidate) => {
    const distance = Math.hypot(candidate.x - camera.x, candidate.z - camera.z);
    return distance >= (nearbyRoofs.length ? 10 : 4) && distance <= (nearbyRoofs.length ? 36 : 28);
  });
  if (separated.length) return pick(rng, separated);
  const nearby = candidates.filter((candidate) => (
    Math.hypot(candidate.x - camera.x, candidate.z - camera.z) <= 40
  ));
  return pick(rng, nearby.length ? nearby : candidates);
}

function factorById(values, id, fallback) {
  return values.find((value) => value.id === id) ?? { id: fallback, range: null };
}

async function makeShot(page, rng, world, task) {
  const timeBand = factorById(TIME_BANDS, task.timeBand, 'morning');
  const vibe = factorById(VIBE_FAMILIES, task.vibe, 'raking-clarity');
  const shadowFamily = factorById(SHADOW_FAMILIES, task.shadowFamily, 'profile');
  const sunAzimuthSector = factorById(SUN_AZIMUTH_SECTORS, task.sunAzimuthSector, 'physical');
  let camera;
  let figure;
  let target = null;
  let subject = null;

  if (task.family === 'park-landscape') {
    [camera] = await legalRandomPoints(page, rng, world.bounds, 1, 'camera', 'park');
    const targets = await legalRandomPoints(page, rng, world.bounds, 8, 'figure', 'park');
    const plausible = targets.filter((point) => Math.hypot(point.x - camera.x, point.z - camera.z) > 9);
    figure = pick(rng, plausible.length ? plausible : targets);
    target = [figure.x, figure.ground + 1.5, figure.z];
  } else if (task.family === 'park-people' || task.family === 'street-people') {
    const setting = task.family === 'street-people' ? 'street' : 'park';
    const settingPeople = world.people.filter((person) => person.setting === setting);
    const preferred = task.subjectGender
      ? settingPeople.filter((person) => person.gender === task.subjectGender)
      : settingPeople;
    const people = preferred.length ? preferred : settingPeople;
    if (!people.length) throw new Error(`no existing ${setting} pedestrians are ready`);
    subject = pick(rng, people);
    camera = await cameraNear(page, rng, world.bounds, subject.position, setting);
    figure = {
      x: subject.position[0],
      z: subject.position[2],
      ground: subject.position[1],
      yaw: subject.yaw,
    };
    target = [subject.position[0], subject.position[1] + 0.9, subject.position[2]];
  } else if (task.family === 'window-figure') {
    if (!world.windows.length) throw new Error(`zone ${world.zone} has no windows for window-figure`);
    figure = await windowFigure(page, rng, world);
    camera = await cameraNear(page, rng, world.bounds, [figure.x, figure.ground, figure.z]);
    target = [figure.x, figure.ground + 0.9, figure.z];
  } else if (task.family === 'doorway-figure') {
    ({ figure, camera } = await doorwayPlacement(page, rng, world));
    target = [figure.x, figure.ground + 0.9, figure.z];
  } else if (task.family === 'rooftop-figure') {
    camera = await elevatedCamera(page, rng, world, 'rooftop');
    figure = rooftopFigure(rng, world, camera);
    target = [figure.x, figure.ground + 0.9, figure.z];
  } else if (task.family === 'elevated-architecture') {
    camera = await elevatedCamera(page, rng, world, task.cameraStratum);
    const [fallback] = await legalRandomPoints(page, rng, world.bounds, 1, 'figure', 'street');
    figure = fallback;
    if (camera.outward) {
      target = [
        camera.x + camera.outward[0] * 80,
        camera.y - 0.4,
        camera.z + camera.outward[1] * 80,
      ];
    }
  } else {
    [camera] = await legalRandomPoints(page, rng, world.bounds, 1, 'camera');
    figure = (await legalRandomPoints(page, rng, world.bounds, 1, 'figure'))[0];
  }

  camera.stratum = task.cameraStratum;
  const shot = assembleShot(rng, world.bounds, camera, figure, world.exterior, {
    timeBand,
    vibe,
    composition: task.composition,
    windows: world.windows,
    architecture: task.family === 'park-landscape' ? [] : world.architecture,
    shadowFamily,
    sunAzimuthSector,
    target,
    subject,
    subjectArchetype: task.subjectArchetype,
    subjectScenario: task.subjectScenario ?? task.family,
    sceneFamily: task.family,
  });
  if (task.family === 'rooftop-figure') shot.camera.fov = Math.min(34, shot.camera.fov);
  if (task.family === 'elevated-architecture' || task.family === 'rooftop-figure') {
    // Evening roof materials otherwise collapse to near-black even when the
    // sky remains visible. Keep nocturnes moody, but still judgeable.
    shot.tuning.exposure = Math.max(0.95, shot.tuning.exposure);
    shot.tuning.ambientIntensity = Math.max(0.16, shot.tuning.ambientIntensity);
    shot.tuning.skyFill = Math.max(0.75, shot.tuning.skyFill ?? 0);
    shot.tuning.groundBounce = Math.max(0.28, shot.tuning.groundBounce ?? 0);
    if (task.timeBand === 'evening') {
      shot.tuning.moonlightIntensity = Math.max(0.7, shot.tuning.moonlightIntensity ?? 0);
      shot.tuning.citySkyGlow = Math.max(0.75, shot.tuning.citySkyGlow ?? 0);
    }
  }
  return shot;
}

async function prepareTaskWorld(page, task) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ensureZone(page, task.zone);
    if (task.family.endsWith('people')) {
      await page.waitForFunction(
        (zone) => window.__shot.world().zone === zone && window.__shot.world().people.length > 0,
        task.zone,
        { timeout: 90000 },
      );
    }
    if (['window-figure', 'doorway-figure', 'rooftop-figure'].includes(task.family)) {
      await page.waitForFunction(
        (zone) => window.__shot.world().zone === zone && window.__shot.world().shotWomanReady,
        task.zone,
        { timeout: 90000 },
      );
    }
    const world = await page.evaluate(() => window.__shot.world());
    if (world.zone === task.zone) return world;
    console.log(`  zone reloaded as ${world.zone}; restoring ${task.zone}`);
  }
  throw new Error(`could not stabilize zone ${task.zone}`);
}

async function resetRun(outDir) {
  const frameDir = path.join(outDir, 'frames');
  await mkdir(frameDir, { recursive: true });
  for (const name of await readdir(frameDir)) {
    if (/^\d+\.png$/.test(name)) await unlink(path.join(frameDir, name));
  }
  for (const name of await readdir(outDir)) {
    if (/^(?:all\.jsonl|manifest\.json|contact-sheet\.png|top-\d+\.(?:png|json))$/.test(name)) {
      await unlink(path.join(outDir, name));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildGamutPlan(args.total, args.seed);
  if (args.planOnly) {
    console.log(JSON.stringify({ total: plan.length, targets: familyTargets(args.total), plan }, null, 2));
    return;
  }
  const start = args.batchIndex * args.batchSize;
  const tasks = plan.slice(start, Math.min(plan.length, start + args.batchSize));
  if (!tasks.length) throw new Error(`batch ${args.batchIndex} starts beyond ${plan.length} tasks`);

  const outDir = path.join(HERE, 'out', args.run);
  const frameDir = path.join(outDir, 'frames');
  await mkdir(frameDir, { recursive: true });
  if (args.reset) await resetRun(outDir);
  const logPath = path.join(outDir, 'all.jsonl');
  const existing = new Map();
  try {
    const raw = await readFile(logPath, 'utf8');
    raw.split('\n').filter(Boolean).forEach((line) => {
      const entry = JSON.parse(line);
      existing.set(entry.sampleIndex, entry);
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (args.replace) {
    const selected = new Set(tasks.map((task) => task.index));
    for (const index of selected) existing.delete(index);
    const retained = [...existing.values()].sort((left, right) => left.sampleIndex - right.sampleIndex);
    await writeFile(logPath, retained.map((entry) => JSON.stringify(entry)).join('\n') + (retained.length ? '\n' : ''));
  }

  const game = await ensureGame(args.gamePort);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
    await page.addInitScript(() => localStorage.removeItem('ghosts-game.tuning.v1'));
    page.on('pageerror', (error) => console.error('page error:', error.stack ?? error.message));
    await page.goto(`${game.url}?shot=1`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.__shot?.ready, null, { timeout: 90000 });
    const canvas = page.locator('canvas').first();

    for (const task of tasks) {
      if (existing.has(task.index)) {
        console.log(`${task.index + 1}/${plan.length} already captured`);
        continue;
      }
      const world = await prepareTaskWorld(page, task);
      const rng = makeRng(args.seed ^ ((task.index + 1) * 0x9e3779b1));
      const shot = await makeShot(page, rng, world, task);
      const { probe, png } = await renderResilient(page, canvas, shot, game.url, task.zone);
      const frame = `frames/${String(task.index).padStart(5, '0')}.png`;
      await writeFile(path.join(outDir, frame), png);
      const entry = {
        sampleIndex: task.index,
        zone: task.zone,
        sceneFamily: task.family,
        timeBand: task.timeBand,
        composition: shot.meta.composition,
        vibe: task.vibe,
        cameraStratum: task.cameraStratum,
        subjectArchetype: shot.meta.subjectArchetype ?? null,
        subjectScenario: shot.meta.subjectScenario ?? null,
        shadowFamily: task.shadowFamily,
        sunAzimuthSector: task.sunAzimuthSector,
        frame,
        valid: null,
        total: null,
        parts: null,
        probe,
        shot,
      };
      await appendFile(logPath, `${JSON.stringify(entry)}\n`);
      existing.set(task.index, entry);
      console.log(`${task.index + 1}/${plan.length} ${task.family} ${task.zone}`);
    }
  } finally {
    await browser.close();
    game.stop();
  }

  await writeFile(path.join(outDir, 'capture-manifest.json'), JSON.stringify({
    version: 1,
    total: plan.length,
    captured: existing.size,
    seed: args.seed,
    familyTargets: familyTargets(args.total),
    separatedScoring: true,
  }, null, 2));
  console.log(`batch complete: ${existing.size}/${plan.length} durable frames; Chrome closed`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});

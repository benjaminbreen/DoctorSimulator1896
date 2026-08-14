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
import { appendFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
  makeRng,
  counterbalancedFactors,
  sampleGroundPoints,
  sampleElevatedCameraCandidates,
  assembleShot,
  perturb,
  resolveCameraStrata,
  resolveShadowFamilies,
  resolveSunAzimuths,
  resolveTimeBands,
  resolveVibes,
} from './space.mjs';
import { selectDiverseResults } from './diversity.mjs';
import {
  ensureGame,
  ensureZone,
  reachable,
  renderResilient,
  score,
} from './runner.mjs';

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
    timeBands: 'all',
    vibes: 'all',
    compositions: 'all',
    cameraStrata: 'ground',
    shadowFamilies: 'profile',
    sunAzimuths: 'physical',
    leadersPerZone: 2,
    run: '',
    headed: false,
    noFrames: false,
  };
  const flags = { headed: 'headed', 'no-frames': 'noFrames' };
  const aliases = {
    'time-bands': 'timeBands',
    'camera-strata': 'cameraStrata',
    'shadow-families': 'shadowFamilies',
    'sun-azimuths': 'sunAzimuths',
    'leaders-per-zone': 'leadersPerZone',
    'run-name': 'run',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    if (flags[key]) {
      args[flags[key]] = true;
      continue;
    }
    const value = argv[i + 1];
    i += 1;
    const destination = aliases[key] ?? key;
    args[destination] = destination in args && typeof args[destination] === 'number' ? Number(value) : value;
  }
  return args;
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
  page.on('pageerror', (error) => console.error('page error:', error.stack ?? error.message));

  await page.goto(`${game.url}?shot=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shot?.ready, null, { timeout: 60000 });

  const zoneList = String(args.zone).split(',').map((z) => z.trim()).filter(Boolean);
  if (zoneList.includes('all')) {
    zoneList.splice(0, zoneList.length, ...await page.evaluate(() => window.__shot.zones()));
  }
  const timeBands = resolveTimeBands(args.timeBands);
  const vibes = resolveVibes(args.vibes);
  const cameraStrata = resolveCameraStrata(args.cameraStrata);
  const shadowFamilies = resolveShadowFamilies(args.shadowFamilies);
  const sunAzimuths = resolveSunAzimuths(args.sunAzimuths);
  const requestedCompositions = String(args.compositions)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedCompositions = ['figure', 'window', 'architecture'];
  const compositions = requestedCompositions.includes('all')
    ? allowedCompositions
    : requestedCompositions;
  const invalidCompositions = compositions.filter((value) => !allowedCompositions.includes(value));
  if (invalidCompositions.length) {
    throw new Error(`unknown composition(s): ${invalidCompositions.join(', ')}`);
  }
  const canvas = page.locator('canvas').first();
  const rng = makeRng(Number(args.seed));

  function shuffled(values, seed) {
    const order = [...values];
    const orderRng = makeRng(seed);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(orderRng() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    return order;
  }

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
        wanted.push({ x, z, ground: result.ground, stratum: 'ground' });
      });
    }
    if (wanted.length < count) throw new Error(`only found ${wanted.length}/${count} legal ${kind} points`);
    return wanted;
  }

  async function elevatedPoints(world, count, stratum) {
    if (!world.architecture?.length) {
      throw new Error(`zone ${world.zone} has no collider-backed architecture for ${stratum} cameras`);
    }
    const wanted = [];
    for (let attempt = 0; attempt < 40 && wanted.length < count; attempt += 1) {
      const batch = sampleElevatedCameraCandidates(
        rng,
        world.architecture,
        Math.max(8, (count - wanted.length) * 4),
        stratum,
      );
      const probed = await page.evaluate(
        (positions) => window.__shot.sampleCameraPositions(positions),
        batch.map((point) => [point.x, point.y, point.z]),
      );
      batch.forEach((candidate, index) => {
        const result = probed[index];
        if (!result.legal || wanted.length >= count) return;
        wanted.push({ ...candidate, ground: result.ground });
      });
    }
    if (wanted.length < count) {
      throw new Error(`only found ${wanted.length}/${count} legal ${stratum} camera positions`);
    }
    return wanted;
  }

  async function cameraPointsForWorld(world, factors) {
    const schedule = factors.map((factor) => factor.cameraStratum.id);
    const points = new Array(factors.length);
    for (const stratum of new Set(schedule)) {
      const indices = schedule
        .map((value, index) => (value === stratum ? index : -1))
        .filter((index) => index >= 0);
      const sampled = stratum === 'ground'
        ? await legalPoints(world.bounds, indices.length, 'camera', world.exterior)
        : await elevatedPoints(world, indices.length, stratum);
      indices.forEach((index, sampledIndex) => { points[index] = sampled[sampledIndex]; });
    }
    return points;
  }

  // A uniformly sampled camera and figure in a 330m exterior almost never see
  // one another. Sample the figure around its camera so most renders begin as
  // plausible compositions rather than empty directions.
  async function companionPoints(bounds, cameras, exterior) {
    const found = new Array(cameras.length).fill(null);
    for (let attempt = 0; attempt < 24 && found.some((point) => !point); attempt += 1) {
      const indices = [];
      const candidates = [];
      cameras.forEach((camera, index) => {
        if (found[index]) return;
        const distance = exterior ? 4 + rng() * 26 : 1.8 + rng() * 7.5;
        const angle = rng() * Math.PI * 2;
        indices.push(index);
        candidates.push([
          camera.x + Math.sin(angle) * distance,
          camera.z + Math.cos(angle) * distance,
        ]);
      });
      const probed = await page.evaluate(
        ([points, kind]) => window.__shot.sample(points, kind),
        [candidates, 'figure'],
      );
      probed.forEach((result, candidateIndex) => {
        if (!result.legal) return;
        const index = indices[candidateIndex];
        found[index] = {
          x: candidates[candidateIndex][0],
          z: candidates[candidateIndex][1],
          ground: result.ground,
        };
      });
    }
    if (found.some((point) => !point)) {
      const fallback = await legalPoints(bounds, found.filter((point) => !point).length, 'figure', exterior);
      let fallbackIndex = 0;
      found.forEach((point, index) => {
        if (!point) found[index] = fallback[fallbackIndex++];
      });
    }
    return found;
  }

  const runId = args.run || (
    zoneList.length > 4
      ? `mixed-${zoneList.length}zones-seed${args.seed}-${String(args.samples)}`
      : `${zoneList.join('+')}-seed${args.seed}-${String(args.samples)}`
  );
  const outDir = path.join(HERE, 'out', runId);
  const frameDir = path.join(outDir, 'frames');
  await mkdir(frameDir, { recursive: true });
  // A deliberate rerun with the same name replaces its winners. Without this
  // narrow cleanup, an earlier top-12 leaves four stale images when the new
  // validity gates produce only eight winners, and the contact sheet lies.
  for (const name of await readdir(outDir)) {
    if (/^top-\d+\.(?:png|json)$/.test(name) || name === 'contact-sheet.png') {
      await unlink(path.join(outDir, name));
    }
  }
  const logPath = path.join(outDir, 'all.jsonl');
  await writeFile(logPath, '');
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
  const record = async (entry) => {
    const line = JSON.stringify(entry);
    log.push(line);
    await appendFile(logPath, `${line}\n`);
  };
  const results = [];
  const started = Date.now();

  // Zones run one at a time, splitting the budget: a zone change remounts the
  // canvas, so switching per sample would cost more than the render.
  const perZone = Math.max(1, Math.round(Number(args.samples) / zoneList.length));
  for (let zoneIndex = 0; zoneIndex < zoneList.length; zoneIndex += 1) {
    const zone = zoneList[zoneIndex];
    await ensureZone(page, zone);
    const world = await page.evaluate(() => window.__shot.world());
    const { bounds, exterior } = world;
    console.log(
      `\nzone ${world.zone}${exterior ? ' (exterior)' : ''}: ${world.windows.length} windows, ` +
        `${world.architecture?.length ?? 0} architecture anchors, ` +
        `${(bounds.maxX - bounds.minX).toFixed(0)}x${(bounds.maxZ - bounds.minZ).toFixed(0)}m, ${perZone} samples`,
    );
    const activeCameraStrata = exterior ? cameraStrata : [{ id: 'ground' }];
    const zoneFactors = counterbalancedFactors(
      activeCameraStrata,
      shadowFamilies,
      sunAzimuths,
      perZone,
      Number(args.seed) ^ ((zoneIndex + 1) * 0x85ebca6b),
    );
    const cameraPoints = await cameraPointsForWorld(world, zoneFactors);
    const figurePoints = await companionPoints(bounds, cameraPoints, exterior);
    // A separate deterministic permutation per zone avoids coupling one vibe
    // to one daypart while keeping each six-sample block exactly balanced.
    const zoneVibes = shuffled(vibes, Number(args.seed) ^ ((zoneIndex + 1) * 0x9e3779b1));
    const zoneCompositions = exterior
      ? compositions.filter((composition) => composition !== 'window')
      : compositions;
    if (zoneCompositions.length === 0) zoneCompositions.push('architecture');

    for (let i = 0; i < perZone; i += 1) {
      const timeBand = timeBands[(i + zoneIndex) % timeBands.length];
      // Rotate the vibe permutation on each six-sample block. Thus repeated
      // dawn samples in one room do not all inherit the same lighting family.
      const block = Math.floor(i / zoneVibes.length);
      const vibe = zoneVibes[(i + block) % zoneVibes.length];
      // A shorter independent cycle makes repeated samples at one daypart
      // traverse each composition family instead of inheriting one forever.
      const compositionBlock = Math.floor(i / zoneCompositions.length);
      const composition = zoneCompositions[
        (i + compositionBlock + zoneIndex) % zoneCompositions.length
      ];
      const { shadowFamily, sunAzimuthSector } = zoneFactors[i];
      const cameraComposition = cameraPoints[i].stratum === 'ground'
        ? composition
        : 'architecture';
      const shot = assembleShot(rng, bounds, cameraPoints[i], figurePoints[i], exterior, {
        timeBand,
        vibe,
        composition: cameraComposition,
        windows: world.windows,
        architecture: world.architecture,
        shadowFamily,
        sunAzimuthSector,
      });
      const { probe, png } = await renderResilient(page, canvas, shot, game.url, zone);
      const scored = await score(args.scorer, png, probe, {
        zone,
        exterior,
        timeBand: shot.meta.timeBand,
        composition: shot.meta.composition,
        vibe: shot.meta.vibe,
        cameraStratum: shot.meta.cameraStratum,
        shadowFamily: shot.meta.shadowFamily,
        sunAzimuthSector: shot.meta.sunAzimuthSector,
      });
      const frame = await keepFrame(png);
      if (scored.valid) {
        results.push({
          zone,
          bounds,
          exterior,
          timeBand: shot.meta.timeBand,
          vibe: shot.meta.vibe,
          shot,
          probe,
          ...scored,
          png,
        });
      }
      await record({
        zone,
        timeBand: shot.meta.timeBand,
        composition: shot.meta.composition,
        vibe: shot.meta.vibe,
        cameraStratum: shot.meta.cameraStratum,
        shadowFamily: shot.meta.shadowFamily,
        sunAzimuthSector: shot.meta.sunAzimuthSector,
        frame,
        valid: scored.valid,
        total: scored.total,
        parts: scored.parts,
        shot,
      });
      if ((i + 1) % 25 === 0) {
        const rate = results.length / ((Date.now() - started) / 1000);
        const best = results.length ? Math.max(...results.map((r) => r.total)).toFixed(3) : 'none';
        console.log(`  ${i + 1}/${perZone}  best ${best}  ${rate.toFixed(1)}/s`);
      }
    }
  }

  // Hill-climb the leaders: random search finds the neighbourhood, this finds
  // the frame within it. Grouped by zone so the canvas remounts once, not
  // once per climber.
  const baseResults = [...results];
  const climbers = zoneList.flatMap((zone) => baseResults
    .filter((entry) => entry.zone === zone)
    .sort((a, b) => b.total - a.total)
    .slice(0, Number(args.leadersPerZone)));
  for (const zone of zoneList) {
    const forZone = climbers.filter((c) => c.zone === zone);
    if (forZone.length === 0) continue;
    await ensureZone(page, zone);
    for (const climber of forZone) {
      let current = climber;
      for (let step = 0; step < Number(args.climb); step += 1) {
        const scale = 1 - step / (Number(args.climb) + 1);
        const candidate = perturb(rng, current.shot, scale, climber.bounds);
        if (climber.exterior && candidate.meta?.cameraStratum !== 'ground') {
          const [legal] = await page.evaluate(
            (positions) => window.__shot.sampleCameraPositions(positions),
            [candidate.camera.position],
          );
          if (!legal?.legal) continue;
        }
        const { probe, png } = await renderResilient(page, canvas, candidate, game.url, zone);
        const scored = await score(args.scorer, png, probe, {
          zone,
          exterior: climber.exterior,
          timeBand: candidate.meta?.timeBand,
          composition: candidate.meta?.composition,
          vibe: candidate.meta?.vibe,
          cameraStratum: candidate.meta?.cameraStratum,
          shadowFamily: candidate.meta?.shadowFamily,
          sunAzimuthSector: candidate.meta?.sunAzimuthSector,
        });
        const frame = await keepFrame(png);
        const entry = {
          zone,
          bounds: climber.bounds,
          exterior: climber.exterior,
          timeBand: candidate.meta?.timeBand,
          vibe: candidate.meta?.vibe,
          shot: candidate,
          probe,
          ...scored,
          png,
        };
        if (scored.valid) results.push(entry);
        await record({
          zone,
          timeBand: candidate.meta?.timeBand,
          composition: candidate.meta?.composition,
          vibe: candidate.meta?.vibe,
          cameraStratum: candidate.meta?.cameraStratum,
          shadowFamily: candidate.meta?.shadowFamily,
          sunAzimuthSector: candidate.meta?.sunAzimuthSector,
          frame,
          valid: scored.valid,
          climb: true,
          total: scored.total,
          parts: scored.parts,
          shot: candidate,
        });
        if (scored.valid && scored.total > current.total) current = entry;
      }
      console.log(`climbed ${zone} ${climber.total.toFixed(3)} -> ${current.total.toFixed(3)}`);
    }
  }

  // Keep high-quality leaders without allowing one zone, hour, or local camera
  // cluster to fill the entire contact sheet.
  const top = selectDiverseResults(results, Number(args.keep));
  await Promise.all(
    top.flatMap((entry, index) => {
      const stem = path.join(outDir, `top-${String(index + 1).padStart(2, '0')}`);
      return [
        writeFile(`${stem}.png`, entry.png),
        writeFile(
          `${stem}.json`,
          JSON.stringify({
            zone: entry.zone,
            timeBand: entry.timeBand,
            vibe: entry.vibe,
            cameraStratum: entry.shot.meta?.cameraStratum,
            shadowFamily: entry.shot.meta?.shadowFamily,
            sunAzimuthSector: entry.shot.meta?.sunAzimuthSector,
            total: entry.total,
            parts: entry.parts,
            probe: entry.probe,
            shot: entry.shot,
          }, null, 2),
        ),
      ];
    }),
  );
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({
    version: 4,
    seed: Number(args.seed),
    requestedSamples: Number(args.samples),
    renderedSamples: log.length,
    zones: zoneList,
    timeBands: timeBands.map((band) => band.id),
    vibes: vibes.map((vibe) => vibe.id),
    compositions,
    cameraStrata: cameraStrata.map((stratum) => stratum.id),
    shadowFamilies: shadowFamilies.map((family) => family.id),
    sunAzimuths: sunAzimuths.map((sector) => sector.id),
    leadersPerZone: Number(args.leadersPerZone),
  }, null, 2));

  console.log(`\ntop ${top.length} written to ${path.relative(REPO, outDir)}`);
  for (const [index, entry] of top.slice(0, 5).entries()) {
    const parts = Object.entries(entry.parts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(', ');
    console.log(`  ${index + 1}. ${entry.total.toFixed(3)}  ${entry.zone}  ${entry.vibe}  (${parts})`);
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

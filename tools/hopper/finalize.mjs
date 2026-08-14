#!/usr/bin/env node
// Finish an interrupted Hopper search from its durable all.jsonl log.
//
// This deliberately does not start Chrome, the game, CLIP, or the scorer. It
// reuses scores and frames that were already written, selects a balanced set
// of winners, and builds the contact sheet with a small memory footprint.

import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectDiverseResults, selectGamutResults } from './diversity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { run: '', keep: 30, requestedSamples: null };
  const aliases = { 'requested-samples': 'requestedSamples' };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index].replace(/^--/, '');
    const destination = aliases[key] ?? key;
    if (!(destination in args)) throw new Error(`unknown argument --${key}`);
    const value = argv[index + 1];
    if (value == null) throw new Error(`missing value for --${key}`);
    args[destination] = destination === 'run' ? value : Number(value);
  }
  if (!args.run) throw new Error('--run is required');
  if (!Number.isInteger(args.keep) || args.keep <= 0) throw new Error('--keep must be a positive integer');
  if (args.requestedSamples != null && (!Number.isInteger(args.requestedSamples) || args.requestedSamples <= 0)) {
    throw new Error('--requested-samples must be a positive integer');
  }
  return args;
}

function values(entries, key, fallback) {
  return [...new Set(entries.map((entry) => entry[key] ?? entry.shot.meta?.[key] ?? fallback))].sort();
}

async function cleanOldWinners(outDir) {
  await mkdir(outDir, { recursive: true });
  for (const name of await readdir(outDir)) {
    if (/^top-\d+\.(?:png|json)$/.test(name) || name === 'contact-sheet.png') {
      await unlink(path.join(outDir, name));
    }
  }
}

async function contactSheet(outDir) {
  await new Promise((resolve, reject) => {
    const child = spawn('python3', [path.join(HERE, 'contact_sheet.py'), outDir], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`contact sheet exited ${code}`))));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.join(HERE, 'out', args.run);
  const logPath = path.join(outDir, 'all.jsonl');
  const raw = await readFile(logPath, 'utf8');
  const logged = raw.split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid JSON on ${path.basename(logPath)} line ${index + 1}: ${error.message}`);
    }
  });
  const entries = logged
    .filter((entry) => entry.valid !== false && entry.frame && entry.shot?.camera)
    .map((entry) => ({
      ...entry,
      timeBand: entry.timeBand ?? entry.shot.meta?.timeBand,
      vibe: entry.vibe ?? entry.shot.meta?.vibe,
      framePath: path.join(outDir, entry.frame),
    }));
  if (entries.length === 0) throw new Error(`no valid rendered frames in ${logPath}`);

  await cleanOldWinners(outDir);
  const hasGamutFamilies = entries.some((entry) => entry.sceneFamily ?? entry.shot.meta?.sceneFamily);
  const top = (hasGamutFamilies ? selectGamutResults : selectDiverseResults)(
    entries,
    Math.min(args.keep, entries.length),
  );
  await Promise.all(top.flatMap((entry, index) => {
    const stem = path.join(outDir, `top-${String(index + 1).padStart(2, '0')}`);
    return [
      readFile(entry.framePath).then((png) => writeFile(`${stem}.png`, png)),
      writeFile(`${stem}.json`, JSON.stringify({
        zone: entry.zone,
        timeBand: entry.timeBand,
        vibe: entry.vibe,
        sceneFamily: entry.sceneFamily ?? entry.shot.meta?.sceneFamily,
        subjectArchetype: entry.subjectArchetype ?? entry.shot.meta?.subjectArchetype ?? null,
        subjectScenario: entry.subjectScenario ?? entry.shot.meta?.subjectScenario ?? null,
        cameraStratum: entry.cameraStratum ?? entry.shot.meta?.cameraStratum,
        shadowFamily: entry.shadowFamily ?? entry.shot.meta?.shadowFamily,
        sunAzimuthSector: entry.sunAzimuthSector ?? entry.shot.meta?.sunAzimuthSector,
        total: entry.total,
        parts: entry.parts,
        shot: entry.shot,
        sourceFrame: entry.frame,
      }, null, 2)),
    ];
  }));

  const requestedSamples = args.requestedSamples ?? logged.length;
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({
    version: 4,
    finalizedFromLog: true,
    complete: logged.length >= requestedSamples,
    requestedSamples,
    renderedSamples: logged.length,
    validSamples: entries.length,
    zones: values(entries, 'zone', 'unknown'),
    timeBands: values(entries, 'timeBand', 'other'),
    vibes: values(entries, 'vibe', 'legacy'),
    compositions: values(entries, 'composition', 'other'),
    sceneFamilies: values(entries, 'sceneFamily', 'legacy'),
    subjectArchetypes: values(entries, 'subjectArchetype', null).filter(Boolean),
    subjectScenarios: values(entries, 'subjectScenario', null).filter(Boolean),
    cameraStrata: values(entries, 'cameraStratum', 'ground'),
    shadowFamilies: values(entries, 'shadowFamily', 'profile'),
    sunAzimuths: values(entries, 'sunAzimuthSector', 'physical'),
    winners: top.length,
  }, null, 2));

  await contactSheet(outDir);
  console.log(`finalized ${logged.length} rendered frames (${entries.length} valid) into ${top.length} winners`);
  console.log(outDir);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

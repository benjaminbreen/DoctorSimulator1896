// Validate Renderer C runtime assets and copy them into the playable game.
// Use --check to validate without writing files.

import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { validateCharacterRecipe } from '../../shared/characters/recipe.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SOURCE = path.join(ROOT, 'character-lab', 'public', 'models');
const TARGET = path.join(ROOT, 'game', 'public', 'models', 'characters');
const CHECK_ONLY = process.argv.includes('--check');
const REQUIRED_CLIPS = [
  'ClinicIdle', 'SittingTalking', 'SittingKneeStrike', 'SittingDejected',
  'SittingTalkingLegsCrossed', 'SitDown', 'StandUp', 'StandingIdle', 'Walk',
  'RiseFromFloor',
];
const FILES = [
  'renderer-c-women.glb',
  'renderer-c-men.glb',
  'renderer-c-mixamo-motions.glb',
];

const sourceManifestPath = path.join(SOURCE, 'renderer-c-cohorts.json');
const manifest = JSON.parse(await readFile(sourceManifestPath, 'utf8'));
const errors = [];

for (const cohortId of ['women', 'men']) {
  const cohort = manifest.cohorts?.[cohortId];
  if (!cohort) {
    errors.push(`missing cohort ${cohortId}`);
    continue;
  }
  if (cohort.anchors?.length !== 8) errors.push(`${cohortId} must contain eight approved anchors`);
  if (new Set(cohort.anchors?.map((anchor) => anchor.id)).size !== cohort.anchors?.length) errors.push(`${cohortId} has duplicate anchor ids`);
  for (const clip of REQUIRED_CLIPS) {
    if (!cohort.motionClips?.includes(clip)) errors.push(`${cohortId} is missing clip ${clip}`);
  }
  const sample = {
    schemaVersion: 1,
    id: `publish-check-${cohortId}`,
    renderer: 'renderer-c',
    cohort: cohortId,
    identitySeed: 1,
    appearanceSeed: 1,
    anchor: { index: 0, id: cohort.anchors?.[0]?.id || null },
    values: {}, presentation: {}, restingFace: {},
    animation: { body: 'clinic-idle', expression: 'neutral', gaze: 'doctor', speaking: false },
    lod: 'consultation', asset: { path: cohort.path },
    placement: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
  };
  errors.push(...validateCharacterRecipe(sample, manifest).map((error) => `${cohortId}: ${error}`));
}

const sizes = new Map();
for (const file of FILES) {
  try {
    sizes.set(file, (await stat(path.join(SOURCE, file))).size);
  } catch {
    errors.push(`missing source asset ${file}`);
  }
}

if (errors.length) throw new Error(`Renderer C publication failed:\n- ${errors.join('\n- ')}`);

const published = structuredClone(manifest);
published.publishedFor = 'ghosts-game';
for (const cohort of Object.values(published.cohorts)) {
  const file = path.basename(cohort.path);
  cohort.path = `/models/characters/${file}`;
  cohort.bytes = sizes.get(file);
}
published.motionPath = '/models/characters/renderer-c-mixamo-motions.glb';

if (!CHECK_ONLY) {
  await mkdir(TARGET, { recursive: true });
  for (const file of FILES) await copyFile(path.join(SOURCE, file), path.join(TARGET, file));
  await writeFile(
    path.join(TARGET, 'renderer-c-cohorts.json'),
    `${JSON.stringify(published, null, 2)}\n`,
    'utf8',
  );
}

const summary = FILES.map((file) => `${file} ${(sizes.get(file) / 1048576).toFixed(1)}MB`).join(', ');
console.log(`${CHECK_ONLY ? 'validated' : 'published'} Renderer C: ${summary}`);


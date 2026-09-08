// Fetch and parse later park models while earlier stages prepare their GPU
// resources. The shared loader reuses each result when its component mounts.

import { TREE_MODEL_URLS, TREE_LOD_URLS } from '../world/treeModels.js';
import { modelUrl } from '../world/modelPacks.js';

// Enough to keep the pipe busy without competing with the stage the player is
// actually waiting on; the warms are issued at low priority besides.
const CONCURRENCY = 4;

function packUrls(items) {
  const urls = new Set();
  for (const item of items) {
    const url = item.model ? modelUrl(item.model) : null;
    if (url) urls.add(url);
  }
  return [...urls].sort();
}

// The crowd and traffic catalogs are data modules, but they are not otherwise
// in the eager bundle. Import them here so warming does not drag the whole
// stage-7 cast into the boot chunk.
async function crowdUrls() {
  const [pedestrians, gardener, sailor, teddy] = await Promise.all([
    import('../world/pedestrianCatalog.js'),
    import('../world/parkGardener.js'),
    import('../world/sailorBoy.js'),
    import('../world/teddyRoosevelt.js'),
  ]);
  return [
    ...pedestrians.PEDESTRIAN_LOD_FILES,
    ...Object.values(pedestrians.PEDESTRIAN_ARCHETYPES).flatMap(
      (archetype) => archetype.animationSources,
    ),
    gardener.PARK_GARDENER_MODEL_FILE,
    gardener.PARK_GARDENER_MOTION_FILE,
    sailor.SAILOR_BOY_MODEL_FILE,
    sailor.SAILOR_BOY_MOTION_FILE,
    teddy.TEDDY_ROOSEVELT_MODEL_FILE,
    teddy.TEDDY_ROOSEVELT_MOTION_FILE,
    '/models/horse.glb',
    '/models/carriage-driver.glb',
  ];
}

// In stage order, so the file a stage is about to need is warmed before one
// three stages out.
export async function parkWarmUrls({ structural = [], cover = [] }) {
  const crowd = await crowdUrls();
  const seen = new Set();
  return [
    ...packUrls(structural),
    ...TREE_MODEL_URLS,
    ...TREE_LOD_URLS,
    ...packUrls(cover),
    ...crowd,
  ].filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

async function warm(url, signal) {
  try {
    const response = await fetch(url, { signal, priority: 'low', credentials: 'same-origin' });
    // The body has to be drained for the response to settle in the cache. The
    // buffer is dropped immediately; the point is the cache entry, not the data.
    await response.arrayBuffer();
  } catch {
    // Aborted, offline, or missing. Whichever stage needs the file will load
    // it itself and report the failure there.
  }
}

function runWarmPool(urlsPromise, signal, load = (url) => warm(url, signal)) {
  urlsPromise.then((urls) => {
    if (signal.aborted) return;
    let next = 0;
    const worker = async () => {
      while (next < urls.length && !signal.aborted) await load(urls[next++]);
    };
    for (let i = 0; i < Math.min(CONCURRENCY, urls.length); i += 1) worker();
  });
}

// Returns an abort function. Call it when the zone unmounts: a park left
// behind should not keep pulling its crowd down over the consulting room's.
export function warmParkAssets(groups, renderer) {
  const controller = new AbortController();
  Promise.all([import('./modelLoader.js'), import('./ktx2.js'), import('meshoptimizer')]).then(([model, textures, meshopt]) => {
    if (controller.signal.aborted) return;
    const loader = new model.GLTFLoader();
    loader.background = true;
    loader.signal = controller.signal;
    loader.setMeshoptDecoder(meshopt.MeshoptDecoder);
    loader.setKTX2Loader(textures.getKTX2Loader(renderer));
    runWarmPool(parkWarmUrls(groups), controller.signal, (url) => loader.loadAsync(url).catch(() => {}));
  });
  return () => controller.abort();
}

// The working day leads from the park to the waiting room and the consulting
// office, whose pack pieces and patient cohort models otherwise download at
// the moment of travel — the first visit cost ~8s on a 20Mbps line.
async function interiorWarmUrls() {
  const [{ zones }, { deriveRoom }] = await Promise.all([
    import('../world/zones.js'),
    import('../world/blueprint.js'),
  ]);
  const urls = new Set();
  for (const id of ['consulting-office', 'waiting-room']) {
    const zone = zones[id];
    if (!zone) continue;
    const items = [...deriveRoom(zone.blueprint).furnitureBoxes, ...(zone.extraItems ?? [])];
    for (const url of packUrls(items)) urls.add(url);
  }
  return [...urls];
}

// Called once the park is fully up and the pipe is idle.
export function warmInteriorAssets() {
  const controller = new AbortController();
  runWarmPool(interiorWarmUrls(), controller.signal);
  return () => controller.abort();
}

// Warm just the next scheduled patient while the player is in the clinic.
export function warmPatient(recipe, renderer) {
  const controller = new AbortController();
  Promise.all([fetch('/models/characters/renderer-c-cohorts.json', { signal: controller.signal }).then(r => r.json()),
    import('./modelLoader.js'), import('./ktx2.js'), import('meshoptimizer'), import('./characters/patientModelPath.js')])
    .then(async ([manifest, model, textures, meshopt, paths]) => {
      if (controller.signal.aborted) return;
      const cohort = manifest.cohorts[recipe.cohort];
      if (!cohort) return;
      const loader = new model.GLTFLoader();
      loader.background = true;
      loader.signal = controller.signal;
      loader.setMeshoptDecoder(meshopt.MeshoptDecoder);
      loader.setKTX2Loader(textures.getKTX2Loader(renderer));
      const urls = new Set([paths.patientModelPath(recipe, cohort), recipe.asset?.motionPath].filter(Boolean));
      await Promise.all([...urls].map(url => loader.loadAsync(url)));
    }).catch(() => {});
  return () => controller.abort();
}

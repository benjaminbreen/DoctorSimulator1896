// The warm list names files the park's stage components load. Nothing breaks
// if it goes stale — boot just quietly returns to eight serial round trips —
// so check that every entry still resolves to a file on disk.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { parkWarmUrls } from '../src/scene/parkPreload.js';
import { getZone } from '../src/world/zones.js';
import { deriveRoom } from '../src/world/blueprint.js';
import { PEDESTRIAN_LOD_FILES } from '../src/world/pedestrianCatalog.js';

function isGroundCover(item) {
  return item.id?.startsWith('cover-') || item.id?.startsWith('tuft-');
}

async function parkUrls() {
  const zone = getZone('central-park', { timeOfDay: 10, dayOfYear: 150 });
  const derived = deriveRoom(zone.blueprint);
  const items = [...derived.furnitureBoxes, ...(zone.extraItems ?? [])]
    .filter((item) => item.model);
  return parkWarmUrls({
    structural: items.filter((item) => !isGroundCover(item)),
    cover: items.filter(isGroundCover),
  });
}

test('every warmed park asset exists', async () => {
  const urls = await parkWarmUrls({ structural: [], cover: [] });
  const missing = urls.filter(
    (url) => !existsSync(new URL(`../public${url.split('?')[0]}`, import.meta.url)),
  );
  assert.deepEqual(missing, [], 'warm list names files that are not there');
});

test('the park warms its set dressing, its trees, and its cast', async () => {
  const urls = await parkUrls();
  assert.ok(urls.length > 40, `expected the full park list, got ${urls.length}`);
  assert.equal(new Set(urls).size, urls.length, 'a file is warmed twice');
  // One representative of each stage the warming exists to cover.
  for (const piece of ['large_park_bench', 'Tree-01', 'horse.glb', 'carriage-driver.glb']) {
    assert.ok(urls.some((url) => url.includes(piece)), `${piece} is not warmed`);
  }
  for (const lod of PEDESTRIAN_LOD_FILES) {
    assert.ok(urls.includes(lod), `${lod} is not warmed`);
  }
});

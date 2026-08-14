import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_SITES,
  SIGN_ATLAS_ENTRIES,
  SIGN_SITES,
  STREET_DRESSING_BUDGET,
  STREET_SIGN_POSTS,
  resolveStreetDressing,
} from '../src/world/streetDressing.js';
import { streetItems } from '../src/world/streetGrid.js';

test('the district uses exactly three selective 45-star flag sites', () => {
  assert.equal(FLAG_SITES.length, 3);
  assert.deepEqual(
    FLAG_SITES.map((site) => site.buildingId),
    ['hotel-new-netherland', 'hotel-savoy', 'metropolitan-club'],
  );
  assert.equal(new Set(FLAG_SITES.map((site) => site.id)).size, FLAG_SITES.length);
  assert.equal(new Set(FLAG_SITES.map((site) => site.phase)).size, FLAG_SITES.length);
  assert.ok(FLAG_SITES.every((site) => site.sourceStatus.includes('inferred')));
});

test('the sign manifest stays selective and every entry shares the atlas', () => {
  assert.equal(SIGN_SITES.length, 18);
  assert.ok(SIGN_SITES.length <= STREET_DRESSING_BUDGET.signRecords);
  assert.equal(SIGN_SITES.filter((site) => site.kind === 'street-blade').length, 6);
  assert.equal(SIGN_SITES.filter((site) => site.kind === 'hotel').length, 2);
  assert.equal(SIGN_SITES.filter((site) => site.kind === 'to-let').length, 3);
  assert.equal(new Set(SIGN_SITES.map((site) => site.id)).size, SIGN_SITES.length);
  for (const site of SIGN_SITES) {
    assert.ok(SIGN_ATLAS_ENTRIES[site.atlasKey], `${site.id} has an atlas cell`);
    assert.equal(site.collider, undefined);
    assert.equal(site.castShadow, undefined);
  }
});

test('atlas cells fit one texture and do not overlap', () => {
  const entries = Object.entries(SIGN_ATLAS_ENTRIES);
  for (const [key, entry] of entries) {
    const [x, y, width, height] = entry.rect;
    assert.ok(x >= 0 && y >= 0 && width > 16 && height > 16, `${key} has a usable cell`);
    assert.ok(x + width <= 1024 && y + height <= 512, `${key} stays in the atlas`);
  }
  for (let first = 0; first < entries.length; first += 1) {
    const [firstKey, { rect: a }] = entries[first];
    for (let second = first + 1; second < entries.length; second += 1) {
      const [secondKey, { rect: b }] = entries[second];
      const overlapX = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const overlapY = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      assert.ok(overlapX <= 0 || overlapY <= 0, `${firstKey} and ${secondKey} do not overlap`);
    }
  }
});

test('all building anchors resolve to finite, bounded render records', () => {
  const layout = resolveStreetDressing(streetItems);
  assert.equal(layout.flags.length, STREET_DRESSING_BUDGET.flags);
  assert.equal(layout.supports.length, STREET_SIGN_POSTS.length);
  assert.equal(layout.signs.length, 24, 'six double-sided blades plus twelve fixed signs');
  assert.ok(layout.signs.length <= STREET_DRESSING_BUDGET.signFaces);
  for (const record of [...layout.flags, ...layout.signs, ...layout.supports]) {
    assert.ok(record.position.every(Number.isFinite), `${record.id} resolves in world space`);
  }
  assert.ok(layout.flags.every((flag) => flag.size.every((value) => value > 0)));
  assert.ok(layout.signs.every((sign) => sign.size.every((value) => value > 0)));
});

test('street dressing geometry remains beneath its triangle budget', () => {
  const layout = resolveStreetDressing(streetItems);
  const flagClothTriangles = layout.flags.length * 16 * 5 * 2;
  const flagPoleTriangles = layout.flags.length * 140;
  const signFaceTriangles = layout.signs.length * 2;
  const signPostTriangles = layout.supports.length * 140;
  const estimate = flagClothTriangles + flagPoleTriangles + signFaceTriangles + signPostTriangles;
  assert.ok(estimate < STREET_DRESSING_BUDGET.triangles, `${estimate} triangles stay below budget`);
  assert.equal(STREET_DRESSING_BUDGET.renderBatches, 4);
});

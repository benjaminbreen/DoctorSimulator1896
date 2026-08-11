import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCarousel, CAROUSEL } from '../src/world/carousel.js';
import { terrainHeight } from '../src/world/terrain.js';
import { parkItems } from '../src/world/centralPark.js';

test('both carousel entries offer the ride', () => {
  const markers = parkItems.filter((item) => item.id.startsWith('carousel-ride'));
  assert.equal(markers.length, 2);
  for (const marker of markers) {
    assert.equal(marker.affordance?.kind, 'act');
    assert.equal(marker.render, false);
    assert.equal(marker.collider, false);
    const distance = Math.hypot(marker.position[0] - CAROUSEL.x, marker.position[2] - CAROUSEL.z);
    assert.ok(distance > 5 && distance < 8, `marker at the pavilion edge, got ${distance.toFixed(1)}`);
  }
});

test('the carousel is deterministic and fully populated', () => {
  const built = buildCarousel();
  assert.deepEqual(built.horses, buildCarousel().horses);
  assert.equal(built.horses.length, 18, 'two rows of horses');
  assert.equal(built.posts.length, built.sides, 'a post per bay');
  for (const horse of built.horses) {
    assert.ok(horse.radius < built.platform.radius - 0.5, 'horse rides the platform');
    assert.ok(horse.body.every((v) => v > 0 && v <= 1), 'painted, not gain-tinted');
  }
});

test('the platform steps up within the autostep limit', () => {
  const built = buildCarousel();
  assert.ok(built.platform.height <= 0.32, 'platform edge is walkable');
  const steps = built.steps.map((s) => s.p[1] + s.s[1] / 2);
  for (const top of steps) assert.ok(top <= 0.32, 'entry steps stay low');
});

test('entry bays are open and the rest are railed', () => {
  const built = buildCarousel();
  const rails = built.colliders.filter((c) => c.type === 'box' && c.size[1] === 1.0);
  assert.equal(rails.length, built.sides - 2, 'ten railed bays, two entries');
  assert.ok(built.colliders.some((c) => c.type === 'cylinder' && c.radius > 4), 'platform carries a collider');
});

test('the carousel stands on its graded pad', () => {
  const built = buildCarousel();
  const center = terrainHeight(CAROUSEL.x, CAROUSEL.z);
  assert.ok(Math.abs(terrainHeight(CAROUSEL.x + 4, CAROUSEL.z) - center) < 0.05, 'pad is level');
  assert.ok(Math.abs(built.ground - center) < 1e-9);
});

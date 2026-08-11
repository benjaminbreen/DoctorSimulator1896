import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGapstow, deckY, walkY, GAPSTOW, GAPSTOW_ARCH, RUN_W } from '../src/world/gapstow.js';
import { parkItems } from '../src/world/centralPark.js';
import { terrainHeight } from '../src/world/terrain.js';

test('deck profile matches the documented bridge at its scale', () => {
  // 12 ft rise over the water at 0.58 of real size: crown 2.15 above -0.5.
  assert.ok(Math.abs(deckY(0) - 1.65) < 0.03, `crown height, got ${deckY(0).toFixed(2)}`);
  assert.ok(deckY(RUN_W) < 0.7, 'ends meet the banks low');
  assert.ok(deckY(1.5) > deckY(3) && deckY(3) > deckY(5), 'profile falls from the crown');
  assert.ok(walkY(RUN_W + 1) < deckY(RUN_W), 'apron ramps below the masonry end');
});

test('the stonework is deterministic and stays in its footprint', () => {
  const built = buildGapstow();
  assert.deepEqual(built.stones, buildGapstow().stones);
  assert.ok(built.stones.length > 250 && built.stones.length < 900, `stone count sane, got ${built.stones.length}`);
  for (const stone of built.stones) {
    assert.ok(Math.abs(stone.p[0]) < 9 && Math.abs(stone.p[2]) < 3.1, 'stone inside the footprint');
    assert.ok(stone.p[1] > -0.95 && stone.p[1] < 3.0, 'stone at masonry height');
  }
});

test('the arch opening stays open', () => {
  const built = buildGapstow();
  const blocking = built.stones.filter(
    (stone) => Math.hypot(stone.p[0], stone.p[1] - GAPSTOW_ARCH.cy) < GAPSTOW_ARCH.r - 0.05,
  );
  assert.equal(blocking.length, 0, 'no stone hangs inside the intrados');
});

test('the collider staircase stays under the autostep limit', () => {
  const cos = Math.cos(GAPSTOW.yaw);
  const sin = Math.sin(GAPSTOW.yaw);
  const steps = parkItems
    .filter((item) => item.id.startsWith('gapstow-step') || item.id === 'gapstow-deck')
    .map((item) => ({
      offset: (item.position[0] - GAPSTOW.x) * cos - (item.position[2] - GAPSTOW.z) * sin,
      top: item.position[1] + item.size[1] / 2,
    }))
    .sort((a, b) => a.offset - b.offset);
  assert.ok(steps.length >= 15, `staircase spans the crossing, got ${steps.length}`);
  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(Math.abs(steps[i].top - steps[i - 1].top) <= 0.32, `rise at offset ${steps[i].offset.toFixed(1)} walkable`);
    assert.ok(steps[i].offset - steps[i - 1].offset < 1.0, 'no gap in the staircase');
  }
  // First rise measured from the shore just past each end of the staircase.
  for (const sign of [-1, 1]) {
    const edge = sign < 0 ? steps[0] : steps[steps.length - 1];
    const x = GAPSTOW.x + cos * (edge.offset + sign * 0.8);
    const z = GAPSTOW.z - sin * (edge.offset + sign * 0.8);
    assert.ok(edge.top - terrainHeight(x, z) <= 0.32, 'approach rise walkable');
  }
});

test('abutment boulders flank the crossing without blocking it', () => {
  const built = buildGapstow();
  assert.ok(built.rocks.length >= 12);
  for (const rock of built.rocks) {
    assert.ok(Math.abs(rock.p[0]) > 6.5, 'boulder beyond the arch');
    assert.ok(Math.abs(rock.p[2]) > 1.95, 'boulder clear of the walk');
    assert.ok(rock.s[0] >= 0.3 && rock.s[0] <= 1.8, 'boulder at rock scale');
  }
});

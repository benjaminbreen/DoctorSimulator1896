import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParkRocks } from '../src/world/parkRocks.js';
import { pondDepth, pathsDistance } from '../src/world/terrain.js';

test('park rocks are deterministic and populated', () => {
  const rocks = buildParkRocks();
  assert.deepEqual(rocks, buildParkRocks());
  assert.ok(rocks.boulders.length >= 10, `boulders on the outcrops, got ${rocks.boulders.length}`);
  assert.ok(rocks.pebbles.length >= 40, `pebble litter present, got ${rocks.pebbles.length}`);
});

test('rocks stay on land and off the walks', () => {
  const { boulders, pebbles } = buildParkRocks();
  for (const rock of [...boulders, ...pebbles]) {
    assert.ok(pondDepth(rock.p[0], rock.p[2]) > 0, 'rock on dry ground');
    assert.ok(pathsDistance(rock.p[0], rock.p[2]) > 0.3, 'rock clear of the walks');
  }
});

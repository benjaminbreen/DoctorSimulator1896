import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParkRocks } from '../src/world/parkRocks.js';
import { pondDepth, pathsDistance } from '../src/world/terrain.js';
import {WATER_LEVEL} from '../src/world/centralPark.js';

test('park rocks are deterministic and populated', () => {
  const rocks = buildParkRocks();
  assert.deepEqual(rocks, buildParkRocks());
  assert.ok(rocks.boulders.length >= 10, `boulders on the outcrops, got ${rocks.boulders.length}`);
  assert.ok(rocks.pebbles.length >= 40, `pebble litter present, got ${rocks.pebbles.length}`);
});

test('boulders stay on land and shoreline pebbles remain visible off the walks', () => {
  const { boulders, pebbles } = buildParkRocks();
  for (const rock of [...boulders, ...pebbles]) {
    assert.ok(rock.p[1]+rock.s[1]/2>WATER_LEVEL, 'rock emerges above water');
    assert.ok(pathsDistance(rock.p[0], rock.p[2]) > 0.3, 'rock clear of the walks');
  }
  for(const rock of boulders)assert.ok(pondDepth(rock.p[0],rock.p[2])>0,'boulder on dry ground');
});

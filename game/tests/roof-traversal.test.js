import test from 'node:test';
import assert from 'node:assert/strict';
import { movementStep } from '../src/movement/movementStep.js';
import { advanceTraversal, beginTraversal, findTraversal } from '../src/movement/traversal.js';
import { STREET_ROOF_ITEMS, STREET_ROOF_LADDERS } from '../src/world/roofTraversal.js';
import { fallEffect } from '../src/world/player.js';
import outdoor from '../src/tuning/presets/outdoor.json' with { type: 'json' };

test('both street ladders connect the alley to the roof and offer a way back down', () => {
  for (const ladder of STREET_ROOF_LADDERS) {
    const ascent = findTraversal(STREET_ROOF_LADDERS, ladder.low, ladder.yaw);
    assert.equal(ascent?.item.id, ladder.id);
    const upper = advanceTraversal(beginTraversal(ascent, ladder.low, ladder.yaw), 30);
    assert.ok(upper.done && upper.position[1] > 20);
    const exitYaw = ladder.yaw + Math.PI;
    const descent = findTraversal(STREET_ROOF_LADDERS, upper.position, exitYaw);
    assert.equal(descent?.down, true);
    const lower = advanceTraversal(beginTraversal(descent, upper.position, exitYaw), 30);
    assert.deepEqual(lower.position, ladder.low);
  }
});

test('a normal sprint jump can cross each gap in both directions', () => {
  const roofs = STREET_ROOF_ITEMS.filter((item) => item.id.endsWith('-walkable-roof'));
  const tunables = outdoor.values;
  const bounds = (roof) => [roof.position[0] - roof.size[0] / 2, roof.position[0] + roof.size[0] / 2];
  const top = (roof) => roof.position[1] + roof.size[1] / 2;

  for (let i = 1; i < roofs.length; i += 1) {
    assert.ok(bounds(roofs[i])[0] - bounds(roofs[i - 1])[1] > tunables.capsuleRadius * 2, 'a real gap separates the roof slabs');
    for (const direction of [-1, 1]) {
      const [source, target] = direction > 0 ? [roofs[i - 1], roofs[i]] : [roofs[i], roofs[i - 1]];
      const yaw = -direction * Math.PI / 2;
      let x = bounds(source)[direction > 0 ? 1 : 0] - direction;
      let y = top(source) + 0.045;
      let state = { velocity: [direction * tunables.runSpeed, 0, 0], yaw, grounded: true, coyoteTimer: 0, jumpBufferTimer: 0 };
      const [left, right] = bounds(target);
      let landed = false;
      for (let frame = 0; frame < 180; frame += 1) {
        const next = movementStep({ input: { x: 0, z: 1, run: true, jump: true }, lookYaw: yaw, state, dt: 1 / 120, tunables });
        x += next.desiredDelta[0];
        y += next.desiredDelta[1];
        state = next.state;
        if (state.velocity[1] < 0 && y <= top(target) + 0.045) {
          landed = x > left + tunables.capsuleRadius && x < right - tunables.capsuleRadius;
          break;
        }
      }
      assert.ok(landed, `${source.id} to ${target.id} reaches solid roof`);
    }
  }
});

test('a short jump down is safe while falling from the roof still hurts', () => {
  assert.equal(fallEffect(9.1, 0.8), null);
  assert.ok(fallEffect(9.1), 'walking off a ledge does not count as a prepared jump');
  assert.equal(fallEffect(20, 22)?.amount, 22);
});

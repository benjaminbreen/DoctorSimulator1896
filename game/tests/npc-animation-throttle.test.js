import test from 'node:test';
import assert from 'node:assert/strict';
import { updateNpcAnimation } from '../src/scene/npcAnimationThrottle.js';

function actor() {
  return {
    updates: [],
    mixer: {
      update(step) {
        this.owner.updates.push(step);
      },
      owner: null,
    },
  };
}

function trackedActor() {
  const value = actor();
  value.mixer.owner = value;
  return value;
}

test('near NPC animation updates every frame', () => {
  const npc = trackedActor();
  assert.equal(updateNpcAnimation(npc, 0.02, 10 ** 2, 1), true);
  assert.deepEqual(npc.updates, [0.02]);
});

test('mid-distance NPC animation is staggered without losing time', () => {
  const npc = trackedActor();
  assert.equal(updateNpcAnimation(npc, 0.02, 40 ** 2, 1), false);
  assert.equal(updateNpcAnimation(npc, 0.02, 40 ** 2, 2), false);
  assert.equal(updateNpcAnimation(npc, 0.02, 40 ** 2, 3), true);
  assert.deepEqual(npc.updates, [0.06]);
});

test('hidden and very distant NPCs hold their pose without a catch-up jump', () => {
  const npc = trackedActor();
  updateNpcAnimation(npc, 0.1, 40 ** 2, 1);
  assert.equal(updateNpcAnimation(npc, 0.1, 61 ** 2, 2), false);
  assert.equal(npc.animationPending, 0);
  assert.equal(updateNpcAnimation(npc, 0.1, 10 ** 2, 3, 0, false), false);
  assert.equal(updateNpcAnimation(npc, 0.02, 10 ** 2, 4), true);
  assert.deepEqual(npc.updates, [0.02]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { GOODS, handVerb } from '../src/world/goods.js';
import {
  equipGood, getGoodCount, getPocket, heldGood, receiveGood, resetPocketForTests,
  runVerb, stowHeld,
} from '../src/world/pocket.js';
import { getThrowablePlay, resetThrowablePlayForTests } from '../src/world/throwablePlay.js';
import { THROWABLE_TYPES } from '../src/world/throwables.js';
import { getPlayer, resetPlayer, STARTING_NEURASTHENIA } from '../src/world/player.js';

test.afterEach(() => {
  resetPocketForTests();
  resetThrowablePlayForTests();
  resetPlayer();
});

// The hand slot lives in throwablePlay, so anything the player can carry has
// to exist in both registries or it will vanish when stowed.
test('every carryable good and every throwable have matching rows', () => {
  for (const item of Object.values(GOODS)) {
    if (item.throwable) assert.ok(THROWABLE_TYPES[item.throwable], `${item.id} names a throwable`);
    assert.ok(item.verbs.length > 0, `${item.id} has a verb`);
  }
  for (const type of Object.keys(THROWABLE_TYPES)) {
    const owner = Object.values(GOODS).find((item) => item.throwable === type);
    assert.ok(owner, `${type} has a good`);
  }
});

test('a bought good fills the hand first, then the pocket', () => {
  assert.equal(receiveGood('apple'), 'hand');
  assert.equal(heldGood().id, 'apple');
  assert.equal(getGoodCount('apple'), 0);

  assert.equal(receiveGood('apple'), 'pocket');
  assert.equal(heldGood().id, 'apple');
  assert.equal(getGoodCount('apple'), 1);

  assert.equal(receiveGood('nothing-like-this'), null);
});

test('a good with no throwable always goes to the pocket', () => {
  assert.equal(receiveGood('herring'), 'pocket');
  assert.equal(getThrowablePlay().phase, 'empty');
  assert.equal(equipGood('herring'), false);
});

test('equipping and stowing move one item without losing it', () => {
  resetPocketForTests({ cabbage: 2 });
  assert.ok(equipGood('cabbage'));
  assert.equal(getGoodCount('cabbage'), 1);
  assert.equal(getThrowablePlay().phase, 'held');

  // The hand is full, so the second one stays put.
  assert.equal(equipGood('cabbage'), false);
  assert.ok(stowHeld());
  assert.equal(getGoodCount('cabbage'), 2);
  assert.equal(getThrowablePlay().phase, 'empty');
});

test('eating spends the item and moves the meters', () => {
  receiveGood('herring');
  assert.ok(runVerb('herring', 'eat'));
  assert.equal(getGoodCount('herring'), 0);
  assert.equal(getPlayer().neurasthenia, STARTING_NEURASTHENIA - 3);
  // Nothing left to eat.
  assert.equal(runVerb('herring', 'eat'), false);
});

test('eating what is in hand empties the hand rather than the pocket', () => {
  resetPocketForTests({ apple: 1 });
  assert.ok(equipGood('apple'));
  assert.ok(runVerb('apple', 'eat'));
  assert.equal(getThrowablePlay().phase, 'empty');
  assert.equal(getGoodCount('apple'), 0);
  assert.equal(getPlayer().neurasthenia, STARTING_NEURASTHENIA - 2);
});

test('the hand verb is the first one, and the pocket lists in registry order', () => {
  assert.equal(handVerb('apple').id, 'throw');
  assert.equal(handVerb('herring').id, 'eat');
  resetPocketForTests({ herring: 1, apple: 2 });
  assert.deepEqual(getPocket().map((item) => item.id), ['apple', 'herring']);
  assert.equal(getPocket()[0].count, 2);
});

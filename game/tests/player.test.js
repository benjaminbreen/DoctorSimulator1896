import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlayer,
  resetPlayer,
  harm,
  recover,
  tickPlayer,
  condition,
  isDown,
  subscribePlayer,
  applyPlayerEvent,
  recentMeterEvents,
  healthCondition,
  neurastheniaCondition,
  MAX,
} from '../src/world/player.js';

test.beforeEach(() => resetPlayer());

test('a fresh player is unhurt and unwearied', () => {
  const player = getPlayer();
  assert.equal(player.health, MAX);
  assert.equal(player.neurasthenia, 0);
  assert.equal(player.fatigue, 0);
  assert.equal(condition(player), 'well');
});

test('harm takes health, tires, and says where it came from', () => {
  harm({ amount: 18, tires: 12, source: 'induction-coil', note: 'a shock at 3 cm' });
  const player = getPlayer();
  assert.equal(player.health, 82);
  assert.equal(player.fatigue, 12);
  assert.equal(player.log.at(-1).source, 'induction-coil');
  assert.equal(player.log.at(-1).note, 'a shock at 3 cm');
});

test('neither scalar leaves its range', () => {
  harm({ amount: 500, tires: 500 });
  assert.equal(getPlayer().health, 0);
  assert.equal(getPlayer().fatigue, MAX);
  recover({ health: 500, fatigue: 500 });
  assert.equal(getPlayer().health, MAX);
  assert.equal(getPlayer().fatigue, 0);
});

test('condition reads as words, worst first', () => {
  assert.equal(condition({ health: 100, fatigue: 0 }), 'well');
  assert.equal(condition({ health: 100, fatigue: 60 }), 'tiring');
  assert.equal(condition({ health: 100, fatigue: 90 }), 'exhausted');
  assert.equal(condition({ health: 60, fatigue: 0 }), 'shaken');
  assert.equal(condition({ health: 30, fatigue: 0 }), 'badly shaken');
  // Injury outranks tiredness: being hurt is the more urgent fact.
  assert.equal(condition({ health: 10, fatigue: 0 }), 'in a bad way');
});

test('each meter has its own readable condition', () => {
  assert.equal(healthCondition(100), 'full health');
  assert.equal(healthCondition(55), 'shaken');
  assert.equal(neurastheniaCondition(0), 'settled');
  assert.equal(neurastheniaCondition(55), 'strained');
  assert.equal(neurastheniaCondition(90), 'severe nervous exhaustion');
});

test('named events store their actual clamped changes', () => {
  applyPlayerEvent({
    source: 'galvanic-shock',
    label: 'Suffered a severe galvanic shock',
    changes: { health: -20, neurasthenia: 12 },
  });
  applyPlayerEvent({
    source: 'apple',
    label: 'Ate an apple',
    changes: { health: 50 },
  });
  const player = getPlayer();
  assert.equal(player.health, 100);
  assert.equal(player.neurasthenia, 12);
  assert.equal(player.log[0].changes.health, -20);
  assert.equal(player.log[1].changes.health, 20, 'the log records what fit below the cap');
});

test('recent meter history is filtered, capped, and newest first', () => {
  harm({ amount: 4, source: 'shock', label: 'First shock' });
  harm({ tires: 10, source: 'carriage', label: 'Near a carriage' });
  recover({ health: 2, source: 'apple', label: 'Ate an apple' });
  harm({ amount: 3, source: 'fall', label: 'Fell down' });
  harm({ amount: 1, source: 'bruise', label: 'Bruised a hand' });

  assert.deepEqual(
    recentMeterEvents('health', 3).map((event) => event.label),
    ['Bruised a hand', 'Fell down', 'Ate an apple'],
  );
  assert.deepEqual(
    recentMeterEvents('neurasthenia', 3).map((event) => event.label),
    ['Near a carriage'],
  );
});

test('events that hit an existing bound do not claim to change it', () => {
  recover({ health: 10, fatigue: 10, source: 'rest', label: 'Rested' });
  assert.equal(getPlayer().log.length, 0);
  assert.equal(recentMeterEvents('health').length, 0);
});

test('time heals slowly and eases nervous strain faster', () => {
  harm({ amount: 20, tires: 40 });
  tickPlayer(600);
  const player = getPlayer();
  assert.ok(player.health > 80 && player.health < 100, `${player.health} after ten minutes`);
  assert.equal(player.neurasthenia, 5, 'ten minutes should ease thirty-five points');
});

test('a hard shock puts the player down for a while', () => {
  assert.equal(isDown(), false);
  harm({ amount: 30, down: 6, source: 'induction-coil' });
  assert.equal(isDown(), true);
  tickPlayer(4);
  assert.equal(isDown(), true);
  tickPlayer(3);
  assert.equal(isDown(), false);
});

test('the log keeps the day, not the save file', () => {
  for (let i = 0; i < 50; i += 1) harm({ amount: 1, source: `hit-${i}` });
  const log = getPlayer().log;
  assert.equal(log.length, 40);
  assert.equal(log.at(-1).source, 'hit-49');
});

test('a tick too small to read does not wake subscribers', () => {
  let calls = 0;
  // Subscribing fires once immediately; count only what comes after.
  const off = subscribePlayer(() => {
    calls += 1;
  });
  calls = 0;
  // A hundredth of a second moves neither scalar by a whole point.
  tickPlayer(0.01);
  assert.equal(calls, 0, 'the HUD should not re-render sixty times a second');
  harm({ amount: 5 });
  assert.equal(calls, 1);
  off();
});

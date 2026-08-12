import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPlayer,
  resetPlayer,
  harm,
  recover,
  restEffect,
  seatRestEffect,
  recoverFromSeat,
  fallEffect,
  pushcartImpactEffect,
  carriageImpactEffect,
  beginPlayerReaction,
  advancePlayerReaction,
  tickPlayer,
  condition,
  isDown,
  subscribePlayer,
  applyPlayerEvent,
  recentMeterEvents,
  healthCondition,
  neurastheniaCondition,
  MAX,
  STARTING_NEURASTHENIA,
  SEAT_REST_SECONDS,
  SEAT_COOLDOWN_SECONDS,
  throwingEffect,
  npcStartleEffect,
  waterWalkingEffect,
  waterWalkingStep,
  WATER_WALK_INTERVAL_SECONDS,
} from '../src/world/player.js';
import { REACTION_MOTION, REACTION_PHASE } from '../src/world/actorReactions.js';

test.beforeEach(() => resetPlayer());

test('a fresh player is physically sound and nervously frazzled', () => {
  const player = getPlayer();
  assert.equal(player.health, MAX);
  assert.equal(player.neurasthenia, STARTING_NEURASTHENIA);
  assert.equal(player.fatigue, STARTING_NEURASTHENIA);
  assert.equal(player.log.length, 0, 'the opening condition is not a gameplay event');
  assert.equal(condition(player), 'tiring');
});

test('harm takes health, tires, and says where it came from', () => {
  harm({ amount: 18, tires: 12, source: 'induction-coil', note: 'a shock at 3 cm' });
  const player = getPlayer();
  assert.equal(player.health, 82);
  assert.equal(player.fatigue, STARTING_NEURASTHENIA + 12);
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
  assert.equal(neurastheniaCondition(65), 'frazzled');
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
  assert.equal(player.neurasthenia, STARTING_NEURASTHENIA + 12);
  assert.equal(player.log[0].changes.health, -20);
  assert.equal(player.log[1].changes.health, 20, 'the log records what fit below the cap');
});

test('throwing and player-caused startles add named nervous-strain events', () => {
  applyPlayerEvent(throwingEffect('apple', 'Apple'));
  assert.equal(getPlayer().log.at(-1).label, 'You threw an apple like a reckless madman!');
  assert.equal(getPlayer().neurasthenia, STARTING_NEURASTHENIA + 2);

  applyPlayerEvent(npcStartleEffect('pedestrian-4'));
  assert.equal(getPlayer().log.at(-1).label, 'You startled a passer-by.');
  assert.equal(getPlayer().neurasthenia, STARTING_NEURASTHENIA + 5);
});

test('active water walking loses health in rate-limited intervals', () => {
  let step = waterWalkingStep(0, WATER_WALK_INTERVAL_SECONDS / 2, true);
  assert.deepEqual(step, { exposure: 1, damage: 0 });
  step = waterWalkingStep(step.exposure, WATER_WALK_INTERVAL_SECONDS / 2, true);
  assert.deepEqual(step, { exposure: 0, damage: 1 });
  applyPlayerEvent(waterWalkingEffect(step.damage));
  assert.equal(getPlayer().health, MAX - 1);
  assert.equal(getPlayer().log.at(-1).label, 'You waded through cold water.');
  assert.deepEqual(waterWalkingStep(1.5, 0.1, false), { exposure: 0, damage: 0 });
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
  recover({ health: 10, source: 'rest', label: 'Rested' });
  assert.equal(getPlayer().log.length, 0);
  assert.equal(recentMeterEvents('health').length, 0);
});

test('time alone does not restore health or ease nervous strain', () => {
  harm({ amount: 20, tires: 20 });
  const before = getPlayer();
  tickPlayer(600);
  const player = getPlayer();
  assert.equal(player.health, before.health);
  assert.equal(player.neurasthenia, before.neurasthenia);
  assert.equal(player.clock, 600);
});

test('rest recovery scales with duration and is capped', () => {
  assert.deepEqual(restEffect(0.5), { health: 1, neurasthenia: 5 });
  assert.deepEqual(restEffect(3), { health: 6, neurasthenia: 30 });
  assert.deepEqual(restEffect(24), { health: 12, neurasthenia: 45 });
});

test('sitting briefly gives a modest recovery with a per-seat cooldown', () => {
  assert.deepEqual(seatRestEffect(SEAT_REST_SECONDS - 0.01), { health: 0, neurasthenia: 0 });
  assert.deepEqual(seatRestEffect(SEAT_REST_SECONDS), { health: 1, neurasthenia: 4 });

  const first = recoverFromSeat({ seatId: 'park-bench', seconds: SEAT_REST_SECONDS });
  assert.ok(first.event);
  assert.equal(getPlayer().neurasthenia, STARTING_NEURASTHENIA - 4);

  harm({ amount: 5 });
  const blocked = recoverFromSeat({ seatId: 'park-bench', seconds: SEAT_REST_SECONDS });
  assert.equal(blocked.reason, 'cooldown');
  assert.equal(getPlayer().health, 95);

  tickPlayer(SEAT_COOLDOWN_SECONDS + 1);
  recoverFromSeat({ seatId: 'park-bench', seconds: SEAT_REST_SECONDS });
  assert.equal(getPlayer().health, 96);
});

test('falls and pushcart impacts use deterministic severity thresholds', () => {
  assert.equal(fallEffect(7.99), null);
  assert.deepEqual(fallEffect(8), {
    amount: 4,
    neurasthenia: 3,
    source: 'fall',
    label: 'Landed hard',
  });
  assert.equal(fallEffect(16).amount, 22);

  assert.equal(pushcartImpactEffect(4.74), null);
  assert.equal(pushcartImpactEffect(5).amount, 3);
  assert.equal(pushcartImpactEffect(12).amount, 12);
});

test('a carriage hit removes most health at ordinary street speed', () => {
  assert.equal(carriageImpactEffect(0.79), null);
  assert.equal(carriageImpactEffect(1.5).amount, 40);
  assert.deepEqual(carriageImpactEffect(4), {
    amount: 60,
    neurasthenia: 20,
    down: 6,
    source: 'horseless-carriage',
    label: 'Run down by a horseless carriage',
  });
  assert.equal(carriageImpactEffect(5).amount, 75);
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

test('the player knockdown follows the shared fall, prone, and rise phases', () => {
  beginPlayerReaction({ response: 'knockdown', cause: 'horseless-carriage' });
  assert.equal(getPlayer().reaction.phase, REACTION_PHASE.FALLING);
  assert.equal(isDown(), true);

  tickPlayer(REACTION_MOTION.fallShoulder.duration);
  advancePlayerReaction();
  assert.equal(getPlayer().reaction.phase, REACTION_PHASE.PRONE);

  tickPlayer(getPlayer().reaction.proneUntil - getPlayer().clock);
  advancePlayerReaction({ canStand: true });
  assert.equal(getPlayer().reaction.phase, REACTION_PHASE.RISING);

  tickPlayer(REACTION_MOTION.rise.duration);
  advancePlayerReaction();
  assert.equal(getPlayer().reaction.phase, REACTION_PHASE.NORMAL);
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

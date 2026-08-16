import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REACTION_MOTION,
  REACTION_PHASE,
  beginReaction,
  classifyPedestrianImpact,
  classifyPedestrianStartle,
  createReactionState,
  proneHoldSeconds,
  reactionLocksMovement,
  stepReaction,
} from '../src/world/actorReactions.js';
import {
  queueActorImpact,
  resetActorImpactsForTests,
  takeActorImpacts,
} from '../src/world/actorImpacts.js';
import { ledgeCandidate } from '../src/world/motionAffordances.js';

test('bumps scale: flinch, stagger, then a real running hit knocks down', () => {
  assert.equal(classifyPedestrianImpact({ cause: 'player-body', relativeSpeed: 1 }), 'flinch');
  assert.equal(classifyPedestrianImpact({ cause: 'player-body', relativeSpeed: 4.1 }), 'stagger');
  assert.equal(classifyPedestrianImpact({ cause: 'player-body', relativeSpeed: 5.2, running: true }), 'stagger');
  assert.equal(classifyPedestrianImpact({ cause: 'player-body', relativeSpeed: 8, running: true }), 'knockdown');
  assert.equal(classifyPedestrianImpact({ cause: 'horseless-carriage', relativeSpeed: 0.79 }), null);
  assert.equal(classifyPedestrianImpact({ cause: 'horseless-carriage', relativeSpeed: 1 }), 'knockdown');
  assert.equal(classifyPedestrianImpact({ cause: 'horse-drawn-vehicle', relativeSpeed: 1.4 }), 'knockdown');
  // Two walkers colliding head-on flinch; an overtaking brush passes.
  assert.equal(classifyPedestrianImpact({ cause: 'pedestrian-body', relativeSpeed: 2.6 }), 'flinch');
  assert.equal(classifyPedestrianImpact({ cause: 'pedestrian-body', relativeSpeed: 0.4 }), null);
});

test('ordinary pedestrians stay upright: knockdowns collapse to a stagger, light bumps flinch', () => {
  assert.equal(classifyPedestrianStartle({ cause: 'player-body', relativeSpeed: 0.2 }), null);
  assert.equal(classifyPedestrianStartle({ cause: 'player-body', relativeSpeed: 1 }), 'flinch');
  assert.equal(
    classifyPedestrianStartle({ cause: 'player-body', relativeSpeed: 8, running: true }),
    'stagger',
  );
  assert.equal(classifyPedestrianStartle({ cause: 'horseless-carriage', relativeSpeed: 2 }), 'stagger');
  assert.equal(classifyPedestrianStartle({ cause: 'horse-drawn-vehicle', relativeSpeed: 2 }), 'stagger');
});

test('prone recovery rises smoothly with chronological age', () => {
  assert.ok(proneHoldSeconds(24) < 1);
  assert.ok(proneHoldSeconds(40) > proneHoldSeconds(30));
  assert.ok(proneHoldSeconds(55) > proneHoldSeconds(40));
  assert.ok(proneHoldSeconds(65) > 7);
  assert.equal(proneHoldSeconds(10), proneHoldSeconds(22));
  assert.equal(proneHoldSeconds(90), proneHoldSeconds(67));
});

test('a knockdown advances through fall, prone, rise, and normal', () => {
  let reaction = beginReaction(
    createReactionState(),
    { response: 'knockdown', cause: 'horseless-carriage', direction: [3, 4] },
    10,
    { age: 24 },
  );
  assert.equal(reaction.phase, REACTION_PHASE.FALLING);
  assert.deepEqual(reaction.direction, [0.6, 0.8]);
  assert.equal(reactionLocksMovement(reaction), true);

  reaction = stepReaction(reaction, 10 + REACTION_MOTION.fallShoulder.duration);
  assert.equal(reaction.phase, REACTION_PHASE.PRONE);
  reaction = stepReaction(reaction, reaction.proneUntil, { canStand: false });
  assert.equal(reaction.phase, REACTION_PHASE.PRONE, 'an occupied space delays the rise');
  reaction = stepReaction(reaction, reaction.proneUntil, { canStand: true });
  assert.equal(reaction.phase, REACTION_PHASE.RISING);
  reaction = stepReaction(reaction, reaction.phaseUntil);
  assert.equal(reaction.phase, REACTION_PHASE.NORMAL);
});

test('another hit extends prone time without restarting the fall', () => {
  let reaction = beginReaction(
    createReactionState(),
    { response: 'knockdown', cause: 'player-body' },
    0,
    { age: 30 },
  );
  const firstEnd = reaction.phaseUntil;
  const firstProne = reaction.proneUntil;
  reaction = beginReaction(
    reaction,
    { response: 'knockdown', cause: 'horseless-carriage', proneSeconds: 4 },
    1,
    { age: 30 },
  );
  assert.equal(reaction.phaseUntil, firstEnd);
  assert.ok(reaction.proneUntil > firstProne);
});

test('impact mailboxes are drained per stable actor ID', () => {
  resetActorImpactsForTests();
  queueActorImpact('ped-a', { cause: 'player-body' });
  queueActorImpact('ped-a', { cause: 'horseless-carriage' });
  queueActorImpact('ped-b', { cause: 'player-body' });
  assert.equal(takeActorImpacts('ped-a').length, 2);
  assert.equal(takeActorImpacts('ped-a').length, 0);
  assert.equal(takeActorImpacts('ped-b').length, 1);
});

test('ledge affordances require a still actor facing the authored edge', () => {
  const edge = {
    id: 'roof-edge',
    type: 'ledge',
    position: [2, 8, 3],
    outward: [0, -1],
    radius: 0.7,
  };
  assert.equal(ledgeCandidate([edge], { position: [2.1, 8, 3], yaw: 0, speed: 0 })?.id, 'roof-edge');
  assert.equal(ledgeCandidate([edge], { position: [2.1, 8, 3], yaw: Math.PI, speed: 0 }), null);
  assert.equal(ledgeCandidate([edge], { position: [2.1, 8, 3], yaw: 0, speed: 1 }), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { removeAgent, reportAgent } from '../src/world/agents.js';
import { crowdDialogueDefinition, installCrowdDialogue } from '../src/world/crowdDialogue.js';
import {
  canAfford, describePurse, formatPrice, getPurse, getPurseCents, planPayment,
  resetPurseForTests, spendCents,
} from '../src/world/purse.js';
import {
  grievanceAgainst, recordGrievance, resetGrievancesForTests, settleGrievance,
} from '../src/world/grievances.js';
import { ownerOfCart, POSTED_NPCS } from '../src/world/postedNpcs.js';
import { setRunSeedForTests } from '../src/world/runSeed.js';

installCrowdDialogue();
setRunSeedForTests(4242);

function standUpVendor(id = 'plaza-pushcart-vendor') {
  const spec = POSTED_NPCS.find((npc) => npc.id === id);
  reportAgent(id, spec.position[0], spec.position[2], 0.42, {
    kind: 'pedestrian',
    dialogueId: id,
    dialogueName: spec.dialogueName,
    ownsId: spec.ownsId,
    sells: spec.sells,
    dialogueContext: {
      archetype: spec.archetype, role: spec.role, activity: spec.activity, hour: 11, seed: 5,
    },
  });
  return spec;
}

test('the purse spends only what it has and speaks its total', () => {
  resetPurseForTests();
  assert.equal(getPurseCents(), 1747);
  assert.equal(describePurse(), 'Seventeen dollars and forty-seven cents');
  assert.ok(canAfford(1));
  assert.ok(!canAfford(1748));
  assert.ok(spendCents(1));
  assert.equal(getPurseCents(), 1746);
  assert.ok(!spendCents(99999), 'an unaffordable price is refused');
  assert.equal(getPurseCents(), 1746, 'a refused sale takes nothing');
  resetPurseForTests({});
  assert.equal(describePurse(), 'Zero cents');
  resetPurseForTests({ 'note-1': 1, cent: 1 });
  assert.equal(describePurse(), 'One dollar and one cent');
  assert.equal(formatPrice(1), '1¢');
  assert.equal(formatPrice(250), '$2.50');
  resetPurseForTests();
});

test('a manned cart has an owner and priced goods; unmanned carts do not', () => {
  assert.equal(ownerOfCart('cart-plaza')?.id, 'plaza-pushcart-vendor');
  assert.equal(ownerOfCart('cart-savoy'), null, 'the cabbage set piece is unmanned');
  const apple = ownerOfCart('cart-plaza').sells[0];
  assert.equal(apple.priceCents, 1);
  assert.ok(apple.label);
});

test('theft angers the owner, and paying settles it', () => {
  resetGrievancesForTests();
  const spec = standUpVendor();
  try {
    assert.equal(crowdDialogueDefinition(spec.id).grievance, null);
    assert.doesNotMatch(
      crowdDialogueDefinition(spec.id).opening,
      /took|did not pay/i,
      'an unrobbed vendor does not accuse anyone',
    );

    recordGrievance(spec.id, 'theft');
    const robbed = crowdDialogueDefinition(spec.id);
    assert.equal(robbed.grievance.kind, 'theft');
    assert.equal(robbed.grievance.count, 1);
    assert.match(robbed.opening, /took|penny|pay/i, 'he opens by accusing the player');
    assert.equal(robbed.clientContext.grievance.kind, 'theft', 'the grievance crosses the wire');

    recordGrievance(spec.id, 'theft');
    assert.equal(grievanceAgainst(spec.id).count, 2, 'repeat thefts accumulate');

    settleGrievance(spec.id);
    assert.equal(grievanceAgainst(spec.id), null);
    assert.equal(crowdDialogueDefinition(spec.id).grievance, null, 'paying clears the accusation');
  } finally {
    removeAgent(spec.id);
    resetGrievancesForTests();
  }
});

test('a grievance expires on its own', () => {
  resetGrievancesForTests();
  const now = 1_000_000;
  recordGrievance('vendor-x', 'theft', now);
  assert.ok(grievanceAgainst('vendor-x', now + 60_000));
  assert.equal(grievanceAgainst('vendor-x', now + 9 * 60 * 1000), null);
  resetGrievancesForTests();
});

test('a vendor carries his stock into the dialogue packet', () => {
  const spec = standUpVendor();
  try {
    const definition = crowdDialogueDefinition(spec.id);
    assert.equal(definition.sells.length, 1);
    assert.equal(definition.sells[0].id, 'apple');
    assert.deepEqual(definition.clientContext.sells, definition.sells);
    // Someone with nothing to sell exposes an empty list, not undefined.
    reportAgent('crowd-nogoods', 0, 0, 0.45, {
      kind: 'pedestrian',
      dialogueId: 'crowd-nogoods',
      dialogueContext: { archetype: 'm', role: 'commuter', activity: 'walking', hour: 9, seed: 2 },
    });
    assert.deepEqual(crowdDialogueDefinition('crowd-nogoods').sells, []);
  } finally {
    removeAgent(spec.id);
    removeAgent('crowd-nogoods');
  }
});

test('the purse is made of real pieces that add up', () => {
  resetPurseForTests();
  const pieces = getPurse();
  assert.ok(pieces.length > 0);
  const total = pieces.reduce((sum, piece) => sum + piece.cents * piece.count, 0);
  assert.equal(total, getPurseCents(), 'the pieces are the total, not a parallel number');
  // Largest first, so the drawer lays notes out before coins.
  const values = pieces.map((piece) => piece.cents);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
  assert.ok(pieces.some((piece) => piece.kind === 'note'));
  assert.ok(pieces.some((piece) => piece.id === 'cent'), 'small change to pay a penny with');
});

test('paying a penny spends a penny, not a note', () => {
  resetPurseForTests();
  const plan = planPayment(1);
  assert.deepEqual(plan.given, { cent: 1 });
  assert.deepEqual(plan.change, {});
  spendCents(1);
  assert.equal(getPurseCents(), 1746);
});

test('a price with no exact change overpays and takes change back in coin', () => {
  // Only a half dollar: buying a three-cent herring must break it.
  resetPurseForTests({ half: 1 });
  const plan = planPayment(3);
  assert.deepEqual(plan.given, { half: 1 });
  assert.equal(plan.paid, 50);
  assert.ok(Object.keys(plan.change).length > 0, 'he breaks the half dollar');
  assert.ok(spendCents(3));
  assert.equal(getPurseCents(), 47, 'forty-seven cents comes back');
  assert.ok(getPurse().every((piece) => piece.kind === 'coin'), 'change is never paper');
  resetPurseForTests();
});

test('an unaffordable price yields no plan and moves nothing', () => {
  resetPurseForTests({ cent: 2 });
  assert.equal(planPayment(5), null);
  assert.ok(!spendCents(5));
  assert.equal(getPurseCents(), 2);
  resetPurseForTests();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { removeAgent, reportAgent } from '../src/world/agents.js';
import { crowdDialogueDefinition, installCrowdDialogue, moneyMannerFor } from '../src/world/crowdDialogue.js';
import { OFFER_RANGE, pickDropTarget } from '../src/world/dropTargets.js';
import { clearOffer, offerPiece, offerTo, resetOffersForTests } from '../src/world/moneyOffer.js';
import { getPurseCents, resetPurseForTests } from '../src/world/purse.js';
import { grievanceAgainst, recordGrievance, resetGrievancesForTests } from '../src/world/grievances.js';
import { setRunSeedForTests } from '../src/world/runSeed.js';

installCrowdDialogue();
setRunSeedForTests(31337);

function speaker(id, archetype, role = 'stroller') {
  reportAgent(id, 0, 0, 0.45, {
    kind: 'pedestrian',
    dialogueId: id,
    dialogueName: 'someone',
    dialogueContext: { archetype, role, activity: 'standing', hour: 12, seed: 4 },
  });
}

test('a drop lands on the figure under it, or on the ground', () => {
  const near = {
    id: 'near', name: 'A policeman', distance: 2, screenX: 500, screenY: 400,
  };
  assert.equal(pickDropTarget({ x: 505, y: 410 }, [near]).kind, 'npc');
  assert.equal(pickDropTarget({ x: 505, y: 410 }, [near]).id, 'near');
  // Well outside the body box.
  assert.equal(pickDropTarget({ x: 900, y: 400 }, [near]).kind, 'ground');
  // Visible but too far across the park to hand anything to.
  assert.equal(
    pickDropTarget({ x: 500, y: 400 }, [{ ...near, distance: OFFER_RANGE + 1 }]).kind,
    'ground',
  );
  // Behind the camera projects to a screen point but is not a target.
  assert.equal(
    pickDropTarget({ x: 500, y: 400 }, [{ ...near, behindCamera: true }]).kind,
    'ground',
  );
  assert.equal(pickDropTarget({ x: 10, y: 10 }, []).kind, 'ground');
});

test('the nearer of two overlapping figures takes the money', () => {
  const a = { id: 'a', name: 'A', distance: 2, screenX: 500, screenY: 400 };
  const b = { id: 'b', name: 'B', distance: 2, screenX: 520, screenY: 400 };
  assert.equal(pickDropTarget({ x: 502, y: 400 }, [a, b]).id, 'a');
  assert.equal(pickDropTarget({ x: 518, y: 400 }, [a, b]).id, 'b');
});

test('offering a piece moves it out of the purse once', () => {
  resetPurseForTests({ dime: 1 });
  resetOffersForTests();
  try {
    assert.equal(getPurseCents(), 10);
    const offer = offerPiece('someone', 'dime');
    assert.equal(offer.cents, 10);
    assert.equal(getPurseCents(), 0, 'the coin has left the purse');
    assert.equal(offerTo('someone').pieceId, 'dime');
    // Nothing left to offer.
    assert.equal(offerPiece('someone', 'dime'), null);
    clearOffer('someone');
    assert.equal(offerTo('someone'), null);
  } finally {
    resetPurseForTests();
    resetOffersForTests();
  }
});

test('money settles a theft, and reaches the speaker as an offer', () => {
  resetPurseForTests({ quarter: 1 });
  resetOffersForTests();
  resetGrievancesForTests();
  speaker('vendor-offer', 'v', 'vendor');
  try {
    recordGrievance('vendor-offer', 'theft');
    assert.ok(grievanceAgainst('vendor-offer'));
    offerPiece('vendor-offer', 'quarter');
    assert.equal(grievanceAgainst('vendor-offer'), null, 'paying up settles it');

    const definition = crowdDialogueDefinition('vendor-offer');
    assert.equal(definition.moneyOffer.pieceId, 'quarter');
    assert.equal(definition.moneyManner, 'payment');
    assert.equal(definition.clientContext.moneyOffer.cents, 25);
    assert.match(definition.opening, /obliged|do nicely/i, 'a tradesman takes it');
  } finally {
    removeAgent('vendor-offer');
    resetPurseForTests();
    resetOffersForTests();
    resetGrievancesForTests();
  }
});

test('station decides the manner: a bribe, an affront, a delight', () => {
  assert.equal(moneyMannerFor('p'), 'bribe');
  assert.equal(moneyMannerFor('b'), 'delight');
  assert.equal(moneyMannerFor('f'), 'affront');
  assert.equal(moneyMannerFor('v'), 'payment');
  assert.equal(moneyMannerFor('zzz'), 'puzzled', 'an unknown station is merely confused');

  resetPurseForTests({ dollar: 1 });
  resetOffersForTests();
  speaker('cop-offer', 'p', 'police');
  try {
    offerPiece('cop-offer', 'dollar');
    const cop = crowdDialogueDefinition('cop-offer');
    assert.equal(cop.moneyManner, 'bribe');
    assert.match(cop.opening, /put that away|meant to buy/i, 'he treats it as a bribe');
  } finally {
    removeAgent('cop-offer');
    resetPurseForTests();
    resetOffersForTests();
  }
});

test('a refused offer goes back in the purse; an accepted one does not', () => {
  resetPurseForTests({ dollar: 2 });
  resetOffersForTests();
  speaker('cop-refuse', 'p', 'police');
  speaker('boy-take', 'b', 'play');
  try {
    const refused = offerPiece('cop-refuse', 'dollar');
    assert.equal(refused.refused, true, 'an officer will not be bought');
    assert.equal(getPurseCents(), 200, 'the dollar never really left your hand');

    const taken = offerPiece('boy-take', 'dollar');
    assert.equal(taken.refused, false);
    assert.equal(getPurseCents(), 100, 'the boy keeps it');
  } finally {
    removeAgent('cop-refuse');
    removeAgent('boy-take');
    resetPurseForTests();
    resetOffersForTests();
  }
});

test('a refused offer cannot be used to settle a theft', () => {
  resetPurseForTests({ dollar: 1 });
  resetOffersForTests();
  resetGrievancesForTests();
  // A respectable woman refuses money, so a grievance of hers stands.
  speaker('lady-refuse', 'f', 'promenader');
  try {
    recordGrievance('lady-refuse', 'theft');
    offerPiece('lady-refuse', 'dollar');
    assert.ok(grievanceAgainst('lady-refuse'), 'refused money settles nothing');
    assert.equal(getPurseCents(), 100);
  } finally {
    removeAgent('lady-refuse');
    resetPurseForTests();
    resetOffersForTests();
    resetGrievancesForTests();
  }
});

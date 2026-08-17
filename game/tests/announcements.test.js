import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARRY,
  announce,
  dismissAnnouncement,
  getAnnouncement,
  resetAnnouncementsForTests,
} from '../src/world/announcements.js';
import {
  loudestWitness,
  officerWithinEarshot,
  raiseHawk,
  raiseNewsboyCry,
  raiseStreetOutcry,
  raiseTheftOutcry,
} from '../src/world/outcry.js';
import { isNearMiss } from '../src/world/horseDrawnTraffic.js';
import { hotelRegister, registerFor } from '../src/world/hotelRegister.js';
import { inPlantedBed } from '../src/world/groundCover.js';
import { removeAgent, reportAgent } from '../src/world/agents.js';
import { badgeFor, noteNameSpoken, resetAcquaintanceForTests } from '../src/world/acquaintance.js';

const at = (now) => now;

test.beforeEach(() => {
  resetAnnouncementsForTests();
});

test('a louder cry cuts in, a quieter one waits', () => {
  announce({ line: 'A bad business in the road.', carry: CARRY.street, now: at(0) });
  const officer = announce({ line: 'Stand where you are.', carry: CARRY.law, now: at(100) });
  assert.ok(officer, 'the law interrupts street talk');
  assert.equal(getAnnouncement().line, 'Stand where you are.');

  const quieter = announce({ line: 'Look at that, then.', carry: CARRY.street, now: at(200) });
  assert.equal(quieter, null, 'a bystander does not talk over the officer');
});

test('same-carry cries inside the gap are dropped, not queued', () => {
  announce({ line: 'One.', carry: CARRY.alarm, now: at(0) });
  assert.equal(announce({ line: 'Two.', carry: CARRY.alarm, now: at(1000) }), null);
  assert.ok(announce({ line: 'Three.', carry: CARRY.alarm, now: at(9000) }));
});

test('the same key does not repeat itself', () => {
  announce({ line: 'Fetch a doctor!', key: 'outcry:7', carry: CARRY.alarm, now: at(0) });
  dismissAnnouncement(getAnnouncement().id);
  assert.equal(announce({ line: 'Fetch a doctor!', key: 'outcry:7', carry: CARRY.alarm, now: at(9000) }), null);
  assert.ok(announce({ line: 'Fetch a doctor!', key: 'outcry:7', carry: CARRY.alarm, now: at(31000) }));
});

test('the loudest bystander shouts, and never the victim', () => {
  const victim = { agent: { id: 'hit', dialogueName: 'A man in a bowler hat' }, concern: 'outraged', distance: 0, involvedSelf: true };
  const near = { agent: { id: 'near', dialogueName: 'A woman in working dress' }, concern: 'shaken', distance: 4, involvedSelf: false };
  const far = { agent: { id: 'far', dialogueName: 'A policeman' }, concern: 'annoyed', distance: 30, involvedSelf: false };
  assert.equal(loudestWitness([victim, near, far]).agent.id, 'near');
  assert.equal(loudestWitness([victim, far]), null, 'a shrug is not a shout');
});

test('a struck pedestrian brings a call for a doctor', () => {
  const witnesses = [{
    agent: { id: 'near', dialogueName: 'A woman in working dress' },
    concern: 'shaken',
    distance: 5,
    involvedSelf: false,
  }];
  const cry = raiseStreetOutcry({ id: 1, kind: 'vehicle-impact', targetKind: 'pedestrian', x: 0, z: 0 }, witnesses);
  assert.ok(cry);
  assert.match(cry.line, /doctor|help/i);
  assert.equal(cry.anchorId, 'near');
  assert.equal(cry.carry, CARRY.alarm);
});

test('an officer in sight challenges a theft; out of sight, nobody does', () => {
  reportAgent('post', 6, 0, 0.42, { kind: 'policeman', dialogueName: 'A policeman' });
  try {
    assert.equal(officerWithinEarshot(0, 0, 22)?.id, 'post');
    assert.equal(officerWithinEarshot(0, 0, 4), null);

    const challenge = raiseTheftOutcry({ x: 0, z: 0, seed: 1 });
    assert.ok(challenge, 'he saw it happen');
    assert.equal(challenge.carry, CARRY.law);
    assert.equal(challenge.anchorId, 'post');

    resetAnnouncementsForTests();
    assert.equal(raiseTheftOutcry({ x: 400, z: 400, seed: 1 }), null, 'across the park he sees nothing');
  } finally {
    removeAgent('post');
  }
});

test('a plate names a stranger by sight, and by name once he gives it', () => {
  resetAcquaintanceForTests();
  const definition = { name: 'A hotel doorman', identity: { name: 'Ambrose Kelly', age: 44, sex: 'male' } };
  assert.deepEqual(badgeFor('doorman', definition), {
    speaker: 'A hotel doorman',
    station: 'In his mid-forties',
  });

  assert.equal(noteNameSpoken('doorman', 'Ambrose Kelly', 'Kelly, sir, and I have stood this door eleven years.'), 'Ambrose Kelly');
  assert.deepEqual(badgeFor('doorman', definition), {
    speaker: 'Ambrose Kelly',
    station: 'A hotel doorman',
  });
});

test('a name the speaker never said is not learned', () => {
  resetAcquaintanceForTests();
  assert.equal(noteNameSpoken('vendor', 'Ambrose Kelly', 'Couldn’t say, sir.'), null);
  assert.equal(badgeFor('vendor', { name: 'A pushcart vendor' }).speaker, 'A pushcart vendor');
});

test('inspecting somebody is not rate-limited and never talks over a cry', () => {
  const plate = () => announce({
    speaker: 'A policeman', station: 'On his post', line: null, carry: CARRY.inspect, now: 0,
  });
  assert.ok(plate());
  assert.ok(plate(), 'the player may point at two people in a row');
  announce({ line: 'Stand where you are.', carry: CARRY.law, now: 100 });
  assert.equal(plate(), null, 'the officer is talking');
});

test('a driver only shouts at somebody in front of a moving team', () => {
  const team = { horseX: 0, horseZ: 0, horseYaw: 0, speed: 3 };
  assert.equal(isNearMiss(team, [0, 1, 2.4]), true, 'straight ahead, a yard off');
  assert.equal(isNearMiss(team, [2.4, 1, 0]), false, 'beside the horses');
  assert.equal(isNearMiss(team, [0, 1, -2.4]), false, 'behind them');
  assert.equal(isNearMiss(team, [0, 1, 9]), false, 'well up the road');
  assert.equal(isNearMiss({ ...team, speed: 0.4 }, [0, 1, 2.4]), false, 'a standing team');
});

test('the newsboy cries the speech only after it has happened', () => {
  const cry = (hour) => {
    resetAnnouncementsForTests();
    return raiseNewsboyCry({ hour, anchorId: 'newsboy' }).line;
  };
  assert.doesNotMatch(cry(8), /Roosevelt/);
  assert.match(cry(11), /Roosevelt/);
  assert.doesNotMatch(cry(20), /Roosevelt/, 'and not after he has left the park');
});

test('a hawker quotes the price on his own stock list', () => {
  const cry = raiseHawk({
    archetype: 'v',
    speaker: 'A pushcart vendor',
    sells: [{ id: 'apple', label: 'an apple', priceCents: 1 }],
    anchorId: 'plaza-pushcart-vendor',
  });
  assert.match(cry.line, /An apple, sir — a penny/);
  assert.equal(cry.carry, CARRY.street);
});

test('a pelted officer answers in person rather than shouting from his post', () => {
  reportAgent('post', 2, 0, 0.42, { kind: 'policeman', dialogueName: 'A policeman' });
  try {
    const event = {
      id: 9, kind: 'pelting', sourceId: 'player', targetKind: 'policeman', x: 0, z: 0,
    };
    assert.equal(raiseStreetOutcry(event, []), null, 'the confrontation says it instead');
  } finally {
    removeAgent('post');
  }
});

test('the hotel register is a fixed list of real rooms, and only staff have it', () => {
  const guests = hotelRegister(4242);
  assert.equal(guests.length, 6);
  assert.equal(new Set(guests.map((guest) => guest.room)).size, 6, 'no two guests share a room');
  for (const guest of guests) {
    assert.ok(guest.room >= 200 && guest.room <= 599, `room ${guest.room}`);
    assert.match(guest.name, /^(Mr\.|Mrs\.|Miss|Dr\.|Judge|Colonel) /);
  }
  assert.deepEqual(hotelRegister(4242), guests, 'the same run gives the same house');
  assert.notDeepEqual(hotelRegister(99), guests, 'a new run rerolls it');

  assert.equal(registerFor('dm', 'central-park').length, 6, 'the doorman knows his house');
  assert.equal(registerFor('p', 'central-park').length, 0, 'a policeman does not');
  assert.equal(registerFor('dm', 'cattell-lab').length, 0, 'and not from another building');
});

test('the keeper only objects to feet actually in his planting', () => {
  let inBed = null;
  let onLawn = null;
  for (let x = -180; x < 60 && (!inBed || !onLawn); x += 3) {
    for (let z = -40; z < 80; z += 3) {
      if (inPlantedBed(x, z)) inBed ??= [x, z];
      else onLawn ??= [x, z];
    }
  }
  assert.ok(inBed, 'the park has beds somewhere');
  assert.equal(inPlantedBed(onLawn[0], onLawn[1]), false);
});

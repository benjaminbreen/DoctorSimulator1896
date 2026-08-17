import test from 'node:test';
import assert from 'node:assert/strict';
import { removeAgent, reportAgent } from '../src/world/agents.js';
import {
  buildCrowdDefinition,
  crowdDialogueDefinition,
  crowdSpeakerDetails,
  installCrowdDialogue,
} from '../src/world/crowdDialogue.js';
import { npcDialogueDefinition, offlineNpcReply } from '../src/world/npcDialogue.js';
import { renderNpcDialogue } from '../src/world/npcDialogueClient.js';
import { rollIdentity } from '../src/world/npcIdentity.js';
import { attendingNow, parkBulletin } from '../src/world/parkBulletin.js';
import { ROOSEVELT_SPEECH_SITE } from '../src/world/teddyRoosevelt.js';
import {
  recordGrievance,
  resetGrievancesForTests,
  settleGrievance,
} from '../src/world/grievances.js';
import {
  reportMajorStreetEvent,
  resetMajorStreetEventsForTests,
} from '../src/world/majorStreetEvents.js';
import {
  CONCERN_LEVELS,
  resetWitnessMemoryForTests,
  witnessedBy,
} from '../src/world/witnessMemory.js';
import { setRunSeedForTests } from '../src/world/runSeed.js';

installCrowdDialogue();
setRunSeedForTests(1234);

function speak(id, context, x = 0, z = 0) {
  const details = crowdSpeakerDetails(context);
  reportAgent(id, x, z, 0.45, {
    kind: 'pedestrian',
    dialogueId: id,
    dialogueName: details.dialogueName,
    dialogueContext: { ...details.dialogueContext },
  });
}

test('an identity roll is deterministic per seed and varies across seeds', () => {
  const a = rollIdentity('m', 42);
  const b = rollIdentity('m', 42);
  assert.deepEqual(a, b);
  assert.match(a.name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.equal(a.sex, 'male');
  const many = new Set(
    Array.from({ length: 40 }, (_, i) => rollIdentity('m', i).name),
  );
  assert.ok(many.size > 10, 'names vary across seeds');
});

test('police, doormen, dandies, and the sailor boy are all speakable', () => {
  const cases = [
    { archetype: 'p', role: 'police', label: 'On his post', profession: /patrolman|roundsman/ },
    { archetype: 'dm', role: 'doorman', label: 'At the hotel door', profession: /doorman/ },
    { archetype: 'y', role: 'idler', label: 'Idling', profession: /leisure|Harvard|partner/ },
    { archetype: 'b', role: 'play', label: 'At play', profession: /schoolboy/ },
    { archetype: 'v', role: 'vendor', label: 'At his cart', profession: /peddler|hokey-pokey|pretzel/ },
    { archetype: 'c', role: 'cabman', label: 'On the box', profession: /cab|hackman|coachman/ },
    { archetype: 'x', role: 'newsboy', label: 'Crying the papers', profession: /newsboy/ },
    { archetype: 'n', role: 'nursing', label: 'Minding the perambulator', profession: /nursemaid|nanny/ },
    { archetype: 'r', role: 'wheeling', label: 'Awheel', profession: /stenographer|schoolteacher|clubwoman/ },
    { archetype: 'o', role: 'bench', label: 'On his bench', profession: /pensioner|veteran/ },
  ];
  for (const expected of cases) {
    const definition = buildCrowdDefinition(`actor-${expected.archetype}`, {
      archetype: expected.archetype,
      role: expected.role,
      activity: 'standing',
      identitySeed: 3311,
    });
    assert.ok(definition, `${expected.archetype} builds a definition`);
    assert.equal(definition.role, expected.label);
    assert.match(definition.identity.profession, expected.profession);
    assert.ok(definition.opening.length > 0);
    assert.equal(definition.clientContext.hour, 12, 'a missing hour gets a sane default');
  }
});

test('every crowd rig letter rolls a person of the matching sex', async () => {
  // The model catalog and the dialogue tables share single-letter keys. When
  // they drifted apart, a bench-sitting woman rolled as a male doorman.
  const { PEDESTRIAN_ARCHETYPES } = await import('../src/world/pedestrianCatalog.js');
  const women = new Set(['w', 'd', 's', 'f', 'h', 'n', 'l', 'r', 'hm']);
  for (const letter of Object.keys(PEDESTRIAN_ARCHETYPES)) {
    const identity = rollIdentity(letter, 99);
    assert.ok(identity, `rig letter '${letter}' has a dialogue identity table`);
    assert.equal(
      identity.sex,
      women.has(letter) ? 'female' : 'male',
      `rig letter '${letter}' rolls the sex its model shows`,
    );
  }
});

test('the keeper archetype is always a park man', () => {
  for (let seed = 0; seed < 30; seed += 1) {
    const keeper = rollIdentity('g', seed);
    assert.match(keeper.profession, /^park (gardener|maintenance man)$/);
    assert.equal(keeper.sex, 'male');
  }
});

test('the run seed rerolls identities between playthroughs', () => {
  speak('crowd-run-1', {
    archetype: 'w', role: 'errand', activity: 'walking', hour: 10, seed: 5, age: 30,
  });
  try {
    setRunSeedForTests(1);
    const first = crowdDialogueDefinition('crowd-run-1').identity;
    setRunSeedForTests(1);
    const again = crowdDialogueDefinition('crowd-run-1').identity;
    setRunSeedForTests(2);
    const other = crowdDialogueDefinition('crowd-run-1').identity;
    assert.deepEqual(first, again, 'stable within a run');
    assert.notDeepEqual(first, other, 'rerolled next run');
  } finally {
    setRunSeedForTests(1234);
    removeAgent('crowd-run-1');
  }
});

test('the bulletin follows the clock', () => {
  assert.match(parkBulletin(9.75).join(' '), /Roosevelt.*speaking/);
  assert.match(parkBulletin(12).join(' '), /Roosevelt.*spoke.*this morning/);
  assert.doesNotMatch(parkBulletin(23).join(' '), /Roosevelt/);
  assert.match(parkBulletin(23).join(' '), /gone home/);
  assert.match(parkBulletin(10).join(' '), /carousel/i);
});

test('a bystander in eyeshot remembers a crash; a distant one does not', () => {
  resetMajorStreetEventsForTests();
  resetWitnessMemoryForTests();
  speak('crowd-wit-1', {
    archetype: 'w', role: 'errand', activity: 'walking', hour: 14, seed: 3, age: 41,
  }, 12, 0);
  speak('crowd-wit-2', {
    archetype: 'w', role: 'errand', activity: 'walking', hour: 14, seed: 3, age: 41,
  }, 300, 0);
  try {
    reportMajorStreetEvent({
      sourceId: 'wagon-1', targetId: 'ped-9', targetKind: 'pedestrian', x: 10, z: 0,
    });
    const near = witnessedBy('crowd-wit-1');
    assert.equal(near.length, 1);
    assert.equal(near[0].targetKind, 'pedestrian');
    assert.equal(near[0].involvedPlayer, false);
    assert.deepEqual(witnessedBy('crowd-wit-2'), []);

    const definition = crowdDialogueDefinition('crowd-wit-1');
    assert.equal(definition.witnessed.length, 1);
    assert.match(definition.opening, /see|saw|street/i, 'the witness opens with it');
    assert.equal(definition.suggestedQuestions[0], 'What did you just see happen?');
  } finally {
    removeAgent('crowd-wit-1');
    removeAgent('crowd-wit-2');
    resetMajorStreetEventsForTests();
    resetWitnessMemoryForTests();
  }
});

test('a witness who saw the player struck opens with concern', () => {
  resetMajorStreetEventsForTests();
  resetWitnessMemoryForTests();
  speak('crowd-wit-3', {
    archetype: 'm', role: 'rest', activity: 'sitting', hour: 14, seed: 8, age: 50,
  }, 5, 5);
  try {
    reportMajorStreetEvent({
      sourceId: 'carriage-2', targetId: 'player', targetKind: 'player', x: 0, z: 0,
    });
    const definition = crowdDialogueDefinition('crowd-wit-3');
    assert.equal(definition.witnessed[0].involvedPlayer, true);
    assert.match(definition.opening, /hurt|all right/i);
  } finally {
    removeAgent('crowd-wit-3');
    resetMajorStreetEventsForTests();
    resetWitnessMemoryForTests();
  }
});

test('concern scales with composure, proximity, and severity', async () => {
  const { concernLevel } = await import('../src/world/witnessMemory.js');
  const struckPerson = { severity: 1 };
  const cartCrash = { severity: 0.55 };
  // A patrolman two steps away is at most concerned; a low-composure widow
  // at the same distance is shaken by the same sight.
  assert.equal(concernLevel({ ...struckPerson, distance: 5, composure: 0.95 }), 'concerned');
  assert.equal(concernLevel({ ...struckPerson, distance: 5, composure: 0.25 }), 'shaken');
  // The overturned cart: a nuisance to the composed, upsetting up close to
  // the sensitive, invisible from across the lawn.
  assert.equal(concernLevel({ ...cartCrash, distance: 8, composure: 0.9 }), 'annoyed');
  assert.equal(concernLevel({ ...cartCrash, distance: 8, composure: 0.3 }), 'concerned');
  assert.equal(concernLevel({ ...cartCrash, distance: 38, composure: 0.75 }), 'unmoved');
  // Your own cart is another matter entirely.
  assert.equal(concernLevel({ ...cartCrash, distance: 2, composure: 0.9, involvedSelf: true }), 'outraged');
});

test('the owner of a struck cart is outraged; bystander concern varies', () => {
  resetMajorStreetEventsForTests();
  resetWitnessMemoryForTests();
  reportAgent('vendor-own', 3, 0, 0.45, {
    kind: 'pedestrian',
    dialogueId: 'vendor-own',
    ownsId: 'pushcart-7',
    dialogueContext: { archetype: 'v', role: 'vendor', activity: 'standing', hour: 11, seed: 5 },
  });
  reportAgent('cop-near', 4, 0, 0.45, {
    kind: 'policeman',
    dialogueId: 'cop-near',
    dialogueContext: { archetype: 'p', role: 'police', activity: 'standing', hour: 11, seed: 6 },
  });
  try {
    reportMajorStreetEvent({
      sourceId: 'carriage-1', targetId: 'pushcart-7', targetKind: 'pushcart', x: 0, z: 0,
    });
    const vendor = witnessedBy('vendor-own');
    assert.equal(vendor[0].involvedSelf, true);
    assert.equal(vendor[0].concern, 'outraged');
    const cop = witnessedBy('cop-near');
    assert.equal(cop[0].involvedSelf, false);
    assert.ok(['unmoved', 'annoyed'].includes(cop[0].concern), `a patrolman shrugs, got ${cop[0].concern}`);

    const definition = crowdDialogueDefinition('vendor-own');
    assert.match(definition.opening, /livelihood|look what/i, 'the vendor opens with outrage');
  } finally {
    removeAgent('vendor-own');
    removeAgent('cop-near');
    resetMajorStreetEventsForTests();
    resetWitnessMemoryForTests();
  }
});

test('a memory fades with time and reports how far off it was', () => {
  resetMajorStreetEventsForTests();
  resetWitnessMemoryForTests();
  speak('crowd-fade-1', {
    archetype: 'w', role: 'errand', activity: 'walking', hour: 14, seed: 3, age: 41,
  }, 4, 0);
  speak('crowd-fade-2', {
    archetype: 'w', role: 'errand', activity: 'walking', hour: 14, seed: 3, age: 41,
  }, 32, 0);
  try {
    const at = Date.now();
    reportMajorStreetEvent({
      sourceId: 'wagon-1', targetId: 'ped-9', targetKind: 'pedestrian', x: 0, z: 0,
    });
    const fresh = witnessedBy('crowd-fade-1', at)[0];
    const later = witnessedBy('crowd-fade-1', at + 4 * 60 * 1000)[0];
    assert.equal(fresh.nearness, 'here');
    assert.equal(witnessedBy('crowd-fade-2', at)[0].nearness, 'off');
    assert.ok(
      CONCERN_LEVELS.indexOf(later.concern) < CONCERN_LEVELS.indexOf(fresh.concern),
      `the same sight cools off: ${fresh.concern} then ${later.concern}`,
    );
  } finally {
    removeAgent('crowd-fade-1');
    removeAgent('crowd-fade-2');
    resetMajorStreetEventsForTests();
    resetWitnessMemoryForTests();
  }
});

test('a spectacle in front of you outranks a faded memory but not a fresh shock', () => {
  const base = {
    archetype: 'g', role: 'keeper', activity: 'working', hour: 9.75, identitySeed: 77,
    attending: 'roosevelt-speech',
  };
  const stale = buildCrowdDefinition('keeper-a', {
    ...base,
    witnessed: [{ kind: 'vehicle-impact', targetKind: 'pushcart', involvedPlayer: false, concern: 'annoyed', minutesAgo: 19 }],
  });
  const shock = buildCrowdDefinition('keeper-b', {
    ...base,
    witnessed: [{ kind: 'vehicle-impact', targetKind: 'pedestrian', involvedPlayer: false, concern: 'shaken', minutesAgo: 1 }],
  });
  assert.match(stale.opening, /Commissioner|speaking|floor/i);
  assert.equal(stale.suggestedQuestions[0], 'What is he saying up there?');
  assert.match(shock.opening, /start|bad business/i);
});

test('the speech gathering is a matter of place and hour', () => {
  const [x, , z] = ROOSEVELT_SPEECH_SITE.position;
  assert.equal(attendingNow(9.75, x, z), 'roosevelt-speech');
  assert.equal(attendingNow(9.75, x + 200, z), null, 'across the park is not the audience');
  assert.equal(attendingNow(14, x, z), null, 'he has finished and gone');
});

test('a thrown object is seen by the crowd and cannot be paid off', () => {
  resetMajorStreetEventsForTests();
  resetWitnessMemoryForTests();
  resetGrievancesForTests();
  speak('crowd-pelt-1', {
    archetype: 'w', role: 'errand', activity: 'walking', hour: 14, seed: 3, age: 41,
  }, 3, 0);
  try {
    reportMajorStreetEvent({
      kind: 'pelting', sourceId: 'player', targetId: 'cop-1', targetKind: 'policeman', x: 0, z: 0,
    });
    const seen = witnessedBy('crowd-pelt-1')[0];
    assert.equal(seen.kind, 'pelting');
    assert.equal(seen.involvedPlayer, true, 'the player is named as the thrower');

    recordGrievance('cop-1', 'pelted');
    assert.equal(settleGrievance('cop-1'), false, 'a penny does not settle an assault');
    const cop = buildCrowdDefinition('cop-1', {
      archetype: 'p', role: 'police', activity: 'standing', identitySeed: 5,
      grievance: { kind: 'pelted', count: 1, minutesAgo: 1 },
    });
    assert.match(cop.opening, /threw/i);
  } finally {
    removeAgent('crowd-pelt-1');
    resetMajorStreetEventsForTests();
    resetWitnessMemoryForTests();
    resetGrievancesForTests();
  }
});

test('quirks fire deterministically and respect their gates', async () => {
  const { maybeStartQuirk, FLOWER_SPOTS } = await import('../src/world/crowdQuirks.js');
  const [fx, fz] = FLOWER_SPOTS[0];
  const flowers = maybeStartQuirk({
    quirk: 'flower-fancier', x: fx + 1, z: fz, now: 100, roll: 0.2, partnerRoll: 0.5,
  });
  assert.equal(flowers.kind, 'flowers');
  assert.ok(flowers.until > 100);
  assert.equal(maybeStartQuirk({
    quirk: 'flower-fancier', x: fx + 30, z: fz, now: 100, roll: 0.2, partnerRoll: 0.5,
  }), null, 'no flowers in reach, no pause');

  const woman = { id: 'her', x: 1, z: 0, archetype: 'h', moving: true, busy: false };
  const rebuffed = maybeStartQuirk({
    quirk: 'gallant', x: 0, z: 0, now: 100, roll: 0.1, partnerRoll: 0.3, others: [woman],
  });
  assert.equal(rebuffed.kind, 'gallant-rebuffed');
  assert.equal(rebuffed.partner.kind, 'rebuff', 'she answers with a head shake');
  const received = maybeStartQuirk({
    quirk: 'gallant', x: 0, z: 0, now: 100, roll: 0.1, partnerRoll: 0.9, others: [woman],
  });
  assert.equal(received.kind, 'gallant-received');
  assert.equal(received.partner.id, 'her');

  const man = { id: 'him', x: 0.8, z: 0, archetype: 'm', moving: true, busy: false };
  assert.equal(maybeStartQuirk({
    quirk: 'quarrelsome', x: 0, z: 0, now: 100, roll: 0.1, partnerRoll: 0.5, others: [man], quarrelAllowed: false,
  }), null, 'quarrels wait for the rate budget');
  const quarrel = maybeStartQuirk({
    quirk: 'quarrelsome', x: 0, z: 0, now: 100, roll: 0.1, partnerRoll: 0.5, others: [man], quarrelAllowed: true,
  });
  assert.equal(quarrel.kind, 'quarrel');
  assert.equal(quarrel.partner.kind, 'quarrel');
});

test('the server rebuilds the identical definition from the packet', () => {
  const context = {
    archetype: 'w', role: 'errand', activity: 'walking', hour: 10, identitySeed: 991, age: 41,
    witnessed: [{ kind: 'vehicle-impact', targetKind: 'pushcart', involvedPlayer: false, minutesAgo: 2 }],
  };
  const clientSide = buildCrowdDefinition('crowd-x', context);
  const serverSide = buildCrowdDefinition('crowd-x', { ...context });
  assert.deepEqual(clientSide.identity, serverSide.identity);
  assert.deepEqual(clientSide.bulletin, serverSide.bulletin);
  assert.deepEqual(clientSide.witnessed, serverSide.witnessed);
  assert.equal(clientSide.opening, serverSide.opening);
});

test('the park keeper resolves through the same provider', () => {
  reportAgent('scheduled-central-park-gardener', 0, 0, 0.44, {
    kind: 'gardener',
    dialogueId: 'park-keeper',
    dialogueName: 'The park keeper',
    dialogueContext: {
      archetype: 'g', role: 'keeper', activity: 'working', hour: 9.75, seed: 7,
    },
  });
  try {
    const keeper = npcDialogueDefinition('park-keeper');
    assert.ok(keeper, 'resolves by dialogue id, not actor id');
    assert.equal(keeper.name, 'The park keeper');
    assert.match(keeper.identity.profession, /^park /);
    assert.match(keeper.bulletin.join(' '), /Roosevelt/);
    assert.equal(keeper.whereabouts, 'at work keeping the park');
  } finally {
    removeAgent('scheduled-central-park-gardener');
  }
});

test('offline replies cover greetings, the year, and destination', () => {
  speak('crowd-off-1', {
    archetype: 'f', role: 'resident', activity: 'walking', hour: 18.5, seed: 11, age: 47,
  });
  try {
    const npc = npcDialogueDefinition('crowd-off-1');
    assert.match(offlineNpcReply(npc, 'Good day to you'), /good day/i);
    assert.match(offlineNpcReply(npc, 'What year is it?'), /ninety-six/);
    assert.match(offlineNpcReply(npc, 'Where are you headed?'), /home/);
    assert.ok(offlineNpcReply(npc, 'What do you think of Spencer?').length > 0);
  } finally {
    removeAgent('crowd-off-1');
  }
});

test('free questions carry the context to Luna and fall back offline', async () => {
  speak('crowd-net-1', {
    archetype: 'f', role: 'resident', activity: 'walking', hour: 18.5, seed: 11, age: 47,
  });
  try {
    let sentBody = null;
    const result = await renderNpcDialogue({
      npcId: 'crowd-net-1',
      text: 'What news have you heard?',
      fetchImpl: (url, options) => {
        sentBody = JSON.parse(options.body);
        throw new Error('endpoint down');
      },
    });
    assert.equal(sentBody.schemaVersion, 2);
    assert.equal(sentBody.crowdContext.role, 'resident');
    assert.ok(Number.isFinite(sentBody.crowdContext.identitySeed));
    assert.equal(result.source, 'offline', 'a failed request still answers in character');
    assert.ok(result.dialogue.length > 0);
  } finally {
    removeAgent('crowd-net-1');
  }
});

test('scenery without a dialogue context stays scenery', () => {
  reportAgent('crowd-mute', 0, 0, 0.45, { kind: 'pedestrian' });
  try {
    assert.equal(crowdDialogueDefinition('crowd-mute'), null);
    assert.equal(npcDialogueDefinition('crowd-mute'), null);
  } finally {
    removeAgent('crowd-mute');
  }
});

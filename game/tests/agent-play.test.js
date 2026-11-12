import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORED_PATIENT_POOL, CARMELA_RUSSO } from '../src/consultation/patients.js';
import { createConsultSession } from '../scripts/agent/consultSession.js';
import { createDaySession } from '../scripts/agent/daySession.js';
import { play, randomPlayer } from '../scripts/agent/players.js';

async function run(session, actions) {
  let observation = session.observe();
  for (const action of actions) {
    observation = await session.act(action);
    assert.equal(observation.error, undefined, `${JSON.stringify(action)}: ${observation.error}`);
  }
  return observation;
}

// The route in docs/consultation-testing.md and carmela-full.jsonl.
const CARMELA_EVIDENCE_LED = [
  { type: 'think', id: 'carmela-approach-sequence' },
  { type: 'ask', id: 'carmela-ask-pattern' },
  { type: 'ask', id: 'carmela-ask-calamity' },
  { type: 'ask', id: 'carmela-response-steady' },
  { type: 'ask', id: 'carmela-ask-tonics' },
  { type: 'ask', id: 'carmela-ask-red-flags' },
  { type: 'examine', id: 'carmela-exam-cardiorespiratory' },
  { type: 'ask', id: 'carmela-ask-shop' },
  { type: 'decide' },
  { type: 'diagnose', id: 'carmela-dx-nervous-coca' },
  { type: 'prescribe', id: 'drug-stop-tonic' },
  { type: 'sign' },
  { type: 'respond', id: 'work' },
  { type: 'respond', id: 'gradual' },
  { type: 'sign' },
];

test('a text consultation reaches the game’s authored outcome', async () => {
  const session = createConsultSession({ patient: CARMELA_RUSSO });
  const observation = await run(session, CARMELA_EVIDENCE_LED);
  assert.equal(observation.stage, 'result');
  assert.equal(observation.clock.usedMinutes, 30);
  assert.equal(observation.result.immediate.payment, 'Fee paid in full');
  assert.equal(observation.result.oneMonth.band, 'improved');
  const log = session.log();
  assert.equal(log.groundTruth.choseBestDiagnosis, true);
  assert.equal(log.groundTruth.etiologyId, CARMELA_RUSSO.groundTruth.etiologyId);
});

// Keys and strings that would hand the player the answer.
const HIDDEN_KEYS = new Set([
  'groundTruth', 'evaluation', 'alignment', 'selector', 'supportFactIds', 'quality', 'recovery',
  'outcomeModel', 'etiologyId', 'trust', 'satisfaction', 'discloseFactIds',
]);

function hiddenKeysIn(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => hiddenKeysIn(item, found));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (HIDDEN_KEYS.has(key)) found.add(key);
      hiddenKeysIn(item, found);
    }
  }
  return found;
}

test('observations before the result never carry scoring or ground truth', async () => {
  for (const patient of AUTHORED_PATIENT_POOL) {
    for (let seed = 1; seed <= 20; seed += 1) {
      const session = createConsultSession({ patient });
      const player = randomPlayer(seed);
      let observation = session.observe();
      for (let step = 0; step < 60 && !session.done(); step += 1) {
        if (!observation.result) {
          assert.deepEqual([...hiddenKeysIn(observation)], [], `${patient.id} seed ${seed}`);
          const text = JSON.stringify(observation);
          assert.ok(!text.includes(patient.groundTruth.modernSummary), `${patient.id} leaks the modern summary`);
          // Facts the doctor has not uncovered stay out of the observation.
          const known = new Set(session.state().disclosedFactIds);
          for (const fact of patient.facts) {
            if (!known.has(fact.id)) assert.ok(!text.includes(fact.value), `${patient.id} leaks ${fact.id}`);
          }
        }
        observation = await session.act(player.next(observation));
      }
    }
  }
});

test('an unusable action is refused without changing the visit', async () => {
  const session = createConsultSession({ patient: CARMELA_RUSSO });
  const before = session.state();
  const observation = await session.act({ type: 'diagnose', n: 1 });
  assert.match(observation.error, /no such diagnosis/);
  assert.equal(session.state().elapsedMinutes, before.elapsedMinutes);
  assert.equal(session.log().outcome.rejectedActions, 1);
});

test('a text day repeats exactly for one seed and one player', async () => {
  const logs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = createDaySession({ seed: 4, authored: true });
    await play(session, randomPlayer(3), { maxSteps: 400, until: (current) => current.daysCompleted() >= 2 });
    logs.push(JSON.stringify(session.log()));
  }
  assert.equal(logs[0], logs[1]);
  assert.equal(JSON.parse(logs[0]).days.filter((day) => !day.unfinished).length, 2);
});

test('keeping and cancelling appointments settle the day as the game does', async () => {
  const session = createDaySession({ seed: 4, authored: true });
  assert.deepEqual(session.observe().schedule.map((item) => item.patient),
    ['Miss Nora Byrne', 'Mrs. Carmela Russo', 'Mr. Samuel Taylor']);

  // 9:45: Nora is due while the doctor is in the park. Cancel her.
  let observation = await run(session, [{ type: 'wait', minutes: 30 }]);
  assert.equal(observation.card.kind, 'appointment');
  const standing = observation.standing;
  observation = await run(session, [{ type: 'choose', id: 'cancel' }]);
  assert.equal(observation.standing, standing - 7);
  assert.equal(observation.schedule[0].status, 'forfeited');

  // Seeing Carmela costs the 40-minute trip and double the visit's minutes.
  observation = await run(session, [{ type: 'see-patient', id: CARMELA_RUSSO.id }]);
  assert.equal(observation.mode, 'day-consultation');
  assert.equal(observation.day.time, '10:25 in the morning');
  observation = await run(session, CARMELA_EVIDENCE_LED);
  assert.equal(observation.day.time, '11:25 in the morning');
  const purse = observation.day.purse;
  observation = await run(session, [{ type: 'settle', id: 'cash' }, { type: 'finish' }]);
  assert.equal(observation.mode, 'day');
  assert.notEqual(observation.purse, purse);
  assert.equal(observation.schedule[1].status, 'kept');
});

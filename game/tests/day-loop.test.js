import test from 'node:test';
import assert from 'node:assert/strict';
import { createDaySchedule, APPOINTMENT_SLOTS, formatHour } from '../src/world/daySchedule.js';
import { createCallerDay } from '../src/world/callers.js';
import { adjustStanding, getStanding, resetStandingForTests } from '../src/world/standing.js';
import {
  beginErrand, arriveAtLab, noteRead, instrumentTested, getErrand, resetErrandForTests,
} from '../src/world/errand.js';

const PATIENTS = ['nora', 'samuel', 'carmela'];

test('the schedule is a seeded shuffle into the fixed slots', () => {
  const a = createDaySchedule({ seed: 7, patientIds: PATIENTS });
  const b = createDaySchedule({ seed: 7, patientIds: PATIENTS });
  assert.deepEqual(a.list().map((x) => x.patientId), b.list().map((x) => x.patientId));
  assert.deepEqual(a.list().map((x) => x.hours), APPOINTMENT_SLOTS.slice(0, PATIENTS.length));
  const orders = new Set();
  for (let seed = 1; seed <= 12; seed += 1) {
    orders.add(createDaySchedule({ seed, patientIds: PATIENTS }).list().map((x) => x.patientId).join(','));
  }
  assert.ok(orders.size > 1, 'different seeds produce different first patients');
});

test('warning fires once, lateness respects the grace period', () => {
  const schedule = createDaySchedule({ seed: 3, patientIds: PATIENTS });
  const first = schedule.list()[0];
  assert.equal(schedule.takeWarning(first.hours - 10 / 60), null);
  assert.ok(schedule.takeWarning(first.hours - 4 / 60));
  assert.equal(schedule.takeWarning(first.hours - 3 / 60), null, 'warned only once');
  assert.equal(schedule.overdue(first.hours + 2 / 60), null, 'inside grace');
  assert.equal(schedule.overdue(first.hours + 4 / 60)?.patientId, first.patientId);
});

test('kept and forfeited appointments resolve the day', () => {
  const schedule = createDaySchedule({ seed: 3, patientIds: PATIENTS });
  const [a, b, c] = schedule.list();
  assert.ok(schedule.markKept(a.patientId));
  assert.ok(schedule.markForfeited(b.patientId));
  assert.equal(schedule.markForfeited(b.patientId), false, 'cannot forfeit twice');
  assert.equal(schedule.allResolved(), false);
  schedule.markKept(c.patientId);
  assert.ok(schedule.allResolved());
  assert.deepEqual(schedule.stats(), { kept: 2, forfeited: 1, pending: 0 });
});

test('callers are deterministic per seed and honour patience', () => {
  const a = createCallerDay({ seed: 11 });
  const b = createCallerDay({ seed: 11 });
  assert.deepEqual(
    a.list().map((x) => [x.hours, x.identity.name, x.request.id]),
    b.list().map((x) => [x.hours, x.identity.name, x.request.id]),
  );
  const caller = a.list()[0];
  if (caller) {
    assert.equal(a.due(caller.hours - 0.01), null);
    assert.ok(a.due(caller.hours + 0.01));
    const lapsed = a.takeLapsed(caller.hours + 1.0);
    assert.equal(lapsed?.identity.name, caller.identity.name);
    assert.equal(a.due(caller.hours + 0.01), null, 'lapsed callers are gone');
  }
});

test('resolving a caller returns the chosen outcome once', () => {
  const day = createCallerDay({ seed: 2 });
  const caller = day.list()[0];
  if (!caller) return;
  const live = day.due(caller.hours + 0.01);
  const outcome = day.resolve(live, 'sell');
  assert.ok(outcome && typeof outcome.price === 'number');
  assert.equal(day.resolve(live, 'sell'), null, 'answered callers cannot be re-answered');
});

test('standing clamps and logs; the errand pays once at two instruments', () => {
  resetStandingForTests();
  resetErrandForTests();
  const before = getStanding();
  adjustStanding(-7, 'turned a patient away');
  assert.equal(getStanding(), before - 7);

  beginErrand();
  assert.equal(getErrand().status, 'deliver');
  assert.ok(arriveAtLab());
  assert.equal(arriveAtLab(), false, 'the note is found once');
  noteRead();
  const mid = getStanding();
  instrumentTested('colour-wheel');
  assert.equal(getErrand().status, 'testing');
  instrumentTested('colour-wheel');
  assert.equal(getErrand().status, 'testing', 'same instrument does not count twice');
  instrumentTested('reaction-chronoscope');
  assert.equal(getErrand().status, 'done');
  assert.equal(getStanding(), mid + 8);
  resetStandingForTests();
  resetErrandForTests();
});

test('formatHour reads like a clock, not a decimal', () => {
  assert.equal(formatHour(9.75), '9:45 in the morning');
  assert.equal(formatHour(14.25), '2:15 in the afternoon');
});

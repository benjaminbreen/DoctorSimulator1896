import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { EVENT_DECK, createEventDay, pickEvent } from '../src/world/streetEvents.js';
import { REQUESTS, createCallerDay } from '../src/world/callers.js';

test('a day of events is deterministic per seed', () => {
  const a = createEventDay({ seed: 42 }).list();
  const b = createEventDay({ seed: 42 }).list();
  assert.deepEqual(
    a.map((item) => [item.hours, item.event.id, item.identity.name]),
    b.map((item) => [item.hours, item.event.id, item.identity.name]),
  );
  const c = createEventDay({ seed: 43 }).list();
  assert.notDeepEqual(
    a.map((item) => [item.hours, item.event.id]),
    c.map((item) => [item.hours, item.event.id]),
  );
});

test('events come due, resolve once, and expire quietly', () => {
  // Find a seed that schedules at least one event.
  let day = null;
  let first = null;
  for (let seed = 1; seed < 50; seed += 1) {
    const candidate = createEventDay({ seed });
    const list = candidate.list();
    if (list.length > 0) { day = candidate; [first] = list; break; }
  }
  assert.ok(day, 'no seed under 50 produced an event');

  assert.equal(day.due(first.hours - 0.1), null);
  const due = day.due(first.hours + 0.1);
  assert.ok(due);
  const choice = day.resolve(due, due.event.choices[0].id);
  assert.ok(choice.note);
  assert.equal(day.resolve(due, due.event.choices[0].id), null, 'resolves only once');

  // A later pending event expires past its window without a trace.
  day.expire(23);
  assert.equal(day.due(23), null);
});

test('every event choice carries a note and only known effect keys', () => {
  for (const event of EVENT_DECK) {
    assert.ok(event.heading && event.art && event.text({ name: 'X', profession: 'y', age: 10 }));
    for (const choice of event.choices) {
      assert.ok(choice.note, `${event.id}/${choice.id} has a note`);
      for (const key of Object.keys(choice.effects || {})) {
        assert.ok(['cents', 'standing', 'minutes'].includes(key), `${event.id}/${choice.id}: ${key}`);
      }
    }
  }
});

test('the messenger relays a caller once and holds them through the trip', () => {
  // Seed 1 schedules at least one caller; find the first.
  let day = null;
  let first = null;
  for (let seed = 1; seed < 50; seed += 1) {
    const candidate = createCallerDay({ seed });
    const list = candidate.list();
    if (list.length > 0) { day = candidate; [first] = list; break; }
  }
  assert.ok(day, 'no seed under 50 produced a caller');

  const message = day.takeMessage(first.hours + 0.05);
  assert.ok(message, 'a due caller produces a message');
  assert.equal(day.takeMessage(first.hours + 0.06), null, 'the boy comes once');

  // Held callers outlast the patience clock and still resolve.
  day.holdForArrival(message);
  assert.equal(day.takeLapsed(first.hours + 2), null, 'held caller does not lapse');
  const outcome = day.resolve(message, 'advise');
  assert.ok(outcome, 'held caller can still be answered');
});

test('every day-flow art key resolves to its shipped banner', async () => {
  for (const art of ['messenger-boy', 'retiring', 'morning-schedule']) {
    await access(new URL(`../public/ui/events/${art}.webp`, import.meta.url));
  }
  for (const event of EVENT_DECK) {
    await access(new URL(`../public/ui/events/${event.art}.webp`, import.meta.url));
    for (const choice of event.choices) {
      await access(new URL(`../public/ui/events/${event.art}-${choice.id}.webp`, import.meta.url));
    }
  }
  for (const request of REQUESTS) {
    assert.equal(request.art, request.id);
    await access(new URL(`../public/ui/callers/${request.art}.webp`, import.meta.url));
  }
});

test('the seven new street events remain marked draft for review', () => {
  const newIds = new Set([
    'veteran-alms', 'bootblack', 'prescription-boy', 'tract-hander',
    'scorcher', 'pickpocket', 'matron',
  ]);
  for (const event of EVENT_DECK.filter((item) => newIds.has(item.id))) {
    assert.equal(event.contentStatus, 'draft', event.id);
  }
});

test('the deck deals by weight and common events dominate', () => {
  const counts = {};
  for (let i = 0; i < 2000; i += 1) {
    const event = pickEvent(i / 2000);
    counts[event.id] = (counts[event.id] || 0) + 1;
  }
  assert.ok(counts.extra > counts['curbstone-consult'] * 2, 'the newsboy far outdraws the rash');
  assert.ok(Object.keys(counts).length === EVENT_DECK.length, 'every event can deal');
});

test('an untold caller still lapses with the old penalty path', () => {
  let day = null;
  let first = null;
  for (let seed = 1; seed < 50; seed += 1) {
    const candidate = createCallerDay({ seed });
    if (candidate.list().length > 0) { day = candidate; [first] = candidate.list(); break; }
  }
  const lapsed = day.takeLapsed(first.hours + 2);
  assert.ok(lapsed);
  assert.equal(lapsed.status, 'lapsed');
});

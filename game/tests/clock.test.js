import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorldClock,
  dayOfYear,
  GAME_START,
} from '../src/world/clock.js';
import { weekdayName } from '../src/hud/hudState.js';

test('the civil clock opens on Monday 15 June 1896 at half past nine', () => {
  const clock = createWorldClock();
  const state = clock.getSnapshot();
  assert.deepEqual(state.logical.date, {
    year: 1896, month: 6, date: 15, dayOfYear: 167,
  });
  assert.equal(state.logical.hours, 9.5);
  assert.equal(weekdayName(state.logical.date), 'Monday');
  assert.equal(GAME_START.dayOfYear, dayOfYear(GAME_START));
});

test('ambient time advances at eight game seconds per real second', () => {
  const clock = createWorldClock();
  clock.tick(15);
  assert.equal(clock.getSnapshot().logical.totalMinutes, 9.5 * 60 + 2);
  assert.equal(clock.getSnapshot().visual.totalMinutes, 9.5 * 60 + 2);
});

test('pause stops ambient time', () => {
  const clock = createWorldClock();
  clock.setPaused(true);
  clock.tick(60);
  assert.equal(clock.getSnapshot().logical.hours, 9.5);
  clock.setPaused(false);
  clock.tick(15);
  assert.equal(clock.getSnapshot().logical.totalMinutes, 9.5 * 60 + 2);
});

test('action time is logical immediately and catches up visually', () => {
  const clock = createWorldClock();
  clock.advanceMinutes(5, { duration: 1 });
  assert.equal(clock.getSnapshot().logical.totalMinutes, 9.5 * 60 + 5);
  assert.equal(clock.getSnapshot().visual.totalMinutes, 9.5 * 60);
  clock.tick(1);
  assert.equal(clock.getSnapshot().transitioning, false);
  assert.equal(clock.getSnapshot().visual.totalMinutes, clock.getSnapshot().logical.totalMinutes);
});

test('passing midnight advances the date and solar day', () => {
  const clock = createWorldClock({
    start: { year: 1896, month: 6, date: 15, hour: 23, minute: 50 },
  });
  clock.advanceMinutes(20, { animate: false });
  assert.deepEqual(clock.getSnapshot().logical.date, {
    year: 1896, month: 6, date: 16, dayOfYear: 168,
  });
  assert.equal(clock.getSnapshot().logical.hour, 0);
  assert.equal(clock.getSnapshot().logical.minute, 10);
});

test('until morning always moves forward to seven', () => {
  const clock = createWorldClock({
    start: { year: 1896, month: 6, date: 15, hour: 18, minute: 0 },
  });
  const minutes = clock.advanceToHour(7, { animate: false });
  assert.equal(minutes, 13 * 60);
  assert.equal(clock.getSnapshot().logical.date.date, 16);
  assert.equal(clock.getSnapshot().logical.hours, 7);
});

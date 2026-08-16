import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFRONT_PHASE,
  confrontationFor,
  confrontationGroup,
  confrontationLine,
  provokeConfrontation,
  releaseConfrontation,
  resetConfrontationsForTests,
  stepConfrontation,
} from '../src/world/confrontation.js';
import { clearNotices, getNotices } from '../src/world/notices.js';
import { resetGrievancesForTests, grievanceAgainst } from '../src/world/grievances.js';
import { PEDESTRIAN_ARCHETYPES } from '../src/world/pedestrianCatalog.js';

test.beforeEach(() => {
  resetConfrontationsForTests();
  resetGrievancesForTests();
  clearNotices();
});

test('every crowd rig letter has a confrontation voice', () => {
  for (const key of Object.keys(PEDESTRIAN_ARCHETYPES)) {
    const line = confrontationLine(confrontationGroup(key, null), 'Cabbage', key);
    assert.ok(line.length > 20, `rig letter '${key}' says something`);
    assert.ok(line.includes('cabbage') || !line.includes('{item}'), `'${key}': ${line}`);
  }
});

test('the thrown object is named in the line, lowercased', () => {
  const line = confrontationLine('gentleman', 'Cabbage', 'seed');
  assert.ok(line.includes('cabbage'));
  assert.ok(!line.includes('{item}'));
});

test('a seated figure stands before walking, then arrives and speaks', () => {
  provokeConfrontation('bench-sitter', {
    itemLabel: 'Apple', archetype: 'w', name: 'A woman', dialogueId: 'bench-sitter', seated: true, now: 0,
  });
  const stand = stepConfrontation('bench-sitter', { x: 0, z: 0, playerX: 0, playerZ: 6, delta: 0.1, now: 0.2 });
  assert.equal(stand.phase, CONFRONT_PHASE.ROUSING);
  assert.equal(stand.walking, false);
  assert.equal(stand.z, 0, 'she does not slide across the park while getting up');

  // Once up, she closes the gap and stops an arm's length short.
  let state = null;
  for (let now = 2; now < 12; now += 0.1) {
    state = stepConfrontation('bench-sitter', { x: 0, z: state?.z ?? 0, playerX: 0, playerZ: 6, delta: 0.1, now });
    if (state.phase === CONFRONT_PHASE.SPEAKING) break;
  }
  assert.equal(state.phase, CONFRONT_PHASE.SPEAKING);
  assert.ok(Math.abs(6 - state.z) <= 1.8, `stopped at ${state.z}`);
  assert.equal(getNotices().length, 1, 'she says it once');
  assert.match(getNotices()[0].text, /apple/);
});

test('she gives up if the player runs off, and the state is dropped', () => {
  provokeConfrontation('runner', { itemLabel: 'Cabbage', archetype: 'm', now: 0 });
  const gone = stepConfrontation('runner', { x: 0, z: 0, playerX: 0, playerZ: 300, delta: 0.1, now: 1 });
  assert.equal(gone, null);
  assert.equal(confrontationFor('runner'), null);
  assert.equal(getNotices().length, 0, 'nobody shouts across the whole park');
});

test('a second hit refreshes the chase rather than restarting it', () => {
  const first = provokeConfrontation('twice', { itemLabel: 'Cabbage', archetype: 'm', now: 0 });
  const second = provokeConfrontation('twice', { itemLabel: 'Apple', archetype: 'm', now: 4 });
  assert.equal(second, first, 'same state object');
  assert.match(first.line, /cabbage/, 'the first object is the one named');
  assert.ok(second.giveUpAt > 4);
});

test('being pelted is a grievance the NPC remembers', () => {
  provokeConfrontation('vendor', {
    itemLabel: 'Cabbage', kind: 'pedestrian', dialogueId: 'plaza-pushcart-vendor', now: 0,
  });
  assert.equal(grievanceAgainst('plaza-pushcart-vendor')?.kind, 'pelted');
});

test('releasing clears the state', () => {
  provokeConfrontation('gone', { itemLabel: 'Cabbage', archetype: 'm', now: 0 });
  releaseConfrontation('gone');
  assert.equal(confrontationFor('gone'), null);
});

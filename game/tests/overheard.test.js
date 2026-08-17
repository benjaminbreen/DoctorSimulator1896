import test from 'node:test';
import assert from 'node:assert/strict';
import {
  benchPairs,
  benchSubject,
  overhearBenchTalk,
  overhearQuirk,
  resetOverheardForTests,
} from '../src/world/overheard.js';
import { clearNotices, getNotices } from '../src/world/notices.js';

function sitter(id, x, z, name = 'A woman in working dress') {
  return {
    id,
    x,
    z,
    dialogueId: id,
    dialogueName: name,
    dialogueContext: { activity: 'sitting' },
  };
}

test.beforeEach(() => {
  resetOverheardForTests();
  clearNotices();
});

test('a rebuffed gallant is quoted through the woman, not the man', () => {
  const raised = overhearQuirk({
    kind: 'gallant-rebuffed',
    selfName: 'A well-dressed young man',
    partnerName: 'A woman in rational dress',
    x: 0, z: 0, playerX: 2, playerZ: 0, now: 0,
  });
  assert.ok(raised);
  assert.match(getNotices()[0].text, /^A woman in rational dress: “…/);
});

test('nothing is overheard across the park', () => {
  const raised = overhearQuirk({
    kind: 'quarrel',
    selfName: 'A man in a bowler hat',
    partnerName: 'Another man',
    x: 0, z: 0, playerX: 40, playerZ: 0, now: 0,
  });
  assert.equal(raised, null);
  assert.equal(getNotices().length, 0);
});

test('only two people on one bench count as company', () => {
  const agents = [sitter('a', 0, 0), sitter('b', 1.2, 0), sitter('c', 5, 0)];
  const pairs = benchPairs(agents, 0, 0);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].a.id, pairs[0].b.id], ['a', 'b']);
  assert.equal(benchPairs(agents, 60, 60).length, 0, 'and only within earshot');
});

test('a walker is not company, however close he passes', () => {
  const agents = [
    sitter('a', 0, 0),
    { ...sitter('b', 1, 0), dialogueContext: { activity: 'walking' } },
  ];
  assert.equal(benchPairs(agents, 0, 0).length, 0);
});

test('the subject follows the hour, and an incident outranks it', () => {
  const pair = { a: sitter('a', 0, 0), b: sitter('b', 1, 0) };
  assert.equal(benchSubject(pair, 9.75), 'speech');
  assert.equal(benchSubject(pair, 12), 'speech', 'still the talk of the park until he leaves');
  assert.equal(benchSubject(pair, 20), 'late');
  assert.equal(benchSubject(pair, 7), 'late');
});

test('one scrap at a time, and the same pair does not repeat', () => {
  const agents = [sitter('a', 0, 0), sitter('b', 1, 0)];
  const overhear = (now) => overhearBenchTalk({
    playerX: 0, playerZ: 2, hour: 12, agents, now,
  });
  assert.ok(overhear(0));
  assert.equal(overhear(30000), null, 'the same pair, again, so soon');
  assert.ok(overhear(400000), 'but not forever');
});

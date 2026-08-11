import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCasebookEntries,
  getCasebookDraft,
  setCasebookDraft,
  saveCasebookEntry,
  subscribeCasebook,
} from '../src/hud/casebookState.js';

const STAMP = { date: { year: 1896, month: 5, date: 14 }, hours: 11.5 };

test('saving the draft appends an entry and clears the draft', () => {
  const before = getCasebookEntries().length;
  setCasebookDraft('  A note on the omnibus fare.  ');
  const entry = saveCasebookEntry(STAMP);
  assert.equal(entry.text, 'A note on the omnibus fare.');
  assert.equal(getCasebookEntries().length, before + 1);
  assert.equal(getCasebookEntries().at(-1), entry);
  assert.equal(getCasebookDraft(), '');
});

test('an empty draft saves nothing', () => {
  const before = getCasebookEntries().length;
  setCasebookDraft('   ');
  assert.equal(saveCasebookEntry(STAMP), null);
  assert.equal(getCasebookEntries().length, before);
});

test('subscribers hear draft changes and saves', () => {
  let calls = 0;
  const off = subscribeCasebook(() => { calls += 1; });
  setCasebookDraft('Heard.');
  saveCasebookEntry(STAMP);
  off();
  setCasebookDraft('Not heard.');
  assert.equal(calls, 2);
});

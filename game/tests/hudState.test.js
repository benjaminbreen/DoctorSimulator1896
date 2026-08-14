import test from 'node:test';
import assert from 'node:assert/strict';
import {
  day,
  dayNews,
  dayNewsSource,
  letters,
  weekdayName,
} from '../src/hud/hudState.js';

test('the HUD opens on Monday 15 June 1896', () => {
  assert.deepEqual(day, { year: 1896, month: 6, date: 15 });
  assert.equal(weekdayName(day), 'Monday');
});

test('player correspondence identifies the William James adaptation', () => {
  assert.equal(letters.length, 1);
  const [letter] = letters;
  assert.equal(letter.date, 'June 11, 1896');
  assert.match(letter.body.join(' '), /psychological experiment with mescal/i);
  assert.match(letter.provenance.note, /brother Henry/);
  assert.match(letter.provenance.label, /Fictionalized/);
  assert.match(letter.provenance.sourceUrl, /gutenberg\.org/);
});

test('the day panel contains only source-bound newspaper material', () => {
  assert.deepEqual(dayNews, [
    'McKinley sold out to Foraker.',
    'Nothing but gold will do.',
  ]);
  assert.equal(dayNewsSource.date, 'June 15, 1896');
  assert.match(dayNewsSource.sourceUrl, /loc\.gov/);
});

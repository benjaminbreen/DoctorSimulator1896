import test from 'node:test';
import assert from 'node:assert/strict';
import { removeAgent, reportAgent } from '../src/world/agents.js';
import { crowdDialogueDefinition, installCrowdDialogue } from '../src/world/crowdDialogue.js';
import { bulletinApplies, settingOf, suggestedQuestions, whereSentence } from '../src/world/npcQuestions.js';
import { setRunSeedForTests } from '../src/world/runSeed.js';

installCrowdDialogue();
setRunSeedForTests(9090);

test('a lobby speaker is never asked about the park', () => {
  const asked = suggestedQuestions({
    archetype: 'y', role: 'idler', place: 'new-netherland-lobby', hour: 12, seed: 5,
  });
  assert.equal(asked.length, 3);
  assert.doesNotMatch(asked.join(' '), /park|carousel/i);
  // A man loitering in a lobby is not bound anywhere.
  assert.doesNotMatch(asked.join(' '), /where are you bound/i);
  assert.match(asked.join(' '), /house|meet/i, 'he is asked about the place he is in');
});

test('a park walker still gets park questions and a destination', () => {
  const asked = suggestedQuestions({
    archetype: 'm', role: 'commuter', place: 'central-park', hour: 12, seed: 5,
  });
  assert.match(asked.join(' '), /where are you bound/i);
});

test('trade decides the first question', () => {
  const cabman = suggestedQuestions({
    archetype: 'c', role: 'cabman', place: 'central-park', hour: 12, seed: 2,
  });
  assert.match(cabman[0], /downtown|motor carriage/i);
  const newsboy = suggestedQuestions({
    archetype: 'x', role: 'newsboy', place: 'central-park', hour: 12, seed: 2,
  });
  assert.match(newsboy[0], /papers|sell/i);
  assert.notDeepEqual(cabman, newsboy, 'two trades are not offered the same questions');
});

test('the hour shows up only outside the middle of the day', () => {
  const night = suggestedQuestions({
    archetype: 'p', role: 'police', place: 'central-park', hour: 23, seed: 1, limit: 6,
  });
  assert.match(night.join(' '), /late to be out/i);
  const noon = suggestedQuestions({
    archetype: 'p', role: 'police', place: 'central-park', hour: 12, seed: 1, limit: 6,
  });
  assert.doesNotMatch(noon.join(' '), /late to be out|about early/i);
});

test('situational questions come first and never crowd each other out', () => {
  const asked = suggestedQuestions({
    archetype: 'v',
    role: 'vendor',
    place: 'central-park',
    hour: 12,
    seed: 1,
    situational: ['What did you just see happen?'],
  });
  assert.equal(asked[0], 'What did you just see happen?');
  assert.equal(new Set(asked).size, asked.length, 'no repeats');
});

test('setting decides where a speaker thinks they are, and whether park news applies', () => {
  assert.equal(settingOf('new-netherland-lobby'), 'hotel');
  assert.equal(settingOf('central-park'), 'park');
  assert.equal(settingOf('nowhere-in-particular'), 'street');
  assert.match(whereSentence('metropolitan-club-lobby'), /Metropolitan Club/);
  assert.match(whereSentence('central-park'), /Central Park/);
  assert.ok(bulletinApplies('central-park'));
  assert.ok(!bulletinApplies('new-netherland-lobby'), 'park news is not indoor talk');
});

test('a lobby dandy carries the lobby through to his definition', () => {
  reportAgent('lobby-dandy', 0, 0, 0.45, {
    kind: 'pedestrian',
    dialogueId: 'lobby-dandy',
    dialogueName: 'A well-dressed young man',
    dialogueContext: {
      archetype: 'y', role: 'idler', activity: 'standing', hour: 12, seed: 8, place: 'new-netherland-lobby',
    },
  });
  try {
    const definition = crowdDialogueDefinition('lobby-dandy');
    assert.match(definition.where, /New Netherland/);
    assert.deepEqual(definition.bulletin, [], 'no park bulletin indoors');
    assert.doesNotMatch(definition.suggestedQuestions.join(' '), /park|carousel/i);
    assert.equal(definition.clientContext.place, 'new-netherland-lobby');
  } finally {
    removeAgent('lobby-dandy');
  }
});

test('the carousel is only asked about while it is running', () => {
  const dawn = suggestedQuestions({
    archetype: 'x', role: 'newsboy', place: 'central-park', hour: 6, seed: 4, limit: 6,
  });
  assert.doesNotMatch(dawn.join(' '), /carousel/i, 'it is not running at six in the morning');
  const midday = suggestedQuestions({
    archetype: 'x', role: 'newsboy', place: 'central-park', hour: 13, seed: 4, limit: 6,
  });
  assert.match(midday.join(' '), /carousel/i);
});

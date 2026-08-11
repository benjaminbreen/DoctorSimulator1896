import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publishContextPromptState,
  clearContextPromptState,
  acknowledgeContextPromptState,
} from '../src/world/contextPrompts.js';

const prompt = (id, label = id) => ({ id, label, keyLabel: 'E', dwellMs: 0 });
const empty = { contextPromptCandidates: {}, contextPromptHistory: {}, contextPrompt: null };

test('higher-ranked source wins the prompt slot', () => {
  let state = publishContextPromptState(empty, 'item', prompt('vase'), 1000);
  state = publishContextPromptState(state, 'npc', prompt('mrs-ostrander'), 1001);
  assert.equal(state.contextPrompt.id, 'mrs-ostrander');
  state = clearContextPromptState(state, 'npc', 1002);
  assert.equal(state.contextPrompt.id, 'vase');
});

test('a prompt must dwell before it shows', () => {
  const candidate = { ...prompt('door'), dwellMs: 200 };
  let state = publishContextPromptState(empty, 'interior', candidate, 1000);
  assert.equal(state.contextPrompt, null);
  // Republishing the same prompt keeps firstSeenAt, so dwell can elapse.
  state = publishContextPromptState(state, 'interior', candidate, 1250);
  assert.equal(state.contextPrompt?.id, 'door');
});

test('acting on a prompt suppresses it for the cooldown', () => {
  const candidate = { ...prompt('chair'), repeatCooldownMs: 500 };
  let state = publishContextPromptState(empty, 'item', candidate, 1000);
  assert.equal(state.contextPrompt?.id, 'chair');
  state = acknowledgeContextPromptState(state, 'item', 1100);
  assert.equal(state.contextPrompt, null);
  // Still suppressed inside the window, live again after it.
  state = publishContextPromptState(state, 'item', candidate, 1300);
  assert.equal(state.contextPrompt, null);
  state = publishContextPromptState(state, 'item', candidate, 1700);
  assert.equal(state.contextPrompt?.id, 'chair');
});

test('unchanged publish returns the same state object', () => {
  const candidate = prompt('couch');
  const state = publishContextPromptState(empty, 'item', candidate, 1000);
  const again = publishContextPromptState(state, 'item', candidate, 1050);
  assert.equal(again, state);
});

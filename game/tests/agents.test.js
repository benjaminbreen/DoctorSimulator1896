// The crowd reports every figure every frame, so reportAgent hands back the
// live entry and the caller writes onto it. These pin the part that makes
// that safe: one stable object per id, and fields that survive a bare report.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgent, removeAgent, reportAgent } from '../src/world/agents.js';

test('reporting the same id twice returns the one entry', () => {
  const first = reportAgent('walker-1', 1, 2, 0.5);
  const second = reportAgent('walker-1', 3, 4, 0.6);
  assert.equal(first, second);
  assert.equal(getAgent('walker-1'), first);
  assert.deepEqual([second.x, second.z, second.r], [3, 4, 0.6]);
  removeAgent('walker-1');
});

test('fields written onto the entry outlive later position reports', () => {
  const agent = reportAgent('walker-2', 0, 0);
  agent.kind = 'pedestrian';
  agent.dialogueId = 'walker-2';
  reportAgent('walker-2', 5, 6);
  assert.equal(getAgent('walker-2').kind, 'pedestrian');
  assert.equal(getAgent('walker-2').dialogueId, 'walker-2');
  removeAgent('walker-2');
});

test('the details argument still works for callers that pass one', () => {
  reportAgent('cart-1', 0, 0, 1, { obstacleKind: 'pushcart' });
  assert.equal(getAgent('cart-1').obstacleKind, 'pushcart');
  removeAgent('cart-1');
  assert.equal(getAgent('cart-1'), null);
});

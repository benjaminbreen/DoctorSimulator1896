import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { validateCaseCard } from '../shared/patients/cases/validateCard.js';

const dir = new URL('../shared/patients/cases/cards/', import.meta.url);

test('every case card is structurally complete', () => {
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
  assert.ok(files.length > 0);
  for (const name of files) {
    const card = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    assert.equal(`${card.id}.json`, name, `${name}: id must match the file name`);
    assert.deepEqual(validateCaseCard(card), [], name);
  }
});

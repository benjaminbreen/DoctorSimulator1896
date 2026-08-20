import test from 'node:test';
import assert from 'node:assert/strict';
import { TREATMENT_LIBRARY } from '../src/consultation/treatments.js';

test('the treatment shelf has forty choices while retaining all drugs', () => {
  assert.equal(TREATMENT_LIBRARY.length, 40);
  assert.equal(TREATMENT_LIBRARY.filter((treatment) => treatment.categoryId === 'drugs').length, 11);
});

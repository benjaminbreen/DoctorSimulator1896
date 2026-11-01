import test from 'node:test';
import assert from 'node:assert/strict';
import { TREATMENT_LIBRARY, searchTreatments } from '../src/consultation/treatments.js';
import { CARMELA_RUSSO } from '../src/consultation/patients.js';

test('the treatment shelf has forty choices while retaining all drugs', () => {
  assert.equal(TREATMENT_LIBRARY.length, 40);
  assert.equal(TREATMENT_LIBRARY.filter((treatment) => treatment.categoryId === 'drugs').length, 11);
});

test('cabinet search finds case wording and alternatives without ranking by outcome', () => {
  const found = searchTreatments(CARMELA_RUSSO, ' COCA wine ');
  assert.deepEqual(found.map((item) => item.id), ['drug-coca-wine', 'drug-stop-tonic']);
  assert.match(found[1].label, /Stop the coca wine/);
  assert.equal(searchTreatments(CARMELA_RUSSO, 'nonexistent remedy').length, 0);
  assert.ok(searchTreatments(CARMELA_RUSSO, 'manage shop').some((item) => item.id === 'drug-stop-tonic'));
});

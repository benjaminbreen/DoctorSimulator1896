import test from 'node:test';
import assert from 'node:assert/strict';
import { TECHNICAL_PATIENTS } from '../src/consultation/technicalPatients.js';
import {
  addPatientNote,
  deletePatientNote,
  editPatientNote,
  loadPatientNotes,
  savePatientNotes,
} from '../src/consultation/patientNotes.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('patient notes add, edit, and delete without changing another patient', () => {
  const storage = memoryStorage();
  const firstPatient = TECHNICAL_PATIENTS[0];
  const secondPatient = TECHNICAL_PATIENTS[1];

  let notes = addPatientNote([], '  Ask whether the shaking follows coffee.  ', 100);
  assert.deepEqual(notes, [{ id: 'note-100', text: 'Ask whether the shaking follows coffee.', createdAt: 100, updatedAt: 100 }]);
  assert.equal(savePatientNotes(firstPatient, notes, storage), true);
  assert.deepEqual(loadPatientNotes(firstPatient, storage), notes);
  assert.deepEqual(loadPatientNotes(secondPatient, storage), []);

  notes = editPatientNote(notes, 'note-100', 'Compare the tremor before and after rest.', 200);
  savePatientNotes(firstPatient, notes, storage);
  assert.equal(loadPatientNotes(firstPatient, storage)[0].text, 'Compare the tremor before and after rest.');
  assert.equal(loadPatientNotes(firstPatient, storage)[0].updatedAt, 200);

  notes = deletePatientNote(notes, 'note-100');
  savePatientNotes(firstPatient, notes, storage);
  assert.deepEqual(loadPatientNotes(firstPatient, storage), []);
});

test('empty notes are never created or saved', () => {
  const storage = memoryStorage();
  const patient = TECHNICAL_PATIENTS[0];
  assert.deepEqual(addPatientNote([], '   ', 100), []);
  savePatientNotes(patient, [{ id: 'empty', text: '  ', createdAt: 1, updatedAt: 1 }], storage);
  assert.deepEqual(loadPatientNotes(patient, storage), []);
});

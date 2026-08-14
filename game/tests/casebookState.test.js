import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSULTATION_PATIENTS } from '../src/consultation/patients.js';
import { startConsultation, consultationTransition } from '../src/consultation/engine.js';
import {
  getPatientRecord,
  syncConsultationRecord,
} from '../src/hud/casebookState.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const STAMP = { date: { year: 1896, month: 8, date: 3 }, hours: 10.25 };

test('starting a consultation creates one persistent visit', () => {
  const storage = memoryStorage();
  const patient = CONSULTATION_PATIENTS[0];
  const state = startConsultation(patient);
  syncConsultationRecord(patient, state, STAMP, storage);
  syncConsultationRecord(patient, { ...state, stage: 'inquiry' }, STAMP, storage);

  const record = getPatientRecord(patient, storage);
  assert.equal(record.patientId, patient.id);
  assert.equal(record.visits.length, 1);
  assert.equal(record.visits[0].status, 'in-progress');
});

test('the record includes observed information but not hidden patient facts', () => {
  const storage = memoryStorage();
  const patient = CONSULTATION_PATIENTS[0];
  let state = startConsultation(patient);
  state = consultationTransition(state, patient, { type: 'begin-inquiry' });
  state = consultationTransition(state, patient, { type: 'examine', id: patient.examinations[0].id });
  syncConsultationRecord(patient, state, STAMP, storage);

  const visit = getPatientRecord(patient, storage).visits[0];
  assert.equal(visit.observations.length, 1);
  assert.equal(visit.observations[0].label, patient.examinations[0].label);
  assert.equal(JSON.stringify(visit).includes('allowedDisclosureIds'), false);
  assert.equal(JSON.stringify(visit).includes('modernDebrief'), false);
});

test('records for different patients stay isolated', () => {
  const storage = memoryStorage();
  const first = CONSULTATION_PATIENTS[0];
  const second = CONSULTATION_PATIENTS[1];
  syncConsultationRecord(first, startConsultation(first), STAMP, storage);
  syncConsultationRecord(second, startConsultation(second), STAMP, storage);

  assert.equal(getPatientRecord(first, storage).visits.length, 1);
  assert.equal(getPatientRecord(second, storage).visits.length, 1);
  assert.notEqual(getPatientRecord(first, storage).patientId, getPatientRecord(second, storage).patientId);
});

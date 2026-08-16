// Persistent practice records assembled from consultation events. The store
// keeps only what the player observed, recorded, or chose; it never copies a
// patient's hidden ground truth into the casebook.
import { resolveTreatmentPlan } from '../consultation/treatments.js';

export const CASEBOOK_STORAGE_KEY = 'ghosts.casebook.records.v1';

const MAX_VISITS_PER_PATIENT = 24;
const listeners = new Set();
let revision = 0;

function browserStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function emptyBook() {
  return { schemaVersion: 1, nextVisitId: 1, patients: {} };
}

function readBook(storage = browserStorage()) {
  if (!storage) return emptyBook();
  try {
    const parsed = JSON.parse(storage.getItem(CASEBOOK_STORAGE_KEY));
    if (parsed?.schemaVersion === 1 && parsed.patients && typeof parsed.patients === 'object') {
      return {
        schemaVersion: 1,
        nextVisitId: Math.max(1, Number(parsed.nextVisitId) || 1),
        patients: parsed.patients,
      };
    }
  } catch {
    // A damaged record store should leave the casebook empty, not unusable.
  }
  return emptyBook();
}

function writeBook(book, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(CASEBOOK_STORAGE_KEY, JSON.stringify(book));
    revision += 1;
    for (const listener of listeners) listener();
    return true;
  } catch {
    return false;
  }
}

function cleanStamp(stamp = {}) {
  const date = stamp.date || {};
  return {
    date: {
      year: Number(date.year) || 1896,
      month: Number(date.month) || 1,
      date: Number(date.date) || 1,
    },
    hours: Math.max(0, Math.min(24, Number(stamp.hours) || 0)),
  };
}

function observationEntries(state) {
  const seen = new Set();
  const entries = [];
  for (const event of state.history || []) {
    let entry = null;
    if (event.kind === 'examination' && event.reply) {
      entry = { kind: 'examination', label: event.label || 'Examination', text: event.reply };
    } else if (event.kind === 'speech' && event.noteSummary) {
      entry = { kind: 'patient-account', label: 'Patient account', text: event.noteSummary };
    }
    if (!entry) continue;
    const key = `${entry.label}:${entry.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

function selectedEvidence(patient, state) {
  const factMap = new Map(patient.facts.map((fact) => [fact.id, fact]));
  return (state.caseRecordFactIds || []).map((id) => factMap.get(id)).filter(Boolean).map((fact) => ({
    id: fact.id,
    label: fact.label,
    text: fact.notebookSummary || fact.value,
  }));
}

function resultSignature(state) {
  if (state.stage !== 'result') return null;
  return [
    state.patientId,
    state.history?.length || 0,
    state.diagnosisId || '',
    (state.treatmentIds || []).join(','),
    state.result?.oneMonth?.band || '',
  ].join(':');
}

function projectVisit(patient, state, stamp, previous, id) {
  const diagnosis = patient.diagnoses.find((item) => item.id === state.diagnosisId);
  const plan = resolveTreatmentPlan(patient, state.treatmentIds);
  const complete = state.stage === 'result';
  const closed = state.stage === 'terminated';
  return {
    id,
    startedAt: previous?.startedAt || stamp,
    updatedAt: stamp,
    status: complete ? 'complete' : closed ? 'closed' : 'in-progress',
    stage: state.stage,
    elapsedMinutes: Math.max(0, Number(state.elapsedMinutes) || 0),
    observations: observationEntries(state),
    evidence: selectedEvidence(patient, state),
    diagnosis: diagnosis ? { id: diagnosis.id, label: diagnosis.label } : null,
    treatments: plan ? plan.treatments.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.detail || '',
    })) : [],
    caseNote: String(state.caseNote || '').trim(),
    immediateOutcome: complete ? {
      narrative: state.result?.immediate?.narrative || '',
      departureLine: state.result?.immediate?.departureLine || '',
      paymentCents: Number(state.result?.immediate?.paymentCents) || 0,
    } : null,
    oneMonthOutcome: complete && state.result?.oneMonth ? {
      band: state.result.oneMonth.band || 'recorded',
      narrative: state.result.oneMonth.narrative || '',
    } : null,
    summary: complete ? {
      questionsAsked: Number(state.result?.summary?.questionsAsked) || 0,
      examinationsPerformed: Number(state.result?.summary?.examinationsPerformed) || 0,
      minutesUsed: Number(state.result?.summary?.minutesUsed) || Number(state.elapsedMinutes) || 0,
    } : null,
    resultSignature: resultSignature(state),
  };
}

export function subscribeCasebook(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCasebookRevision() {
  return revision;
}

export function getCasebookRecords(storage = browserStorage()) {
  return readBook(storage).patients;
}

export function getPatientRecord(patient, storage = browserStorage()) {
  return getCasebookRecords(storage)[patient.id] || null;
}

// Update the open visit after every consultation transition. A second call
// with the same completed result updates that visit instead of duplicating it.
export function syncConsultationRecord(patient, state, stamp, storage = browserStorage()) {
  if (!patient || !state || state.patientId !== patient.id) return null;
  const book = readBook(storage);
  const current = book.patients[patient.id] || { patientId: patient.id, visits: [] };
  const visits = [...(current.visits || [])];
  const last = visits.at(-1) || null;
  const signature = resultSignature(state);
  const updateLast = Boolean(last && (
    last.status === 'in-progress'
    || (signature && last.resultSignature === signature)
  ));
  const visitId = updateLast ? last.id : `visit-${book.nextVisitId++}`;
  const time = cleanStamp(stamp);
  const visit = projectVisit(patient, state, time, updateLast ? last : null, visitId);
  if (updateLast) visits[visits.length - 1] = visit;
  else visits.push(visit);

  const trimmedVisits = visits.slice(-MAX_VISITS_PER_PATIENT);
  const record = {
    patientId: patient.id,
    status: visit.status,
    firstSeenAt: current.firstSeenAt || visit.startedAt,
    lastSeenAt: visit.updatedAt,
    visits: trimmedVisits,
  };
  const nextBook = {
    ...book,
    patients: { ...book.patients, [patient.id]: record },
  };
  writeBook(nextBook, storage);
  return record;
}

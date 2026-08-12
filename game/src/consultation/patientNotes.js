export const PATIENT_NOTES_STORAGE_KEY = 'ghosts.consultation.patient-notes.v1';

const MAX_NOTES_PER_PATIENT = 100;
const MAX_NOTE_LENGTH = 2000;

function browserStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function patientScope(patient) {
  return `${patient.id}:${patient.profile?.seed ?? 'authored'}`;
}

function cleanNote(note) {
  const text = String(note?.text || '').trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) return null;
  const createdAt = Number(note?.createdAt) || Date.now();
  return {
    id: String(note?.id || `note-${createdAt}`),
    text,
    createdAt,
    updatedAt: Number(note?.updatedAt) || createdAt,
  };
}

function readBook(storage) {
  if (!storage) return { schemaVersion: 1, patients: {} };
  try {
    const parsed = JSON.parse(storage.getItem(PATIENT_NOTES_STORAGE_KEY));
    if (parsed?.schemaVersion === 1 && parsed.patients && typeof parsed.patients === 'object') return parsed;
  } catch {
    // A damaged or unavailable store should never make the casebook unusable.
  }
  return { schemaVersion: 1, patients: {} };
}

export function loadPatientNotes(patient, storage = browserStorage()) {
  const values = readBook(storage).patients[patientScope(patient)];
  if (!Array.isArray(values)) return [];
  return values.map(cleanNote).filter(Boolean).slice(-MAX_NOTES_PER_PATIENT);
}

export function savePatientNotes(patient, notes, storage = browserStorage()) {
  if (!storage) return false;
  const book = readBook(storage);
  const clean = notes.map(cleanNote).filter(Boolean).slice(-MAX_NOTES_PER_PATIENT);
  try {
    storage.setItem(PATIENT_NOTES_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      patients: { ...book.patients, [patientScope(patient)]: clean },
    }));
    return true;
  } catch {
    return false;
  }
}

export function addPatientNote(notes, text, now = Date.now()) {
  const cleanText = String(text || '').trim().slice(0, MAX_NOTE_LENGTH);
  if (!cleanText) return notes;
  const ids = new Set(notes.map((note) => note.id));
  let suffix = 0;
  let id = `note-${now}`;
  while (ids.has(id)) id = `note-${now}-${++suffix}`;
  return [...notes, { id, text: cleanText, createdAt: now, updatedAt: now }]
    .slice(-MAX_NOTES_PER_PATIENT);
}

export function editPatientNote(notes, id, text, now = Date.now()) {
  const cleanText = String(text || '').trim().slice(0, MAX_NOTE_LENGTH);
  if (!cleanText) return notes;
  return notes.map((note) => (note.id === id ? { ...note, text: cleanText, updatedAt: now } : note));
}

export function deletePatientNote(notes, id) {
  return notes.filter((note) => note.id !== id);
}

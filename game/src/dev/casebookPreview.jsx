// Dev-only page for working on the casebook layout: /casebook.html. Mounts the
// modal against the authored patients with a seeded record store, so the panel
// can be checked without booting the park.

import { createRoot } from 'react-dom/client';
import CasebookModal from '../hud/CasebookModal.jsx';
import { CASEBOOK_STORAGE_KEY } from '../hud/casebookState.js';
import { savePatientNotes } from '../consultation/patientNotes.js';
import { CONSULTATION_PATIENTS } from '../consultation/patients.js';
import '../styles.css';

// The page shares an origin with the game, so seeding the real store would
// overwrite a player's saved casebook. Swap in a throwaway one first.
const memory = new Map();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
    clear: () => memory.clear(),
    key: (index) => [...memory.keys()][index] ?? null,
    get length() { return memory.size; },
  },
});

const stamp = (date) => ({ date: { year: 1896, month: 6, date }, hours: 10 });
const seen = CONSULTATION_PATIENTS[0];

localStorage.setItem(CASEBOOK_STORAGE_KEY, JSON.stringify({
  schemaVersion: 1,
  nextVisitId: 2,
  patients: {
    [seen.id]: {
      patientId: seen.id,
      status: 'complete',
      firstSeenAt: stamp(15),
      lastSeenAt: stamp(15),
      visits: [{
        id: 'visit-1',
        startedAt: stamp(15),
        updatedAt: stamp(15),
        status: 'complete',
        stage: 'result',
        elapsedMinutes: 28,
        observations: [
          { kind: 'examination', label: 'Observed', text: 'fatigue, guarded movement, tenderness at the temples.' },
          { kind: 'patient-account', label: 'Patient account', text: 'the pain worsens after a long day at the machine.' },
        ],
        evidence: [],
        diagnosis: { id: 'neurasthenia', label: 'Nervous exhaustion' },
        treatment: { id: 'rest', label: 'Reduced working hours; regular meals' },
        caseNote: 'Reluctant to discuss conditions at home.',
        immediateOutcome: { narrative: '', departureLine: '', paymentCents: 300 },
        oneMonthOutcome: {
          band: 'improved',
          narrative: 'She writes that the headaches have eased, though the sleeplessness holds.',
        },
        summary: { questionsAsked: 6, examinationsPerformed: 2, minutesUsed: 28 },
        resultSignature: 'preview',
      }],
    },
  },
}));

savePatientNotes(seen, [
  { id: 'n1', text: 'Pain worsens after prolonged close work.', createdAt: 1 },
  { id: 'n2', text: 'Patient seemed reluctant to discuss conditions at home.', createdAt: 2 },
]);

createRoot(document.getElementById('root')).render(
  <div style={{ position: 'fixed', inset: 0, background: '#161311' }}>
    <CasebookModal
      open
      onClose={() => {}}
      patients={CONSULTATION_PATIENTS}
      day={{ year: 1896, month: 6, date: 15 }}
      onSeePatient={(patient) => console.info('see patient', patient.id)}
    />
  </div>,
);

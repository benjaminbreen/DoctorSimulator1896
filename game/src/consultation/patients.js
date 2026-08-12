import { NORA_BYRNE } from './authoredPatients/noraByrne.js';
import { createTechnicalPatients, DEFAULT_TECHNICAL_PATIENT_SEEDS } from './technicalPatients.js';

export { NORA_BYRNE } from './authoredPatients/noraByrne.js';
export { DEFAULT_TECHNICAL_PATIENT_SEEDS } from './technicalPatients.js';

export function createConsultationPatients(seeds = DEFAULT_TECHNICAL_PATIENT_SEEDS) {
  const procedural = createTechnicalPatients(seeds);
  return Object.freeze([NORA_BYRNE, procedural[1], procedural[2]]);
}

export const CONSULTATION_PATIENTS = createConsultationPatients();

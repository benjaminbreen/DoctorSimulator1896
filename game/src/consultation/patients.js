import { NORA_BYRNE } from './authoredPatients/noraByrne.js';
import { SAMUEL_TAYLOR } from './authoredPatients/samuelTaylor.js';
import { CARMELA_RUSSO } from './authoredPatients/carmelaRusso.js';
import { WILHELMINA_OTTEN } from './authoredPatients/wilhelminaOtten.js';
import { DEFAULT_TECHNICAL_PATIENT_SEEDS } from './technicalPatients.js';

export { NORA_BYRNE } from './authoredPatients/noraByrne.js';
export { SAMUEL_TAYLOR } from './authoredPatients/samuelTaylor.js';
export { CARMELA_RUSSO } from './authoredPatients/carmelaRusso.js';
export { WILHELMINA_OTTEN } from './authoredPatients/wilhelminaOtten.js';
export { DEFAULT_TECHNICAL_PATIENT_SEEDS } from './technicalPatients.js';

export function createConsultationPatients(_seeds = DEFAULT_TECHNICAL_PATIENT_SEEDS) {
  // Preserve the seed argument for callers that still use this factory as the
  // public queue seam. The opening queue is now fully authored; procedural
  // patients remain available through createTechnicalPatients for lab tests.
  return Object.freeze([NORA_BYRNE, SAMUEL_TAYLOR, CARMELA_RUSSO, WILHELMINA_OTTEN]);
}

export const CONSULTATION_PATIENTS = createConsultationPatients();

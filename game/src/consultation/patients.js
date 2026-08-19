import { NORA_BYRNE } from './authoredPatients/noraByrne.js';
import { SAMUEL_TAYLOR } from './authoredPatients/samuelTaylor.js';
import { CARMELA_RUSSO } from './authoredPatients/carmelaRusso.js';
import { WILHELMINA_OTTEN } from './authoredPatients/wilhelminaOtten.js';
import { createDayPatients } from './technicalPatients.js';

export { NORA_BYRNE } from './authoredPatients/noraByrne.js';
export { SAMUEL_TAYLOR } from './authoredPatients/samuelTaylor.js';
export { CARMELA_RUSSO } from './authoredPatients/carmelaRusso.js';
export { WILHELMINA_OTTEN } from './authoredPatients/wilhelminaOtten.js';
export { DEFAULT_TECHNICAL_PATIENT_SEEDS } from './technicalPatients.js';

// Day one is the authored cast. Later days (or a rerolled morning list) are
// procedural citizens generated from the day seed.
export function createConsultationPatients(day = null) {
  if (!day) return Object.freeze([NORA_BYRNE, SAMUEL_TAYLOR, CARMELA_RUSSO, WILHELMINA_OTTEN]);
  return createDayPatients(day);
}

export const CONSULTATION_PATIENTS = createConsultationPatients();

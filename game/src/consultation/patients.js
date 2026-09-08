import { NORA_BYRNE } from './authoredPatients/noraByrne.js';
import { SAMUEL_TAYLOR } from './authoredPatients/samuelTaylor.js';
import { CARMELA_RUSSO } from './authoredPatients/carmelaRusso.js';
import { WILHELMINA_OTTEN } from './authoredPatients/wilhelminaOtten.js';
import { FERDINAND_DE_CHAPUYS } from './authoredPatients/ferdinandDeChapuys.js';
import { createDayPatients } from './technicalPatients.js';
import { createRandom } from '../../../shared/patients/index.js';

export { NORA_BYRNE } from './authoredPatients/noraByrne.js';
export { SAMUEL_TAYLOR } from './authoredPatients/samuelTaylor.js';
export { CARMELA_RUSSO } from './authoredPatients/carmelaRusso.js';
export { WILHELMINA_OTTEN } from './authoredPatients/wilhelminaOtten.js';
export { FERDINAND_DE_CHAPUYS } from './authoredPatients/ferdinandDeChapuys.js';
export { DEFAULT_TECHNICAL_PATIENT_SEEDS } from './technicalPatients.js';

export const AUTHORED_PATIENT_POOL = Object.freeze([
  NORA_BYRNE, SAMUEL_TAYLOR, CARMELA_RUSSO, WILHELMINA_OTTEN, FERDINAND_DE_CHAPUYS,
]);

function createAuthoredDay({ daySeed = 1896, count = 3 } = {}) {
  const random = createRandom(daySeed, 'authored-day-one');
  const remaining = [...AUTHORED_PATIENT_POOL];
  const selected = [];
  while (selected.length < Math.min(count, remaining.length)) {
    selected.push(remaining.splice(random.integer(0, remaining.length - 1), 1)[0]);
  }
  return Object.freeze(selected);
}

// Day one draws three people from the authored pool. Later days (or a rerolled
// morning list) are procedural citizens generated from the day seed.
export function createConsultationPatients(day = null) {
  if (!day || day.dayIndex === 0) return createAuthoredDay(day || undefined);
  return createDayPatients(day);
}

export const CONSULTATION_PATIENTS = createConsultationPatients();

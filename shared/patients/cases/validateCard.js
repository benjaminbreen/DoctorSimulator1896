// Structural check for case cards. Quotes are checked against the corpus
// separately by scripts/cases/find_cases.py check.
const STATUSES = ['draft', 'verified'];
const SETTINGS = ['private-practice', 'dispensary', 'hospital', 'asylum', 'society-report', 'unknown'];
const CONFIDENCE = ['low', 'moderate', 'high'];

export function validateCaseCard(card) {
  const errors = [];
  const need = (condition, message) => { if (!condition) errors.push(message); };
  need(/^[a-z0-9-]+$/.test(card?.id || ''), 'id must be kebab-case');
  need(STATUSES.includes(card?.status), `status must be one of ${STATUSES.join(', ')}`);
  const source = card?.source || {};
  need(source.citation, 'source.citation is required');
  need(Number.isInteger(source.year), 'source.year must be a year');
  need(source.passageIds?.length > 0, 'source.passageIds must list corpus passages');
  need(Array.isArray(card?.inferred), 'inferred must list fields that are our inference, not the source');
  need(SETTINGS.includes(card?.setting), `setting must be one of ${SETTINGS.join(', ')}`);
  need(card?.reported && typeof card.reported === 'object', 'reported is required (use null for unstated fields)');
  need(card?.presentation?.complaints?.length > 0, 'presentation.complaints is required');
  need(card?.periodDiagnosis, 'periodDiagnosis is required');
  need(Array.isArray(card?.treatments), 'treatments must be an array (empty if none reported)');
  need(card?.quotes?.length > 0, 'at least one quote is required');
  need(card?.modernReading?.text, 'modernReading.text is required');
  need(CONFIDENCE.includes(card?.modernReading?.confidence), 'modernReading.confidence must be low, moderate, or high');
  need(card?.conditionTags?.length > 0, 'at least one condition tag is required');
  const fields = card?.fields || {};
  need(fields.fixed?.length > 0, 'fields.fixed must name what cannot change');
  need(Array.isArray(fields.constrained), 'fields.constrained must be an array');
  for (const item of fields.constrained || []) need(item.field && item.rule, 'each constrained field needs field and rule');
  need(Array.isArray(fields.free), 'fields.free must be an array');
  return errors;
}

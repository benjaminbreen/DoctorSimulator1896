function includesAll(values, required) {
  const known = new Set(values || []);
  return (required || []).every((id) => known.has(id));
}

function includesAny(values, required) {
  if (!(required?.length > 0)) return true;
  const known = new Set(values || []);
  return required.some((id) => known.has(id));
}

export function ruleIsAvailable(rule, state) {
  return state.trust >= (rule.minimumTrust ?? 0)
    && includesAll(state.disclosedFactIds, rule.requiresFactIds)
    && includesAny(state.disclosedFactIds, rule.requiresAnyFactIds)
    && !(rule.excludesFactIds || []).some((id) => state.disclosedFactIds.includes(id))
    && (!rule.requiresPendingResponseId || state.pendingResponseId === rule.requiresPendingResponseId);
}

function scoreTerms(text, terms) {
  const normalized = String(text || '').toLowerCase();
  return (terms || []).reduce((score, term) => (
    normalized.includes(String(term).toLowerCase()) ? score + String(term).length : score
  ), 0);
}

export function resolveInquiryRule(patient, state, input = {}) {
  if (input.promptId) {
    const prompt = patient.prompts?.find((candidate) => candidate.id === input.promptId) || null;
    return prompt && ruleIsAvailable(prompt, state) ? prompt : null;
  }

  const ranked = (patient.inquiryIntents || [])
    .filter((intent) => ruleIsAvailable(intent, state))
    .map((intent, index) => ({ intent, index, score: scoreTerms(input.text, intent.matchTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.intent || null;
}

export function availableDialoguePrompts(patient, state, limit = 3) {
  const asked = new Set(state.history
    .filter((event) => event.kind === 'speech' && event.promptId)
    .map((event) => event.promptId));
  const known = new Set(state.disclosedFactIds);
  const available = (patient.prompts || []).filter((prompt) => {
    if (!ruleIsAvailable(prompt, state) || (!prompt.repeatable && asked.has(prompt.id))) return false;
    if (state.pendingResponseId) return prompt.resolvesPendingResponseId === state.pendingResponseId;
    if (prompt.resolvesPendingResponseId) return false;
    const disclosures = prompt.discloseFactIds || [];
    const stale = disclosures.length > 0 && disclosures.every((id) => known.has(id));
    return !stale || prompt.useAfterDisclosure;
  });

  const selected = [];
  const usedRoles = new Set();
  const ranked = available
    .map((prompt, index) => ({ prompt, index, priority: Number(prompt.priority) || 0 }))
    .sort((left, right) => right.priority - left.priority || left.index - right.index);

  for (const entry of ranked) {
    const role = entry.prompt.role || 'general';
    if (usedRoles.has(role)) continue;
    selected.push(entry.prompt);
    usedRoles.add(role);
    if (selected.length >= limit) return selected;
  }
  for (const entry of ranked) {
    if (selected.includes(entry.prompt)) continue;
    selected.push(entry.prompt);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function availableExaminations(patient, state) {
  const observed = new Set(state.observedFactIds || []);
  return (patient.examinations || []).filter((examination) => {
    const factIds = examination.factIds || [examination.factId];
    return examination.repeatable || !factIds.filter(Boolean).every((id) => observed.has(id));
  });
}

function rankedDecisionItems(items, state, selectedId, limit) {
  const known = new Set(state.disclosedFactIds || []);
  const ranked = (items || []).map((item, index) => {
    const selector = item.selector || {};
    const support = (selector.supportFactIds || []).filter((id) => known.has(id)).length;
    const contrary = (selector.contraryFactIds || []).filter((id) => known.has(id)).length;
    return {
      item,
      index,
      score: (Number(selector.basePriority) || 0) + support * 12 - contrary * 5,
    };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = ranked.slice(0, limit).map((entry) => entry.item);
  const current = (items || []).find((item) => item.id === selectedId);
  if (current && !selected.includes(current)) selected[selected.length - 1] = current;
  return selected;
}

export function availableDiagnoses(patient, state, limit = 3) {
  return rankedDecisionItems(patient.diagnoses, state, state.diagnosisId, limit);
}

export function availableTreatments(patient, state, limit = 3) {
  return rankedDecisionItems(patient.treatments, state, state.treatmentId, limit);
}

export function classifyCustomThought(patient, text) {
  const ranked = (patient.thoughtIntents || [])
    .map((intent, index) => ({ intent, index, score: scoreTerms(text, intent.matchTerms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const match = ranked[0]?.intent;
  return {
    id: match?.id || 'unclassified',
    label: match?.label || 'Unclassified working idea',
    alignment: match?.alignment ?? 0,
  };
}

export function deterministicAppraisal(patient, state, input = {}) {
  const text = String(input.text || '').toLowerCase();
  if (['idiot', 'liar', 'fraud'].some((term) => text.includes(term))) {
    return { register: 'hostile', decorumBreach: 3, intent: 'insult', terminates: true };
  }
  const rule = resolveInquiryRule(patient, state, input);
  if (rule?.appraisal) return { terminates: false, ...rule.appraisal };
  if (input.stance === 'reassure') {
    return { register: 'courteous', decorumBreach: 0, intent: 'reassure', terminates: false };
  }
  if (input.stance === 'challenge') {
    return { register: 'prying', decorumBreach: 0, intent: 'challenge', terminates: false };
  }
  return { register: 'clinical', decorumBreach: 0, intent: 'question', terminates: false };
}

export function relationshipEffects(patient, state, input = {}) {
  return resolveInquiryRule(patient, state, input)?.effects || {};
}

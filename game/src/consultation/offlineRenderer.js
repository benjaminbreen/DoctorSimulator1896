function containsAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

export function renderOfflineDialogue(request, patient) {
  const disclosedNow = request.allowedDisclosureIds.slice(0, 1);
  const disclosed = patient.facts.find((fact) => fact.id === disclosedNow[0]);
  const rule = [...(patient.prompts || []), ...(patient.inquiryIntents || [])]
    .find((candidate) => candidate.id === request.resolvedRuleId);
  const hostile = containsAny(request.playerInput, ['idiot', 'liar', 'fraud']);
  const reassuring = request.stance === 'reassure';
  return {
    dialogue: rule?.dialogue || (disclosed
      ? `“${disclosed.patientWording || disclosed.value}”`
      : reassuring
        ? '“Thank you. I will try to answer plainly.”'
        : '“I cannot add much more to that just now.”'),
    behavior: hostile
      ? 'The patient draws back and prepares to leave.'
      : rule?.behavior || 'The patient remains attentive.',
    disclosedNow,
    appraisal: rule?.appraisal ? { terminates: false, ...rule.appraisal } : {
      register: hostile ? 'hostile' : reassuring ? 'courteous' : 'clinical',
      decorumBreach: hostile ? 3 : 0,
      intent: request.stance,
      terminates: hostile,
    },
  };
}

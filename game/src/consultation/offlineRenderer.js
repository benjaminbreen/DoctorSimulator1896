export function renderOfflineDialogue(request, patient) {
  const appraisal = request.appraisal;
  const hurt = ['discouraged', 'distressed', 'anxious', 'ashamed'].includes(request.currentEmotion?.expression);
  if (appraisal?.intent === 'insult') return {
    dialogue: appraisal.terminates
      ? '“I’m leaving. I don’t want to continue.”'
      : hurt
        ? '“I came here for help. I don’t understand why you’re speaking to me like that.”'
        : '“There’s no need to speak to me like that.”',
    behavior: appraisal.terminates ? 'The patient prepares to leave.'
      : hurt ? 'The patient looks down, visibly hurt.' : 'The patient stiffens and frowns.',
    reactionExpression: hurt ? 'discouraged' : 'frowning',
    expressionIntensity: 0.8,
    gaze: hurt ? 'down' : 'doctor',
    bodyCue: hurt ? 'sitting-distressed' : 'sitting-disapproval',
    disclosedNow: [], appraisal,
  };
  if (appraisal?.intent === 'apology') return {
    dialogue: '“All right. Can we go on?”',
    behavior: 'The patient settles back, still watchful.',
    reactionExpression: hurt ? 'discouraged' : 'guarded',
    expressionIntensity: Math.max(0.25, (request.currentEmotion?.expressionIntensity ?? 0.8) * 0.5),
    gaze: hurt ? 'down' : 'doctor', bodyCue: 'sitting-talking',
    disclosedNow: [], appraisal,
  };
  const disclosedNow = request.allowedDisclosureIds.slice(0, request.maxDisclosures || 1);
  const disclosed = patient.facts.find((fact) => fact.id === disclosedNow[0]);
  const rule = [...(patient.prompts || []), ...(patient.inquiryIntents || [])]
    .find((candidate) => candidate.id === request.resolvedRuleId);
  const reassuring = request.stance === 'reassure';
  return {
    dialogue: rule?.dialogue || (disclosed
      ? `“${disclosed.patientWording || disclosed.value}”`
      : reassuring
        ? '“All right.”'
        : '“I’m not sure what you mean. Can you ask me another way?”'),
    behavior: rule?.behavior || '',
    disclosedNow,
    appraisal,
  };
}

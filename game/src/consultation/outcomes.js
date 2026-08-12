function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function ratioFor(ids, knownIds) {
  if (!(ids?.length > 0)) return 1;
  const known = new Set(knownIds || []);
  return ids.filter((id) => known.has(id)).length / ids.length;
}

function band(value, boundaries) {
  if (value >= boundaries.high) return 'high';
  if (value >= boundaries.middle) return 'middle';
  return 'low';
}

function healthBand(change) {
  if (change >= 4) return 'improved';
  if (change >= -1) return 'little-change';
  if (change >= -5) return 'worse';
  return 'harmed';
}

function scorePhrase(score) {
  if (score >= 8) return 'strong';
  if (score >= 5) return 'mixed';
  return 'poor';
}

function interpretationScore(patient, state) {
  const prepared = state.interpretationIds
    .map((id) => patient.interpretations.find((item) => item.id === id)?.alignment)
    .filter(Number.isFinite);
  const custom = state.customInterpretations
    .map((item) => item.classification?.alignment)
    .filter(Number.isFinite);
  const values = [...prepared, ...custom];
  if (!values.length) return 5;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clamp(Math.round(5 + average * 1.6), 0, 10);
}

function jamesLetter(patient, scores, model) {
  const address = model.james?.address || 'My dear Doctor';
  const close = model.james?.close || 'Yours faithfully, William James';
  return `${address}, Your observation in ${patient.profile.identity.displayName}’s case was ${scorePhrase(scores.observation)} (${scores.observation}/10). Your diagnostic reasoning was ${scorePhrase(scores.diagnosis)} (${scores.diagnosis}/10), and your conduct of treatment was ${scorePhrase(scores.treatment)} (${scores.treatment}/10). I find ${scorePhrase(scores.scientificPromise)} scientific promise in the record (${scores.scientificPromise}/10), especially where you distinguished what was observed from what was merely supposed. ${close}`;
}

export function resolveAuthoredOutcome(patient, state, noteCoverage) {
  const model = patient.outcomeModel;
  if (!model) return null;
  const diagnosis = patient.diagnoses.find((item) => item.id === state.diagnosisId);
  const treatment = patient.treatments.find((item) => item.id === state.treatmentId);
  const knownFactIds = [...new Set([...state.disclosedFactIds, ...state.observedFactIds])];
  const evidenceRatio = ratioFor(model.evidenceFactIds, knownFactIds);
  const criticalRatio = ratioFor(model.criticalFactIds, knownFactIds);

  const diagnosisBase = diagnosis.evaluation?.quality ?? 0;
  const treatmentBase = treatment.evaluation?.quality ?? 0;
  const observationScore = Math.round(evidenceRatio * 10);
  const diagnosisScore = Math.round(diagnosisBase * (0.65 + criticalRatio * 0.35));
  const treatmentScore = Math.round(treatmentBase * (0.72 + evidenceRatio * 0.28));
  const thoughtScore = interpretationScore(patient, state);
  const scientificPromise = clamp(Math.round(
    observationScore * 0.3 + diagnosisScore * 0.25 + treatmentScore * 0.1
      + noteCoverage / 10 * 0.2 + thoughtScore * 0.15,
  ), 0, 10);
  const satisfaction = clamp(Math.round(
    state.satisfaction
      + (diagnosis.evaluation?.patientAcceptance || 0)
      + (treatment.evaluation?.patientAcceptance || 0),
  ), 0, 100);
  const experienceBand = band(satisfaction, { high: 70, middle: 43 });
  const reputation = experienceBand === 'high' ? 3 : experienceBand === 'middle' ? 0 : -3;
  const payment = experienceBand === 'low' ? model.fee.reduced : model.fee.full;
  const healthChange = treatment.evaluation?.healthChange || 0;
  const functionChange = treatment.evaluation?.functionChange || 0;
  const episodesChange = treatment.evaluation?.episodesChange || 0;
  const outcomeBand = healthBand(healthChange);
  const immediateLead = model.immediateNarratives[experienceBand];
  const immediateDetail = treatment.evaluation?.immediateText || '';
  const monthLead = treatment.evaluation?.monthText || model.monthNarratives[outcomeBand];
  const scores = {
    observation: observationScore,
    diagnosis: diagnosisScore,
    treatment: treatmentScore,
    interpretation: thoughtScore,
    caseRecord: Math.round(noteCoverage / 10),
    scientificPromise,
  };

  return {
    kind: 'authored-outcome',
    diagnosisId: diagnosis.id,
    treatmentId: treatment.id,
    noteCoverage,
    evidenceCoverage: Math.round(evidenceRatio * 100),
    reputation,
    record: rounded((diagnosisScore + treatmentScore + noteCoverage / 10) / 3),
    immediate: {
      satisfaction,
      band: experienceBand,
      narrative: [immediateLead, immediateDetail].filter(Boolean).join(' '),
      paymentCents: payment,
      paymentLabel: payment === model.fee.full ? 'Fee paid in full' : 'Reduced fee paid',
      wordOfMouth: experienceBand === 'high' ? 'Likely recommendation' : experienceBand === 'middle' ? 'No clear recommendation' : 'Likely complaint',
      reputation,
    },
    oneMonth: {
      band: outcomeBand,
      narrative: monthLead,
      healthChange,
      functionChange,
      episodesChange,
      incomeChangeCents: treatment.evaluation?.incomeChangeCents || 0,
    },
    scores,
    james: {
      letter: jamesLetter(patient, scores, model),
      disclaimer: 'The assessment explains fixed scores derived from the case record.',
    },
    modernDebrief: `${model.modernDebrief} ${treatment.evaluation?.modernText || ''}`.trim(),
  };
}

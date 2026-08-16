import { resolveTreatmentPlan } from './treatments.js';

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

function recoveryBand(change) {
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
  const latest = [...state.history].reverse().find((event) => event.kind === 'interpretation');
  const alignment = latest?.alignment;
  return Number.isFinite(alignment) ? clamp(Math.round(5 + alignment * 1.6), 0, 10) : 5;
}

function jamesLetter(patient, scores, model) {
  const address = model.james?.address || 'My dear Doctor';
  const close = model.james?.close || 'Yours faithfully, William James';
  return `${address}, Your observation in ${patient.profile.identity.displayName}’s case was ${scorePhrase(scores.observation)} (${scores.observation}/10). Your diagnostic reasoning was ${scorePhrase(scores.diagnosis)} (${scores.diagnosis}/10), and your conduct of treatment was ${scorePhrase(scores.treatment)} (${scores.treatment}/10). I find ${scorePhrase(scores.scientificPromise)} scientific promise in the record (${scores.scientificPromise}/10), especially where you distinguished what was observed from what was merely supposed. ${close}`;
}

function consultationCounts(state) {
  return {
    questionsAsked: state.history.filter((event) => (
      event.kind === 'speech' && event.stance === 'question' && event.countsAsQuestion !== false
    )).length,
    examinationsPerformed: state.history.filter((event) => event.kind === 'examination').length,
  };
}

function performanceFeedback(result, state) {
  const counts = consultationCounts(state);
  const strengths = [];
  const improvements = [];
  if (result.evidenceCoverage >= 65) strengths.push('You gathered a focused body of useful evidence.');
  else improvements.push('A little more discriminating evidence would have made the assessment firmer.');
  if (counts.examinationsPerformed > 0) strengths.push('You tested the history against physical findings.');
  else improvements.push('No physical examination was entered in the record.');
  if ((result.scores?.diagnosis ?? 0) >= 7) strengths.push('The diagnosis was well supported by the evidence you had.');
  else improvements.push('The final diagnosis was only partly supported by the discovered evidence.');
  if ((result.scores?.treatment ?? 0) >= 7) strengths.push('The treatment plan addressed the patient’s likely needs.');
  else improvements.push('The treatment plan carried important limitations or risks.');
  if ((state.elapsedMinutes || 0) <= (state.appointmentMinutes || 30)) strengths.push('You concluded within the scheduled appointment.');
  else improvements.push('The consultation ran into overtime and delayed the practice.');
  return {
    strengths: strengths.slice(0, 2),
    improvements: improvements.slice(0, 2),
  };
}

function departureLine(model, experienceBand) {
  return model.departureLines?.[experienceBand] || {
    high: '“Thank you, Doctor. I believe I understand what I am to do.”',
    middle: '“Thank you, Doctor. I shall think carefully on what you have said.”',
    low: '“Good day, Doctor. I do not think there is more to be said.”',
  }[experienceBand];
}

function attachSummary(result, state) {
  const counts = consultationCounts(state);
  return {
    ...result,
    immediate: {
      ...result.immediate,
      satisfactionOutOfTen: Math.round((result.immediate.satisfaction / 10) * 10) / 10,
    },
    summary: {
      ...counts,
      minutesUsed: state.elapsedMinutes || 0,
      scheduledMinutes: state.appointmentMinutes || 30,
      overtimeMinutes: Math.max(0, (state.elapsedMinutes || 0) - (state.appointmentMinutes || 30)),
      selectedEvidenceCount: state.caseRecordFactIds?.length || 0,
    },
    feedback: performanceFeedback(result, state),
  };
}

export function resolveAuthoredOutcome(patient, state, noteCoverage) {
  const model = patient.outcomeModel;
  if (!model) return null;
  const diagnosis = patient.diagnoses.find((item) => item.id === state.diagnosisId);
  const plan = resolveTreatmentPlan(patient, state.treatmentIds);
  if (!plan) return null;
  const knownFactIds = [...new Set([...state.disclosedFactIds, ...state.observedFactIds])];
  const evidenceRatio = ratioFor(model.evidenceFactIds, knownFactIds);
  const criticalRatio = ratioFor(model.criticalFactIds, knownFactIds);

  const diagnosisBase = diagnosis.evaluation?.quality ?? 0;
  const treatmentBase = plan.evaluation.quality;
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
      + plan.evaluation.patientAcceptance,
  ), 0, 100);
  const experienceBand = band(satisfaction, { high: 70, middle: 43 });
  const reputation = experienceBand === 'high' ? 3 : experienceBand === 'middle' ? 0 : -3;
  const payment = experienceBand === 'low' ? model.fee.reduced : model.fee.full;
  const recovery = plan.evaluation.recovery;
  const cost = plan.evaluation.cost;
  const outcomeBand = recoveryBand(recovery);
  const immediateLead = model.immediateNarratives[experienceBand];
  const immediateDetail = plan.evaluation.immediateText;
  const monthLead = plan.evaluation.monthText || model.monthNarratives[outcomeBand];
  const scores = {
    observation: observationScore,
    diagnosis: diagnosisScore,
    treatment: treatmentScore,
    interpretation: thoughtScore,
    caseRecord: Math.round(noteCoverage / 10),
    scientificPromise,
  };

  const result = {
    kind: 'authored-outcome',
    diagnosisId: diagnosis.id,
    treatmentIds: plan.treatments.map((item) => item.id),
    treatmentLabels: plan.treatments.map((item) => item.label),
    noteCoverage,
    evidenceCoverage: Math.round(evidenceRatio * 100),
    reputation,
    record: rounded((diagnosisScore + treatmentScore + noteCoverage / 10) / 3),
    immediate: {
      satisfaction,
      band: experienceBand,
      narrative: [immediateLead, immediateDetail].filter(Boolean).join(' '),
      departureLine: departureLine(model, experienceBand),
      paymentCents: payment,
      paymentLabel: payment === model.fee.full ? 'Fee paid in full' : 'Reduced fee paid',
      wordOfMouth: experienceBand === 'high' ? 'Likely recommendation' : experienceBand === 'middle' ? 'No clear recommendation' : 'Likely complaint',
      reputation,
    },
    oneMonth: {
      band: outcomeBand,
      narrative: monthLead,
      recovery,
      cost,
    },
    scores,
    james: {
      letter: jamesLetter(patient, scores, model),
      disclaimer: 'The assessment explains fixed scores derived from the case record.',
    },
    modernDebrief: `${model.modernDebrief} ${plan.evaluation.modernText}`.trim(),
  };
  return attachSummary(result, state);
}

export function resolveFollowUpOutcome(patient, state) {
  const model = patient.outcomeModel;
  if (!model) return null;
  const evidenceRatio = ratioFor(model.evidenceFactIds, state.disclosedFactIds);
  const observation = Math.round(evidenceRatio * 10);
  const satisfaction = clamp(Math.round(state.satisfaction + 2), 0, 100);
  const experienceBand = band(satisfaction, { high: 70, middle: 43 });
  const scores = {
    observation,
    diagnosis: 5,
    treatment: 5,
    interpretation: interpretationScore(patient, state),
    caseRecord: 5,
    scientificPromise: clamp(Math.round(observation * 0.45 + 3.5), 0, 10),
  };
  const result = {
    kind: 'follow-up-outcome',
    diagnosisId: null,
    treatmentIds: [],
    treatmentLabels: [],
    noteCoverage: 0,
    evidenceCoverage: Math.round(evidenceRatio * 100),
    reputation: 0,
    record: rounded((observation + scores.interpretation) / 2),
    immediate: {
      satisfaction,
      band: experienceBand,
      narrative: 'You explain that the available evidence does not yet justify a settled course and arrange another visit.',
      departureLine: model.followUpDepartureLine || '“Very well, Doctor. I would rather return than have you name the trouble too quickly.”',
      paymentCents: model.fee.reduced,
      paymentLabel: 'Reduced consultation fee',
      wordOfMouth: 'No clear recommendation',
      reputation: 0,
    },
    oneMonth: {
      band: 'little-change',
      narrative: model.followUpMonthText || 'No treatment has yet been begun; the later course depends on the arranged return visit.',
      recovery: 0,
      cost: 0,
    },
    scores,
    james: {
      letter: jamesLetter(patient, scores, model),
      disclaimer: 'The assessment explains fixed scores derived from the case record.',
    },
    modernDebrief: `${model.modernDebrief} The player deferred treatment pending further evidence.`,
  };
  return attachSummary(result, state);
}

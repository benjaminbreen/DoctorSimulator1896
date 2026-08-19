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

// Offline fallback only; the live letter comes from the model with the full
// transcript. No numbers — James does not grade, he judges.
function jamesLetter(patient, scores, model) {
  const address = model.james?.address || 'My dear Doctor';
  const name = patient.profile.identity.displayName;
  const them = patient.profile.identity.sex === 'female' ? 'her' : patient.profile.identity.sex === 'male' ? 'him' : 'them';
  const looking = {
    strong: `You looked at ${name} before you theorized about ${them}, which is rarer than it should be.`,
    mixed: `You saw something of ${name}, though you left more on the table than you carried off.`,
    poor: `You theorized about ${name} more than you looked at ${them}, which is the common vice.`,
  }[scorePhrase(scores.observation)];
  const judging = {
    strong: 'Your reasoning followed the evidence rather than dragging it along behind.',
    mixed: 'Your reasoning was sound in parts and hopeful in others; the two should not be neighbors.',
    poor: 'Your conclusion arrived well before your evidence did, and never waited for it.',
  }[scorePhrase(scores.diagnosis)];
  const treating = {
    strong: 'The treatment was honest work.',
    mixed: 'The treatment I would call harmless, which is not the same as useful.',
    poor: 'The treatment I would not have inflicted on a man I liked.',
  }[scorePhrase(scores.treatment)];
  return `${address}, ${looking} ${judging} ${treating} Write to me when the case turns. Wm. James`;
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
  if (result.evidenceCoverage >= 65) strengths.push('You found most of the evidence that mattered.');
  else improvements.push('More specific evidence would have made the diagnosis firmer.');
  if (counts.examinationsPerformed > 0) strengths.push('You checked the story against a physical examination.');
  else improvements.push('You never examined the patient.');
  if ((result.scores?.diagnosis ?? 0) >= 7) strengths.push('The diagnosis fit the evidence you had.');
  else improvements.push('The diagnosis was only partly supported by what you found.');
  if ((result.scores?.treatment ?? 0) >= 7) strengths.push('The treatment fit the case.');
  else improvements.push('The treatment carried real limits or risks.');
  if ((state.elapsedMinutes || 0) <= (state.appointmentMinutes || 30)) strengths.push('You finished within the appointment.');
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
  // Say plainly what was prescribed; the authored prose never names it.
  const labels = plan.treatments.map((item) => item.label.toLowerCase());
  const prescribedLine = `You prescribe ${labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
    : labels[0]}.`;
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
      // Chronological: what you prescribed, how it lands, how the patient leaves.
      narrative: [prescribedLine, immediateDetail, immediateLead].filter(Boolean).join(' '),
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
      disclaimer: 'Written on reading the case record you signed.',
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
      disclaimer: 'Written on reading the case record you signed.',
    },
    modernDebrief: `${model.modernDebrief} The player deferred treatment pending further evidence.`,
  };
  return attachSummary(result, state);
}

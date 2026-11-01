export const CARMELA_DISCUSSION = {
  starts: [
    { treatmentIds: ['drug-stop-tonic', 'drug-coca-wine'], step: 'conflicting-wine' },
    { treatmentIds: ['rest-cure-home'], step: 'rest' },
    { treatmentIds: ['drug-stop-tonic'], step: 'wine' },
  ],
  steps: {
    'conflicting-wine': {
      dialogue: '“Do you want me to stop the wine or keep taking it?”',
      reactionExpression: 'guarded', bodyCue: 'sitting-disbelief',
      choices: [{ id: 'revise', text: 'Let me correct the prescription.', revise: true }],
    },
    wine: {
      dialogue: '“I thought the wine was helping. What should I do if my heart starts again?”',
      reactionExpression: 'anxious', bodyCue: 'sitting-self-soothing',
      choices: [
        { id: 'trial', text: 'Leave off the wine for a week. Keep a note of the attacks.', agreement: 'wine-trial' },
        { id: 'work', text: 'Leave off the wine. Let’s work out how you can manage at the shop.', next: 'shop' },
        { id: 'revise', text: 'Let’s look at the prescription again.', revise: true },
      ],
    },
    shop: {
      dialogue: '“I can stop the wine. But I can’t close the shop. Elena’s seventeen. She can help, but she can’t run it on her own.”',
      discloseFactIds: ['carmela-shop-stakes'],
      noteSummary: 'Carmela needs to keep the shop open; Elena cannot run it alone.',
      noteKey: 'carmela-shop-stakes',
      reactionExpression: 'guarded', bodyCue: 'sitting-talking',
      choices: [
        { id: 'gradual', text: 'Keep the shop open. Start with one customer, with Elena beside you.', agreement: 'gradual-counter' },
        { id: 'supported', text: 'Let Elena cover the counter for a few days, then try it together.', agreement: 'supported-start' },
        { id: 'defer', text: 'For now, stop the wine and keep a note. We’ll discuss work next week.', agreement: 'wine-trial' },
      ],
    },
    rest: {
      dialogue: '“If I close the shop, we have no income. I can’t leave Elena to run it for weeks.”',
      discloseFactIds: ['carmela-shop-stakes'],
      noteSummary: 'Carmela says she cannot close the shop or leave Elena in charge for weeks.',
      noteKey: 'carmela-shop-stakes',
      reactionExpression: 'frowning', bodyCue: 'sitting-disapproval',
      choices: [
        { id: 'revise', text: 'Then this plan won’t work. Let’s change it.', revise: true },
        { id: 'insist', text: 'I still recommend complete rest. Will you be able to do it?', agreement: 'rest-declined' },
      ],
    },
    other: {
      dialogue: '“What should I expect from this? Will I still be able to work?”',
      reactionExpression: 'guarded', bodyCue: 'sitting-talking',
      choices: [
        { id: 'review', text: 'It may not stop the attacks. Come back so we can check how you’re getting on.', agreement: 'review-response' },
        { id: 'practical', text: 'Tell me which parts of the plan will be difficult at the shop.', next: 'practical' },
        { id: 'revise', text: 'Let’s reconsider before you start it.', revise: true },
      ],
    },
    practical: {
      dialogue: '“I can come back, but not in the middle of the day. Elena’s seventeen. I can’t leave her to run the shop.”',
      discloseFactIds: ['carmela-shop-stakes'],
      noteSummary: 'Carmela needs a return appointment outside the shop’s busy hours; Elena cannot run it alone.',
      noteKey: 'carmela-shop-stakes',
      reactionExpression: 'guarded', bodyCue: 'sitting-talking',
      choices: [
        { id: 'arrange', text: 'We’ll arrange a time you can manage. Tell me if the treatment causes trouble.', agreement: 'practical-review' },
        { id: 'revise', text: 'Let’s look for a plan that takes less time away from work.', revise: true },
      ],
    },
  },
  agreements: {
    'wine-trial': {
      treatmentId: 'drug-stop-tonic', quality: 8, recovery: 6, cost: 0, patientAcceptance: 4,
      summary: 'Stop coca wine and record attacks for a week; return to discuss work.',
      dialogue: '“I can leave it off for a week. I’ll write down when it happens.”',
      immediateText: 'She agrees to stop the wine and keep a note of the attacks. She has no plan yet for returning to the counter.',
      monthText: 'Carmela has stopped the wine. The attacks are less frequent, but she still asks Elena to answer the shop bell. They have not yet worked out how to share the counter.',
      modernText: 'Removing the stimulant helps, but the agreed plan leaves avoidance and the strain on the household unresolved.',
      review: {
        opening: '“They’re not as bad. I haven’t taken the wine, but I still send Elena when the bell rings.”',
        symptoms: '“Less often, and they pass sooner. I still get frightened when one starts.”',
        work: '“Elena’s doing most of the serving. I know I can’t leave it all to her.”',
      },
    },
    'gradual-counter': {
      treatmentId: 'drug-stop-tonic', quality: 10, recovery: 10, cost: 1, patientAcceptance: 7,
      summary: 'Stop coca wine; serve one customer at a time with Elena nearby; review in a week.',
      dialogue: '“I can try one customer. Elena can stay beside me at first.”',
      immediateText: 'She agrees to stop the wine and try the counter with Elena beside her, starting with one customer.',
      monthText: 'Carmela has stopped the wine and is serving customers again. She had two brief attacks in the first week and none in the last twelve days. Elena still helps when the shop is busy.',
      modernText: 'The agreed plan removes the stimulant and reduces avoidance in small steps while keeping the shop open.',
      review: {
        opening: '“I’m serving again. I still want Elena nearby when it’s busy, but I haven’t had an attack for twelve days.”',
        symptoms: '“There were two that first week. They passed. Nothing since.”',
        work: '“I started with one customer, as we agreed. I’m doing more now. Elena still helps when there’s a crowd.”',
      },
    },
    'supported-start': {
      treatmentId: 'drug-stop-tonic', quality: 10, recovery: 9, cost: -1, patientAcceptance: 8,
      summary: 'Stop coca wine; Elena covers the counter briefly, then they serve together; review in a week.',
      dialogue: '“A few days, then we’ll try it together. I can do that.”',
      immediateText: 'She agrees to stop the wine. Elena will cover the counter briefly before they begin serving together.',
      monthText: 'Carmela has stopped the wine and returned to the counter with Elena’s help. They lost some trade during the first few days. She still avoids the busiest hour, but is doing more each week.',
      modernText: 'A short period of practical support makes the plan manageable; the return to ordinary activity remains gradual.',
      review: {
        opening: '“We lost some trade those first few days. I’m back at the counter now, except when it’s very busy.”',
        symptoms: '“I still get the pounding sometimes. It’s less often since I stopped the wine.”',
        work: '“Elena and I serve together. I let her take over when there’s a crowd.”',
      },
    },
    'rest-declined': {
      treatmentId: 'rest-cure-home', quality: 2, recovery: 0, cost: 0, patientAcceptance: -8,
      summary: 'Complete rest recommended; Carmela says she cannot follow it because the shop must stay open.',
      dialogue: '“No. I can’t close it. You’ll have to suggest something else.”',
      immediateText: 'She says she cannot follow the recommendation to close the shop. No workable rest arrangement has been agreed.',
      monthText: 'Carmela kept the shop open and did not take the prescribed rest. The attacks continue.',
      modernText: 'The recommendation was not followed. Its predicted effects should not be confused with the course of an untreated problem.',
      review: {
        opening: '“I couldn’t close the shop. I told you that last time. I’m still having the attacks.”',
        symptoms: '“Much the same. I still take the wine to get through the day.”',
        work: '“We stayed open. Elena does more at the counter than she ought to.”',
      },
    },
    'review-response': {
      summary: 'Try the selected treatment and review its effects rather than promise that it will stop the attacks.',
      dialogue: '“All right. How soon do you want me back?”',
    },
    'practical-review': {
      summary: 'Try the selected treatment and arrange a review around the shop’s working hours.',
      dialogue: '“I can come before I open. That would be easier.”',
    },
  },
};

export function treatmentDiscussionStep(patient, state) {
  const discussion = patient.treatmentDiscussion;
  if (!discussion || state.treatmentAgreement) return null;
  const id = state.discussionStep || discussion.starts.find(entry =>
    entry.treatmentIds.every(treatmentId => state.treatmentIds.includes(treatmentId)))?.step || 'other';
  return { id, ...discussion.steps[id] };
}

export function agreedTreatment(patient, state) {
  return patient.treatmentDiscussion?.agreements[state.treatmentAgreement?.id] || null;
}

export function applyTreatmentAgreement(patient, state, plan) {
  const agreement = agreedTreatment(patient, state);
  const treatment = plan.treatments.find(item => item.id === agreement?.treatmentId);
  if (!treatment) return plan;
  const evaluation = { ...plan.evaluation };
  for (const key of ['quality', 'recovery', 'cost', 'patientAcceptance']) {
    evaluation[key] += agreement[key] - treatment.evaluation[key];
  }
  for (const key of ['immediateText', 'monthText', 'modernText']) {
    evaluation[key] = [agreement[key], ...plan.treatments.filter(item => item !== treatment)
      .map(item => item.evaluation[key])].filter(Boolean).join(' ');
  }
  if (plan.treatments.length > 1) evaluation.monthText = [
    state.treatmentAgreement.id === 'rest-declined' ? 'Carmela did not take the prescribed rest.'
      : `Carmela followed the agreed plan: ${agreement.summary}`,
    ...plan.treatments.filter(item => item !== treatment).map(item => item.evaluation.monthText),
  ].filter(Boolean).join(' ');
  return { ...plan, evaluation };
}

export function treatmentReturnVisit(patient, state, result) {
  if (!patient.treatmentDiscussion || !state.treatmentAgreement) return null;
  const agreement = agreedTreatment(patient, state);
  // A second medicine still has its own effects. Do not claim a clean recovery
  // from the wine plan when the combined treatment actually caused harm.
  const review = state.treatmentIds.length === 1 ? agreement?.review : null;
  const improved = result.oneMonth.recovery >= 4;
  return {
    opening: review?.opening || (improved ? '“I’ve been a little better. I wanted to tell you how I’m getting on.”'
      : '“I’m still having trouble. Can we go over the treatment again?”'),
    expression: improved ? 'guarded' : 'discouraged',
    questions: [
      { id: 'attacks', text: 'How have the attacks been?', dialogue: review?.symptoms || result.oneMonth.narrative, observation: !review },
      { id: 'shop', text: 'How are you managing at the shop?', dialogue: review?.work || '“It’s still difficult. I need a plan that lets me keep the shop open.”' },
    ],
    plans: [
      { id: 'continue', text: 'Keep the present plan. Come back if things get worse.',
        dialogue: improved ? '“All right. I’ll let you know.”' : '“But I’m not getting better. I’d like you to examine me again.”' },
      { id: 'counter', text: 'Try the counter with Elena beside you. We’ll review it again.',
        dialogue: state.treatmentAgreement.id === 'gradual-counter' ? '“We’ve been doing that. I can keep trying.”' : '“I can try that if she stays with me at first.”' },
      { id: 'reassess', text: 'I’d like to examine you again before changing the prescription.', dialogue: '“All right. What do you need me to do?”' },
    ],
  };
}

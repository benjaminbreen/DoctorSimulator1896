import { CARMELA_RUSSO, NORA_BYRNE, SAMUEL_TAYLOR } from '../src/consultation/patients.js';
import {
  buildDialogueRequest,
  consultationTiming,
  consultationTransition,
  startConsultation,
} from '../src/consultation/engine.js';
import { renderOfflineDialogue } from '../src/consultation/offlineRenderer.js';
import {
  availableDiagnoses,
  availableDialoguePrompts,
  availableExaminations,
} from '../src/consultation/patientLogic.js';

const rawArgs = process.argv.slice(2);
const patientFlag = rawArgs.find((argument) => argument.startsWith('--patient='));
const patientKey = patientFlag?.slice('--patient='.length)
  || (rawArgs.includes('--carmela') ? 'carmela' : rawArgs.includes('--samuel') ? 'samuel' : 'nora');
const args = rawArgs.filter((argument) => !['--carmela', '--samuel', patientFlag].includes(argument));
const patients = { nora: NORA_BYRNE, samuel: SAMUEL_TAYLOR, carmela: CARMELA_RUSSO };
const patient = patients[patientKey];

if (!patient) {
  throw new Error(`Unknown authored patient: ${patientKey}. Use nora, samuel, or carmela.`);
}

function begin() {
  return consultationTransition(startConsultation(patient), patient, { type: 'begin-inquiry' });
}

function speak(state, promptId) {
  const prompt = patient.prompts.find((item) => item.id === promptId);
  if (!prompt) throw new Error(`Unknown prompt: ${promptId}`);
  const input = {
    promptId,
    text: prompt.text,
    stance: prompt.stance,
    responseTo: prompt.resolvesPendingResponseId || null,
  };
  const request = buildDialogueRequest(patient, state, input);
  return consultationTransition(state, patient, {
    type: 'speech-response', input, response: renderOfflineDialogue(request, patient),
  });
}

function chooseDecision(state, diagnosisId, treatmentId, factIds) {
  state = consultationTransition(state, patient, { type: 'begin-decision' });
  state = consultationTransition(state, patient, { type: 'select-diagnosis', id: diagnosisId });
  state = consultationTransition(state, patient, { type: 'select-treatment', id: treatmentId });
  state = consultationTransition(state, patient, { type: 'begin-case-note' });
  for (const id of factIds) state = consultationTransition(state, patient, { type: 'select-record-fact', id });
  return consultationTransition(state, patient, { type: 'submit-case-note' });
}

function apply(state, token) {
  if (patient.prompts.some((item) => item.id === token)) return speak(state, token);
  if (patient.examinations.some((item) => item.id === token)) {
    return consultationTransition(state, patient, { type: 'examine', id: token });
  }
  if (token === 'overtime') return consultationTransition(state, patient, { type: 'continue-overtime' });
  if (token === 'followup') return consultationTransition(state, patient, { type: 'schedule-follow-up' });
  if (token.startsWith('think:')) return consultationTransition(state, patient, { type: 'interpret', id: token.slice(6) });
  if (token.startsWith('decide:')) {
    const [, diagnosisId, treatmentId, evidence = ''] = token.split(':');
    return chooseDecision(state, diagnosisId, treatmentId, evidence.split(',').filter(Boolean));
  }
  throw new Error(`Unknown action: ${token}`);
}

function options(state) {
  if (state.stage !== 'inquiry') return [];
  return [
    ...availableDialoguePrompts(patient, state).map((item) => `${item.id} (${item.minutes ?? 5}m)`),
    ...availableExaminations(patient, state).map((item) => `${item.id} (${item.minutes ?? 3}m)`),
    ...availableDiagnoses(patient, state).map((item) => `dx:${item.id}`),
    // Every library treatment is offerable; list the ones this case answers to.
    ...Object.keys(patient.treatmentOverrides || {}).map((id) => `tx:${id}`),
  ];
}

function snapshot(state, action = 'start') {
  const time = consultationTiming(patient, state);
  const last = state.history.at(-1);
  return {
    action,
    stage: state.stage,
    minutes: `${state.elapsedMinutes}/${time.authorizedMinutes}`,
    remaining: time.authorizedRemaining,
    trust: state.trust,
    satisfaction: state.satisfaction,
    newFacts: (last?.facts || (last?.fact ? [last.fact] : [])).map((fact) => fact.label).join(', ')
      || (last?.disclosedNow || []).join(', '),
    error: state.errors.at(-1) || '',
  };
}

function run(label, tokens, verbose = true) {
  let state = begin();
  const rows = [snapshot(state)];
  for (const token of tokens) {
    const errorCount = state.errors.length;
    state = apply(state, token);
    rows.push(snapshot(state, token));
    if (state.errors.length > errorCount) break;
  }
  if (verbose) {
    console.log(`\n${label}`);
    console.table(rows);
    if (state.result) {
      console.table({
        payment: state.result.immediate.paymentLabel,
        satisfaction: `${state.result.immediate.satisfactionOutOfTen}/10`,
        questions: state.result.summary.questionsAsked,
        exams: state.result.summary.examinationsPerformed,
        minutes: state.result.summary.minutesUsed,
        month: state.result.oneMonth.band,
      });
    } else {
      console.log('Available now:', options(state).join('\n  '));
    }
  }
  return state;
}

const noraScenarios = [
  {
    label: 'Focused support',
    tokens: [
      'think:nora-approach-history',
      'nora-ask-onset', 'nora-ask-work', 'nora-ask-hand-agency', 'nora-response-respect',
      'nora-ask-memory', 'nora-ask-messages', 'nora-exam-neurologic', 'overtime', 'nora-exam-general',
      'decide:nora-dx-automatism:mind-remove-influence:nora-automatic-writing,nora-missing-time,nora-sensory-pattern',
    ],
  },
  {
    label: 'Rushed period treatment',
    tokens: [
      'think:nora-approach-hysteria',
      'nora-ask-hand-agency', 'nora-response-dismiss', 'nora-exam-neurologic',
      'decide:nora-dx-neurasthenia:rest-cure-home:nora-automatic-writing,nora-sensory-pattern,nora-sleep',
    ],
  },
  {
    label: 'Deliberate follow-up',
    tokens: ['nora-ask-onset', 'nora-ask-work', 'nora-exam-neurologic', 'followup'],
  },
];

const carmelaScenarios = [
  {
    label: 'Evidence-led plan',
    tokens: [
      'think:carmela-approach-sequence',
      'carmela-ask-pattern', 'carmela-ask-calamity', 'carmela-response-steady',
      'carmela-ask-tonics', 'carmela-ask-red-flags', 'carmela-exam-cardiorespiratory',
      'carmela-ask-shop',
      'decide:carmela-dx-nervous-coca:drug-stop-tonic:carmela-episode-pattern,carmela-coca-wine,carmela-cardiac-exam',
    ],
  },
  {
    label: 'Flattering presentiment',
    tokens: [
      'think:carmela-approach-sequence',
      'carmela-ask-pattern', 'carmela-ask-calamity', 'carmela-response-omen',
      'carmela-ask-shop', 'carmela-exam-cardiorespiratory',
      'decide:carmela-dx-presentiment:mind-endorse:carmela-episode-pattern,carmela-bell-avoidance,carmela-cardiac-exam',
    ],
  },
  {
    label: 'Dismissal and seclusion',
    tokens: [
      'think:carmela-approach-heart',
      'carmela-ask-pattern', 'carmela-ask-calamity', 'carmela-response-dismiss',
      'carmela-ask-shop', 'carmela-exam-cardiorespiratory',
      'decide:carmela-dx-irritable-heart:rest-cure-home:carmela-episode-pattern,carmela-shop-stakes,carmela-cardiac-exam',
    ],
  },
];

const samuelScenarios = [
  {
    label: 'Focused occupational diagnosis',
    tokens: [
      'think:samuel-approach-exposure',
      'samuel-ask-course', 'samuel-ask-work', 'samuel-response-test',
      'samuel-ask-bowels', 'samuel-exam-mouth-hands', 'samuel-ask-income',
      'samuel-exam-abdomen',
      'decide:samuel-dx-lead:move-lighter-work:samuel-metal-work,samuel-digestion,samuel-gum-line',
    ],
  },
  {
    label: 'Humane but incomplete melancholia plan',
    tokens: [
      'think:samuel-approach-melancholia',
      'samuel-ask-course', 'samuel-ask-bereavement', 'samuel-ask-safety',
      'samuel-ask-work', 'samuel-response-test',
      'decide:samuel-dx-melancholia:mind-companionship:samuel-course,samuel-bereavement,samuel-safety',
    ],
  },
  {
    label: 'Moralizing diagnosis and seclusion',
    tokens: [
      'think:samuel-approach-melancholia',
      'samuel-ask-course', 'samuel-ask-work', 'samuel-response-moralize',
      'samuel-ask-bowels', 'samuel-exam-mouth-hands', 'samuel-ask-income',
      'decide:samuel-dx-melancholia:rest-cure-home:samuel-metal-work,samuel-digestion,samuel-gum-line',
    ],
  },
];

const scenarios = { nora: noraScenarios, samuel: samuelScenarios, carmela: carmelaScenarios }[patientKey];

if (args[0] === '--compare') {
  const states = scenarios.map((scenario) => run(scenario.label, scenario.tokens, false));
  console.table(states.map((state, index) => ({
    path: scenarios[index].label,
    minutes: state.result.summary.minutesUsed,
    questions: state.result.summary.questionsAsked,
    exams: state.result.summary.examinationsPerformed,
    satisfaction: state.result.immediate.satisfactionOutOfTen,
    payment: state.result.immediate.paymentLabel,
    month: state.result.oneMonth.band,
  })));
} else if (args[0] === '--demo') {
  run(scenarios[0].label, scenarios[0].tokens);
} else if (args.length) {
  run('Custom path', args);
} else {
  run(`${patient.label}: opening decision state`, []);
  console.log('\nUsage:');
  console.log('  npm run playtest:consult -- --demo');
  console.log('  npm run playtest:consult -- --compare');
  console.log('  npm run playtest:consult -- --patient=samuel --compare');
  console.log('  npm run playtest:consult -- --patient=carmela --compare');
  console.log('  npm run playtest:consult -- <prompt-or-exam-id> ... decide:<diagnosis>:<treatment>:<fact,fact>');
}

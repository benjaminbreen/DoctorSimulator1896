import { generatePatient, patientToRendererCRecipe } from '../../../../shared/patients/index.js';
import { createActorInstance } from '../../world/characters/actors.js';

const id = 'nora-byrne-1896';
const base = generatePatient({ seed: 2273, sex: 'female' });

const profile = Object.freeze({
  ...base,
  identity: Object.freeze({
    ...base.identity,
    age: 28,
    birthYear: 1868,
    givenName: 'Nora',
    familyName: 'Byrne',
    title: 'Miss',
    displayName: 'Miss Byrne',
    fullName: 'Miss Nora Byrne',
    origin: Object.freeze({
      id: 'irish-american', label: 'Irish American', generation: 1,
      generationLabel: 'born in New York to Irish parents',
    }),
    migration: null,
    religion: 'Roman Catholic',
    language: 'English',
  }),
  social: Object.freeze({
    ...base.social,
    classId: 'working',
    classLabel: 'self-supporting working household',
    occupationId: 'copyist',
    occupation: 'copyist in a law office',
    householdPosition: 'boarder',
    household: Object.freeze({ maritalStatus: 'single', spouseOccupation: null, spouseDeceased: false, children: 0, dependents: 0 }),
    residence: 'a boarding house in Greenwich Village',
    payer: 'private account',
    referralSource: 'her boarding-house keeper',
  }),
  clinical: Object.freeze({
    id: 'nora-dissociative-presentation',
    periodCategory: 'hysteria with cerebral automatism',
    theme: 'amnesia, automatic writing, and functional sensory symptoms after bereavement',
    presentingComplaint: 'poor sleep and trembling hands',
    symptoms: ['broken sleep', 'fine hand tremor', 'automatic writing', 'brief periods of missing time', 'variable numbness of the left hand'],
    duration: 'six months',
    severity: 0.62,
    affect: 'guarded',
    flags: ['research-draft', 'authored-composite'],
    performance: Object.freeze({
      posture: -0.08, breathing: 1.08, breathingRate: 16, fidget: 1.28,
      gazeDrift: 1.32, weightShift: 1.05, tremor: 0.58, handTension: 0.72,
      gestureSpeed: 1.05,
    }),
  }),
});

const recipe = patientToRendererCRecipe(profile, {
  id,
  asset: {
    kind: 'authored-character',
    path: '/models/characters/nora-byrne.glb?v=4',
    applyRecipe: false,
    opaque: true,
    modelRotationX: -Math.PI / 2,
    motionClips: [
      'ClinicIdle', 'SittingTalking', 'SittingSelfSoothing',
    ],
    clipMap: {
      'clinic-idle': 'ClinicIdle',
      'sitting-talking': 'SittingTalking',
      'sitting-distressed': 'SittingSelfSoothing',
      'sitting-disapproval': 'SittingSelfSoothing',
      'sitting-disbelief': 'SittingSelfSoothing',
      'sitting-self-soothing': 'SittingSelfSoothing',
      'sit-down': 'ClinicIdle',
      'stand-up': 'ClinicIdle',
      'standing-idle': 'ClinicIdle',
      walk: 'ClinicIdle',
    },
  },
  animation: { body: 'clinic-idle', expression: 'guarded', gaze: 'doctor', speaking: false },
  // Use the same chair anchor and facing as the procedural female patients.
  // Asset-axis correction belongs on the model, not in its room placement.
  placement: { position: [0.45, 0.22, -1.7], rotation: [0, Math.PI, 0], scale: 1.82 },
});

// Enter by the waiting-room door (south wall, consulting-office blueprint).
// The renderer skips the walk until this asset carries Walk and SitDown clips.
recipe.presentation.entrance = { from: [2.4, 0, 4.55] };
// Her recorded sign: a fine tremor in both hands, displayed at rest.
recipe.presentation.tremor = 0.6;

const actor = createActorInstance({ id, recipe });

const facts = Object.freeze([
  Object.freeze({
    id: 'nora-sleep', kind: 'symptom', label: 'Broken sleep',
    value: 'Her sleep has been broken for several months, with no fixed hour of waking.',
    notebookSummary: 'Patient wakes repeatedly in the night and is exhausted by morning.',
    patientWording: 'I fall asleep from weariness, but wake again and again before morning.',
    disclosure: 'open', confidence: 'high', measurement: false,
    releaseOn: ['sleep', 'night', 'wake', 'dream'], noteTerms: ['sleep', 'waking', 'insomnia'],
  }),
  Object.freeze({
    id: 'nora-tremor', kind: 'symptom', label: 'Hand tremor',
    value: 'A fine tremor comes and goes in both hands and becomes more marked when she is watched.',
    notebookSummary: 'Hand tremor becomes more marked when the patient is watched.',
    patientWording: 'The shaking is worse when someone fixes their eyes upon my hands.',
    disclosure: 'open', confidence: 'moderate', measurement: false,
    releaseOn: ['tremor', 'shake', 'shaking', 'hands'], noteTerms: ['tremor', 'shaking', 'hands'],
  }),
  Object.freeze({
    id: 'nora-work-risk', kind: 'social', label: 'Work and lodging',
    value: 'She supports herself as a copyist; prolonged seclusion would cost her position and probably her room.',
    notebookSummary: 'Patient depends on copyist wages for her room and cannot afford prolonged rest.',
    patientWording: 'If I am kept from the office, I cannot pay Mrs. Doyle for my room. There is no family purse to fall back upon.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['work', 'office', 'copyist', 'money', 'room', 'rest'], noteTerms: ['work', 'copyist', 'office', 'lodging', 'room'],
  }),
  Object.freeze({
    id: 'nora-bereavement', kind: 'history', label: 'Bereavement',
    value: 'Her elder sister Mary died after a short illness in January 1896; the sleep disturbance began soon afterward.',
    notebookSummary: 'Sleep disturbance worsened around her sister Mary’s illness and death in January.',
    patientWording: 'My sister Mary died in January. I began waking in the night not long after we buried her.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['sister', 'mary', 'death', 'died', 'grief', 'loss', 'began', 'onset'],
    noteTerms: ['sister', 'mary', 'death', 'bereavement', 'grief'],
  }),
  Object.freeze({
    id: 'nora-seance', kind: 'context', label: 'Séance circle',
    value: 'A fellow boarder brought her to a small spiritualist circle, where attention settled on the movement of her hand.',
    notebookSummary: 'A fellow boarder brought the patient to a spiritualist circle where her hand was watched for signs from Mary.',
    patientWording: 'Mrs. Bell took me to a circle. They said the movement of my hand might mean that Mary wished to speak.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    minimumTrust: 50,
    releaseOn: ['séance', 'seance', 'circle', 'spiritualist', 'spirit', 'dead'],
    noteTerms: ['séance', 'seance', 'circle', 'spiritualist'],
  }),
  Object.freeze({
    id: 'nora-automatic-writing', kind: 'symptom', label: 'Automatic writing',
    value: 'When a pencil is placed in her left hand during the circle, the hand sometimes writes short phrases without a felt intention to write.',
    notebookSummary: 'Patient says her left hand writes while she feels she is only watching it.',
    patientWording: 'With the pencil in my left hand, words sometimes come while I feel as though I am merely watching it move.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    minimumTrust: 52,
    releaseOn: ['write', 'writing', 'pencil', 'hand move', 'without intending', 'automatic'],
    noteTerms: ['writing', 'pencil', 'automatic', 'intention'],
  }),
  Object.freeze({
    id: 'nora-missing-time', kind: 'symptom', label: 'Missing time',
    value: 'On three occasions she found that ten to twenty minutes had passed without a continuous memory of them, although witnesses described quiet, purposeful behavior.',
    notebookSummary: 'Patient reports three gaps of ten to twenty minutes despite apparently purposeful behavior.',
    patientWording: 'Three times I have come to myself with part of the hour gone. They tell me I answered sensibly and put things in order, but I remember none of it.',
    disclosure: 'withheld', confidence: 'moderate', measurement: false,
    minimumTrust: 58, requiresFactIds: ['nora-automatic-writing'],
    releaseOn: ['memory', 'remember', 'time', 'hour', 'lost', 'missing', 'come to'],
    noteTerms: ['memory', 'amnesia', 'missing time', 'hour'],
  }),
  Object.freeze({
    id: 'nora-message-limits', kind: 'context', label: 'Contents of the writing',
    value: 'The writing uses Mary’s name but contains only family phrases and facts Nora already knew.',
    notebookSummary: 'The writings use Mary’s name and familiar phrases but reveal nothing unknown to the patient.',
    patientWording: 'It signs Mary’s name and uses sayings of ours, but it has told us nothing that was unknown to me before.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    requiresFactIds: ['nora-automatic-writing'],
    releaseOn: ['message', 'messages', 'words', 'said', 'know', 'unknown', 'mary'],
    noteTerms: ['message', 'writing', 'known', 'family phrases'],
  }),
  Object.freeze({
    id: 'nora-seizure-negatives', kind: 'history', label: 'No convulsive markers',
    value: 'She reports no convulsion, dangerous fall, tongue injury, incontinence, or prolonged confusion after an episode.',
    notebookSummary: 'No falls, convulsions, tongue injury, incontinence, or confusion follow the episodes.',
    patientWording: 'I have never fallen in a fit, bitten my tongue, or lost control of myself. I am not dazed afterward—only frightened by the gap.',
    disclosure: 'withheld', confidence: 'moderate', measurement: false,
    requiresFactIds: ['nora-automatic-writing'],
    releaseOn: ['fit', 'seizure', 'tongue', 'fall', 'confusion', 'convulsion'],
    noteTerms: ['convulsion', 'tongue', 'incontinence', 'confusion', 'seizure'],
  }),
  Object.freeze({
    id: 'nora-observed-tremor', kind: 'sign', label: 'Observed tremor',
    value: 'A fine irregular tremor is visible with the arms extended. It diminishes while her attention is occupied by a counting task.',
    disclosure: 'observed', confidence: 'moderate', measurement: false,
    noteTerms: ['tremor', 'attention', 'counting', 'diminishes'],
  }),
  Object.freeze({
    id: 'nora-sensory-pattern', kind: 'sign', label: 'Left-hand sensation',
    value: 'Pin and light touch are reported as dull over the left hand in a glove-like boundary that does not follow a single nerve or root.',
    disclosure: 'observed', confidence: 'moderate', measurement: false,
    noteTerms: ['sensation', 'numbness', 'glove', 'left hand'],
  }),
  Object.freeze({
    id: 'nora-normal-neurology', kind: 'sign', label: 'Strength and reflexes',
    value: 'Strength is full with encouragement; tendon reflexes are equal, and there is no wasting or fixed weakness.',
    disclosure: 'observed', confidence: 'high', measurement: false,
    noteTerms: ['strength', 'reflexes', 'wasting', 'weakness'],
  }),
  Object.freeze({
    id: 'nora-thyroid-negative', kind: 'sign', label: 'Pulse and neck',
    value: 'Pulse is 78 and regular. There is no visible enlargement of the thyroid, eye prominence, or marked loss of weight.',
    disclosure: 'observed', confidence: 'high', measurement: true,
    noteTerms: ['pulse', 'thyroid', 'eyes', 'weight'],
  }),
]);

const prompts = Object.freeze([
  Object.freeze({
    id: 'nora-ask-onset', text: 'Trace the onset and ask what changed in her life.', stance: 'question',
    role: 'history', priority: 30, minutes: 5,
    noteSummary: 'Sleep disturbance worsened around her sister Mary’s illness and death in January.',
    discloseFactIds: ['nora-bereavement'], dialogue: '“After Christmas, I think. No—after Mary was taken ill. She was my elder sister. I had been sleeping poorly before she died in January, but not in this fashion.”',
    effects: { satisfaction: 2 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'onset' },
    bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'nora-ask-work', text: 'Ask how illness or prolonged rest would affect her work and room.', stance: 'question',
    role: 'context', priority: 25, minutes: 5,
    noteSummary: 'Patient depends on copyist wages for her room and cannot afford prolonged rest.',
    discloseFactIds: ['nora-work-risk'], dialogue: '“I copy contracts and correspondence for Mr. Pritchard. He has said nothing yet, but he notices errors. If I am kept from the office, there will be no wages and then no room at Mrs. Doyle’s. I have no family purse to draw upon.”',
    effects: { satisfaction: 3 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'social history' },
  }),
  Object.freeze({
    id: 'nora-ask-hand-agency', text: 'Ask exactly what happens when her hand moves without her intending it.', stance: 'question',
    role: 'symptom', priority: 28, minutes: 5, maxDisclosures: 2,
    noteSummary: 'At a spiritualist circle, the patient’s left hand writes while she feels she is watching it.',
    discloseFactIds: ['nora-seance', 'nora-automatic-writing'],
    opensPendingResponseId: 'nora-spiritualism-concern',
    dialogue: '“Mrs. Bell pressed me to attend a circle. With a pencil in my left hand, words sometimes come while I feel I am only watching it move. They said Mary might be trying to speak. You will not put ‘spiritualism’ in your account as though I were a fool, will you?”',
    effects: { trust: 2, satisfaction: 3 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'social suggestion' },
    bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'nora-response-respect', text: '“No. I want to understand what happened, not ridicule you.”', stance: 'reassure',
    role: 'response', priority: 40, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'nora-spiritualism-concern', resolvesPendingResponseId: 'nora-spiritualism-concern',
    dialogue: '“Thank you. I had feared that one word would settle your opinion of me before you heard the rest.”',
    effects: { trust: 6, satisfaction: 7 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'respectful response' },
  }),
  Object.freeze({
    id: 'nora-response-clinical', text: '“I shall record only the circumstances and observable symptoms.”', stance: 'suggest',
    role: 'response', priority: 35, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'nora-spiritualism-concern', resolvesPendingResponseId: 'nora-spiritualism-concern',
    dialogue: '“Very well. I can ask no more than that.”',
    effects: { trust: 1, satisfaction: 2 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'clinical response' },
  }),
  Object.freeze({
    id: 'nora-response-dismiss', text: '“Spiritualism is foolishness; it has no place in a medical account.”', stance: 'challenge',
    role: 'response', priority: 30, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'nora-spiritualism-concern', resolvesPendingResponseId: 'nora-spiritualism-concern',
    dialogue: '“That was not what I asked. I see that I was right to be cautious.”',
    effects: { trust: -10, satisfaction: -13 }, appraisal: { register: 'prying', decorumBreach: 1, intent: 'dismissive response' },
    bodyCue: 'sitting-disapproval',
  }),
  Object.freeze({
    id: 'nora-ask-memory', text: 'Test memory continuity and ask about signs of a convulsive fit.', stance: 'question',
    role: 'differential', priority: 32, minutes: 5, maxDisclosures: 2,
    noteSummary: 'Three brief memory gaps occurred without falls, convulsions, or confusion.',
    requiresFactIds: ['nora-automatic-writing'], discloseFactIds: ['nora-missing-time', 'nora-seizure-negatives'],
    dialogue: '“Three times part of the hour was gone, though they say I answered sensibly and put things in order. There was no fall or fit, no bitten tongue, and afterward I was frightened but not confused.”',
    effects: { trust: 1, satisfaction: 1 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'amnesia differential' },
    bodyCue: 'sitting-disbelief',
  }),
  Object.freeze({
    id: 'nora-ask-messages', text: 'Ask whether the writing contains anything she could not know.', stance: 'question',
    role: 'differential', priority: 18, minutes: 3,
    noteSummary: 'The writings use Mary’s name and familiar phrases but reveal nothing unknown to the patient.',
    requiresFactIds: ['nora-automatic-writing'], discloseFactIds: ['nora-message-limits'],
    dialogue: '“No, that is what troubles me. It signs Mary’s name and uses little sayings we had between us, but it has never told anything I did not already know. Mrs. Bell thinks that proves nothing. I am less certain.”',
    effects: { satisfaction: 1 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'message content' },
  }),
]);

const inquiryIntents = Object.freeze([
  Object.freeze({
    id: 'nora-intent-automatic-writing', matchTerms: ['write without', 'writing', 'pencil', 'hand move', 'control your hand', 'automatic'],
    noteSummary: 'Patient says her left hand writes while she feels she is only watching it.',
    discloseFactIds: ['nora-automatic-writing'], minimumTrust: 52,
    dialogue: '“Yes. It is the left hand. Once the pencil is there it may start before I have decided on a word. I can see what it writes, but I do not feel that I am composing it.”',
    effects: { satisfaction: 1 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'automatic writing' },
    bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'nora-intent-amnesia', matchTerms: ['lose time', 'missing time', 'remember everything', 'memory', 'blank', 'gap'],
    noteSummary: 'Patient reports three gaps of ten to twenty minutes despite apparently purposeful behavior.',
    requiresFactIds: ['nora-automatic-writing'], discloseFactIds: ['nora-missing-time'], minimumTrust: 58,
    dialogue: '“There have been three gaps—ten minutes perhaps, or twenty. That is Mrs. Bell’s reckoning. She says I spoke quite ordinarily. I remember none of it, which is what frightens me.”',
    effects: { trust: 1 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'amnesia' },
    bodyCue: 'sitting-disbelief',
  }),
  Object.freeze({
    id: 'nora-intent-bereavement', matchTerms: ['sister', 'mary', 'died', 'death', 'grief', 'loss', 'when did it begin'],
    noteSummary: 'Sleep disturbance worsened around her sister Mary’s illness and death in January.',
    discloseFactIds: ['nora-bereavement'],
    dialogue: '“My sister Mary died in January. I thought the poor sleep belonged only to grief at first, but it has gone on, and the shaking came afterward—or perhaps just before. I cannot place it exactly.”',
    effects: { satisfaction: 2 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'bereavement' },
  }),
  Object.freeze({
    id: 'nora-intent-seance', matchTerms: ['seance', 'séance', 'spiritualist', 'circle', 'spirit', 'dead speaking'],
    noteSummary: 'A fellow boarder brought the patient to a spiritualist circle where her hand was watched for signs from Mary.',
    requiresFactIds: ['nora-bereavement'], discloseFactIds: ['nora-seance'], minimumTrust: 50,
    dialogue: '“Mrs. Bell, who lodges in the same house, took me to a circle. They watched my hand for a sign from Mary. I went only because she pressed me, at least the first time.”',
    effects: { trust: 2 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'séance' },
  }),
  Object.freeze({
    id: 'nora-intent-message-content', matchTerms: ['what did it say', 'messages say', 'message', 'anything unknown', 'could not know'],
    noteSummary: 'The writings use Mary’s name and familiar phrases but reveal nothing unknown to the patient.',
    requiresFactIds: ['nora-automatic-writing'], discloseFactIds: ['nora-message-limits'],
    dialogue: '“Nothing I could not have known. It uses Mary’s name and phrases from home. That is why I cannot decide whether the writing means anything at all.”',
    appraisal: { register: 'clinical', decorumBreach: 0, intent: 'message content' },
  }),
  Object.freeze({
    id: 'nora-intent-work', matchTerms: ['work', 'job', 'office', 'pay rent', 'room', 'afford rest'],
    noteSummary: 'Patient depends on copyist wages for her room and cannot afford prolonged rest.',
    discloseFactIds: ['nora-work-risk'],
    dialogue: '“I must keep my place at the law office. Without the wages I cannot keep my room, and there is no one who can simply maintain me while I rest.”',
    effects: { satisfaction: 3 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'social history' },
  }),
  Object.freeze({
    id: 'nora-intent-seizure', matchTerms: ['seizure', 'fit', 'convulsion', 'bite your tongue', 'fall down', 'confused afterward'],
    noteSummary: 'No falls, convulsions, tongue injury, incontinence, or confusion follow the episodes.',
    requiresFactIds: ['nora-missing-time'], discloseFactIds: ['nora-seizure-negatives'],
    dialogue: '“There has been no fit and no fall. They tell me I remain quiet. When I come to myself I know where I am; I simply do not know where the missing minutes have gone.”',
    appraisal: { register: 'clinical', decorumBreach: 0, intent: 'seizure differential' },
  }),
  Object.freeze({
    id: 'nora-intent-fraud', matchTerms: ['pretend', 'faking', 'fake', 'attention', 'making it up'],
    noteKey: 'nora-denies-fraud', noteSummary: 'Patient denies deliberate production and says she came from fear and the need to keep working.',
    dialogue: '“I expected you might doubt the story. I did not expect to be accused of inventing it. If that is your judgment, there is little use in my remaining.”',
    effects: { trust: -12, satisfaction: -16 }, appraisal: { register: 'prying', decorumBreach: 1, intent: 'accusation' },
    bodyCue: 'sitting-disapproval',
  }),
]);

export const NORA_BYRNE = Object.freeze({
  id,
  label: 'Miss Nora Byrne',
  contentStatus: 'research-draft',
  profileStatus: 'authored-composite',
  initialTrust: 58,
  initialSatisfaction: 50,
  profile,
  actor,
  opening: Object.freeze({
    dialogue: '“It is my hands, Doctor. They shake at the office, and I do not sleep as I should.”',
    behavior: 'Miss Byrne sits very upright on the edge of the chair, her gloves folded tightly in her lap. A faint tremor passes through her left hand when she notices you looking at it.',
  }),
  appointment: Object.freeze({ minutes: 30, overtimeExtensionMinutes: 5, maxOvertimeExtensions: 1 }),
  groundTruth: Object.freeze({
    etiologyId: 'trauma-related-dissociation-with-functional-symptoms',
    modernSummary: 'A fictional presentation of dissociative amnesia with functional neurological symptoms following bereavement, overwork, and sleep disruption.',
    precipitatingFactors: ['bereavement', 'overwork', 'sleep disruption'],
    shapingFactors: ['spiritualist expectations', 'attention to automatic writing'],
    maintainingFactors: ['fear of the episodes', 'repeated séance participation', 'economic strain'],
    exclusions: ['malingering', 'epileptic seizure', 'structural neurological disease', 'intoxication', 'supernatural knowledge'],
  }),
  sources: Object.freeze([
    Object.freeze({ id: 'james-bourne', citation: 'William James, The Principles of Psychology (1890), vol. 1, pp. 391–393.', supports: ['purposeful behavior during amnesia', 'spontaneous trance as a period comparison'] }),
    Object.freeze({ id: 'james-lucie', citation: 'William James, The Principles of Psychology (1890), vol. 1, p. 228.', supports: ['automatic writing in an insensible hand', 'spirit interpretation shaped by social surroundings'] }),
    Object.freeze({ id: 'janet-lucie', citation: 'Pierre Janet, L’Automatisme psychologique (1889), p. 200 and surrounding experiments.', supports: ['automatic writing and divided awareness'] }),
    Object.freeze({ id: 'dana', citation: 'Charles L. Dana, Text-book of Nervous Diseases (1892), pp. 416–430.', supports: ['period differential: hysteria, tremor, sensory loss, trance, and cerebral automatism'] }),
  ]),
  facts,
  prompts,
  inquiryIntents,
  interpretations: Object.freeze([
    Object.freeze({
      id: 'nora-approach-history',
      label: 'History and daily life',
      text: 'I should learn how this began and what was happening in her family and daily life before I draw conclusions.',
      alignment: 2,
      nextMode: 'patient',
    }),
    Object.freeze({
      id: 'nora-approach-examination',
      label: 'Physical causes first',
      text: 'An examination may disclose an ordinary bodily cause for the tremor before I question her further.',
      alignment: 1,
      nextMode: 'examination',
    }),
    Object.freeze({
      id: 'nora-approach-hysteria',
      label: 'Functional nervous illness',
      text: 'At first glance this resembles a textbook hysterical affection; I should test that impression as I proceed.',
      alignment: 0,
      nextMode: 'patient',
      provisionalDiagnosisId: 'nora-dx-automatism',
    }),
  ]),
  dialogueStyle: 'Nora is guarded, concrete, and self-supporting. She speaks in complete but unpolished sentences, sometimes corrects her chronology, and worries about sounding foolish. Keep replies conversational rather than diagnostic. Do not add facts.',
  thoughtIntents: Object.freeze([
    Object.freeze({ id: 'dissociation', label: 'Divided awareness or cerebral automatism', matchTerms: ['double consciousness', 'dissociation', 'automatism', 'divided', 'memory state', 'unconscious writing'], alignment: 3 }),
    Object.freeze({ id: 'functional', label: 'Functional nervous symptom', matchTerms: ['functional', 'hysteria', 'suggestion', 'attention changes'], alignment: 2 }),
    Object.freeze({ id: 'organic', label: 'Organic nervous disease', matchTerms: ['organic', 'epilepsy', 'thyroid', 'brain disease', 'nerve damage'], alignment: 0 }),
    Object.freeze({ id: 'fraud', label: 'Deliberate production', matchTerms: ['fraud', 'malingering', 'pretend', 'faking'], alignment: -2 }),
    Object.freeze({ id: 'spirit', label: 'Spirit influence', matchTerms: ['spirit', 'ghost', 'mary communicating', 'supernatural'], alignment: -1 }),
  ]),
  examinations: Object.freeze([
    Object.freeze({
      id: 'nora-exam-neurologic', label: 'Focused neurologic examination', minutes: 5,
      factIds: ['nora-observed-tremor', 'nora-sensory-pattern', 'nora-normal-neurology'],
      reply: 'The tremor diminishes during a counting task. Sensation is dull in a glove-like boundary, while strength and reflexes remain normal.',
      uncertainty: 'The combined pattern argues against a single damaged nerve but does not by itself establish a cause.',
      effects: { satisfaction: -1 }, bodyCue: 'sitting-self-soothing', gesture: 'extend-both-arms',
    }),
    Object.freeze({
      id: 'nora-exam-general', label: 'General physical examination', minutes: 5,
      factIds: ['nora-thyroid-negative'],
      reply: facts.find((fact) => fact.id === 'nora-thyroid-negative').value,
      uncertainty: 'A brief office examination cannot exclude every bodily disease.', effects: { satisfaction: 0 },
    }),
  ]),
  diagnoses: Object.freeze([
    Object.freeze({ id: 'nora-dx-automatism', label: 'Hysteria with cerebral automatism', description: 'A period formulation joining the sensory signs, amnesia, and automatic acts.', selector: { basePriority: 8, supportFactIds: ['nora-automatic-writing', 'nora-missing-time', 'nora-sensory-pattern'] }, evaluation: { quality: 10, patientAcceptance: 1 } }),
    Object.freeze({ id: 'nora-dx-double-consciousness', label: 'Spontaneous hypnotic trance', description: 'A plausible period account of the amnesic intervals, but narrower than the whole presentation.', selector: { basePriority: 5, supportFactIds: ['nora-automatic-writing', 'nora-missing-time'] }, evaluation: { quality: 8, patientAcceptance: 1 } }),
    Object.freeze({ id: 'nora-dx-neurasthenia', label: 'Neurasthenic exhaustion', description: 'Fits fatigue and sleep loss but does not explain the full pattern.', selector: { basePriority: 4, supportFactIds: ['nora-sleep', 'nora-work-risk'] }, evaluation: { quality: 5, patientAcceptance: 3 } }),
    Object.freeze({ id: 'nora-dx-epilepsy', label: 'Epileptic automatism', description: 'An important differential weakened by the history and examination.', selector: { basePriority: 3, supportFactIds: ['nora-missing-time'], contraryFactIds: ['nora-seizure-negatives'] }, evaluation: { quality: 3, patientAcceptance: -1 } }),
    Object.freeze({ id: 'nora-dx-basedow', label: 'Basedow’s disease', description: 'The tremor suggests it, but the supporting physical signs are absent.', selector: { basePriority: 1, supportFactIds: ['nora-tremor'], contraryFactIds: ['nora-thyroid-negative'] }, evaluation: { quality: 1, patientAcceptance: -1 } }),
    Object.freeze({ id: 'nora-dx-malingering', label: 'Malingering', description: 'Regard the symptoms and writing as consciously produced for attention or advantage.', selector: { basePriority: -4 }, evaluation: { quality: 0, patientAcceptance: -20 } }),
    Object.freeze({ id: 'nora-dx-spirit', label: 'Spirit control', description: 'Regard the writing as communication from Mary through an external agency.', selector: { basePriority: -3, supportFactIds: ['nora-seance'] }, evaluation: { quality: 0, patientAcceptance: 9 } }),
  ]),
  // Only the treatments that matter in this case. Everything else in the
  // library resolves to its default, which for Nora is a null result.
  treatmentOverrides: Object.freeze({
    'mind-remove-influence': Object.freeze({
      label: 'Support, sleep, continued work, and observation',
      detail: 'Reduce séance exposure, protect ordinary occupation, improve food and sleep, and arrange return visits.',
      evaluation: Object.freeze({
        quality: 10, patientAcceptance: 6, recovery: 9, cost: 1,
        immediateText: 'The practical attention to her work and lodging makes the advice feel possible to follow.',
        monthText: 'A month later, Miss Byrne has remained at work, sleeps more regularly, and has stopped attending the circle. The gaps have not recurred and the tremor is less frequent.',
        modernText: 'The supportive plan reduces suggestion and stress without removing ordinary function.',
      }),
    }),
    'rest-cure-home': Object.freeze({
      label: 'Complete rest and seclusion',
      detail: 'Bed rest, isolation, abundant feeding, and withdrawal from work.',
      evaluation: Object.freeze({
        quality: 4, patientAcceptance: 1, recovery: 2, cost: -12,
        immediateText: 'She is relieved to hear that the condition has a recognized regimen, but plainly fears losing her position.',
        monthText: 'A month later, the visible tremor is quieter in seclusion, but Miss Byrne has lost her copyist’s place and can no longer afford her former room. Her dependence and isolation have increased.',
        modernText: 'Seclusion suppresses some visible stress while imposing serious social and functional harm.',
      }),
    }),
    'drug-bromide': Object.freeze({
      label: 'Bromide draught at night',
      detail: 'A sedating nightly medicine with no direct effect on the underlying process.',
      evaluation: Object.freeze({
        quality: 3, patientAcceptance: 5, recovery: -1, cost: -3,
        immediateText: 'A bottle and a clear nightly direction make the visit feel medically substantial.',
        monthText: 'A month later, the bromide sometimes helps Miss Byrne fall asleep but leaves her dull at the office. The gaps and automatic writing remain when she attends the circle.',
        modernText: 'Sedation changes sleep and alertness but does not address the dissociation or its maintaining conditions.',
      }),
    }),
    'mind-hypnotic-investigation': Object.freeze({
      label: 'Repeated hypnotic investigation',
      detail: 'Use suggestion to reproduce the state and question the alternate stream of awareness.',
      evaluation: Object.freeze({
        quality: 5, patientAcceptance: 3, recovery: -2, cost: -2,
        immediateText: 'She is hopeful that the strange state might finally be made intelligible.',
        monthText: 'A month later, the sessions have produced elaborate new accounts, but the details vary with the questions put to her. The episodes are more prominent in her thoughts and no more settled.',
        modernText: 'Repeated suggestive questioning risks contaminating the account and reinforcing the symptom.',
      }),
    }),
    'mind-endorse': Object.freeze({
      label: 'Encourage the communications',
      detail: 'Accept Mary’s agency and direct continued sittings to develop the writing.',
      evaluation: Object.freeze({
        quality: 0, patientAcceptance: 13, recovery: -9, cost: -7,
        immediateText: 'She leaves feeling believed and tells Mrs. Bell that you understood what other doctors would have mocked.',
        monthText: 'A month later, Miss Byrne is a valued subject at the circle and speaks warmly of your insight. Her missing intervals are longer, her office attendance has suffered, and the writings still contain no knowledge unavailable to her.',
        modernText: 'Endorsement increases satisfaction while reinforcing the social setting and attention that maintain the episodes.',
      }),
    }),
    'mind-dismiss': Object.freeze({
      label: 'Dismiss the complaint as deception',
      detail: 'Offer no treatment and warn her to stop performing the symptoms.',
      evaluation: Object.freeze({
        quality: 0, patientAcceptance: -22, recovery: -7, cost: -5,
        immediateText: 'She leaves the fee on the desk only after being reminded and will not meet your eye.',
        monthText: 'A month later, Miss Byrne has not returned. Fear and poor sleep have worsened, and she relies more heavily on the circle that does not accuse her of deceit.',
        modernText: 'Accusation removes clinical support and drives her toward the group that confirms the symptom’s supernatural meaning.',
      }),
    }),
  }),
  caseNote: Object.freeze({
    minimumWords: 0,
    minimumEvidenceSelections: 2,
    maximumEvidenceSelections: 3,
    requiredFactIds: ['nora-bereavement', 'nora-automatic-writing', 'nora-missing-time', 'nora-sensory-pattern', 'nora-work-risk'],
  }),
  outcomeModel: Object.freeze({
    evidenceFactIds: ['nora-bereavement', 'nora-automatic-writing', 'nora-missing-time', 'nora-message-limits', 'nora-seizure-negatives', 'nora-sensory-pattern', 'nora-normal-neurology', 'nora-work-risk'],
    criticalFactIds: ['nora-automatic-writing', 'nora-missing-time', 'nora-sensory-pattern', 'nora-normal-neurology'],
    fee: Object.freeze({ full: 300, reduced: 150 }),
    departureLines: Object.freeze({
      high: '“Thank you, Doctor. I feel that you heard me without making a spectacle of it.”',
      middle: '“Thank you, Doctor. I shall try what you advise and see what follows.”',
      low: '“Good day, Doctor. I do not think there is more to be said.”',
    }),
    followUpDepartureLine: '“Very well, Doctor. I would rather return than have the matter named too quickly.”',
    followUpMonthText: 'Miss Byrne is still awaiting a settled plan. She has continued working, but the poor sleep and fear of another gap remain.',
    immediateNarratives: Object.freeze({
      high: 'Miss Byrne rises with visible relief and thanks you warmly. She believes the consultation was worth its cost.',
      middle: 'Miss Byrne thanks you with reserve. She appears uncertain, but does not feel that the visit was wasted.',
      low: 'Miss Byrne rises stiffly. Her brief thanks cannot conceal disappointment and hurt.',
    }),
    monthNarratives: Object.freeze({
      improved: 'Her health and ordinary function have improved.',
      'little-change': 'There has been little material change.',
      worse: 'Her symptoms and ordinary function have worsened.',
      harmed: 'The chosen course has produced substantial harm.',
    }),
    james: Object.freeze({ address: 'My dear Doctor', close: 'Yours faithfully, William James' }),
    modernDebrief: 'From a modern clinical perspective, Nora’s presentation is most consistent with dissociative amnesia and functional neurological symptoms after bereavement, overwork, and disrupted sleep. The automatic writing contains no information Nora did not already possess and provides no evidence of a supernatural source.',
  }),
});

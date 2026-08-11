import { createActorInstance } from '../world/characters/actors.js';
import { generatePatient, patientToRendererCRecipe } from '../../../shared/patients/index.js';

export const DEFAULT_TECHNICAL_PATIENT_SEEDS = Object.freeze([2273, 4819, 4816]);

function generatedActor(seed, id, sex, expression = 'neutral') {
  const profile = generatePatient({ seed, sex });
  const female = sex === 'female';
  const recipe = patientToRendererCRecipe(profile, {
    id,
    animation: { body: 'clinic-idle', expression, gaze: 'doctor', speaking: false },
    // The two cohort masters currently use opposite forward axes. Keep that
    // asset correction at this adapter boundary; both use the east chair.
    // Lifted to the chair's seat height; at y 0 the sitting pose sinks in.
    placement: female
      ? { position: [0.45, 0.22, -1.7], rotation: [0, Math.PI, 0], scale: 1 }
      : { position: [0.45, 0.22, -1.7], rotation: [0, 0, 0], scale: 1 },
  });
  return { profile, actor: createActorInstance({ id, recipe }) };
}

const commonInterpretations = Object.freeze([
  Object.freeze({ id: 'read-distress', text: 'The patient appears genuinely distressed.' }),
  Object.freeze({ id: 'read-reserve', text: 'The patient is withholding part of the account.' }),
  Object.freeze({ id: 'read-physical', text: 'A physical sign deserves more weight than the manner of speaking.' }),
]);

function technicalPatient(input) {
  return Object.freeze({
    contentStatus: 'technical-fixture',
    profileStatus: 'draft-procedural',
    initialTrust: 50,
    interpretations: commonInterpretations,
    caseNote: { minimumWords: 12, requiredFactIds: input.requiredFactIds },
    ...input,
    label: input.profile.identity.fullName,
  });
}

export function createTechnicalPatients(seeds = DEFAULT_TECHNICAL_PATIENT_SEEDS) {
  const normalizedSeeds = DEFAULT_TECHNICAL_PATIENT_SEEDS.map((fallback, index) => Number(seeds[index]) || fallback);
  const cast = [
    generatedActor(normalizedSeeds[0], 'technical-a', 'female', 'guarded'),
    generatedActor(normalizedSeeds[1], 'technical-b', 'male', 'guarded'),
    generatedActor(normalizedSeeds[2], 'technical-c', 'female', 'fatigued'),
  ];
  return Object.freeze([
  technicalPatient({
    id: 'technical-a',
    profile: cast[0].profile,
    actor: cast[0].actor,
    opening: {
      dialogue: '“I have slept badly for several nights, and my hands will not remain still.”',
      behavior: 'She holds both hands together in her lap.',
    },
    facts: [
      { id: 'a-complaint', label: 'Complaint', value: 'Poor sleep and shaking hands', confidence: 'high', measurement: false, disclosure: 'open', noteTerms: ['sleep', 'shaking', 'tremor'] },
      { id: 'a-sleep', label: 'Sleep', value: 'Wakes repeatedly', confidence: 'high', measurement: false, disclosure: 'withheld', releaseOn: ['sleep', 'night', 'wake'], patientWording: 'I wake again and again before morning.', noteTerms: ['wake', 'sleep'] },
      { id: 'a-pulse', label: 'Pulse', value: 'Quick and regular', confidence: 'high', measurement: true, disclosure: 'withheld', releaseOn: ['pulse', 'heart'], patientWording: 'I often feel my heart beating quickly.', noteTerms: ['pulse', 'regular'] },
      { id: 'a-tremor', label: 'Tremor', value: 'Fine tremor at rest', confidence: 'high', measurement: false, disclosure: 'withheld', releaseOn: ['hand', 'shake', 'tremor'], patientWording: 'It continues even when I try to rest my hands.', noteTerms: ['tremor', 'hand'] },
    ],
    examinations: [
      { id: 'a-check-pulse', label: 'Take pulse', factId: 'a-pulse', reply: 'The pulse is quick but regular.', uncertainty: 'A single reading cannot establish its usual rate.' },
      { id: 'a-check-hands', label: 'Observe hands', factId: 'a-tremor', reply: 'A fine tremor continues while the hands are supported.', behavior: 'She watches your hands closely.' },
    ],
    // Question texts carry the release tokens of the facts they pursue.
    prompts: [
      { id: 'a-ask-night', text: 'Tell me how you pass the night — do you wake?', stance: 'question' },
      { id: 'a-ask-hands', text: 'When did the trembling of your hands begin?', stance: 'question' },
      { id: 'a-ask-heart', text: 'Does your heart ever race or flutter?', stance: 'question' },
      { id: 'a-reassure', text: 'You are safe to speak plainly; nothing leaves this room.', stance: 'reassure' },
    ],
    diagnoses: [
      { id: 'a-diagnosis-1', label: 'Working diagnosis A1', reputation: 4, record: 1 },
      { id: 'a-diagnosis-2', label: 'Working diagnosis A2', reputation: 1, record: 4 },
    ],
    treatments: [
      { id: 'a-treatment-1', label: 'Treatment plan A1', reputation: 4, record: -1 },
      { id: 'a-treatment-2', label: 'Treatment plan A2', reputation: 1, record: 4 },
    ],
    requiredFactIds: ['a-sleep', 'a-tremor'],
  }),
  technicalPatient({
    id: 'technical-b',
    profile: cast[1].profile,
    actor: cast[1].actor,
    opening: {
      dialogue: '“The pain returns behind my eyes, especially when the room is bright.”',
      behavior: 'He turns slightly away from the lamp.',
    },
    facts: [
      { id: 'b-complaint', label: 'Complaint', value: 'Recurring head pain', confidence: 'high', measurement: false, disclosure: 'open', noteTerms: ['pain', 'head'] },
      { id: 'b-light', label: 'Light', value: 'Bright light worsens pain', confidence: 'high', measurement: false, disclosure: 'withheld', releaseOn: ['light', 'lamp', 'bright'], patientWording: 'Bright light makes the pain markedly worse.', noteTerms: ['light', 'bright'] },
      { id: 'b-pupils', label: 'Pupils', value: 'Equal response to light', confidence: 'high', measurement: false, disclosure: 'withheld', releaseOn: ['eye', 'pupil', 'vision'], patientWording: 'My sight itself does not seem changed.', noteTerms: ['pupil', 'equal'] },
      { id: 'b-nausea', label: 'Nausea', value: 'Occasional nausea', confidence: 'moderate', measurement: false, disclosure: 'withheld', releaseOn: ['stomach', 'sick', 'nausea'], patientWording: 'At its worst, the pain turns my stomach.', noteTerms: ['nausea', 'stomach'] },
    ],
    examinations: [
      { id: 'b-check-pupils', label: 'Inspect pupils', factId: 'b-pupils', reply: 'Both pupils respond equally to the shaded lamp.' },
      { id: 'b-test-light', label: 'Vary the light', factId: 'b-light', reply: 'The brighter light promptly increases his discomfort.', behavior: 'He raises a hand to shade his eyes.' },
    ],
    prompts: [
      { id: 'b-ask-light', text: 'Does the lamplight trouble you just now?', stance: 'question' },
      { id: 'b-ask-vision', text: 'Has your vision itself changed at all?', stance: 'question' },
      { id: 'b-ask-stomach', text: 'Does the pain ever turn your stomach?', stance: 'question' },
      { id: 'b-reassure', text: 'Take your time; we will go slowly and carefully.', stance: 'reassure' },
    ],
    diagnoses: [
      { id: 'b-diagnosis-1', label: 'Working diagnosis B1', reputation: 4, record: 2 },
      { id: 'b-diagnosis-2', label: 'Working diagnosis B2', reputation: 1, record: 4 },
    ],
    treatments: [
      { id: 'b-treatment-1', label: 'Treatment plan B1', reputation: 3, record: 0 },
      { id: 'b-treatment-2', label: 'Treatment plan B2', reputation: 1, record: 4 },
    ],
    requiredFactIds: ['b-light', 'b-pupils'],
  }),
  technicalPatient({
    id: 'technical-c',
    profile: cast[2].profile,
    actor: cast[2].actor,
    opening: {
      dialogue: '“I become faint when I stand, and the weakness has been worse this week.”',
      behavior: 'She remains seated and keeps one hand on the chair.',
    },
    facts: [
      { id: 'c-complaint', label: 'Complaint', value: 'Weakness and faintness', confidence: 'high', measurement: false, disclosure: 'open', noteTerms: ['weak', 'faint'] },
      { id: 'c-standing', label: 'Standing', value: 'Symptoms worsen on standing', confidence: 'high', measurement: false, disclosure: 'withheld', releaseOn: ['stand', 'rise', 'upright'], patientWording: 'It comes over me when I rise from a chair.', noteTerms: ['stand', 'rise'] },
      { id: 'c-pulse', label: 'Pulse', value: 'Pulse rises after standing', confidence: 'high', measurement: true, disclosure: 'withheld', releaseOn: ['pulse', 'heart'], patientWording: 'My heart races when the faintness begins.', noteTerms: ['pulse', 'rises'] },
      { id: 'c-tongue', label: 'Tongue', value: 'Pale appearance', confidence: 'moderate', measurement: false, disclosure: 'withheld', releaseOn: ['mouth', 'tongue'], patientWording: 'My mouth has felt unusually dry.', noteTerms: ['tongue', 'pale'] },
    ],
    examinations: [
      { id: 'c-check-pulse', label: 'Compare pulse', factId: 'c-pulse', reply: 'The pulse rises after she carefully stands.', behavior: 'She grips the chair until the faintness passes.' },
      { id: 'c-check-tongue', label: 'Inspect tongue', factId: 'c-tongue', reply: 'The tongue and inner mouth appear pale.' },
    ],
    prompts: [
      { id: 'c-ask-standing', text: 'What happens when you rise from a chair?', stance: 'question' },
      { id: 'c-ask-heart', text: 'Does your heart race when the faintness comes?', stance: 'question' },
      { id: 'c-ask-mouth', text: 'Has your mouth been dry, or your appetite poor?', stance: 'question' },
      { id: 'c-reassure', text: 'We shall take this gently; you are in careful hands.', stance: 'reassure' },
    ],
    diagnoses: [
      { id: 'c-diagnosis-1', label: 'Working diagnosis C1', reputation: 4, record: 0 },
      { id: 'c-diagnosis-2', label: 'Working diagnosis C2', reputation: 1, record: 4 },
    ],
    treatments: [
      { id: 'c-treatment-1', label: 'Treatment plan C1', reputation: 4, record: -2 },
      { id: 'c-treatment-2', label: 'Treatment plan C2', reputation: 1, record: 4 },
    ],
    requiredFactIds: ['c-standing', 'c-pulse'],
  }),
  ]);
}

export const TECHNICAL_PATIENTS = createTechnicalPatients();

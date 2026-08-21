import { generatePatient, patientToRendererCRecipe } from '../../../../shared/patients/index.js';
import { createActorInstance } from '../../world/characters/actors.js';

const id = 'samuel-taylor-1896';
const base = generatePatient({ seed: 4819, sex: 'male' });

const profile = Object.freeze({
  ...base,
  social: Object.freeze({
    ...base.social,
    classId: 'working',
    classLabel: 'skilled working household',
    occupationId: 'printer',
    occupation: 'compositor temporarily assigned to stereotype work',
    householdPosition: 'widowed father and principal wage earner',
    residence: 'Yorkville',
    payer: 'employer assistance',
    referralSource: 'his printing-shop foreman',
  }),
  clinical: Object.freeze({
    ...base.clinical,
    id: 'samuel-chronic-lead-poisoning',
    periodCategory: 'suspected chronic plumbism with melancholic symptoms',
    theme: 'occupational lead exposure mistaken for primary melancholia',
    presentingComplaint: 'errors at the case, withdrawal, poor appetite, and gripping abdominal pain',
    symptoms: ['poor concentration', 'withdrawal', 'headache', 'poor appetite', 'constipation', 'abdominal colic'],
    duration: 'five months, progressively',
    severity: 0.64,
    affect: 'weary and apprehensive',
    flags: ['research-draft', 'authored-composite', 'passive-death-wish'],
  }),
});

const generatedRecipe = patientToRendererCRecipe(profile, {
  id,
  // Authored Mixamo-skinned typesetter model; exported upright and Y-up by
  // scripts/characters/export_samuel_taylor.py, so no axis correction here.
  asset: {
    kind: 'authored-character',
    path: '/models/characters/samuel-taylor.glb?v=1',
    applyRecipe: false,
    opaque: true,
    motionClips: [
      'ClinicIdle', 'StandingIdle', 'SittingDisbelief', 'SittingCrying', 'SittingGalvanicShock',
    ],
    clipMap: {
      'clinic-idle': 'ClinicIdle',
      'sitting-talking': 'ClinicIdle',
      'sitting-distressed': 'SittingCrying',
      'sitting-disapproval': 'SittingDisbelief',
      'sitting-disbelief': 'SittingDisbelief',
      'sitting-self-soothing': 'ClinicIdle',
      'sit-down': 'ClinicIdle',
      'stand-up': 'StandingIdle',
      'standing-idle': 'StandingIdle',
      walk: 'StandingIdle',
    },
  },
  animation: { body: 'clinic-idle', expression: 'discouraged', gaze: 'doctor', speaking: false },
  placement: { position: [0.45, 0.04, -1.57], rotation: [0, Math.PI, 0], scale: 1.78 },
});

const recipe = {
  ...generatedRecipe,
  values: { ...generatedRecipe.values, skinTone: '#afa59b' },
};

// Enter by the waiting-room door (south wall, consulting-office blueprint).
// The renderer skips the walk until this asset carries Walk and SitDown clips.
recipe.presentation.entrance = { from: [2.4, 0, 4.55] };

const actor = createActorInstance({ id, recipe });

const facts = Object.freeze([
  Object.freeze({
    id: 'samuel-work-errors', kind: 'symptom', label: 'Errors and withdrawal at work',
    value: 'A skilled compositor has begun setting wrong letters, abandoning half-set lines, and withdrawing from conversation at the shop.',
    notebookSummary: 'The patient reports new compositing errors, abandoned work, and withdrawal at the printing shop.',
    patientWording: 'I set a wrong letter and don’t catch it. Twice I’ve left a forme half done and gone and stood in the stairway instead.',
    disclosure: 'open', confidence: 'high', measurement: false,
    releaseOn: ['errors', 'printing', 'work', 'withdrawal', 'type'], noteTerms: ['errors', 'type', 'printing', 'withdrawal'],
  }),
  Object.freeze({
    id: 'samuel-course', kind: 'history', label: 'Five-month progressive course',
    value: 'The difficulty began five months ago and has progressed. It is worst after long shop days and somewhat easier on Sundays away from work.',
    notebookSummary: 'Symptoms progressed over five months, worsen after long shop days, and ease somewhat on Sundays.',
    patientWording: 'Five months, near enough. At first only after a long edition, now most evenings. Sundays I’m out of the shop and that’s the one day it lifts.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['when', 'began', 'course', 'Sunday', 'better', 'worse'], noteTerms: ['five months', 'Sunday', 'shop days', 'progressive'],
  }),
  Object.freeze({
    id: 'samuel-headache', kind: 'symptom', label: 'Headache and mental slowing',
    value: 'He has a dull frontal headache, irritability, and difficulty holding a line of copy in mind; there has been no seizure, delirium, or fainting.',
    notebookSummary: 'Dull headache and poor concentration without seizure, delirium, or syncope.',
    patientWording: 'There’s an ache over my eyes. I read the same line three times and it won’t stay with me. I’ve had no fits and I don’t lose my senses.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['headache', 'head', 'memory', 'concentration', 'fit', 'faint'], noteTerms: ['headache', 'concentration', 'no seizure', 'no fainting'],
  }),
  Object.freeze({
    id: 'samuel-digestion', kind: 'symptom', label: 'Constipation and abdominal colic',
    value: 'His appetite is poor, his bowels may not move for four days, and he has gripping pain below the navel that is eased by firm pressure.',
    notebookSummary: 'Poor appetite, obstinate constipation, and gripping abdominal pain relieved by pressure.',
    patientWording: 'I’ve been badly constipated, four days at a stretch sometimes, and then a pain comes low down. Pressing hard on it helps.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['bowels', 'constipation', 'appetite', 'stomach', 'abdomen', 'pain', 'colic'], noteTerms: ['constipation', 'poor appetite', 'abdominal pain', 'pressure'],
  }),
  Object.freeze({
    id: 'samuel-metal-work', kind: 'exposure', label: 'Recent work at the metal pot',
    value: 'For six months he has filled in for an ill stereotyper, breaking old plates, remelting type metal, and skimming dross in a cramped back room.',
    notebookSummary: 'For six months he has broken old plates, tended molten type metal, and skimmed dross in a cramped room.',
    patientWording: 'Mr. Lacey lost his stereotyper in the spring, so I do that work along with my own. Breaking up old plates, feeding the metal pot, skimming the dross. It’s a back room below the street with no window.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    requiresFactIds: ['samuel-course'], releaseOn: ['work', 'shop', 'metal', 'lead', 'type', 'stereotype', 'dross'], noteTerms: ['type metal', 'dross', 'old plates', 'six months'],
  }),
  Object.freeze({
    id: 'samuel-shop-hygiene', kind: 'exposure', label: 'Dust and meals at the case',
    value: 'Grey dust settles on his hands and clothes. The shop has no washbasin near the workroom, and he commonly eats bread beside the type cases.',
    notebookSummary: 'Grey shop dust coats his hands; he eats beside the type cases without a nearby washbasin.',
    patientWording: 'The dust gets into your hands and won’t wash out however you wipe them. The basin’s two floors up, so I take my bread at the cases.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    requiresFactIds: ['samuel-course'], releaseOn: ['dust', 'hands', 'wash', 'meal', 'bread', 'hygiene'], noteTerms: ['grey dust', 'hands', 'bread', 'no washbasin'],
  }),
  Object.freeze({
    id: 'samuel-bereavement', kind: 'history', label: 'Bereavement does not fit the new course',
    value: 'His wife Rebecca died three years ago. He grieved deeply but remained sociable and worked reliably until the present five-month decline.',
    notebookSummary: 'His wife died three years ago; grief was substantial, but the occupational and cognitive decline began only five months ago.',
    patientWording: 'Three years this January. I took it very hard, I won’t pretend otherwise. But I kept at my work and I kept going to church. This other business only started in the spring.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['wife', 'widow', 'grief', 'loss', 'Rebecca', 'sad'], noteTerms: ['Rebecca', 'three years', 'grief', 'five months'],
  }),
  Object.freeze({
    id: 'samuel-safety', kind: 'risk', label: 'Passive wish for death without present intent',
    value: 'On some mornings he has wished not to wake, but denies a plan, preparation, or intent to harm himself. His son and faith are strong reasons for living, and he agrees to seek help if that changes.',
    notebookSummary: 'Occasional wish not to wake; no plan, preparation, or present intent. Son and faith are protective, with agreement to seek help if risk changes.',
    patientWording: 'There have been mornings I’ve prayed not to wake up. I’ve never done anything about it and I don’t intend to. Daniel sleeps in the next room, and I’d not do that to him.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    requiresFactIds: ['samuel-bereavement'], releaseOn: ['suicide', 'harm', 'death', 'wake', 'safe', 'danger'], noteTerms: ['not wake', 'no plan', 'Daniel', 'protective'],
  }),
  Object.freeze({
    id: 'samuel-income', kind: 'social', label: 'A workable reassignment exists',
    value: 'Samuel supports his seventeen-year-old son. His foreman has said that a physician who identifies a bodily workplace cause can request temporary reassignment to proofreading and press records without ending his wages.',
    notebookSummary: 'He supports a seventeen-year-old son; a medical letter could secure temporary clean-work reassignment without ending wages.',
    patientWording: 'I can’t stop work, that’s the trouble of it. Daniel’s on an apprentice wage and there’s the rent. Mr. Lacey said if it’s something in the body he could put me on proofs a while at the same money.',
    disclosure: 'withheld', confidence: 'moderate', measurement: false,
    requiresFactIds: ['samuel-metal-work'], releaseOn: ['wages', 'income', 'son', 'Daniel', 'reassign', 'foreman', 'rest'], noteTerms: ['son', 'wages', 'reassignment', 'proofreading'],
  }),
  Object.freeze({
    id: 'samuel-gum-line', kind: 'sign', label: 'Blue-grey gingival line',
    value: 'A narrow blue-grey line is visible along portions of the gum margin, most clearly beside several neglected teeth.',
    disclosure: 'observed', confidence: 'moderate', measurement: false,
    noteTerms: ['blue-grey', 'gum', 'gingival line'],
  }),
  Object.freeze({
    id: 'samuel-wrist-weakness', kind: 'sign', label: 'Subtle extensor weakness',
    value: 'Grip is preserved, but extension of both wrists and middle fingers is weaker than flexion after repeated effort. There is no complete wrist-drop.',
    disclosure: 'observed', confidence: 'moderate', measurement: false,
    noteTerms: ['wrist', 'finger extension', 'weakness', 'no wrist-drop'],
  }),
  Object.freeze({
    id: 'samuel-abdominal-exam', kind: 'sign', label: 'Abdominal and pulse findings',
    value: 'The abdomen is not rigid or distended. Diffuse discomfort below the navel lessens with steady pressure; the pulse is 58 and regular.',
    disclosure: 'observed', confidence: 'moderate', measurement: true,
    noteTerms: ['abdomen', 'pressure', 'pulse', '58', 'regular'],
  }),
]);

const prompts = Object.freeze([
  Object.freeze({
    id: 'samuel-ask-course', text: 'Ask when the errors began and whether time away from work helps.', stance: 'question',
    role: 'history', priority: 38, minutes: 4, maxDisclosures: 2,
    discloseFactIds: ['samuel-course', 'samuel-headache'],
    noteSummary: 'A five-month decline worsens after shop days and eases on Sundays, with headache and impaired concentration.',
    dialogue: '“About five months ago. At first it was only after a long day. Now it happens most evenings, with an ache over my eyes. It eases on Sundays, when I am out of the shop.”',
    effects: { trust: 2, satisfaction: 2 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'course and pattern' },
    reactionExpression: 'discouraged', bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'samuel-ask-work', text: 'Ask whether his duties or working conditions changed.', stance: 'question',
    role: 'exposure', priority: 40, minutes: 4, maxDisclosures: 2,
    requiresFactIds: ['samuel-course'], discloseFactIds: ['samuel-metal-work', 'samuel-shop-hygiene'],
    opensPendingResponseId: 'samuel-foreman-question',
    noteSummary: 'Six months of metal-pot, old-plate, and dross work preceded symptoms; dusty hands and meals beside type create exposure.',
    dialogue: '“Mr. Lacey lost his stereotyper in the spring, so I took on that work too. I break plates and tend the metal pot in a room below the street. There is no window, and the basin is two floors up, so I often eat with dust still on my hands. My foreman wants to know if it is the metal or me.”',
    effects: { trust: 1, satisfaction: 1 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'occupational exposure' },
    reactionExpression: 'frowning', bodyCue: 'sitting-disapproval',
  }),
  Object.freeze({
    id: 'samuel-response-test', text: '“I need to examine you before I can say. The metal may be involved.”', stance: 'reassure',
    role: 'response', priority: 42, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'samuel-foreman-question', resolvesPendingResponseId: 'samuel-foreman-question',
    dialogue: '“That is fair. Find out what it is and tell me straight.”',
    effects: { trust: 8, satisfaction: 7 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'provisional occupational explanation' },
    reactionExpression: 'smiling', bodyCue: 'sitting-talking',
  }),
  Object.freeze({
    id: 'samuel-response-moralize', text: '“This is melancholy, not the metal.”', stance: 'challenge',
    role: 'response', priority: 38, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'samuel-foreman-question', resolvesPendingResponseId: 'samuel-foreman-question',
    dialogue: '“So you have blamed my character without examining me.”',
    effects: { trust: -13, satisfaction: -18 }, appraisal: { register: 'prying', decorumBreach: 1, intent: 'moralizing dismissal' },
    reactionExpression: 'frowning', bodyCue: 'sitting-disapproval',
  }),
  Object.freeze({
    id: 'samuel-response-certain', text: '“This is lead poisoning. You must leave the trade today.”', stance: 'suggest',
    role: 'response', priority: 34, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'samuel-foreman-question', resolvesPendingResponseId: 'samuel-foreman-question',
    dialogue: '“You have not examined me, sir. And I have rent to pay.”',
    effects: { trust: -4, satisfaction: -3 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'premature certainty' },
    reactionExpression: 'discouraged', bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'samuel-ask-bowels', text: 'Ask about his appetite, constipation, and stomach pain.', stance: 'question',
    role: 'physical', priority: 35, minutes: 3,
    discloseFactIds: ['samuel-digestion'],
    noteSummary: 'Poor appetite, four-day constipation, and gripping lower abdominal pain relieved by pressure.',
    dialogue: '“I can go four days without a movement. Then I get a gripping pain low down for an hour or two. Pressure helps. I have little appetite, but I make myself eat at noon.”',
    effects: { satisfaction: 2 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'gastrointestinal symptoms' },
    reactionExpression: 'pained', bodyCue: 'sitting-distressed',
  }),
  Object.freeze({
    id: 'samuel-ask-bereavement', text: 'Ask whether this began after his wife died.', stance: 'question',
    role: 'context', priority: 31, minutes: 4,
    discloseFactIds: ['samuel-bereavement'],
    noteSummary: 'His wife died three years ago, but the new occupational and cognitive decline began only five months ago.',
    dialogue: '“My wife died three years ago. It was hard, but I kept working and going to church. These problems began only this spring.”',
    effects: { trust: 2, satisfaction: 2 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'bereavement chronology' },
    reactionExpression: 'discouraged', bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'samuel-ask-safety', text: 'Ask whether he has thought about death or harming himself.', stance: 'question',
    role: 'safety', priority: 39, minutes: 3,
    requiresFactIds: ['samuel-bereavement'], discloseFactIds: ['samuel-safety'],
    noteSummary: 'Occasional wish not to wake, without plan or intent; his son and faith are protective.',
    dialogue: '“Some mornings I have prayed not to wake up. I have no plan to harm myself. My son is in the next room, and I would tell him if that changed.”',
    effects: { trust: 5, satisfaction: 3 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'suicide risk assessment' },
    reactionExpression: 'discouraged', bodyCue: 'sitting-distressed',
  }),
  Object.freeze({
    id: 'samuel-ask-income', text: 'Ask whether he can change duties without losing his wages.', stance: 'question',
    role: 'stakes', priority: 30, minutes: 3,
    requiresFactIds: ['samuel-metal-work'], discloseFactIds: ['samuel-income'],
    noteSummary: 'A medical letter could move him to clean proofreading and record work while preserving wages.',
    dialogue: '“I cannot stop work. My son earns an apprentice’s wage, and we have rent to pay. Mr. Lacey could move me to proofs and press records at the same pay, but he wants a doctor’s letter.”',
    effects: { trust: 3, satisfaction: 3 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'treatment feasibility' },
    reactionExpression: 'frowning', bodyCue: 'sitting-disapproval',
  }),
]);

const inquiryIntents = Object.freeze([
  Object.freeze({ id: 'samuel-intent-course', matchTerms: ['when begin', 'started', 'how long', 'Sunday', 'worse'], discloseFactIds: ['samuel-course', 'samuel-headache'], maxDisclosures: 2, dialogue: prompts.find((item) => item.id === 'samuel-ask-course').dialogue, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'course and pattern' }, reactionExpression: 'discouraged', bodyCue: 'sitting-self-soothing' }),
  Object.freeze({ id: 'samuel-intent-work', matchTerms: ['printing', 'shop', 'metal', 'lead', 'type', 'stereotype', 'dross'], requiresFactIds: ['samuel-course'], discloseFactIds: ['samuel-metal-work', 'samuel-shop-hygiene'], maxDisclosures: 2, dialogue: prompts.find((item) => item.id === 'samuel-ask-work').dialogue, effects: { trust: 1 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'occupational exposure' }, reactionExpression: 'frowning', bodyCue: 'sitting-disapproval' }),
  Object.freeze({ id: 'samuel-intent-digestion', matchTerms: ['bowels', 'constipation', 'appetite', 'stomach', 'abdomen', 'colic'], discloseFactIds: ['samuel-digestion'], dialogue: prompts.find((item) => item.id === 'samuel-ask-bowels').dialogue, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'gastrointestinal symptoms' }, reactionExpression: 'pained', bodyCue: 'sitting-distressed' }),
  Object.freeze({ id: 'samuel-intent-grief', matchTerms: ['wife', 'Rebecca', 'grief', 'bereavement', 'loss'], discloseFactIds: ['samuel-bereavement'], dialogue: prompts.find((item) => item.id === 'samuel-ask-bereavement').dialogue, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'bereavement chronology' }, reactionExpression: 'discouraged', bodyCue: 'sitting-self-soothing' }),
  Object.freeze({ id: 'samuel-intent-safety', matchTerms: ['suicide', 'harm himself', 'wish for death', 'not wake', 'safe'], requiresFactIds: ['samuel-bereavement'], discloseFactIds: ['samuel-safety'], dialogue: prompts.find((item) => item.id === 'samuel-ask-safety').dialogue, effects: { trust: 3 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'suicide risk assessment' }, reactionExpression: 'discouraged', bodyCue: 'sitting-distressed' }),
  Object.freeze({ id: 'samuel-intent-income', matchTerms: ['wages', 'income', 'son', 'Daniel', 'reassign', 'rest', 'foreman'], requiresFactIds: ['samuel-metal-work'], discloseFactIds: ['samuel-income'], dialogue: prompts.find((item) => item.id === 'samuel-ask-income').dialogue, effects: { satisfaction: 2 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'treatment feasibility' }, reactionExpression: 'frowning', bodyCue: 'sitting-disapproval' }),
]);

export const SAMUEL_TAYLOR = Object.freeze({
  id,
  label: 'Mr. Samuel Taylor',
  contentStatus: 'research-draft',
  profileStatus: 'authored-composite',
  initialTrust: 53,
  initialSatisfaction: 51,
  profile,
  actor,
  appointment: Object.freeze({ minutes: 30, overtimeExtensionMinutes: 5, maxOvertimeExtensions: 1 }),
  opening: Object.freeze({
    dialogue: '“I have been a printer for thirty years, sir. Lately I have been setting wrong letters and leaving work unfinished. My foreman calls it melancholy. I do not know what it is.”',
    behavior: 'Mr. Taylor sits with his ink-stained hands on his knees. He is plainly tired and answers carefully, as though he expects to be checked.',
  }),
  groundTruth: Object.freeze({
    etiologyId: 'chronic-occupational-lead-exposure',
    modernSummary: 'Chronic occupational lead exposure from temporary stereotype and type-metal duties, presenting with gastrointestinal, neurologic, cognitive, and depressive symptoms.',
    precipitatingFactors: ['temporary reassignment to stereotype and type-metal work'],
    shapingFactors: ['widowhood', 'fear of losing a skilled trade and wages', 'responsibility for a dependent son'],
    maintainingFactors: ['continued dross and molten-metal work', 'lead-contaminated dust', 'eating beside the type cases without nearby handwashing'],
    exclusions: ['primary melancholia as the sole cause', 'uncomplicated bereavement', 'malingering', 'acute saturnine encephalopathy', 'alcoholic dyspepsia'],
  }),
  sources: Object.freeze([
    Object.freeze({ id: 'wood-fitz-1896', citation: 'Horatio C. Wood Jr. and Reginald H. Fitz, The Practice of Medicine (1896), section on chronic lead poisoning.', supports: ['period recognition of chronic lead poisoning', 'gastrointestinal, gingival, and paralytic signs'] }),
    Object.freeze({ id: 'tuke-1892', citation: 'Daniel Hack Tuke, ed., A Dictionary of Psychological Medicine (1892).', supports: ['period mental-status history', 'asking about supposed cause and danger to self or others'] }),
    Object.freeze({ id: 'dublin-1893', citation: '“Saturnine Encephalopathy,” Dublin Journal of Medical Science 95 (1893).', supports: ['period differential between chronic plumbism and severe encephalopathy', 'colic, gum line, and wrist-drop as lead signs'] }),
    Object.freeze({ id: 'hamilton-verrill-1917', citation: 'Alice Hamilton and Charles H. Verrill, Hygiene of the Printing Trades, U.S. Bureau of Labor Statistics Bulletin 209 (1917).', supports: ['retrospective evidence for lead hazards in type founding, stereotyping, and some composing rooms', 'dust, dross, hygiene, and insidious printer presentations'] }),
  ]),
  facts,
  prompts,
  inquiryIntents,
  interpretations: Object.freeze([
    Object.freeze({ id: 'samuel-approach-exposure', label: 'Ask about his work', text: 'I should ask about recent changes at the print shop.', alignment: 3, nextMode: 'patient' }),
    Object.freeze({ id: 'samuel-approach-melancholia', label: 'Ask about his mood', text: 'I should ask about his mood and whether he might harm himself.', alignment: 2, nextMode: 'patient' }),
    Object.freeze({ id: 'samuel-approach-exam', label: 'Examine him', text: 'I should examine him for physical signs.', alignment: 2, nextMode: 'examination' }),
  ]),
  thoughtIntents: Object.freeze([
    Object.freeze({ id: 'lead', label: 'Chronic occupational lead poisoning', matchTerms: ['lead', 'plumbism', 'saturnine', 'type metal', 'occupational poison'], alignment: 3 }),
    Object.freeze({ id: 'melancholia', label: 'Melancholia requiring safety assessment', matchTerms: ['melancholia', 'depression', 'suicide', 'self-harm', 'grief'], alignment: 1 }),
    Object.freeze({ id: 'neurasthenia', label: 'Neurasthenic exhaustion', matchTerms: ['neurasthenia', 'nervous exhaustion', 'overwork'], alignment: 0 }),
    Object.freeze({ id: 'moral', label: 'Weakness of character', matchTerms: ['weak character', 'moral weakness', 'lazy', 'unfit'], alignment: -3 }),
  ]),
  dialogueStyle: 'Samuel is a fifty-four-year-old New York printer: reserved, proud of skilled work, and respectful to a physician he is paying. Write plain spoken English of the period. Ordinary words, varied sentence length, some hesitation and approximate numbers, an occasional "sir". He uses printing words only for printing things (the case, a forme, the stone, dross) and never as a comparison for anything else. No epigrams, no metaphors, and no line that would work as the end of a scene. Do not use racial eye dialect, servile phrasing, generic uplift rhetoric, or facts not authorized by the simulation. He may be guarded because the foreman’s judgment affects his wages, but direct, evidence-based questions earn direct answers.',
  examinations: Object.freeze([
    Object.freeze({
      id: 'samuel-exam-mouth-hands', label: 'Inspect gums and test grip and wrist extension', minutes: 4,
      factIds: ['samuel-gum-line', 'samuel-wrist-weakness'],
      reply: 'A narrow blue-grey line marks parts of the gum margin. Grip is preserved, but repeated wrist and middle-finger extension is subtly weak on both sides; there is no complete wrist-drop.',
      uncertainty: 'The gum line is not unique to lead, and effort may affect subtle weakness; the cluster must be weighed with exposure and symptoms.',
      effects: { trust: 2, satisfaction: 3 }, gesture: 'present-wrist',
      reactionExpression: 'guarded',
    }),
    Object.freeze({
      id: 'samuel-exam-abdomen', label: 'Examine the abdomen and count the pulse', minutes: 3,
      factIds: ['samuel-abdominal-exam'],
      reply: facts.find((fact) => fact.id === 'samuel-abdominal-exam').value,
      uncertainty: 'These findings support but do not prove lead colic, and do not exclude another abdominal disorder.',
      effects: { satisfaction: 1 }, gesture: 'present-wrist',
      reactionExpression: 'pained',
    }),
  ]),
  diagnoses: Object.freeze([
    Object.freeze({ id: 'samuel-dx-lead', label: 'Chronic lead poisoning (plumbism)', description: 'Occupational lead exposure producing colic, constipation, cognitive change, low mood, a gingival line, and early extensor weakness.', selector: { basePriority: 6, supportFactIds: ['samuel-metal-work', 'samuel-shop-hygiene', 'samuel-digestion', 'samuel-gum-line', 'samuel-wrist-weakness', 'samuel-course'] }, evaluation: { quality: 10, patientAcceptance: 5 } }),
    Object.freeze({ id: 'samuel-dx-melancholia', label: 'Melancholia', description: 'A plausible description of withdrawal and passive death wishes that does not by itself explain the occupational pattern or physical signs.', selector: { basePriority: 7, supportFactIds: ['samuel-work-errors', 'samuel-bereavement', 'samuel-safety'], contraryFactIds: ['samuel-metal-work', 'samuel-gum-line'] }, evaluation: { quality: 6, patientAcceptance: 3 } }),
    Object.freeze({ id: 'samuel-dx-neurasthenia', label: 'Neurasthenic exhaustion', description: 'Overwork can fit headache and poor concentration, but is a broad label that misses the coherent toxic syndrome.', selector: { basePriority: 3, supportFactIds: ['samuel-work-errors', 'samuel-course', 'samuel-headache'], contraryFactIds: ['samuel-gum-line', 'samuel-wrist-weakness'] }, evaluation: { quality: 4, patientAcceptance: 4 } }),
    Object.freeze({ id: 'samuel-dx-dyspepsia', label: 'Chronic dyspepsia', description: 'Constipation and abdominal pain are genuine, but this diagnosis leaves the exposure, gums, hands, and mental change unexplained.', selector: { basePriority: 1, supportFactIds: ['samuel-digestion'], contraryFactIds: ['samuel-metal-work', 'samuel-gum-line', 'samuel-wrist-weakness'] }, evaluation: { quality: 2, patientAcceptance: 1 } }),
    Object.freeze({ id: 'samuel-dx-malingering', label: 'Malingering to escape work', description: 'Treat his account as a calculated attempt to avoid the metal room.', selector: { basePriority: -4, contraryFactIds: ['samuel-course', 'samuel-digestion', 'samuel-gum-line', 'samuel-wrist-weakness'] }, evaluation: { quality: 0, patientAcceptance: -14 } }),
  ]),
  // Only the treatments that matter in this case. Everything else in the
  // library resolves to its default, which for Samuel is a null result.
  treatmentOverrides: Object.freeze({
    'move-lighter-work': Object.freeze({
      label: 'Remove the exposure while preserving his wages',
      detail: 'Write for immediate reassignment from metal, dross, and dust; require washing and meals away from type; relieve constipation, nourish, and review him within one week.',
      evaluation: Object.freeze({
        quality: 10, patientAcceptance: 9, recovery: 10, cost: 1,
        immediateText: 'The letter gives him something practical to place before his foreman without declaring him unfit for the trade.',
        monthText: 'A month later, Samuel is working on proofs and press records away from the metal room. The colic has ceased, his bowels are regular, and he has set two clean pages without an error. The gum line remains faint and the wrist weakness still warrants review.',
        modernText: 'Stopping lead exposure is the decisive intervention. Hygiene and follow-up matter; a historical purgative may relieve constipation but is not a substitute for removal and modern toxicologic care.',
      }),
    }),
    'move-leave-trade': Object.freeze({
      label: 'Order him to abandon printing entirely',
      detail: 'Remove him from all printing work at once, without arranging replacement wages or a narrower clean-work restriction.',
      evaluation: Object.freeze({
        quality: 7, patientAcceptance: -7, recovery: 10, cost: -11,
        immediateText: 'He accepts the danger but hears the order as the destruction of a thirty-year skilled livelihood.',
        monthText: 'A month later, the colic and headache are improving away from the shop, but Samuel and Daniel are behind on rent. His health is better; his ordinary function and independence are not.',
        modernText: 'Complete exposure removal protects health, but an unnecessarily broad work ban creates avoidable financial harm when clean reassignment is available.',
      }),
    }),
    'drug-iodide': Object.freeze({
      label: 'Give iodide and a purgative; leave work unchanged',
      detail: 'Treat constipation and presumed lead retention while he continues at the metal pot.',
      evaluation: Object.freeze({
        quality: 5, patientAcceptance: 7, recovery: 1, cost: -3,
        immediateText: 'A bottle and prescription feel concrete, and he is relieved not to lose wages, but the cause remains at his hands each day.',
        monthText: 'A month later, the purgative has sometimes relieved the constipation, but the headache, colic, and setting errors return after each long spell at the metal pot.',
        modernText: 'Period medicines cannot compensate for continuing lead exposure. Symptom relief without source control allows toxicity to continue.',
      }),
    }),
    'mind-companionship': Object.freeze({
      label: 'Treat melancholia with companionship and regular occupation',
      detail: 'Ask church friends and his son to keep him company while he remains in the same shop duties.',
      evaluation: Object.freeze({
        quality: 4, patientAcceptance: 10, recovery: -5, cost: -4,
        immediateText: 'He appreciates that you have taken his isolation seriously and leaves believing the plan humane.',
        monthText: 'A month later, Samuel has attended two church suppers and felt less alone, but the abdominal attacks and errors have worsened. He has now dropped a composing stick because his wrists gave way.',
        modernText: 'Social support may help distress, but treating mood alone misses ongoing occupational neurotoxicity and delays source control.',
      }),
    }),
    'rest-cure-home': Object.freeze({
      label: 'Prescribe a private rest cure and seclusion',
      detail: 'Remove him from work, church, son, and ordinary decisions under a diagnosis of melancholia.',
      evaluation: Object.freeze({
        quality: 1, patientAcceptance: -11, recovery: -3, cost: -14,
        immediateText: 'He regards confinement and separation from Daniel as punishment for having answered honestly.',
        monthText: 'A month later, isolation has deepened Samuel’s hopelessness and ended his wages. Lead exposure has stopped incidentally, but the plan has obscured the cause and damaged the ties that protected him.',
        modernText: 'Seclusion is not justified by a passive death wish without present intent, and it creates psychiatric, social, and financial harm even though it incidentally ends workplace exposure.',
      }),
    }),
    'elec-galvanization': Object.freeze({
      label: 'Prescribe galvanism for nervous exhaustion',
      detail: 'Offer repeated electrical treatments while leaving work, dust, and meals unchanged.',
      evaluation: Object.freeze({
        quality: 2, patientAcceptance: 3, recovery: -7, cost: -7,
        immediateText: 'Samuel asks quietly how electricity is expected to remove metal from a man’s workroom.',
        monthText: 'A month later, the office treatments have cost six afternoons and the metal-room exposure continues. The pain, constipation, weakness, and errors are all more frequent.',
        modernText: 'Galvanism does not remove lead or prevent further absorption; it adds cost and delay.',
      }),
    }),
  }),
  caseNote: Object.freeze({
    minimumWords: 0, minimumEvidenceSelections: 1, maximumEvidenceSelections: 3,
    requiredFactIds: ['samuel-course', 'samuel-digestion', 'samuel-metal-work', 'samuel-shop-hygiene', 'samuel-income', 'samuel-gum-line', 'samuel-wrist-weakness', 'samuel-safety'],
  }),
  outcomeModel: Object.freeze({
    evidenceFactIds: ['samuel-work-errors', 'samuel-course', 'samuel-headache', 'samuel-digestion', 'samuel-metal-work', 'samuel-shop-hygiene', 'samuel-bereavement', 'samuel-safety', 'samuel-income', 'samuel-gum-line', 'samuel-wrist-weakness', 'samuel-abdominal-exam'],
    criticalFactIds: ['samuel-digestion', 'samuel-metal-work', 'samuel-shop-hygiene', 'samuel-gum-line', 'samuel-wrist-weakness'],
    fee: Object.freeze({ full: 300, reduced: 150 }),
    immediateNarratives: Object.freeze({
      high: 'Mr. Taylor rereads your instructions as carefully as a proof and folds them into his breast pocket. He believes the visit has treated him as a craftsman with a solvable problem.',
      middle: 'Mr. Taylor leaves with a reserved nod. He is not yet sure he believes your explanation.',
      low: 'Mr. Taylor rises stiffly and returns the paper to your desk. He believes you judged his character before you examined his work or body.',
    }),
    departureLines: Object.freeze({
      high: '“Thank you, sir. That’s something I can take back to Mr. Lacey.”',
      middle: '“I’ll try it, Doctor. We’ll see how the week goes.”',
      low: '“You’ve made your mind up quick enough, sir.”',
    }),
    followUpDepartureLine: '“I’ll come again, if you’ll write to my foreman that it isn’t settled yet.”',
    followUpMonthText: 'Samuel has remained at the metal pot while awaiting a settled assessment. The constipation, headaches, and errors continue, though he has asked Daniel to watch for any change in his safety.',
    monthNarratives: Object.freeze({ improved: 'His health and ability to work have improved.', 'little-change': 'There has been little material change.', worse: 'The toxic and functional symptoms have progressed.', harmed: 'The chosen course has produced substantial medical, social, and financial harm.' }),
    james: Object.freeze({ address: 'My dear Doctor', close: 'Yours faithfully, William James' }),
    modernDebrief: 'Samuel’s fixed ground truth is chronic occupational lead exposure with gastrointestinal, peripheral-motor, cognitive, and depressive manifestations. Bereavement and financial fear shape his distress but do not explain the five-month workplace-linked syndrome. The blue gum line and subtle weakness support rather than prove the diagnosis; the passive wish for death still requires direct safety assessment regardless of etiology.',
  }),
});

import { generatePatient, patientToRendererCRecipe } from '../../../../shared/patients/index.js';
import { createActorInstance } from '../../world/characters/actors.js';

// Fourth authored patient, and the test bed for the later-life appearance,
// the widow-cap hat, and the clothing wrinkle layer. Clinical content is a
// research draft like the others: nothing here is settled history until Ben
// verifies it.

const id = 'wilhelmina-otten-1896';
const base = generatePatient({ seed: 9147, sex: 'female' });

const profile = Object.freeze({
  ...base,
  identity: Object.freeze({
    ...base.identity,
    age: 67,
    birthYear: 1829,
    language: 'English',
    homeLanguage: 'German',
  }),
  social: Object.freeze({
    ...base.social,
    occupationId: 'boarding-house-keeper',
    occupation: 'keeper of a lodging house',
    householdPosition: 'widowed householder',
    residence: 'a lodging house she keeps on East 7th Street',
  }),
  clinical: Object.freeze({
    ...base.clinical,
    id: 'wilhelmina-rheumatism-palsy-fear',
    periodCategory: 'chronic rheumatism of the joints with nervous depression',
    theme: 'aching, knotted hands read by the patient as the start of her sister’s fatal shaking palsy',
    presentingComplaint: 'aching, stiff hands worst on washing mornings, broken sleep, and a fear she keeps to herself',
    symptoms: ['aching finger joints', 'morning stiffness', 'broken sleep', 'low spirits', 'fear of creeping palsy'],
    duration: 'two years, worse these four months',
    severity: 0.44,
    affect: 'composed, dry, economical with complaints',
    flags: ['research-draft', 'authored-composite'],
  }),
});

const recipe = patientToRendererCRecipe(profile, {
  id,
  animation: { body: 'clinic-idle', expression: 'guarded', gaze: 'doctor', speaking: false },
  placement: { position: [0.45, 0.22, -1.7], rotation: [0, Math.PI, 0], scale: 1 },
});

// Enter by the waiting-room door (south wall, consulting-office blueprint).
recipe.presentation.entrance = { from: [2.4, 0, 4.55] };
// A widow of her generation calls in a close dark capote and keeps it on.
recipe.presentation.hat = { style: 'widow-cap', color: '#221d1a', band: '#37322d' };
// The wrinkle-layer test: worn wool, sombre widow's palette.
recipe.presentation.clothingWrinkles = 1;
recipe.presentation.dressColor = '#2c3038';
recipe.presentation.secondaryColor = '#212530';
recipe.presentation.trimColor = '#5c5347';
recipe.presentation.fabricType = 'wool';

const actor = createActorInstance({ id, recipe });

const facts = Object.freeze([
  Object.freeze({
    id: 'otten-hand-pain', kind: 'symptom', label: 'Aching hands',
    value: 'Both hands ache at the finger joints and the base of the thumbs, worst on washing mornings and in damp weather.',
    notebookSummary: 'Aching of the finger joints, both hands, worse with laundry work and damp.',
    patientWording: 'They ache most when I do the washing, especially in damp weather.',
    disclosure: 'open', confidence: 'high', measurement: false,
    releaseOn: ['hands', 'ache', 'pain', 'fingers', 'joints'], noteTerms: ['hands', 'joints', 'aching', 'damp'],
  }),
  Object.freeze({
    id: 'otten-morning-stiffness', kind: 'symptom', label: 'Morning stiffness',
    value: 'The fingers are stiff for a quarter hour on waking and loosen with use; they do not lock or swell hot.',
    notebookSummary: 'Brief morning stiffness that eases with use; no hot swelling.',
    patientWording: 'They are stiff for about fifteen minutes after I wake. Using them helps.',
    disclosure: 'open', confidence: 'high', measurement: false,
    releaseOn: ['morning', 'stiff', 'waking', 'loosen'], noteTerms: ['stiffness', 'morning', 'quarter hour'],
  }),
  Object.freeze({
    id: 'otten-work-history', kind: 'social', label: 'A lifetime of laundry',
    value: 'She took in washing for thirty years before keeping lodgers, and still does the house linens herself each Monday.',
    notebookSummary: 'Thirty years of laundry work; still washes the house linens weekly.',
    patientWording: 'I took in washing for thirty years. I still do the house linens every Monday.',
    disclosure: 'open', confidence: 'high', measurement: false,
    releaseOn: ['work', 'washing', 'laundry', 'lodgers', 'linens'], noteTerms: ['laundry', 'lodging house', 'Mondays'],
  }),
  Object.freeze({
    id: 'otten-sister-fear', kind: 'history', label: 'Her sister’s shaking illness',
    value: 'Her elder sister in Bremen died after years of a shaking palsy that began, she believes, in the hands. She has told no one she fears the same beginning.',
    notebookSummary: 'Family history of a fatal shaking palsy; private fear that her hand trouble is its start.',
    patientWording: 'My sister’s hands shook before she died. I have feared the same thing for two years.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    requiresFactIds: ['otten-hand-pain'],
    releaseOn: ['sister', 'family', 'fear', 'shaking', 'palsy', 'tremble', 'afraid'],
    noteTerms: ['sister', 'shaking palsy', 'fear', 'Bremen'],
  }),
  Object.freeze({
    id: 'otten-sleep-spirits', kind: 'symptom', label: 'Broken sleep and low spirits',
    value: 'She wakes near three and lies calculating: the pain, the lodgers’ rent, and what became of her sister. Her spirits are lower than she will admit.',
    notebookSummary: 'Early waking with rumination; low spirits, understated.',
    patientWording: 'I often wake at three and worry about my hands, the rent, and my sister.',
    disclosure: 'guarded', confidence: 'medium', measurement: false,
    releaseOn: ['sleep', 'night', 'waking', 'spirits', 'sad', 'worry'],
    noteTerms: ['sleep', 'three o’clock', 'spirits'],
  }),
  Object.freeze({
    id: 'otten-joint-exam', kind: 'sign', label: 'The joints themselves',
    value: 'The end joints of several fingers carry firm bony knots; the knuckles are not hot or reddened, and the wrists move freely with mild grating.',
    notebookSummary: 'Bony enlargement at the finger end-joints, no heat or redness; mild crepitus at the wrists.',
    disclosure: 'exam', confidence: 'high', measurement: true,
    releaseOn: [], noteTerms: ['bony knots', 'end joints', 'no heat', 'crepitus'],
  }),
  Object.freeze({
    id: 'otten-no-palsy-signs', kind: 'sign', label: 'No sign of palsy',
    value: 'There is no tremor at rest or on movement, no dragging of a foot, no change in the face or speech, and her writing is steady.',
    notebookSummary: 'No tremor, gait change, facial change, or writing change: nothing of paralysis agitans.',
    disclosure: 'exam', confidence: 'high', measurement: true,
    releaseOn: [], noteTerms: ['no tremor', 'steady writing', 'gait'],
  }),
  Object.freeze({
    id: 'otten-general-soundness', kind: 'sign', label: 'General condition',
    value: 'Heart and lungs are sound for her age; colour is good; weight is steady. She is a strong woman with worn hands.',
    notebookSummary: 'Heart, lungs, colour, and weight all satisfactory for sixty-seven.',
    disclosure: 'exam', confidence: 'high', measurement: true,
    releaseOn: [], noteTerms: ['sound', 'weight steady', 'colour good'],
  }),
]);

const prompts = Object.freeze([
  Object.freeze({
    id: 'otten-ask-pattern', stance: 'question', text: 'Ask when her hands hurt most and what helps.',
    discloseFactIds: ['otten-hand-pain', 'otten-morning-stiffness'],
    effects: { trust: 2 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'clinical pattern' },
    bodyCue: 'sitting-talking', reactionExpression: 'guarded',
  }),
  Object.freeze({
    id: 'otten-ask-work', stance: 'question', text: 'Ask about her work and how she uses her hands.',
    discloseFactIds: ['otten-work-history'],
    effects: { trust: 2, satisfaction: 1 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'occupation' },
    bodyCue: 'sitting-talking', reactionExpression: 'neutral',
  }),
  Object.freeze({
    id: 'otten-ask-family', stance: 'question', text: 'Ask about any family history of hand or nerve problems.',
    requiresFactIds: ['otten-hand-pain'], discloseFactIds: ['otten-sister-fear'],
    effects: { trust: 3 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'family history' },
    bodyCue: 'sitting-self-soothing', reactionExpression: 'anxious',
  }),
  Object.freeze({
    id: 'otten-ask-sleep', stance: 'question', text: 'Ask about her sleep and mood.',
    discloseFactIds: ['otten-sleep-spirits'],
    effects: { trust: 1 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'sleep and mood' },
    bodyCue: 'sitting-talking', reactionExpression: 'fatigued',
  }),
]);

const inquiryIntents = Object.freeze([
  Object.freeze({
    id: 'otten-intent-pattern', label: 'Pain pattern and use',
    matchTerms: ['pain', 'ache', 'hands', 'stiff', 'morning', 'weather', 'work', 'washing'],
    discloseFactIds: ['otten-hand-pain', 'otten-morning-stiffness', 'otten-work-history'], maxDisclosures: 2,
    bodyCue: 'sitting-talking', reactionExpression: 'guarded',
  }),
  Object.freeze({
    id: 'otten-intent-family', label: 'Family history and fear',
    matchTerms: ['family', 'sister', 'mother', 'shaking', 'palsy', 'tremor', 'afraid', 'fear'],
    requiresFactIds: ['otten-hand-pain'], discloseFactIds: ['otten-sister-fear'],
    bodyCue: 'sitting-self-soothing', reactionExpression: 'anxious',
  }),
  Object.freeze({
    id: 'otten-intent-sleep', label: 'Sleep and spirits',
    matchTerms: ['sleep', 'night', 'waking', 'spirits', 'mood', 'melancholy', 'worry'],
    discloseFactIds: ['otten-sleep-spirits'],
    bodyCue: 'sitting-talking', reactionExpression: 'fatigued',
  }),
]);

export const WILHELMINA_OTTEN = Object.freeze({
  id,
  label: 'Mrs. Wilhelmina Otten',
  contentStatus: 'research-draft',
  profileStatus: 'authored-composite',
  initialTrust: 60,
  initialSatisfaction: 50,
  profile,
  actor,
  appointment: Object.freeze({ minutes: 30, overtimeExtensionMinutes: 5, maxOvertimeExtensions: 1 }),
  opening: Object.freeze({
    dialogue: '“My hands ache, Doctor, and the joints are changing shape. I have had aches before, but not like this. Can you tell me what is happening?”',
    behavior: 'Mrs. Otten sits straight-backed with her gloves already off, her hands laid on her knee like items presented for inspection. She watches your face rather than her fingers.',
  }),
  groundTruth: Object.freeze({
    etiologyId: 'arthritis-deformans-with-palsy-fear',
    modernSummary: 'Osteoarthritis of the hands after decades of laundry work, with health anxiety centred on a family memory of a fatal tremor illness, plus early-waking low mood.',
    precipitatingFactors: ['decades of wet, heavy hand work', 'age-related joint degeneration'],
    shapingFactors: ['sister’s death from a shaking illness', 'private catastrophic reading of joint changes'],
    maintainingFactors: ['continued heavy washing days', 'nocturnal rumination', 'secrecy about the fear'],
    exclusions: ['paralysis agitans', 'acute inflammatory arthritis', 'anaemia', 'malingering'],
  }),
  sources: Object.freeze([
    Object.freeze({ id: 'osler-practice', citation: 'William Osler, The Principles and Practice of Medicine (1892), section on arthritis deformans.', supports: ['bony enlargement of finger joints in elderly working women', 'distinction from acute articular rheumatism'] }),
    Object.freeze({ id: 'gowers-nervous', citation: 'William R. Gowers, A Manual of Diseases of the Nervous System, 2nd ed. (1893), on paralysis agitans.', supports: ['resting tremor, gait, and writing changes as early signs distinguishing the shaking palsy'] }),
    Object.freeze({ id: 'riis-german-ny', citation: 'Jacob A. Riis, How the Other Half Lives (1890), on German households of the East Side.', supports: ['German lodging-house keeping and household economy'] }),
  ]),
  facts,
  prompts,
  inquiryIntents,
  interpretations: Object.freeze([
    Object.freeze({ id: 'otten-approach-joints', label: 'Examine the joints first', text: 'The joints should be examined first, to rule out physical issues.', alignment: 3, nextMode: 'examination' }),
    Object.freeze({ id: 'otten-approach-fear', label: 'Ask what she fears', text: 'I should ask if something specific is frightening her.', alignment: 3, nextMode: 'patient' }),
    Object.freeze({ id: 'otten-approach-age', label: 'Ask about her history', text: 'I should ask about her life history.', alignment: 2, nextMode: 'patient' }),
  ]),
  thoughtIntents: Object.freeze([
    Object.freeze({ id: 'rheumatism', label: 'Chronic joint disease', matchTerms: ['rheumatism', 'arthritis', 'joints', 'wear', 'deformans'], alignment: 3 }),
    Object.freeze({ id: 'palsy-fear', label: 'Fear of the shaking palsy', matchTerms: ['fear', 'palsy', 'tremor', 'sister', 'anxiety', 'reassure'], alignment: 3 }),
    Object.freeze({ id: 'paralysis-agitans', label: 'Paralysis agitans', matchTerms: ['paralysis agitans', 'shaking palsy', 'parkinson'], alignment: 1 }),
    Object.freeze({ id: 'melancholia', label: 'Senile melancholia', matchTerms: ['melancholia', 'depression', 'decline', 'senile'], alignment: 0 }),
  ]),
  dialogueStyle: 'Wilhelmina has kept accounts and lodgers for decades and speaks accordingly: short declaratives, dry wit, no self-pity, German word order surfacing only when tired. She names prices and days of the week precisely. She does not volunteer the fear about her sister; it must be asked for, and when it comes it comes flatly. No epigrams, no metaphors, no dialect spelling. Do not add facts.',
  examinations: Object.freeze([
    Object.freeze({
      id: 'otten-exam-hands', label: 'Examine the hands and wrists', minutes: 5,
      factIds: ['otten-joint-exam', 'otten-no-palsy-signs'],
      reply: 'The end joints carry firm bony knots without heat. There is no tremor at rest or in motion, and her writing is steady: nothing of the shaking palsy.',
      uncertainty: 'Early paralysis agitans can be subtle, but two years without tremor, gait, or writing change argues strongly against it.',
      effects: { trust: 3, satisfaction: 2 }, gesture: 'present-wrist',
      reactionExpression: 'relieved',
    }),
    Object.freeze({
      id: 'otten-exam-general', label: 'General examination for her age', minutes: 4,
      factIds: ['otten-general-soundness'],
      reply: facts.find((fact) => fact.id === 'otten-general-soundness').value,
      uncertainty: 'A sound general state does not rule out disease of slow onset, but it narrows the field considerably.',
      effects: { satisfaction: 1 },
      reactionExpression: 'neutral',
    }),
  ]),
  diagnoses: Object.freeze([
    Object.freeze({ id: 'otten-dx-arthritis', label: 'Chronic rheumatism of the joints', description: 'Age and long wet work have thickened the finger joints: painful, slow, and neither fatal nor a palsy.', selector: { basePriority: 7, supportFactIds: ['otten-joint-exam', 'otten-work-history', 'otten-morning-stiffness'] }, evaluation: { quality: 10, patientAcceptance: 6 } }),
    Object.freeze({ id: 'otten-dx-combined', label: 'Rheumatism with nervous depression', description: 'The joint disease is real, and so are the broken nights and the buried fear that feed on it.', selector: { basePriority: 6, supportFactIds: ['otten-joint-exam', 'otten-sleep-spirits', 'otten-sister-fear'] }, evaluation: { quality: 9, patientAcceptance: 5 } }),
    Object.freeze({ id: 'otten-dx-agitans', label: 'Incipient paralysis agitans', description: 'Her own feared diagnosis, unsupported by tremor, gait, face, or handwriting.', selector: { basePriority: 2, supportFactIds: ['otten-sister-fear'], contraryFactIds: ['otten-no-palsy-signs'] }, evaluation: { quality: 1, patientAcceptance: 3 } }),
    Object.freeze({ id: 'otten-dx-anaemia', label: 'Anaemic debility of age', description: 'A stock explanation for an old woman’s complaints that her colour and strength contradict.', selector: { basePriority: 1, contraryFactIds: ['otten-general-soundness'] }, evaluation: { quality: 2, patientAcceptance: 4 } }),
    Object.freeze({ id: 'otten-dx-decay', label: 'The general decay of age', description: 'Tell her the hands are simply old. True in part, useless in whole, and she will hear it as dismissal.', selector: { basePriority: 3, supportFactIds: ['otten-joint-exam'] }, evaluation: { quality: 3, patientAcceptance: 1 } }),
  ]),
  treatmentOverrides: Object.freeze({
    'drug-iodide': Object.freeze({
      label: 'Salicylate of soda for the painful weeks',
      detail: 'A measured course during flares, with plain words about what it can and cannot do for joints already changed.',
      evaluation: Object.freeze({
        quality: 7, patientAcceptance: 6, recovery: 5, cost: -2,
        immediateText: 'She approves of a remedy with a schedule and a stated limit.',
        monthText: 'A month later, the worst washing-day aches are blunted. The knots remain, as you said they would, and she reports this without complaint.',
        modernText: 'Salicylates offer symptomatic relief for osteoarthritis flares; honest framing prevents disappointment when structural change persists.',
      }),
    }),
    'water-warm-bath': Object.freeze({
      label: 'Hot soaks, wool at night, and lighter Mondays',
      detail: 'Warm water before work, wool mittens against the night damp, and the heaviest linens sent out to a laundry.',
      evaluation: Object.freeze({
        quality: 9, patientAcceptance: 7, recovery: 7, cost: -1,
        immediateText: 'Practical measures in her own kitchen: she is already planning which lodger’s linens go out first.',
        monthText: 'A month later, the morning stiffness has shortened and the Monday aches no longer reach Tuesday. She sleeps past three more often than not.',
        modernText: 'Heat, joint protection, and activity modification are still first-line care for hand osteoarthritis, and preserved routine protects mood.',
      }),
    }),
    'rest-cure-home': Object.freeze({
      label: 'Rest the hands entirely',
      detail: 'Forbid the wash-tub and needle alike, and let the lodging house be run around her.',
      evaluation: Object.freeze({
        quality: 2, patientAcceptance: -6, recovery: -2, cost: -8,
        immediateText: 'She points out, correctly, that a lodging house is not run from a chair.',
        monthText: 'A month later, the hands are stiffer for their idleness, the house is behind on its linens, and she has hired help she cannot well afford.',
        modernText: 'Immobilisation worsens osteoarthritic stiffness; loss of purposeful activity harms both function and mood.',
      }),
    }),
    'drug-laudanum': Object.freeze({
      label: 'Laudanum for the nights',
      detail: 'Quiet the three-o’clock waking with an opiate and leave the days as they are.',
      evaluation: Object.freeze({
        quality: 3, patientAcceptance: 4, recovery: 0, cost: -4,
        immediateText: 'She takes the bottle with visible reluctance; she has buried lodgers who liked it too well.',
        monthText: 'A month later, she sleeps heavily but wakes dull, and has quietly halved the dose herself. The hands and the fear are unchanged.',
        modernText: 'Sedating the symptom leaves the arthritis, the anxiety, and the rumination untreated, and adds dependence risk.',
      }),
    }),
    'mind-endorse': Object.freeze({
      label: 'Confirm that the palsy may be beginning',
      detail: 'Treat her fear as prudent foresight and advise her to prepare the household for her decline.',
      evaluation: Object.freeze({
        quality: 0, patientAcceptance: 2, recovery: -8, cost: -10,
        immediateText: 'She goes very still, thanks you correctly, and pays the full fee as though settling an estate.',
        monthText: 'A month later, she has begun transferring the lodging book to a niece and watches her hands hourly. The nights are worse than the joints now.',
        modernText: 'Confirming an unfounded degenerative fear in a patient with health anxiety produces exactly the functional decline she dreaded.',
      }),
    }),
  }),
  caseNote: Object.freeze({
    minimumWords: 0, minimumEvidenceSelections: 1, maximumEvidenceSelections: 3,
    requiredFactIds: ['otten-joint-exam', 'otten-no-palsy-signs', 'otten-sister-fear', 'otten-work-history'],
  }),
  outcomeModel: Object.freeze({
    evidenceFactIds: ['otten-hand-pain', 'otten-morning-stiffness', 'otten-work-history', 'otten-sister-fear', 'otten-sleep-spirits', 'otten-joint-exam', 'otten-no-palsy-signs', 'otten-general-soundness'],
    criticalFactIds: ['otten-joint-exam', 'otten-no-palsy-signs', 'otten-sister-fear'],
    fee: Object.freeze({ full: 250, reduced: 125 }),
    immediateNarratives: Object.freeze({
      high: 'Mrs. Otten draws her gloves back on over the knotted joints with something like ceremony. You have told her what her hands are, and what they are not.',
      // Neutral about what the player did: an examination may never have happened.
      middle: 'Mrs. Otten thanks you with reserve. She has a name for her trouble now, but the explanation has not yet satisfied her.',
      low: 'Mrs. Otten rises stiffly and says the visit was dear for so short a word. The thing she came to ask about was never named.',
    }),
    departureLines: Object.freeze({
      high: '“Not my sister’s illness. You will forgive me, Doctor, if I say that was worth the fee alone.”',
      // Treatment-neutral: the player may have prescribed anything by now.
      middle: '“I will try what you have set down. If the shape goes on changing, I will be back with harder questions.”',
      low: '“Old age I knew about before I climbed your stair, Doctor. Good day.”',
    }),
    followUpDepartureLine: '“Very well. I will keep the count of bad mornings and bring it to you.”',
    followUpMonthText: 'She keeps a precise ledger of bad mornings but continues the heavy Mondays while awaiting a settled plan. The fear about her sister remains unspoken at home.',
    monthNarratives: Object.freeze({ improved: 'Her hands and her nights have both eased.', 'little-change': 'There has been little material change.', worse: 'Pain, fear, and sleeplessness have tightened their circle.', harmed: 'The chosen course has done real harm to her function and her household.' }),
    james: Object.freeze({ address: 'My dear Doctor', close: 'Yours faithfully, William James' }),
    modernDebrief: 'Mrs. Otten presents osteoarthritis of the hands — Heberden’s nodes, brief morning stiffness, mechanical pattern — in a lifelong laundress, complicated by health anxiety anchored to a sister’s death from a tremor illness and by early-waking low mood. The pivotal acts are the negative neurological examination and eliciting the withheld fear; reassurance grounded in demonstrated findings addresses what actually brought her in.',
  }),
});

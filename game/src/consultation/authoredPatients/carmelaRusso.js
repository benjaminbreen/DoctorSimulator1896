import { generatePatient, patientToRendererCRecipe } from '../../../../shared/patients/index.js';
import { createActorInstance } from '../../world/characters/actors.js';

const id = 'carmela-russo-1896';
const base = generatePatient({ seed: 4816, sex: 'female' });

const profile = Object.freeze({
  ...base,
  identity: Object.freeze({
    ...base.identity,
    age: 46,
    birthYear: 1850,
    language: 'English',
    homeLanguage: 'Sicilian',
  }),
  social: Object.freeze({
    ...base.social,
    occupationId: 'shopkeeper',
    occupation: 'proprietor of a provisions shop',
    householdPosition: 'widowed proprietor',
    residence: 'rooms above her shop near Gramercy',
  }),
  clinical: Object.freeze({
    ...base.clinical,
    id: 'carmela-stimulant-amplified-panic',
    periodCategory: 'nervous palpitation with morbid fear',
    theme: 'panic after a frightening theft, amplified by coca wine and avoidance',
    presentingComplaint: 'sudden hammering of the heart, trembling, and a conviction that calamity is near',
    symptoms: ['paroxysmal palpitation', 'short breath', 'trembling', 'impending doom', 'avoidance of the shop bell'],
    duration: 'three weeks',
    severity: 0.56,
    affect: 'controlled but apprehensive',
    flags: ['research-draft', 'authored-composite'],
  }),
});

const recipe = patientToRendererCRecipe(profile, {
  id,
  animation: { body: 'clinic-idle', expression: 'guarded', gaze: 'doctor', speaking: false },
  placement: { position: [0.45, 0.22, -1.7], rotation: [0, Math.PI, 0], scale: 1 },
});

const actor = createActorInstance({ id, recipe });

const facts = Object.freeze([
  Object.freeze({
    id: 'carmela-palpitations', kind: 'symptom', label: 'Sudden palpitation',
    value: 'Her heart begins to pound abruptly during otherwise ordinary activity.',
    notebookSummary: 'Patient reports sudden attacks of violent, regular heart-beating.',
    patientWording: 'The heart gives one hard knock, then it runs as if I had climbed five flights.',
    disclosure: 'open', confidence: 'high', measurement: false,
    releaseOn: ['heart', 'beat', 'pound', 'palpitation'], noteTerms: ['heart', 'palpitation', 'pounding'],
  }),
  Object.freeze({
    id: 'carmela-episode-pattern', kind: 'symptom', label: 'Pattern of the attacks',
    value: 'Attacks peak within minutes, last roughly ten minutes, and include short breath, trembling, tingling fingers, and an overpowering conviction of disaster.',
    notebookSummary: 'Attacks peak quickly and pass in about ten minutes, with short breath, trembling, tingling, and dread.',
    patientWording: 'It mounts quickly. Ten minutes, perhaps. My fingers prick, the room seems too small, and I am certain some evil has already happened.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['attack', 'long', 'minutes', 'breath', 'tingling', 'happens'],
    noteTerms: ['minutes', 'breath', 'tingling', 'dread', 'attack'],
  }),
  Object.freeze({
    id: 'carmela-robbery-fright', kind: 'history', label: 'Fright at the shop',
    value: 'The first attack followed an attempted till theft three weeks ago. Carmela caught the thief’s wrist and shouted until a patrolman came.',
    notebookSummary: 'The first attack followed an attempted theft from the shop till three weeks ago.',
    patientWording: 'A man put his hand in my till. I caught his wrist and shouted the street down. I was steady then. The shaking came after I barred the door.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['first', 'began', 'shop', 'thief', 'robbery', 'fright'],
    noteTerms: ['theft', 'thief', 'shop', 'fright', 'till'],
  }),
  Object.freeze({
    id: 'carmela-bell-avoidance', kind: 'behavior', label: 'Fear of the shop bell',
    value: 'The shop doorbell now triggers anticipatory dread. She leaves her daughter to answer it and has begun avoiding the crowded horse-car.',
    notebookSummary: 'The shop bell and crowded horse-car now provoke dread; her daughter increasingly covers the counter.',
    patientWording: 'When the bell rings I send Elena. On the horse-car I stand near the step, though it is foolish and cold there.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    requiresFactIds: ['carmela-robbery-fright'], releaseOn: ['bell', 'avoid', 'counter', 'horse-car', 'streetcar'],
    noteTerms: ['bell', 'avoidance', 'counter', 'horse-car'],
  }),
  Object.freeze({
    id: 'carmela-shop-stakes', kind: 'social', label: 'Shop and daughter',
    value: 'The provisions shop is the household’s livelihood. Her seventeen-year-old daughter Elena helps, but cannot yet run it alone.',
    notebookSummary: 'Her shop supports the household; her seventeen-year-old daughter cannot run it alone.',
    patientWording: 'The shop paid my husband’s last debts and it keeps my daughter. Elena is capable, but she is seventeen. I will not make a widow of her before she is even married.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['shop', 'work', 'daughter', 'close', 'income', 'rest'],
    noteTerms: ['shop', 'daughter', 'Elena', 'income', 'work'],
  }),
  Object.freeze({
    id: 'carmela-coca-wine', kind: 'exposure', label: 'Mariani coca wine',
    value: 'After the first attack she began taking a wineglass of Mariani coca wine three times daily as a strengthening nerve tonic.',
    notebookSummary: 'Since the first attack she has taken a wineglass of Mariani coca wine three times daily.',
    patientWording: 'It is Mariani wine—the coca wine. A customer said every physician in Europe commends it. One glass at breakfast, one at noon, one before I close.',
    disclosure: 'withheld', confidence: 'high', measurement: true,
    releaseOn: ['medicine', 'tonic', 'wine', 'coca', 'remedy', 'take'],
    noteTerms: ['Mariani', 'coca', 'wine', 'tonic', 'three times'],
  }),
  Object.freeze({
    id: 'carmela-dose-link', kind: 'history', label: 'Timing after the tonic',
    value: 'The attacks became more frequent after she began the tonic, and several occurred within an hour of a dose.',
    notebookSummary: 'Attacks increased after coca wine began and often follow a dose within an hour.',
    patientWording: 'Now that you ask—yes. The worst one came before the luncheon trade, not an hour after the second glass. I thought that proved I needed more strength.',
    disclosure: 'withheld', confidence: 'moderate', measurement: false,
    releaseOn: ['after', 'dose', 'glass', 'often', 'timing'],
    noteTerms: ['after', 'dose', 'hour', 'wine'],
  }),
  Object.freeze({
    id: 'carmela-no-cardiac-red-flags', kind: 'history', label: 'No cardiac warning signs',
    value: 'She has no fainting, exertional chest pressure, ankle swelling, blue discoloration, or sustained irregular beating; she climbs the stairs to her rooms without symptoms.',
    notebookSummary: 'No syncope, exertional chest pressure, edema, cyanosis, or sustained irregular rhythm.',
    patientWording: 'I do not faint. There is no crushing pain. I climb to our rooms carrying a basket and the heart behaves. It attacks when I am standing still.',
    disclosure: 'withheld', confidence: 'high', measurement: false,
    releaseOn: ['faint', 'pain', 'stairs', 'exercise', 'swelling', 'irregular'],
    noteTerms: ['faint', 'exertion', 'pain', 'swelling', 'stairs'],
  }),
  Object.freeze({
    id: 'carmela-cardiac-exam', kind: 'sign', label: 'Heart and pulse',
    value: 'Pulse is 96 and regular while she recounts the theft, falling to 80 after several quiet breaths. Heart sounds are normal, without murmur or enlargement.',
    disclosure: 'observed', confidence: 'high', measurement: true,
    noteTerms: ['pulse', 'regular', 'murmur', '80', '96'],
  }),
  Object.freeze({
    id: 'carmela-respiratory-exam', kind: 'sign', label: 'Lungs and circulation',
    value: 'Respiration is initially 20 and shallow, then 15 and easy. Lungs are clear; there is no cyanosis or ankle edema.',
    disclosure: 'observed', confidence: 'high', measurement: true,
    noteTerms: ['respiration', 'lungs', 'cyanosis', 'edema'],
  }),
  Object.freeze({
    id: 'carmela-general-exam', kind: 'sign', label: 'Thyroid and anaemia screen',
    value: 'There is no thyroid enlargement or eye prominence. The conjunctivae are not pale; weight and temperature are stable.',
    disclosure: 'observed', confidence: 'moderate', measurement: false,
    noteTerms: ['thyroid', 'eyes', 'pale', 'weight', 'temperature'],
  }),
]);

const prompts = Object.freeze([
  Object.freeze({
    id: 'carmela-ask-pattern', text: 'Ask how an attack begins, how long it lasts, and what she feels.', stance: 'question',
    role: 'history', priority: 34, minutes: 5, maxDisclosures: 2,
    discloseFactIds: ['carmela-episode-pattern', 'carmela-robbery-fright'],
    noteSummary: 'Attacks began after an attempted shop theft and now peak rapidly with short breath, tingling, and dread.',
    dialogue: '“Three weeks ago a man put his hand in my till. I caught his wrist and shouted until a patrolman came. I was steady then. After I barred the door, the heart began. Now an attack mounts in a minute or two—the breath short, the fingers pricking—and for ten minutes I am certain some evil has happened.”',
    effects: { trust: 2, satisfaction: 2 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'episode history' },
    reactionExpression: 'discouraged',
    bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'carmela-ask-calamity', text: 'Ask what “calamity” means to her and what she now avoids.', stance: 'question',
    role: 'belief', priority: 30, minutes: 5,
    requiresFactIds: ['carmela-robbery-fright'], discloseFactIds: ['carmela-bell-avoidance'],
    opensPendingResponseId: 'carmela-attack-question',
    noteSummary: 'The shop bell and crowded horse-car now provoke dread and avoidance.',
    dialogue: '“The bell rings and before I see the customer, I know: this one brings ruin. I send Elena to the counter. Listen—there, it begins now.” She grips the chair as her breathing quickens. “Do not tell me only to be calm. Is my heart failing, or am I losing my reason?”',
    effects: { trust: 1 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'meaning and avoidance' },
    reactionExpression: 'discouraged',
    bodyCue: 'sitting-distressed',
  }),
  Object.freeze({
    id: 'carmela-response-steady', text: '“Neither conclusion is justified. Follow my count while I examine what the body is doing.”', stance: 'reassure',
    role: 'response', priority: 40, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'carmela-attack-question', resolvesPendingResponseId: 'carmela-attack-question',
    dialogue: 'She follows the slower count reluctantly. After several breaths her hands loosen. “That is plain speaking. Good. Now tell me what you find.”',
    effects: { trust: 7, satisfaction: 7 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'honest grounding' },
    reactionExpression: 'smiling',
  }),
  Object.freeze({
    id: 'carmela-response-dismiss', text: '“It is only nerves. Compose yourself and it will pass.”', stance: 'challenge',
    role: 'response', priority: 34, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'carmela-attack-question', resolvesPendingResponseId: 'carmela-attack-question',
    dialogue: '“Only nerves?” Her breath remains high. “A thing may be in the nerves and still be a thing. I did not pay three dollars to be scolded for having a body.”',
    effects: { trust: -9, satisfaction: -14 }, appraisal: { register: 'prying', decorumBreach: 1, intent: 'dismissal' },
    reactionExpression: 'frowning',
    bodyCue: 'sitting-disapproval',
  }),
  Object.freeze({
    id: 'carmela-response-omen', text: '“Some presentiments deserve attention; perhaps the attacks warn you away from danger.”', stance: 'suggest',
    role: 'response', priority: 31, minutes: 2, countsAsQuestion: false,
    requiresPendingResponseId: 'carmela-attack-question', resolvesPendingResponseId: 'carmela-attack-question',
    dialogue: 'Her face clears at once. “Yes. That is what I have thought. Then I must trust the warning and keep Elena at the counter.”',
    effects: { trust: 5, satisfaction: 8 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'confirm presentiment' },
    reactionExpression: 'smiling',
  }),
  Object.freeze({
    id: 'carmela-ask-tonics', text: 'Inventory every medicine, cordial, wine, and tonic she has taken.', stance: 'question',
    role: 'exposure', priority: 33, minutes: 3, maxDisclosures: 2,
    requiresFactIds: ['carmela-episode-pattern'], discloseFactIds: ['carmela-coca-wine', 'carmela-dose-link'],
    noteSummary: 'A wineglass of Mariani coca wine three times daily preceded the recent increase in attacks.',
    dialogue: '“Mariani wine—the coca wine. A customer said every physician in Europe commends it. One glass at breakfast, one at noon, one before I close. Now that you ask, the worst attack came not an hour after the second glass. I thought that proved I needed more strength.”',
    effects: { satisfaction: 2 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'drug exposure' },
    reactionExpression: 'discouraged',
    bodyCue: 'sitting-self-soothing',
  }),
  Object.freeze({
    id: 'carmela-ask-red-flags', text: 'Test for fainting, exertional pain, swelling, and sustained irregular beating.', stance: 'question',
    role: 'differential', priority: 28, minutes: 5,
    discloseFactIds: ['carmela-no-cardiac-red-flags'],
    noteSummary: 'No syncope, exertional pain, edema, cyanosis, or sustained irregular beating.',
    dialogue: '“I do not faint. There is no crushing pain and no swelling. I carry a basket up to our rooms and the heart behaves. It attacks when I stand still, which is why I say it makes no honest sense.”',
    appraisal: { register: 'clinical', decorumBreach: 0, intent: 'cardiac red flags' },
  }),
  Object.freeze({
    id: 'carmela-ask-shop', text: 'Ask who depends on the shop and what closing it would cost.', stance: 'question',
    role: 'context', priority: 24, minutes: 5,
    discloseFactIds: ['carmela-shop-stakes'],
    noteSummary: 'The shop supports Carmela and her seventeen-year-old daughter, who cannot run it alone.',
    dialogue: '“The shop paid my husband’s last debts and it keeps my daughter. Elena is capable, but she is seventeen. I will not make a widow of her before she is even married. If your cure means closing the shutters, say so plainly and tell me who pays the grocer.”',
    effects: { trust: 2, satisfaction: 3 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'practical stakes' },
    reactionExpression: 'frowning',
    bodyCue: 'sitting-disapproval',
  }),
]);

const inquiryIntents = Object.freeze([
  Object.freeze({
    id: 'carmela-intent-pattern', matchTerms: ['how long', 'what happens', 'attack', 'first begin', 'started'],
    discloseFactIds: ['carmela-episode-pattern', 'carmela-robbery-fright'], maxDisclosures: 2,
    dialogue: prompts.find((item) => item.id === 'carmela-ask-pattern').dialogue,
    effects: { trust: 1 }, appraisal: { register: 'clinical', decorumBreach: 0, intent: 'episode history' },
  }),
  Object.freeze({
    id: 'carmela-intent-tonic', matchTerms: ['medicine', 'tonic', 'wine', 'coca', 'remedy', 'drug'],
    requiresFactIds: ['carmela-episode-pattern'], discloseFactIds: ['carmela-coca-wine', 'carmela-dose-link'], maxDisclosures: 2,
    dialogue: prompts.find((item) => item.id === 'carmela-ask-tonics').dialogue,
    appraisal: { register: 'clinical', decorumBreach: 0, intent: 'drug exposure' },
  }),
  Object.freeze({
    id: 'carmela-intent-heart', matchTerms: ['faint', 'chest pain', 'stairs', 'exercise', 'swelling', 'irregular'],
    discloseFactIds: ['carmela-no-cardiac-red-flags'],
    dialogue: prompts.find((item) => item.id === 'carmela-ask-red-flags').dialogue,
    appraisal: { register: 'clinical', decorumBreach: 0, intent: 'cardiac red flags' },
  }),
  Object.freeze({
    id: 'carmela-intent-shop', matchTerms: ['shop', 'work', 'daughter', 'close', 'income', 'rest'],
    discloseFactIds: ['carmela-shop-stakes'],
    dialogue: prompts.find((item) => item.id === 'carmela-ask-shop').dialogue,
    effects: { satisfaction: 2 }, appraisal: { register: 'courteous', decorumBreach: 0, intent: 'practical stakes' },
  }),
]);

export const CARMELA_RUSSO = Object.freeze({
  id,
  label: 'Mrs. Carmela Russo',
  contentStatus: 'research-draft',
  profileStatus: 'authored-composite',
  initialTrust: 57,
  initialSatisfaction: 50,
  profile,
  actor,
  appointment: Object.freeze({ minutes: 30, overtimeExtensionMinutes: 5, maxOvertimeExtensions: 1 }),
  opening: Object.freeze({
    dialogue: '“My heart begins its hammering, and then I know—something dreadful is at the door. I have buried a husband, Doctor. I know fear when there is reason. This comes first.”',
    behavior: 'Mrs. Russo places her gloves squarely on your desk as though setting down an account book. Only the thumb of her left hand moves, rubbing the glove seam.',
  }),
  groundTruth: Object.freeze({
    etiologyId: 'panic-after-fright-amplified-by-coca-wine',
    modernSummary: 'Panic attacks conditioned by a frightening shop incident, made more frequent by coca-wine stimulant exposure and avoidance.',
    precipitatingFactors: ['attempted shop theft', 'acute fright'],
    shapingFactors: ['catastrophic interpretation of bodily sensations', 'widowhood and sole responsibility for the shop'],
    maintainingFactors: ['coca wine three times daily', 'avoidance of the doorbell and crowded transit', 'reliance on her daughter'],
    exclusions: ['structural heart disease', 'sustained arrhythmia', 'hyperthyroidism', 'anaemia', 'prophetic warning', 'malingering'],
  }),
  sources: Object.freeze([
    Object.freeze({ id: 'james-emotions', citation: 'William James, The Principles of Psychology (1890), vol. 2, ch. 25, pp. 449–467.', supports: ['morbid fear with palpitation, shallow breathing, trembling, and precordial anxiety'] }),
    Object.freeze({ id: 'james-instinct', citation: 'William James, The Principles of Psychology (1890), vol. 2, ch. 24, pp. 415–424.', supports: ['agoraphobic avoidance and palpitation with terror'] }),
    Object.freeze({ id: 'anderson-practice', citation: 'William A. Anderson, A Text-book of the Practice of Medicine (1895), pp. 53–54.', supports: ['cocaine, alcohol, tea, and coffee as causes of functional palpitation', 'remove the cause before drug treatment'] }),
    Object.freeze({ id: 'mariani-ad', citation: 'Mariani Wine advertisement, Texas Medical Journal 12, no. 2 (August 1896).', supports: ['wineglass dosing three times daily', 'physician-endorsed tonic marketing'] }),
    Object.freeze({ id: 'riis-italian-ny', citation: 'Jacob A. Riis, How the Other Half Lives (1890), ch. 5.', supports: ['Italian settlement, shops, and household economy in New York'] }),
  ]),
  facts,
  prompts,
  inquiryIntents,
  interpretations: Object.freeze([
    Object.freeze({ id: 'carmela-approach-heart', label: 'Exclude heart disease', text: 'A dangerous disorder of the heart must be excluded before I call this a nervous complaint.', alignment: 2, nextMode: 'examination' }),
    Object.freeze({ id: 'carmela-approach-sequence', label: 'Reconstruct each attack', text: 'The order of bodily sensations, fear, setting, and recovery may distinguish the cause better than the word “palpitation.”', alignment: 3, nextMode: 'patient' }),
    Object.freeze({ id: 'carmela-approach-tonics', label: 'Inventory stimulants and tonics', text: 'I should inventory medicines, wines, coffee, tobacco exposure, and patent tonics before deciding this is spontaneous.', alignment: 3, nextMode: 'patient' }),
  ]),
  thoughtIntents: Object.freeze([
    Object.freeze({ id: 'panic', label: 'Morbid fear or panic', matchTerms: ['panic', 'morbid fear', 'fear cycle', 'conditioned', 'dread'], alignment: 3 }),
    Object.freeze({ id: 'stimulant', label: 'Drug or stimulant effect', matchTerms: ['cocaine', 'coca', 'stimulant', 'tonic', 'medicine effect'], alignment: 3 }),
    Object.freeze({ id: 'cardiac', label: 'Organic cardiac disease', matchTerms: ['heart disease', 'cardiac', 'arrhythmia', 'valve'], alignment: 1 }),
    Object.freeze({ id: 'omen', label: 'Prophetic presentiment', matchTerms: ['omen', 'prophecy', 'presentiment', 'warning of danger'], alignment: -2 }),
  ]),
  dialogueStyle: 'Carmela came to New York at eleven and speaks fluent, idiomatic English. She is concise, commercially minded, Catholic without being credulous, and intolerant of condescension. Do not use broken-English eye dialect or generic Italian exclamations. Let her use concrete shopkeeping comparisons and an occasional long sentence when frightened. Do not add facts.',
  examinations: Object.freeze([
    Object.freeze({
      id: 'carmela-exam-cardiorespiratory', label: 'Examine heart, pulse, and breathing', minutes: 5,
      factIds: ['carmela-cardiac-exam', 'carmela-respiratory-exam'],
      reply: 'Pulse is 96 and regular during her account, then falls to 80 with quiet breathing. Heart sounds and lungs are normal; respiration settles from 20 to 15.',
      uncertainty: 'A normal office examination cannot exclude every intermittent rhythm disturbance.', effects: { satisfaction: 2 },
    }),
    Object.freeze({
      id: 'carmela-exam-general', label: 'Check thyroid, colour, weight, and temperature', minutes: 5,
      factIds: ['carmela-general-exam'], reply: facts.find((fact) => fact.id === 'carmela-general-exam').value,
      uncertainty: 'These findings make Basedow’s disease and marked anaemia less likely without excluding every bodily cause.',
    }),
  ]),
  diagnoses: Object.freeze([
    Object.freeze({ id: 'carmela-dx-nervous-coca', label: 'Nervous palpitation aggravated by coca', description: 'A functional palpitation in which coca wine intensifies the bodily alarm.', selector: { basePriority: 7, supportFactIds: ['carmela-coca-wine', 'carmela-dose-link', 'carmela-cardiac-exam'] }, evaluation: { quality: 10, patientAcceptance: 4 } }),
    Object.freeze({ id: 'carmela-dx-morbid-fear', label: 'Morbid fear after nervous shock', description: 'The frightening theft has conditioned attacks and avoidance around reminders.', selector: { basePriority: 6, supportFactIds: ['carmela-robbery-fright', 'carmela-bell-avoidance', 'carmela-episode-pattern'] }, evaluation: { quality: 9, patientAcceptance: 3 } }),
    Object.freeze({ id: 'carmela-dx-irritable-heart', label: 'Irritable heart', description: 'A period cardiac label that fits palpitation but explains the triggers and rapid recovery poorly.', selector: { basePriority: 4, supportFactIds: ['carmela-palpitations'], contraryFactIds: ['carmela-cardiac-exam', 'carmela-no-cardiac-red-flags'] }, evaluation: { quality: 5, patientAcceptance: 6 } }),
    Object.freeze({ id: 'carmela-dx-basedow', label: 'Basedow’s disease', description: 'Trembling and palpitation without the expected thyroid, eye, pulse, or weight findings.', selector: { basePriority: 1, contraryFactIds: ['carmela-general-exam'] }, evaluation: { quality: 2, patientAcceptance: 2 } }),
    Object.freeze({ id: 'carmela-dx-anaemia', label: 'Anaemic debility', description: 'A common explanation for breathlessness that lacks supporting pallor or exertional symptoms.', selector: { basePriority: 1, contraryFactIds: ['carmela-general-exam', 'carmela-no-cardiac-red-flags'] }, evaluation: { quality: 2, patientAcceptance: 2 } }),
    Object.freeze({ id: 'carmela-dx-presentiment', label: 'Pathological presentiment', description: 'Treat the attacks as a special faculty warning her of approaching calamity.', selector: { basePriority: -3, supportFactIds: ['carmela-bell-avoidance'] }, evaluation: { quality: 0, patientAcceptance: 11 } }),
  ]),
  // Only the treatments that matter in this case. Everything else in the
  // library resolves to its default, which for Carmela is a null result.
  treatmentOverrides: Object.freeze({
    'drug-stop-tonic': Object.freeze({
      label: 'Stop coca wine; explain the cycle; resume ordinary activity',
      detail: 'Remove the stimulant, preserve the shop, practise slow breathing, and gradually answer the bell herself with review in one week.',
      evaluation: Object.freeze({
        quality: 10, patientAcceptance: 7, recovery: 10, cost: 1,
        immediateText: 'The plan respects both the bodily terror and the arithmetic of keeping a shop.',
        monthText: 'A month later, Carmela has stopped the coca wine and again answers most rings herself. Two brief attacks occurred in the first week; neither became a full paroxysm, and none has occurred for twelve days.',
        modernText: 'Removing cocaine exposure and reversing avoidance addresses two major maintaining factors while safety advice and follow-up protect against missed cardiac disease.',
      }),
    }),
    'rest-cure-home': Object.freeze({
      label: 'Close the shop for complete rest and seclusion',
      detail: 'Withdraw her from commerce, visitors, and household decisions for several weeks.',
      evaluation: Object.freeze({
        quality: 2, patientAcceptance: -8, recovery: 1, cost: -14,
        immediateText: 'She hears the recommendation as a sentence against the business she preserved after her husband’s death.',
        monthText: 'A month later, the attacks are less often provoked because Carmela seldom leaves her room, but Elena has lost customers and credit at the shop. The bell now frightens Carmela more than before.',
        modernText: 'Seclusion strengthens avoidance and imposes financial harm despite reducing immediate exposure to triggers.',
      }),
    }),
    'drug-bromide': Object.freeze({
      label: 'Bromide draught and early bed',
      detail: 'Sedate the nervous system at night while leaving the tonic and avoidance unexamined.',
      evaluation: Object.freeze({
        quality: 4, patientAcceptance: 5, recovery: 1, cost: -3,
        immediateText: 'A bottle and dosage make the visit feel concrete, though she dislikes the prospect of dull mornings.',
        monthText: 'A month later, Carmela sleeps more heavily but is slow over the morning accounts. The attacks continue after coca wine and at the shop bell.',
        modernText: 'Sedation may blunt arousal but does not remove the stimulant or reverse conditioned avoidance.',
      }),
    }),
    'drug-digitalis': Object.freeze({
      label: 'Digitalis for a presumed weak heart',
      detail: 'Treat the palpitation as cardiac weakness despite a normal rhythm and examination.',
      evaluation: Object.freeze({
        quality: 1, patientAcceptance: 8, recovery: -4, cost: -4,
        immediateText: 'Being given a heart medicine validates the danger she feared and briefly reassures her.',
        monthText: 'A month later, nausea and intermittent slow pulse have added new bodily alarms. She watches her heart more closely and ventures into the shop less often.',
        modernText: 'Unneeded digitalis adds toxicity risk and reinforces catastrophic monitoring of a structurally normal heart.',
      }),
    }),
    'elec-galvanization': Object.freeze({
      label: 'Course of galvanic treatments',
      detail: 'Offer repeated electrical treatments for nervous tone without changing coca use or avoidance.',
      evaluation: Object.freeze({
        quality: 3, patientAcceptance: 4, recovery: 0, cost: -2,
        immediateText: 'She is willing to try a modern apparatus but asks how many afternoons it will take from the shop.',
        monthText: 'A month later, the office treatments have produced no clear change. Carmela continues the tonic and still calls Elena when the bell rings.',
        modernText: 'The treatment consumes time and money without addressing the stimulant exposure or learned fear cycle.',
      }),
    }),
    'mind-endorse': Object.freeze({
      label: 'Heed the warnings and avoid provoking places',
      detail: 'Advise her to trust the attacks, leave the counter to Elena, and avoid crowded conveyances.',
      evaluation: Object.freeze({
        quality: 0, patientAcceptance: 13, recovery: -10, cost: -12,
        immediateText: 'She leaves deeply relieved that you have confirmed the attacks mean something and pays without hesitation.',
        monthText: 'A month later, Carmela rarely enters the shop and will not ride the horse-car. The sphere of danger has widened from the bell to the street, church, and any room without a quick exit.',
        modernText: 'Confirming the feared meaning and prescribing avoidance strongly reinforces panic and functional restriction.',
      }),
    }),
  }),
  caseNote: Object.freeze({
    minimumWords: 0, minimumEvidenceSelections: 2, maximumEvidenceSelections: 3,
    requiredFactIds: ['carmela-episode-pattern', 'carmela-coca-wine', 'carmela-dose-link', 'carmela-cardiac-exam', 'carmela-shop-stakes'],
  }),
  outcomeModel: Object.freeze({
    evidenceFactIds: ['carmela-episode-pattern', 'carmela-robbery-fright', 'carmela-bell-avoidance', 'carmela-shop-stakes', 'carmela-coca-wine', 'carmela-dose-link', 'carmela-no-cardiac-red-flags', 'carmela-cardiac-exam', 'carmela-general-exam'],
    criticalFactIds: ['carmela-coca-wine', 'carmela-dose-link', 'carmela-no-cardiac-red-flags', 'carmela-cardiac-exam'],
    fee: Object.freeze({ full: 300, reduced: 150 }),
    immediateNarratives: Object.freeze({
      high: 'Mrs. Russo puts on her gloves with the briskness of a woman who has been given useful business. She considers the visit worth its price.',
      middle: 'Mrs. Russo leaves with a measured nod. She is not fully persuaded, but believes you have at least examined the account honestly.',
      low: 'Mrs. Russo rises without offering her hand. She believes you heard the word “nerves” and stopped listening.',
    }),
    departureLines: Object.freeze({
      high: '“Good. A cause, a plan, and a day to return—that is an honest account.”',
      middle: '“I will do as you say for one week. After that, Doctor, the facts must speak.”',
      low: '“You have given me a name for my fear, but no reason to trust your judgment.”',
    }),
    followUpDepartureLine: '“Another examination is fair. I will keep an account of every attack and bring you the bottle.”',
    followUpMonthText: 'Carmela has kept a precise attack ledger but continues the coca wine while awaiting a settled plan. The attacks and avoidance remain.',
    monthNarratives: Object.freeze({ improved: 'Her health and ordinary function have improved.', 'little-change': 'There has been little material change.', worse: 'Her attacks and avoidance have widened.', harmed: 'The chosen course has produced substantial medical and financial harm.' }),
    james: Object.freeze({ address: 'My dear Doctor', close: 'Yours faithfully, William James' }),
    modernDebrief: 'Carmela’s rapid, time-limited attacks combine panic symptoms with conditioned avoidance after a genuine fright. Coca wine supplied a pharmacologically active stimulant that plausibly amplified palpitation and arousal; the normal office examination and absence of red flags reduce but do not eliminate cardiac concern.',
  }),
});

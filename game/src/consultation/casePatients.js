import { generatePatient, createRandom, patientToRendererCRecipe } from '../../../shared/patients/index.js';
import { lookForProfile } from '../../../shared/characters/profileLook.js';
import { EXPANSION_TEMPLATES } from '../../../shared/characters/patientExpansion.js';
import { createActorInstance } from '../world/characters/actors.js';
import { CONDITIONS } from '../../../shared/patients/cases/conditions.js';
import { resolveTreatment } from './treatments.js';

// Same table as technicalPatients.js, in cents.
const FEES = Object.freeze({
  elite: { full: 500, reduced: 250 },
  affluent: { full: 300, reduced: 150 },
  comfortable: { full: 200, reduced: 100 },
  sponsored: { full: 75, reduced: 25 },
});

// A household of limited means cannot pay for a resort or a nurse at home.
const COSTLY = new Set(['rest-cure-home', 'rest-resort', 'water-cure-course', 'exer-sea-voyage', 'exer-camp-cure']);

function textFiller(profile, vars) {
  const male = profile.identity.sex === 'male';
  const words = {
    he: male ? 'he' : 'she', his: male ? 'his' : 'her', him: male ? 'him' : 'her',
    He: male ? 'He' : 'She', His: male ? 'His' : 'Her',
    name: profile.identity.displayName,
    occupation: profile.social.occupation || profile.social.householdPosition,
    residence: profile.social.residence,
    ...vars,
  };
  return (text) => (text == null ? text : String(text).replace(/\{(\w+)\}/g, (match, key) => words[key] ?? match));
}

const quoted = (text) => `“${text}”`;

function expressionFor(kind) {
  if (kind === 'risk') return { reactionExpression: 'distressed', bodyCue: 'sitting-distressed' };
  if (kind === 'social') return { reactionExpression: 'frowning', bodyCue: 'sitting-disapproval' };
  if (kind === 'history') return { reactionExpression: 'discouraged', bodyCue: 'sitting-self-soothing' };
  return { reactionExpression: 'guarded', bodyCue: 'sitting-talking' };
}

/**
 * Build one consultation patient from a condition and a seed. The condition
 * fixes what is true; the seed picks the person, the wording variants, and
 * which optional facts exist. The result is frozen ground truth.
 */
export function assembleCasePatient(condition, { id, seed, sex = null, persona = {}, amendProfile = null, voice = null }) {
  const random = createRandom(seed, `case-${condition.id}`);
  const constraints = { ...condition.persona, ...persona };
  const weights = constraints.sexWeights || { female: 1, male: 1 };
  const rolledSex = random.weighted(Object.keys(weights).filter((key) => weights[key] > 0), (key) => weights[key]);
  const profile = generatePatient({ seed, ...constraints, sex: sex || rolledSex });
  if (amendProfile) amendProfile(profile);
  const vars = Object.fromEntries(Object.entries(condition.vars || {}).map(([key, options]) => [key, random.pick(options)]));
  const fill = textFiller(profile, vars);
  // Every line a voice pass may reword is listed here by a stable id, and
  // replaced when `voice` has it. The seed's choices never depend on `voice`.
  const voiceLines = new Map();
  const say = (lineId, text) => {
    voiceLines.set(lineId, text);
    const voiced = voice?.[lineId];
    return typeof voiced === 'string' && voiced.trim() ? voiced.trim() : text;
  };

  const affect = random.pick(condition.clinical.affects);
  profile.clinical = {
    ...profile.clinical,
    id: condition.id,
    periodCategory: condition.clinical.periodCategory,
    theme: condition.clinical.theme,
    presentingComplaint: condition.clinical.presentingComplaint,
    symptoms: [...condition.clinical.symptoms],
    affect,
    performance: { ...profile.clinical.performance, ...condition.clinical.performance },
    flags: ['corpus-procedural', 'draft'],
  };

  const factId = (key) => `${id}-${key}`;
  const kept = condition.facts.filter((fact) => fact.chance == null || random.chance(fact.chance));
  const keptKeys = new Set(kept.map((fact) => fact.key));
  const facts = kept.map((fact) => ({
    id: factId(fact.key),
    kind: fact.kind,
    label: fill(fact.label),
    value: fill(fact.value),
    notebookSummary: fill(fact.value),
    ...(fact.wording ? { patientWording: say(`fact:${fact.key}`, fill(fact.wording)) } : {}),
    disclosure: fact.disclosure || 'withheld',
    confidence: fact.disclosure === 'observed' ? 'moderate' : 'high',
    measurement: Boolean(fact.measurement),
    releaseOn: (fact.releaseOn || []).map(fill),
    noteTerms: (fact.noteTerms || []).map(fill),
    requiresFactIds: (fact.requires || []).filter((key) => keptKeys.has(key)).map(factId),
    ...(fact.minimumTrust ? { minimumTrust: fact.minimumTrust } : {}),
  }));
  const factByKey = new Map(kept.map((fact, index) => [fact.key, { source: fact, built: facts[index] }]));

  const prompts = [];
  const inquiryIntents = [];
  for (const prompt of condition.prompts) {
    const disclosed = (prompt.disclose || []).filter((key) => keptKeys.has(key)).map((key) => factByKey.get(key));
    if (prompt.disclose?.length && !disclosed.length) continue;
    const response = Boolean(prompt.resolvesPending);
    const stance = prompt.stance || 'question';
    const ownIds = new Set(disclosed.map((entry) => entry.built.id));
    const requiresFactIds = [...new Set(disclosed.flatMap((entry) => entry.built.requiresFactIds))]
      .filter((required) => !ownIds.has(required));
    const minimumTrust = Math.max(0, ...disclosed.map((entry) => entry.source.minimumTrust || 0));
    const question = prompt.opensPending ? condition.pendingQuestions?.[prompt.opensPending] : null;
    const spoken = prompt.dialogue
      ? say(`reply:${prompt.key}`, fill(prompt.dialogue))
      : disclosed.map((entry) => entry.built.patientWording || entry.built.value).join(' ');
    const dialogue = quoted([spoken, question && say(`pending:${prompt.opensPending}`, fill(question))].filter(Boolean).join(' '));
    const cue = disclosed.length ? expressionFor(disclosed[0].source.kind) : {};
    const rule = {
      id: `${id}-${prompt.key}`,
      text: say(`choice:${prompt.key}`, fill(prompt.text)),
      stance,
      role: prompt.role,
      priority: prompt.priority,
      minutes: response ? 2 : 4,
      ...(response ? { countsAsQuestion: false } : {}),
      maxDisclosures: Math.max(1, disclosed.length),
      discloseFactIds: [...ownIds],
      requiresFactIds,
      ...(minimumTrust ? { minimumTrust } : {}),
      ...(disclosed.length ? { noteSummary: disclosed.map((entry) => entry.built.value).join(' ') } : {}),
      dialogue,
      effects: prompt.effects || { trust: 2, satisfaction: 2 },
      appraisal: {
        register: stance === 'challenge' ? 'prying' : 'clinical',
        decorumBreach: stance === 'challenge' ? 1 : 0,
        intent: prompt.role,
      },
      reactionExpression: prompt.reactionExpression || cue.reactionExpression || 'guarded',
      bodyCue: prompt.bodyCue || cue.bodyCue || 'sitting-talking',
      ...(prompt.opensPending ? { opensPendingResponseId: `${id}-${prompt.opensPending}` } : {}),
      ...(response ? {
        requiresPendingResponseId: `${id}-${prompt.resolvesPending}`,
        resolvesPendingResponseId: `${id}-${prompt.resolvesPending}`,
      } : {}),
    };
    prompts.push(rule);
    if (!response && disclosed.length) {
      inquiryIntents.push({
        id: `${id}-intent-${prompt.key}`,
        matchTerms: [...new Set(disclosed.flatMap((entry) => entry.built.releaseOn))],
        requiresFactIds,
        ...(minimumTrust ? { minimumTrust } : {}),
        discloseFactIds: rule.discloseFactIds,
        maxDisclosures: rule.maxDisclosures,
        dialogue: quoted(spoken),
        appraisal: rule.appraisal,
        reactionExpression: rule.reactionExpression,
        bodyCue: rule.bodyCue,
      });
    }
  }

  const examinations = condition.examinations
    .map((exam) => ({ exam, ids: exam.facts.filter((key) => keptKeys.has(key)).map(factId) }))
    .filter(({ ids }) => ids.length)
    .map(({ exam, ids }) => ({
      id: `${id}-${exam.key}`,
      label: fill(exam.label),
      minutes: 3,
      factIds: ids,
      reply: ids.map((factKey) => facts.find((fact) => fact.id === factKey).value).join(' '),
      uncertainty: fill(exam.uncertainty || ''),
      effects: { trust: 1, satisfaction: 1 },
      reactionExpression: exam.reactionExpression || 'guarded',
    }));

  const existing = (keys) => (keys || []).filter((key) => keptKeys.has(key)).map(factId);
  const diagnoses = condition.diagnoses.map((diagnosis) => ({
    id: `${id}-dx-${diagnosis.key}`,
    label: diagnosis.label,
    description: diagnosis.label,
    selector: {
      basePriority: diagnosis.base, supportFactIds: existing(diagnosis.support), contraryFactIds: existing(diagnosis.contrary),
    },
    reputation: diagnosis.quality >= 7 ? 4 : 1,
    record: diagnosis.quality >= 7 ? 4 : 1,
    evaluation: { quality: diagnosis.quality, patientAcceptance: diagnosis.acceptance },
  }));

  const classId = profile.social.classId;
  const treatmentOverrides = {};
  for (const [treatmentId, override] of Object.entries(condition.treatments)) {
    treatmentOverrides[treatmentId] = {
      ...(override.label ? { label: fill(override.label) } : {}),
      ...(override.detail ? { detail: fill(override.detail) } : {}),
      evaluation: Object.fromEntries(Object.entries(override.evaluation).map(([key, value]) => (
        [key, typeof value === 'string' ? fill(value) : value]))),
    };
  }
  if (classId === 'sponsored') {
    for (const treatmentId of COSTLY) {
      const base = resolveTreatment({ treatmentOverrides }, treatmentId).evaluation;
      treatmentOverrides[treatmentId] = {
        ...treatmentOverrides[treatmentId],
        evaluation: {
          ...base,
          patientAcceptance: (base.patientAcceptance || 0) - 4,
          cost: (base.cost || 0) - 4,
          immediateText: `${base.immediateText} The household cannot afford it.`,
        },
      };
    }
  }

  const critical = existing(condition.critical);
  const surname = profile.identity.displayName;
  const fee = FEES[classId] || FEES.comfortable;
  const opening = random.pick(condition.opening.dialogue);
  const examineMatters = condition.critical.some((key) => factByKey.get(key)?.source.disclosure === 'observed');

  return {
    id,
    contentStatus: 'procedural',
    profileStatus: 'draft-procedural',
    conditionId: condition.id,
    label: profile.identity.fullName,
    initialTrust: random.integer(...(condition.initialTrust || [48, 55])),
    profile,
    opening: {
      dialogue: quoted(say('opening', fill(opening))),
      behavior: `${fill(condition.opening.behavior)} Sent to you by ${profile.social.referralSource}.`,
    },
    dialogueStyle: `${profile.identity.fullName}, ${profile.identity.age}, ${fill('{occupation}')}, ${profile.identity.origin.generationLabel}, from ${profile.social.residence}. Plain spoken English of 1896: ordinary words, short sentences, some hesitation. Not theatrical.`,
    voiceLines: [...voiceLines].map(([lineId, text]) => ({ id: lineId, text })),
    groundTruth: { ...condition.groundTruth },
    sources: condition.cards.map((cardId) => ({ id: cardId, card: `shared/patients/cases/cards/${cardId}.json` })),
    facts,
    prompts,
    inquiryIntents,
    interpretations: [
      { id: 'read-history-first', label: 'Hear the history', text: 'I should hear how this began before I draw conclusions.', alignment: 2, nextMode: 'patient' },
      { id: 'read-examine-first', label: 'Examine first', text: 'An examination may show a bodily cause the history will not.', alignment: examineMatters ? 3 : 1, nextMode: 'examination' },
      { id: 'read-diagnose-first', label: 'Take the complaint at its word', text: 'This looks like the complaint the patient names. I will question with that in mind.', alignment: 0, nextMode: 'patient' },
    ],
    thoughtIntents: condition.thoughtIntents,
    examinations,
    diagnoses,
    treatmentOverrides,
    caseNote: { minimumWords: 0, minimumEvidenceSelections: 1, maximumEvidenceSelections: 3, requiredFactIds: critical },
    outcomeModel: {
      evidenceFactIds: facts.map((fact) => fact.id),
      criticalFactIds: critical,
      fee,
      immediateNarratives: {
        high: `${surname} leaves with a plan that makes sense of the trouble.`,
        middle: `${surname} thanks you with reserve, not yet sure of the advice.`,
        low: `${surname} leaves dissatisfied and is unlikely to return.`,
      },
      departureLines: {
        high: quoted('Thank you, Doctor. That is the first plain account anyone has given me.'),
        middle: quoted('I shall try it, Doctor, and see.'),
        low: quoted('Good day, Doctor.'),
      },
      followUpDepartureLine: quoted('Very well. I will come back, if you think it needs more looking into.'),
      followUpMonthText: `${surname} is still waiting for a settled plan. The trouble continues as before.`,
      monthNarratives: {
        improved: 'Health and ordinary function have improved.',
        'little-change': 'There has been little material change.',
        worse: 'The symptoms and ordinary function have worsened.',
        harmed: 'The chosen course has produced substantial harm.',
      },
      james: { address: 'My dear Doctor', close: 'Yours faithfully, William James' },
      modernDebrief: condition.modernDebrief,
    },
  };
}

const CLIP_MAP = {
  'clinic-idle': 'ClinicIdle', 'standing-idle': 'StandingIdle', walk: 'Walk', 'sit-down': 'SitDown', 'stand-up': 'StandUp',
  'sitting-talking': 'SittingTalking', 'sitting-disbelief': 'SittingDisbelief', 'sitting-disapproval': 'SittingDisapproval',
  'sitting-distressed': 'SittingSelfSoothing', 'sitting-self-soothing': 'SittingSelfSoothing',
};

// Same set-up as the Carmela and Samuel modular reviews. Bump the version
// strings with RendererCActor's review URLs when a template is re-exported.
function modularActor(profile, id) {
  const { model, look } = lookForProfile(profile);
  const male = profile.identity.sex === 'male';
  const version = '20261103-stance-1';
  const recipe = patientToRendererCRecipe(profile, {
    id,
    asset: {
      kind: 'authored-character', path: `/models/characters/${model}.glb?v=${version}`,
      applyRecipe: false, opaque: !male, motionClips: Object.values(CLIP_MAP), clipMap: CLIP_MAP, ...look,
    },
    animation: { body: 'clinic-idle', expression: ['weary', 'sad'].includes(profile.clinical.affect) ? 'fatigued' : 'guarded', gaze: 'doctor', speaking: false },
    performanceStyle: 'responsive-consultation',
    placement: { position: [0.45, 0.05, -1.7], rotation: [0, Math.PI, 0], scale: 1 },
  });
  recipe.restingFace = {};
  recipe.presentation.entrance = { from: [2.4, 0, 4.55] };
  recipe.presentation.consultationZoom = male ? .10 : .12;
  recipe.presentation.clothingWrinkles = .7;
  recipe.presentation.hat = null;
  return createActorInstance({ id, recipe });
}

// Remembers how each patient was built, so a voice pass can rebuild it.
const ASSEMBLY = new WeakMap();

function build(condition, options) {
  const record = assembleCasePatient(condition, options);
  const patient = Object.freeze({ ...record, actor: modularActor(record.profile, record.id) });
  ASSEMBLY.set(patient, { condition, options });
  return patient;
}

export function createCasePatient(conditionId, options) {
  const condition = CONDITIONS.find((item) => item.id === conditionId);
  if (!condition) throw new Error(`unknown condition ${conditionId}`);
  return build(condition, options);
}

// The same patient with model-written wording. Facts, choices' effects, and
// outcomes are unchanged because the seed and condition are the same.
export function voiceCasePatient(patient, voice) {
  const assembly = ASSEMBLY.get(patient);
  if (!assembly || !voice) return patient;
  const record = assembleCasePatient(assembly.condition, { ...assembly.options, voice });
  return Object.freeze({ ...record, actor: patient.actor });
}

// A street referral is the matron's unmarried daughter, so only conditions
// that can fit a young single woman are eligible for her slot.
function fitsReferral(condition) {
  return (condition.persona.sexWeights?.female ?? 1) > 0 && condition.persona.ageRange[0] <= 30
    && !condition.persona.maritalStatus;
}

// The morning list for a procedural day, drawn from the condition table.
// Same signature and id scheme as createDayPatients in technicalPatients.js.
export function createCaseDayPatients({ daySeed = 1, dayIndex = 1, count = 4, referral = null } = {}) {
  const random = createRandom(daySeed, `case-day-${dayIndex}`);
  const pool = [...CONDITIONS];
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const id = `day${dayIndex}-${String.fromCharCode(97 + index)}`;
    const seed = random.integer(1, 1e9);
    const referred = referral && index === 0;
    const eligible = referred ? pool.filter(fitsReferral) : pool;
    const condition = eligible.length ? random.pick(eligible) : random.pick(CONDITIONS);
    // Avoid repeating a condition within a day while the table is small.
    if (pool.length > 1) pool.splice(pool.indexOf(condition), 1);
    return build(condition, {
      id,
      seed,
      ...(referred ? {
        sex: 'female',
        persona: {
          maritalStatus: 'single',
          ageRange: [Math.max(18, condition.persona.ageRange[0]), Math.min(30, condition.persona.ageRange[1])],
        },
        amendProfile: (profile) => {
          const given = profile.identity.givenName;
          profile.identity = {
            ...profile.identity,
            familyName: referral.familyName,
            title: 'Miss',
            displayName: `Miss ${referral.familyName}`,
            fullName: `Miss ${given} ${referral.familyName}`,
          };
          profile.social = { ...profile.social, referralSource: `her mother, Mrs. ${referral.familyName}` };
        },
      } : {}),
    });
  }));
}

// Shared treatment library. Any patient can be offered any treatment here;
// a patient record supplies `treatmentOverrides` for the few that matter in
// that case, and the rest fall through to the default null result.
//
// Four axes, all read by outcomes.js:
//   quality            0..10   the reasoning, judged apart from the outcome
//   patientAcceptance -25..15  how she takes it, added to satisfaction
//   recovery         -10..10   did she get better
//   cost             -15..5    what complying cost her in work, money, and life

export const TREATMENT_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'drugs', label: 'Drugs', icon: '/ui/treatments/drugs.webp',
    lede: 'The dispensary shelf. Dose and duration matter as much as the choice.' }),
  Object.freeze({ id: 'rest', label: 'Rest', icon: '/ui/treatments/rest.webp',
    lede: 'From an hour lying down to Weir Mitchell entire.' }),
  Object.freeze({ id: 'diet', label: 'Diet', icon: '/ui/treatments/diet.webp',
    lede: 'Feeding is treatment. So, in 1896, is brandy.' }),
  Object.freeze({ id: 'exercise', label: 'Exercise & air', icon: '/ui/treatments/exercise.webp',
    lede: 'What was prescribed to men for the complaint that put women to bed.' }),
  Object.freeze({ id: 'water', label: 'Hydrotherapy', icon: '/ui/treatments/water.webp',
    lede: 'Cheap, harmless, and mostly ineffective. The patient rarely minds.' }),
  Object.freeze({ id: 'electricity', label: 'Electrotherapy', icon: '/ui/treatments/electricity.webp',
    lede: 'The apparatus is impressive. That is not nothing.' }),
  Object.freeze({ id: 'suggestion', label: 'Mind & suggestion', icon: '/ui/treatments/suggestion.webp',
    lede: 'Charcot, Bernheim, Janet. This year the whole argument is open.' }),
  Object.freeze({ id: 'removal', label: 'Removal & change', icon: '/ui/treatments/removal.webp',
    lede: 'Not a tonic. Stopping the thing that is doing it.' }),
  Object.freeze({ id: 'custom', label: 'In your own words', icon: '/ui/treatments/custom.webp',
    lede: 'Write the prescription yourself.', custom: true }),
]);

// A default that neither helps nor harms, and reads as such a month later.
function inert(monthText, extra = {}) {
  return {
    quality: 3, patientAcceptance: 2, recovery: 0, cost: -1,
    immediateText: 'The patient takes the instruction without objection.',
    monthText, modernText: 'No active ingredient in this course addresses the underlying process.',
    ...extra,
  };
}

// Treatments with their own artwork are listed here; the rest fall back to
// the category image in TreatmentShelf.
const OWN_ARTWORK = new Set([
  'drug-laudanum', 'drug-morphine', 'drug-cannabis',
  'drug-coca-wine', 'drug-iron-arsenic', 'drug-valerian',
]);

function tx(id, categoryId, label, detail, feeCents, evaluation) {
  return Object.freeze({
    id,
    categoryId,
    label,
    detail,
    feeCents,
    icon: OWN_ARTWORK.has(id) ? `/ui/treatments/${id}.webp` : null,
    evaluation: Object.freeze(evaluation),
  });
}

export const TREATMENT_LIBRARY = Object.freeze([
  /* ---------------- drugs ---------------- */
  tx('drug-bromide', 'drugs', 'Potassium bromide',
    'A nightly draught. Calms excitation; dulls the senses with continued use.', 125, {
      quality: 3, patientAcceptance: 5, recovery: -1, cost: -3,
      immediateText: 'A bottle and a clear nightly direction make the visit feel medically substantial.',
      monthText: 'A month later the bromide sometimes helps sleep, but leaves the patient dull by day.',
      modernText: 'Sedation changes sleep and alertness without touching the cause.',
    }),
  tx('drug-chloral', 'drugs', 'Chloral hydrate',
    'Twenty grains at bedtime. Promotes quiet sleep.', 160, {
      quality: 3, patientAcceptance: 5, recovery: -1, cost: -3,
      immediateText: 'The promise of a night’s sleep is welcome.',
      monthText: 'A month later sleep comes more easily, and the mornings are heavier for it.',
      modernText: 'A hypnotic with a narrow margin between sleep and depressed breathing.',
    }),
  tx('drug-laudanum', 'drugs', 'Laudanum',
    'Ten drops as needed. Quiets pain and the nerves.', 90, {
      quality: 2, patientAcceptance: 6, recovery: -2, cost: -4,
      immediateText: 'The relief is immediate and obvious.',
      monthText: 'A month later the drops are taken oftener than directed and are harder to leave off.',
      modernText: 'Opium relieves distress and builds dependence; the complaint is unchanged.',
    }),
  tx('drug-morphine', 'drugs', 'Morphine, hypodermic',
    'A quarter grain by needle. Certain relief; the habit forms readily.', 240, {
      quality: 1, patientAcceptance: 8, recovery: -4, cost: -6,
      immediateText: 'The needle works within minutes and the gratitude is immediate.',
      monthText: 'A month later the injections are a fixed part of the day and the dose has risen.',
      modernText: 'Iatrogenic opioid dependence, well recognised by 1896 and prescribed anyway.',
    }),
  tx('drug-cannabis', 'drugs', 'Cannabis indica',
    'Five drops of the tincture. Relieves nervous agitation.', 175, {
      quality: 3, patientAcceptance: 4, recovery: 0, cost: -3,
      immediateText: 'The tincture is taken without complaint.',
      monthText: 'A month later the tincture has quieted some evenings and unsettled others.',
      modernText: 'Unstandardised potency; effects varied from batch to batch.',
    }),
  tx('drug-coca-wine', 'drugs', 'Coca wine',
    'A glass with meals. A restorative tonic.', 110, {
      quality: 2, patientAcceptance: 7, recovery: -3, cost: -4,
      immediateText: 'The tonic is pleasant and the patient feels the benefit at once.',
      monthText: 'A month later the tonic is taken daily, and the hours between doses are worse than before.',
      modernText: 'Cocaine, sold as a restorative. The rebound is mistaken for the original illness.',
    }),
  tx('drug-stop-tonic', 'drugs', 'Stop the tonic',
    'Withdraw the coca wine or patent cordial and explain why.', 0, {
      quality: 8, patientAcceptance: 0, recovery: 5, cost: -1,
      immediateText: 'Being told to give up the one thing that helps is not welcome.',
      monthText: 'A month later the daily cycle of relief and collapse has broken.',
      modernText: 'Removing a stimulant ends the withdrawal cycle that was driving the symptoms.',
    }),
  tx('drug-iron-arsenic', 'drugs', 'Iron and arsenic',
    'Fowler’s solution, three drops. For debility and poor colour.', 80, {
      quality: 4, patientAcceptance: 4, recovery: 1, cost: -2,
      immediateText: 'A tonic is what the patient expected to be given.',
      monthText: 'A month later the colour is a little better and nothing else has changed.',
      modernText: 'Iron helps genuine anaemia. The arsenic does nothing but accumulate.',
    }),
  tx('drug-iodide', 'drugs', 'Potassium iodide',
    'Given to drive out a metallic poison.', 140, {
      quality: 5, patientAcceptance: 4, recovery: 2, cost: -2,
      immediateText: 'A definite remedy for a definite poison sounds like medicine.',
      monthText: 'A month later the treatment has done what it can while the exposure continues.',
      modernText: 'Iodide mobilises stored lead, but re-exposure refills the store.',
    }),
  tx('drug-digitalis', 'drugs', 'Digitalis',
    'For a heart believed to be failing.', 130, {
      quality: 2, patientAcceptance: 4, recovery: -3, cost: -3,
      immediateText: 'A heart remedy confirms the patient’s worst reading of the case.',
      monthText: 'A month later the patient is more frightened of her heart than before.',
      modernText: 'A powerful cardiac drug given to a sound heart, with a narrow safety margin.',
    }),
  tx('drug-valerian', 'drugs', 'Valerian',
    'A dram of the tincture. Soothes nervous tension.', 55,
    inert('A month later the valerian has made no difference anyone can name.')),

  /* ---------------- rest ---------------- */
  tx('rest-hour-lying', 'rest', 'An hour lying down',
    'Daily after dinner, curtains drawn.', 0, {
      quality: 5, patientAcceptance: 5, recovery: 2, cost: 0,
      immediateText: 'A small, possible instruction that costs her nothing.',
      monthText: 'A month later the daily hour has been kept and is mildly restorative.',
      modernText: 'Modest, sustainable rest with none of the harms of enforced seclusion.',
    }),
  tx('rest-cure-home', 'rest', 'Rest cure at home',
    'Six weeks in bed. No reading, no visitors, no letters.', 400, {
      quality: 4, patientAcceptance: 1, recovery: 1, cost: -12,
      immediateText: 'She is relieved the condition has a recognised regimen, and plainly afraid of what it costs.',
      monthText: 'A month later the symptoms are quieter in seclusion and the patient’s position is gone.',
      modernText: 'Enforced seclusion suppresses visible symptoms while removing work, income, and company.',
    }),
  tx('rest-cure-sanatorium', 'rest', 'Rest cure at a sanatorium',
    'Six weeks resident: seclusion, massage, feeding up, attendants.', 3800, {
      quality: 4, patientAcceptance: 0, recovery: 2, cost: -14,
      immediateText: 'The sum is named and the room goes quiet.',
      monthText: 'A month later the cost has fallen on the household and the gain is hard to point to.',
      modernText: 'The full Mitchell package, at a price that itself becomes the patient’s problem.',
    }),
  tx('rest-resort', 'rest', 'A fortnight at a resort',
    'Saratoga or the Catskills. Change of scene and regular hours.', 1600, {
      quality: 5, patientAcceptance: 6, recovery: 3, cost: -6,
      immediateText: 'A fortnight away sounds more like a gift than a treatment.',
      monthText: 'A month later the fortnight is remembered fondly and its effect has faded.',
      modernText: 'Rest and removal from routine stressors, for as long as it lasts.',
    }),
  tx('rest-seclusion-family', 'rest', 'Seclusion from the family',
    'One month. No callers, no letters.', 0, {
      quality: 4, patientAcceptance: -2, recovery: 0, cost: -5,
      immediateText: 'Being cut off from her people is not heard as care.',
      monthText: 'A month later the isolation has removed both the irritation and the support.',
      modernText: 'Mitchell’s key ingredient, and the one with the clearest social cost.',
    }),

  /* ---------------- diet ---------------- */
  tx('diet-milk', 'diet', 'Exclusive milk diet',
    'Four quarts daily and nothing else.', 220,
    inert('A month later the milk diet has been abandoned as impractical.', { patientAcceptance: 0, cost: -4 })),
  tx('diet-feeding-up', 'diet', 'Feeding up',
    'Cream, chops, and eggs every two hours.', 310, {
      quality: 5, patientAcceptance: 5, recovery: 3, cost: -4,
      immediateText: 'Being told to eat well is easy to accept and expensive to do.',
      monthText: 'A month later the patient has gained a little and the grocer’s bill has grown.',
      modernText: 'Genuine benefit where undernourishment is part of the picture.',
    }),
  tx('diet-beef-tea', 'diet', 'Beef tea',
    'Three times daily. Strengthens and supports.', 140,
    inert('A month later the beef tea has been taken faithfully and changed nothing.')),
  tx('diet-brandy', 'diet', 'Brandy',
    'A wineglass at noon and at night, as a stimulant.', 120, {
      quality: 2, patientAcceptance: 6, recovery: -2, cost: -3,
      immediateText: 'A prescription for spirits is received warmly.',
      monthText: 'A month later the wineglass has become two and the sleep is worse for it.',
      modernText: 'Prescribed alcohol was routine, and unhelpful for nearly everything it was given for.',
    }),
  tx('diet-cod-liver', 'diet', 'Cod liver oil',
    'A spoonful before meals.', 75,
    inert('A month later the oil has been taken and resented in equal measure.')),
  tx('diet-abstinence', 'diet', 'Abstinence',
    'No tea, coffee, tobacco, or excitement.', 0, {
      quality: 5, patientAcceptance: 1, recovery: 2, cost: -2,
      immediateText: 'A list of things to give up is heard as a reprimand.',
      monthText: 'A month later some of the list has been kept and the sleep is a little better.',
      modernText: 'Removing stimulants helps sleep; the moralising tone does not.',
    }),

  /* ---------------- exercise & air ---------------- */
  tx('exer-walking', 'exercise', 'Graduated walking',
    'A half mile daily, increased each week.', 0, {
      quality: 6, patientAcceptance: 4, recovery: 3, cost: 0,
      immediateText: 'It costs nothing and can be begun tomorrow.',
      monthText: 'A month later the walking has been kept up and the patient sleeps better for it.',
      modernText: 'Sustainable activity, one of the few period prescriptions that holds up.',
    }),
  tx('exer-gymnastics', 'exercise', 'Swedish movements',
    'Medical gymnastics with an attendant.', 600,
    inert('A month later the exercises have lapsed for want of an attendant.', { cost: -4 })),
  tx('exer-change-air', 'exercise', 'Change of air',
    'One month at the shore or in the country.', 1400, {
      quality: 5, patientAcceptance: 7, recovery: 3, cost: -7,
      immediateText: 'A month away is an appealing thing to be told to do.',
      monthText: 'A month later the change has helped and the return has undone much of it.',
      modernText: 'Removal from routine stressors, with no lasting effect once the routine resumes.',
    }),
  tx('exer-sea-voyage', 'exercise', 'A sea voyage',
    'Six weeks, Atlantic passage.', 6000, {
      quality: 4, patientAcceptance: 3, recovery: 2, cost: -15,
      immediateText: 'The suggestion is so far beyond her means that it lands as a joke.',
      monthText: 'A month later the voyage was never taken.',
      modernText: 'A prescription written for a class of patient this one does not belong to.',
    }),
  tx('exer-camp-cure', 'exercise', 'The camp cure',
    'Outdoor life, riding, rough living.', 2200, {
      quality: 5, patientAcceptance: 4, recovery: 4, cost: -9,
      immediateText: 'The plan is vigorous and sounds like something done to healthy men.',
      monthText: 'A month later the open air has done real good and the absence has cost real money.',
      modernText: 'The West cure: activity and daylight, prescribed to men for what put women to bed.',
    }),
  tx('exer-mountain-air', 'exercise', 'Mountain air',
    'The Adirondacks, through the summer.', 3000,
    inert('A month later the season in the mountains has not been arranged.', { cost: -12 })),

  /* ---------------- hydrotherapy ---------------- */
  tx('water-cold-sponge', 'water', 'Cold sponging',
    'On rising, briskly, followed by friction.', 0,
    inert('A month later the morning sponging is a habit and nothing more.', { cost: 0 })),
  tx('water-wet-pack', 'water', 'The wet pack',
    'Wrapped in sheets for an hour.', 100,
    inert('A month later the packs have been given up as troublesome.', { cost: -2 })),
  tx('water-sitz-bath', 'water', 'Sitz bath',
    'Tepid, twice daily.', 60,
    inert('A month later the baths have been taken without effect.')),
  tx('water-turkish-bath', 'water', 'Turkish bath',
    'Weekly, followed by an hour’s rest.', 200, {
      quality: 4, patientAcceptance: 6, recovery: 1, cost: -2,
      immediateText: 'A weekly bath is a pleasure as much as a treatment.',
      monthText: 'A month later the weekly bath is looked forward to and has changed little else.',
      modernText: 'Relaxation and an hour of enforced rest; no specific effect.',
    }),
  tx('water-warm-bath', 'water', 'Continuous warm bath',
    'For excitement and agitation.', 350, {
      quality: 5, patientAcceptance: 4, recovery: 2, cost: -3,
      immediateText: 'The bath quiets the patient while she is in it.',
      monthText: 'A month later the baths have been calming and have not altered the course.',
      modernText: 'Effective sedation for acute agitation, with no lasting action.',
    }),
  tx('water-cure-course', 'water', 'A course at a water cure',
    'A fortnight, resident.', 2400,
    inert('A month later the course was not affordable.', { cost: -11 })),

  /* ---------------- electrotherapy ---------------- */
  tx('elec-general-faradization', 'electricity', 'General faradization',
    'Beard’s method, head to foot, thrice weekly.', 300, {
      quality: 4, patientAcceptance: 7, recovery: 1, cost: -4,
      immediateText: 'The apparatus is impressive and the patient leaves feeling treated.',
      monthText: 'A month later the sittings have been faithfully kept and the benefit is hard to separate from the attention.',
      modernText: 'No specific effect. The ritual, the touch, and the regular appointment do the work.',
    }),
  tx('elec-local-faradization', 'electricity', 'Local faradization',
    'Ten minutes to the affected part.', 180,
    inert('A month later the applications have made no difference to the part treated.', { patientAcceptance: 5, cost: -3 })),
  tx('elec-galvanization', 'electricity', 'Galvanization',
    'Constant current, ten minutes.', 220,
    inert('A month later the current has been applied regularly and changed nothing.', { patientAcceptance: 5, cost: -3 })),
  tx('elec-central-galvanization', 'electricity', 'Central galvanization',
    'Spine and head, Beard’s technique.', 340,
    inert('A month later the course is complete and the complaint is where it was.', { patientAcceptance: 5, cost: -4 })),
  tx('elec-static', 'electricity', 'Static electricity',
    'The machine — sparks and the electric breeze.', 400, {
      quality: 3, patientAcceptance: 9, recovery: 1, cost: -4,
      immediateText: 'The sparks and the crackle are the most impressive thing in the practice.',
      monthText: 'A month later the patient speaks warmly of the machine and is otherwise unchanged.',
      modernText: 'Pure theatre, and unusually effective theatre.',
    }),
  tx('elec-bath', 'electricity', 'The electric bath',
    'Current passed through the water.', 500,
    inert('A month later the baths have been completed without incident or benefit.', { patientAcceptance: 6, cost: -5 })),

  /* ---------------- mind & suggestion ---------------- */
  tx('mind-hypnotic-suggestion', 'suggestion', 'Hypnotic suggestion',
    'The symptom addressed directly under trance.', 300, {
      quality: 6, patientAcceptance: 5, recovery: 4, cost: -2,
      immediateText: 'The procedure is strange and the patient submits to it with some hope.',
      monthText: 'A month later the symptom has receded, though neither of you can say for how long.',
      modernText: 'Direct suggestion works on symptoms that are themselves suggestible.',
    }),
  tx('mind-hypnotic-investigation', 'suggestion', 'Hypnotic investigation',
    'Reproduce the state and question it.', 300, {
      quality: 5, patientAcceptance: 3, recovery: -2, cost: -2,
      immediateText: 'The patient is hopeful the strange state might finally be made intelligible.',
      monthText: 'A month later the sittings have produced elaborate accounts that vary with the questions.',
      modernText: 'Repeated suggestive questioning contaminates the account and reinforces the symptom.',
    }),
  tx('mind-persuasion', 'suggestion', 'Persuasion',
    'Tell the patient plainly what you believe is happening.', 0, {
      quality: 7, patientAcceptance: 4, recovery: 4, cost: 0,
      immediateText: 'A plain explanation is more than the patient has been given before.',
      monthText: 'A month later the explanation has held and the fear around the symptom has eased.',
      modernText: 'Explanation reduces the fear that maintains the symptom. It costs nothing.',
    }),
  tx('mind-companionship', 'suggestion', 'Companionship and occupation',
    'Regular company and work enough to fill the day.', 0, {
      quality: 6, patientAcceptance: 8, recovery: 3, cost: 0,
      immediateText: 'The advice is kind and easy to accept.',
      monthText: 'A month later the patient is less alone and the underlying trouble is untouched.',
      modernText: 'Real benefit to mood, and no effect on a physical cause if there is one.',
    }),
  tx('mind-moral-management', 'suggestion', 'Moral management',
    'Firm authority. No indulgence of the symptom.', 0, {
      quality: 3, patientAcceptance: -6, recovery: -2, cost: -2,
      immediateText: 'The firmness is heard as disbelief.',
      monthText: 'A month later the patient has stopped reporting the symptom and has not stopped having it.',
      modernText: 'Suppressed reporting is mistaken for improvement.',
    }),
  tx('mind-remove-influence', 'suggestion', 'Remove the suggestive influence',
    'End the sittings, the circle, or the company that feeds it.', 0, {
      quality: 8, patientAcceptance: 2, recovery: 6, cost: -2,
      immediateText: 'She is asked to give up the one place she is taken seriously.',
      monthText: 'A month later the episodes have grown less frequent away from the setting that rewarded them.',
      modernText: 'Removing the social reinforcement removes most of the symptom.',
    }),
  tx('mind-endorse', 'suggestion', 'Endorse the patient’s account',
    'Accept the explanation the patient brings and develop it.', 0, {
      quality: 0, patientAcceptance: 13, recovery: -7, cost: -5,
      immediateText: 'She leaves feeling believed, and says you understood what other doctors would have mocked.',
      monthText: 'A month later she is more certain than ever, and worse.',
      modernText: 'Endorsement reinforces the belief and the setting that maintain the symptom.',
    }),
  tx('mind-dismiss', 'suggestion', 'Dismiss the complaint',
    'Offer no treatment and warn the patient to stop performing.', 0, {
      quality: 0, patientAcceptance: -22, recovery: -5, cost: -4,
      immediateText: 'The fee is left on the desk only after a reminder.',
      modernText: 'Accusation removes clinical support and drives the patient toward whoever will believe them.',
      monthText: 'A month later the patient has not returned and is worse.',
    }),
  tx('mind-planchette', 'suggestion', 'Planchette, observed',
    'Record the writing under your own eye, as investigation.', 0, {
      quality: 6, patientAcceptance: 5, recovery: -1, cost: -1,
      immediateText: 'Being studied rather than doubted is a relief.',
      monthText: 'A month later you have a careful record and the patient is unchanged.',
      modernText: 'Good observation, no treatment. The record may be worth more than the visit.',
    }),

  /* ---------------- removal & change ---------------- */
  tx('move-leave-trade', 'removal', 'Leave the trade',
    'Give up the occupation entirely.', 0, {
      quality: 7, patientAcceptance: -4, recovery: 7, cost: -13,
      immediateText: 'The instruction is correct and lands as a sentence.',
      monthText: 'A month later the exposure has stopped and so has the wage.',
      modernText: 'Removes the cause completely, at a cost the patient may not survive economically.',
    }),
  tx('move-lighter-work', 'removal', 'Lighter work at the same trade',
    'Fewer hours of the worst of it; wages preserved.', 0, {
      quality: 9, patientAcceptance: 7, recovery: 6, cost: -1,
      immediateText: 'A plan that protects both the health and the wage is heard with visible relief.',
      monthText: 'A month later the exposure is much reduced and the position is intact.',
      modernText: 'Reduces the causal exposure without imposing destitution.',
    }),
  tx('move-reduced-hours', 'removal', 'Reduced hours',
    'Half days for one month.', 0, {
      quality: 6, patientAcceptance: 4, recovery: 3, cost: -5,
      immediateText: 'Half wages for half days is a arithmetic she does in her head.',
      monthText: 'A month later the shorter days have helped and the short pay has not.',
      modernText: 'Partial reduction of exposure, with a proportionate loss of income.',
    }),
  tx('move-lodgings', 'removal', 'Change of lodgings',
    'Away from the damp, the noise, or the neighbours.', 800, {
      quality: 5, patientAcceptance: 3, recovery: 2, cost: -5,
      immediateText: 'Moving is expensive and the patient says so.',
      monthText: 'A month later the new rooms are better and the rent is higher.',
      modernText: 'Helps where housing is genuinely part of the cause.',
    }),
  tx('move-own-room', 'removal', 'A room of her own',
    'Separated from the household.', 1200,
    inert('A month later the move was not made.', { cost: -8 })),
  tx('move-country', 'removal', 'The country for a season',
    'Placed with relations.', 1800,
    inert('A month later the arrangement could not be made.', { cost: -10 })),
]);

const BY_ID = new Map(TREATMENT_LIBRARY.map((item) => [item.id, item]));

export function treatmentsInCategory(categoryId) {
  return TREATMENT_LIBRARY.filter((item) => item.categoryId === categoryId);
}

// A patient override replaces any field of the library entry, including the
// label, so a generic entry can carry case-specific wording.
export function resolveTreatment(patient, id) {
  const base = BY_ID.get(id);
  if (!base) return null;
  const override = patient?.treatmentOverrides?.[id];
  if (!override) return base;
  return {
    ...base,
    ...override,
    id: base.id,
    categoryId: base.categoryId,
    evaluation: { ...base.evaluation, ...(override.evaluation || {}) },
  };
}

export function resolveTreatmentPlan(patient, ids) {
  const treatments = (ids || []).map((id) => resolveTreatment(patient, id)).filter(Boolean);
  if (!treatments.length) return null;
  // The item that moves health furthest, either way, supplies the prose.
  const principal = treatments.reduce((best, item) => (
    Math.abs(item.evaluation.recovery || 0) > Math.abs(best.evaluation.recovery || 0) ? item : best
  ), treatments[0]);
  const harmful = treatments.filter((item) => (item.evaluation.recovery || 0) < 0).length;
  const sum = (key) => treatments.reduce((total, item) => total + (item.evaluation[key] || 0), 0);
  return {
    treatments,
    principal,
    feeCents: treatments.reduce((total, item) => total + (item.feeCents || 0), 0),
    evaluation: {
      // Best reasoning in the plan, less a point for each thing that harms her.
      quality: Math.max(0, Math.min(10,
        Math.max(...treatments.map((item) => item.evaluation.quality || 0)) - harmful)),
      patientAcceptance: sum('patientAcceptance'),
      recovery: Math.max(-10, Math.min(10, sum('recovery'))),
      cost: Math.max(-15, Math.min(5, sum('cost'))),
      immediateText: principal.evaluation.immediateText || '',
      monthText: principal.evaluation.monthText || '',
      modernText: principal.evaluation.modernText || '',
    },
  };
}

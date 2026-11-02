import { createModularVariation } from './modularVariants.js';
import { headwearVariation } from './headwearGeometry.js';
import { accessoryVariation } from './periodAccessories.js';
import { createRandom } from '../patients/random.js';

// Turns a generated patient profile into a modular model and look. The seed
// still varies the face; the profile decides what a viewer would read from
// the person: origin, age, class, and trade. These weights are guesses.

const COLOURING = {
  'old-stock-american': { skin: ['fairCool', 'fairWarm', 'rose'], hair: ['brown', 'chestnut', 'blond', 'auburn'], eyes: ['blue', 'gray', 'hazel', 'brown'] },
  'irish-american': { skin: ['fairCool', 'rose', 'fairWarm'], hair: ['auburn', 'brown', 'black', 'chestnut'], eyes: ['blue', 'gray', 'green'] },
  'german-american': { skin: ['fairWarm', 'fairCool', 'rose'], hair: ['blond', 'brown', 'chestnut'], eyes: ['blue', 'gray', 'hazel'] },
  'ashkenazi-jewish': { skin: ['fairWarm', 'golden', 'olive'], hair: ['black', 'brown', 'chestnut', 'auburn'], eyes: ['brown', 'hazel', 'green', 'blue'] },
  'eastern-european': { skin: ['fairWarm', 'fairCool', 'golden'], hair: ['brown', 'blond', 'chestnut'], eyes: ['gray', 'blue', 'hazel'] },
  italian: { skin: ['golden', 'olive'], hair: ['black', 'brown'], eyes: ['brown', 'hazel'] },
  'african-american': { skin: ['umber', 'deep', 'golden'], hair: ['black'], eyes: ['brown'] },
  'chinese-american': { skin: ['golden', 'fairWarm'], hair: ['black'], eyes: ['brown'] },
};

const HEAVY_WORK = /laborer|porter|railroad|factory|engine|driver|teamster|stevedore/;
const TRADE = /tradesman|printer|painter|engraver|tailor|carpenter|vendor|peddler|attendant|smith|mechanic/;
const DESK_WORK = /clerk|bookkeeper|stenographer|telegraph|engraver|teacher|governess|physician|attorney|writer|student|editor|tailor|dressmaker|seamstress/;
const WOMEN_AT_WORK = /servant|laundress|seamstress|dressmaker|factory|attendant|vendor|boardinghouse/;

export function lookForProfile(profile) {
  const male = profile.identity.sex === 'male';
  const age = profile.identity.age;
  const classId = profile.social.classId;
  const trade = `${profile.social.occupationId || ''} ${profile.social.occupation || ''}`.toLowerCase();
  const random = createRandom(profile.seed, 'modular-look');
  const base = createModularVariation(profile.seed, male);
  const colouring = COLOURING[profile.identity.origin?.id] || COLOURING['old-stock-american'];
  const wealthy = classId === 'elite' || classId === 'affluent';

  let model;
  let outfit;
  if (male) {
    if (HEAVY_WORK.test(trade)) [model, outfit] = ['male-worker-template', 'work-shirt'];
    else if (TRADE.test(trade) || classId === 'sponsored') [model, outfit] = [random.pick(['male-lean-template', 'male-broad-template']), random.chance(.3) ? 'canvas-apron' : 'work-shirt'];
    else [model, outfit] = [wealthy && age >= 40 && random.chance(.6) ? 'male-broad-template' : random.pick(['male-lean-template', 'male-broad-template']), 'tailored-clothes'];
  } else {
    model = random.pick(['carmela-russo', 'seamstress-prototype']);
    outfit = WOMEN_AT_WORK.test(trade) || classId === 'sponsored' ? 'work-apron' : 'day-dress';
  }

  let hairTone = random.pick(colouring.hair);
  if (age >= 60) hairTone = random.pick(['silver', 'mixedGray']);
  else if (age >= 45 && random.chance((age - 40) / 25)) hairTone = 'mixedGray';

  let hairStyle;
  if (male) {
    hairStyle = age < 35 ? 'short-side-part'
      : age < 50 ? random.pick(['short-side-part', 'receding-sweep'])
        : random.pick(['receding-sweep', 'receding-sweep', 'bald']);
  } else {
    hairStyle = age < 35 ? random.pick(['soft-side-waves', 'braided-knot', 'curled-side-rolls', 'center-chignon'])
      : random.pick(['center-chignon', 'waved-knot', 'soft-side-waves']);
  }

  const range = classId === 'sponsored' ? 'plain' : classId === 'elite' ? 'dress' : 'everyday';
  const accessories = accessoryVariation(profile.seed, male ? 'men' : 'women', range, outfit);
  const glassesChance = (DESK_WORK.test(trade) ? .45 : .08) + (age >= 50 ? .25 : 0);
  accessories.glassesStyle = random.chance(glassesChance)
    ? random.pick(['round', 'oval', 'pince-nez', ...(range === 'dress' ? ['rimless'] : [])])
    : 'none';

  const hatClass = wealthy ? 'affluent' : classId === 'comfortable' ? 'middle' : 'working';
  const hat = headwearVariation(profile.seed, male ? 'men' : 'women', hatClass);
  const household = profile.social.household || {};
  if (!male && household.spouseDeceased && random.chance(.6)) Object.assign(hat, { hatStyle: 'mourning-bonnet', hatColor: 'black' });

  const body = male ? {
    bellySize: wealthy && age >= 40 ? random.pick([.3, .7, 1]) : HEAVY_WORK.test(trade) ? random.pick([-.5, 0]) : random.pick([-.5, 0, .3]),
    waistWidth: wealthy && age >= 40 ? random.pick([0, .3]) : random.pick([-.3, 0]),
    // Young men in 1896 were often clean-shaven or wore a small moustache.
    sideburns: age < 30 ? random.pick(['none', 'none', 'short-sideburns']) : base.sideburns,
    moustache: age < 22 ? 'none' : age < 30 ? random.pick(['none', 'neat-moustache']) : base.moustache,
  } : {};

  return {
    model,
    look: {
      ...base,
      ...accessories,
      ...hat,
      ...body,
      outfit,
      hairStyle,
      hairTone,
      skinTone: random.pick(colouring.skin),
      eyeTone: random.pick(colouring.eyes),
      palette: classId === 'sponsored' ? random.pick(['original', 'taupe']) : base.palette,
    },
  };
}

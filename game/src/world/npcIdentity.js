// Procedural identity roll for park NPCs. Each archetype has pools of names,
// professions, and circumstances; the seed picks one combination, so the same
// stranger keeps the same life all playthrough and rerolls next playthrough.
//
// DRAFT CONTENT: the period names and occupations below need Ben's review
// before they are treated as settled (docs/decisions.md, historical content).

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const part of parts) {
    h ^= Math.imul(Math.trunc(part) & 0xffffffff, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

export function pickSeeded(list, seed, salt) {
  if (!list || list.length === 0) return null;
  return list[hashSeed(seed, salt) % list.length];
}

// Stable numeric seed for actors identified by string id (police posts,
// hotel doors), so their rolled identity survives re-renders.
export function hashString(text) {
  let h = 2166136261;
  for (const char of String(text)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const MEN_FIRST = [
  'Patrick', 'Michael', 'Thomas', 'George', 'William', 'James', 'Daniel',
  'John', 'Edward', 'Charles', 'Frank', 'Henry', 'Joseph', 'Martin',
  'Peter', 'Hugh', 'Owen', 'Walter', 'Albert', 'Stephen', 'Donald',
];

const WOMEN_FIRST = [
  'Mary', 'Margaret', 'Ellen', 'Bridget', 'Catherine', 'Annie', 'Julia',
  'Agnes', 'Sarah', 'Nora', 'Rose', 'Lizzie', 'Hannah', 'Grace', 'Emma',
  'Louisa', 'Martha', 'Delia', 'Maud', 'Alice',
];

const SURNAMES = [
  'Nolan', 'Brennan', 'Kelly', 'Byrne', 'Doyle', 'Murphy', 'Sullivan',
  'Walsh', 'Gallagher', 'Reilly', 'Costello', 'Fitzpatrick', 'Schmidt',
  'Muller', 'Hoffman', 'Weber', 'Meyer', 'Baker', 'Turner', 'Clark',
  'Harris', 'Price',
];

// Professions and circumstances per archetype. The archetype comes from the
// character model, so a rolled person always fits what the player sees.
// Composure is the stat behind reactions to street incidents: high composure
// shrugs off what leaves low composure shaken. Quirks are occasional visible
// habits; null slots mean most people have none.
const ARCHETYPES = {
  m: {
    sex: 'male',
    ages: [24, 58],
    composure: [0.4, 0.8],
    quirks: ['gallant', 'quarrelsome', 'flower-fancier', null, null, null],
    professions: [
      'clerk in a dry-goods house', 'bookkeeper', 'insurance man',
      'law copyist', 'shipping clerk', 'printer', 'telegraph operator',
    ],
    details: [
      'walks through the park to spare the streetcar fare',
      'has sore feet and firm opinions on the price of a decent lunch',
      'counts the park path the only quiet quarter hour of his day',
      'reads two newspapers a day and trusts neither',
    ],
  },
  w: {
    sex: 'female',
    ages: [20, 45],
    composure: [0.35, 0.7],
    quirks: ['flower-fancier', null, null, null],
    professions: [
      'dressmaker', 'laundress', 'shop girl at a Broadway counter',
      'milliner’s assistant', 'seamstress paid by the piece',
    ],
    details: [
      'is carrying work between households and short on daylight',
      'knows every shortcut through the park',
      'is on a rare hour off and determined to enjoy it',
      'is saving a little each week against the winter',
    ],
  },
  f: {
    sex: 'female',
    ages: [40, 55],
    composure: [0.25, 0.55],
    quirks: ['flower-fancier', 'flower-fancier', null, null],
    professions: [
      'boarding-house keeper', 'schoolteacher of long standing',
      'doctor’s wife', 'dressmaker with her own shop',
    ],
    details: [
      'walks daily for her constitution and knows half the regular faces here',
      'is fond of the flower beds and of correcting people gently',
      'has a girl minding the kitchen while she takes the air',
      'has buried two husbands and outlasted three landlords',
    ],
  },
  h: {
    sex: 'female',
    ages: [19, 32],
    composure: [0.35, 0.7],
    quirks: ['flower-fancier', null, null],
    professions: [
      'stenographer', 'shop girl', 'schoolteacher lately arrived from Albany',
      'typewriter operator in a law office',
    ],
    details: [
      'takes her lunch in the park in fine weather and reads serialized novels',
      'is saving toward a bicycle of her own',
      'is still charmed by nearly everything in the city',
      'writes home every Sunday and embellishes very little',
    ],
  },
  s: {
    sex: 'female',
    ages: [28, 60],
    composure: [0.2, 0.5],
    quirks: ['flower-fancier', null, null, null],
    professions: [
      'widow of a clerk', 'widow of a policeman', 'in mourning for a brother',
      'lately bereaved of her sister',
    ],
    details: [
      'walks because the house is too quiet to sit in',
      'comes to the park because the departed was fond of it',
      'finds the company of strangers easier than that of friends just now',
    ],
  },
  // The scheduled park keeper: always a park man, name and temper rolled.
  g: {
    sex: 'male',
    ages: [38, 60],
    composure: [0.6, 0.9],
    quirks: ['flower-fancier', 'quarrelsome', null],
    professions: ['park gardener', 'park maintenance man'],
    details: [
      'is proud of the planting beds and quietly scornful of anyone who walks across them',
      'has kept these paths for years and remembers when the trees were saplings',
      'holds that the park is the one honest piece of work in the city',
    ],
  },
  // A patrolman on post. On duty, civil, and not to be drawn far from it.
  p: {
    sex: 'male',
    ages: [28, 52],
    composure: [0.85, 1],
    quirks: [null],
    professions: ['patrolman on this post', 'roundsman of the precinct'],
    details: [
      'is on duty and answers shortly, though not unkindly',
      'knows every regular face on this stretch and misses little',
      'has walked this post long enough to have opinions about the traffic',
    ],
  },
  // A young woman in a summer dress. Shares the letter the model catalog
  // uses for her rig, so a bench sitter rolls as herself.
  d: {
    sex: 'female',
    ages: [19, 34],
    composure: [0.35, 0.7],
    quirks: ['flower-fancier', null, null],
    professions: [
      'shop girl', 'stenographer', 'music teacher', 'clerk in a photographer’s studio',
    ],
    details: [
      'is out in her good dress and means to enjoy the afternoon',
      'meets a friend on this bench most fine days',
      'is newly engaged and not yet tired of saying so',
    ],
  },
  l: {
    sex: 'female',
    ages: [24, 44],
    composure: [0.4, 0.75],
    quirks: ['flower-fancier', null, null],
    professions: [
      'clergyman’s wife', 'music teacher', 'draper’s bookkeeper',
      'matron of a girls’ boarding house', 'wife of a Broadway clerk',
    ],
    details: [
      'takes the same walk each afternoon and notices when anything is out of place',
      'is on her way to call on a friend and has the hour to spare',
      'keeps a subscription at Mudie’s and reads faster than it can supply her',
      'has opinions about the state of the walks and has written to say so',
    ],
  },
  // A hotel doorman at his door. Two letters: the single letters are the
  // model-catalog rig keys, and 'd' is already the summer-dress woman.
  dm: {
    sex: 'male',
    ages: [30, 55],
    composure: [0.6, 0.9],
    quirks: [null],
    professions: ['hotel doorman'],
    details: [
      'cannot leave his door and keeps one eye on it while he talks',
      'prides himself on knowing a guest from a passerby at forty paces',
      'has held this door through three managers and two renamings',
    ],
  },
  // A fashionable young man idling where he can be seen.
  y: {
    sex: 'male',
    ages: [22, 35],
    composure: [0.45, 0.75],
    quirks: ['gallant', 'gallant', 'quarrelsome', null],
    professions: ['gentleman of leisure', 'young man lately down from Harvard', 'junior partner in his father’s firm'],
    details: [
      'is chiefly occupied in being seen at the right hour',
      'has opinions on tailoring and shares them freely',
      'is waiting for a friend who is characteristically late',
    ],
  },
  // A boy at play in a sailor suit.
  b: {
    sex: 'male',
    ages: [8, 12],
    composure: [0.5, 0.85],
    quirks: [null],
    professions: ['schoolboy'],
    details: [
      'is at play and half-minded to run off mid-sentence',
      'knows the park better than any grown person and says so',
      'is meant to be home by supper and knows it',
    ],
  },
  // A pushcart vendor working the streets by the park. The name pools follow
  // the trade as it actually was in 1896 New York.
  v: {
    sex: 'male',
    ages: [25, 60],
    composure: [0.45, 0.8],
    quirks: ['quarrelsome', null, null],
    firstNames: ['Giuseppe', 'Salvatore', 'Antonio', 'Luigi', 'Pasquale', 'Abraham', 'Isaac', 'Samuel', 'Moses', 'Jacob'],
    surnames: ['Russo', 'Esposito', 'Marino', 'Greco', 'Ferrara', 'Cohen', 'Levy', 'Katz', 'Blum', 'Stein'],
    professions: ['fruit peddler', 'vegetable peddler', 'hokey-pokey man selling ice cream', 'pretzel seller'],
    details: [
      'counts every apple and knows which policeman will move him along',
      'has held this corner three years and means to keep it',
      'is saving toward a store with a roof, a real one',
      'lost half a cart of goods to a wagon once and still watches the traffic sideways',
    ],
  },
  // A cab driver waiting on a fare or up on the box.
  c: {
    sex: 'male',
    ages: [25, 60],
    composure: [0.55, 0.85],
    quirks: ['quarrelsome', 'gallant', null, null],
    professions: ['hansom cab driver', 'hackman with his own rig', 'coachman for hire'],
    details: [
      'knows every hotel door and theater time in the city',
      'has strong words for the horseless carriage and gives them freely',
      'treats his horse better than most men treat their families',
      'can tell a good tipper at half a block',
    ],
  },
  // A newsboy crying the papers.
  x: {
    sex: 'male',
    ages: [9, 15],
    composure: [0.55, 0.9],
    quirks: [null],
    professions: ['newsboy'],
    details: [
      'shouts the headlines all day and believes about half of them',
      'sleeps at the Newsboys’ Lodging House and is proud to pay his own way',
      'can size up whether a man will buy before the man knows it himself',
    ],
  },
  // A nursemaid airing her charge in a perambulator.
  n: {
    sex: 'female',
    ages: [18, 35],
    composure: [0.3, 0.6],
    quirks: ['flower-fancier', null, null],
    professions: ['nursemaid to a family on Fifth Avenue', 'nanny for a doctor’s household', 'nursemaid, second girl of the house'],
    details: [
      'walks the same loop each fair morning so the baby will sleep',
      'knows every other nursemaid on this stretch by first name',
      'sends most of her wages home and does not say so',
      'is firm that the park air does more good than any tonic',
    ],
  },
  // A wheelwoman: the bicycle craze of the nineties, on the park drives.
  r: {
    sex: 'female',
    ages: [18, 32],
    composure: [0.45, 0.8],
    quirks: ['flower-fancier', null, null],
    professions: ['stenographer who rides before work', 'schoolteacher', 'clubwoman of the cycling set'],
    details: [
      'rides a drop-frame safety and is saving toward a better one',
      'hears opinions about women awheel from perfect strangers, and returns them',
      'learned to ride in an academy hall last winter and now outpaces her brothers',
      'holds that the wheel has done more for women than a decade of speeches',
    ],
  },
  // An old veteran taking the sun on a bench, thirty years after the war.
  o: {
    sex: 'male',
    ages: [52, 74],
    composure: [0.75, 1],
    quirks: ['flower-fancier', null, null],
    professions: ['war pensioner', 'retired harness maker and war veteran', 'veteran, late of the Grand Army post'],
    details: [
      'served in the war and will say more if asked, and less if pressed',
      'walks to this bench every fair day and considers it his',
      'remembers the park when the trees were half this size',
      'measures every public man against the ones he buried',
    ],
  },
};

const TEMPERAMENTS = [
  'plainspoken and a little dry',
  'civil but brisk',
  'warm and inclined to chat',
  'reserved until drawn out',
  'cheerful and easily amused',
  'tired, but patient with a stranger',
];

// Deterministic roll: same archetype and seed give the same person. A visual
// age from the character model wins over the rolled one when provided.
export function rollIdentity(archetype, identitySeed, { age } = {}) {
  const table = ARCHETYPES[archetype];
  if (!table) return null;
  const seed = Math.trunc(identitySeed ?? 1);
  const first = pickSeeded(
    table.firstNames ?? (table.sex === 'male' ? MEN_FIRST : WOMEN_FIRST),
    seed,
    11,
  );
  const surname = pickSeeded(table.surnames ?? SURNAMES, seed, 12);
  const [low, high] = table.ages;
  const [calm, calmer] = table.composure ?? [0.4, 0.8];
  return {
    name: `${first} ${surname}`,
    sex: table.sex,
    age: Number.isFinite(age) ? Math.trunc(age) : low + (hashSeed(seed, 13) % (high - low + 1)),
    profession: pickSeeded(table.professions, seed, 14),
    detail: pickSeeded(table.details, seed, 15),
    temperament: pickSeeded(TEMPERAMENTS, seed, 16),
    composure: calm + (hashSeed(seed, 17) % 1000) / 1000 * (calmer - calm),
    quirk: pickSeeded(table.quirks ?? [null], seed, 18),
  };
}

export function knownArchetype(archetype) {
  return Object.hasOwn(ARCHETYPES, archetype);
}

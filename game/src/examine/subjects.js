// A close look at something nobody wrote a record for.
//
// Everything in the world cannot be authored one object at a time, so a picked
// thing is classified from what the simulation already knows about it — its
// model or its finish, its measured size, where it stands — and the class
// supplies the observations. The roll is seeded on the object's own id, so the
// same boulder reads the same way every time anybody looks at it.
//
// The authored records in examinables.js take precedence: those are the three
// objects that carry the story. This is for everything else.
//
// DRAFT content, like examinables.js. The detail is ordinary — schist banding,
// coal soot, the wear on a bench — but none of it is verified.

const FEET = 3.280839895;

function hash01(text, salt = 0) {
  let total = salt;
  for (let i = 0; i < text.length; i += 1) total = (total * 31 + text.charCodeAt(i)) | 0;
  const value = Math.sin(Math.abs(total) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** One of `list`, chosen by the subject's own id. Same id, same choice. */
function roll(list, id, salt = 0) {
  return list[Math.floor(hash01(id, salt) * list.length) % list.length];
}

// Period measure. A physician of 1896 reaches for inches and feet, and a
// number the player can picture beats a decimal.
export function measure(metres) {
  const inches = metres * 39.3700787;
  if (inches < 1) return 'under an inch';
  if (inches < 24) {
    const whole = Math.round(inches * 2) / 2;
    return `${whole % 1 === 0 ? whole : `${Math.floor(whole)}½`} inches`;
  }
  const feet = metres * FEET;
  if (feet < 10) {
    const whole = Math.floor(feet);
    const rest = Math.round((feet - whole) * 12);
    return rest === 0 ? `${whole} feet` : `${whole} feet ${rest} inches`;
  }
  return `some ${Math.round(feet / 5) * 5} feet`;
}

function span(item) {
  return Math.max(...(item.size ?? [0.3, 0.3, 0.3]));
}

// ---------------------------------------------------------------------------
// Classification. Every branch reads a field the world builders already set.

const MODEL_CLASSES = [
  [/grass|clover|flower|bush|meadow|plants__/i, 'plant'],
  [/bench/i, 'timber'],
  [/lamp|guardrail|railing|fence/i, 'ironwork'],
  [/tree|elm|oak|pine/i, 'tree'],
  [/chair|table|sofa|settee|stool|cabinet|desk/i, 'timber'],
];

export function classifySubject(item) {
  if (!item) return 'ground';
  if (item.subjectClass) return item.subjectClass;
  if (item.kind === 'tree' || item.shape === 'tree') return 'tree';
  if (item.kind === 'backdrop' || item.texture === 'brick') return 'masonry';
  if (item.texture === 'paving' || item.texture === 'road') return 'ground';
  const model = item.model ?? '';
  for (const [pattern, name] of MODEL_CLASSES) if (pattern.test(model)) return name;
  if (item.label || item.glass || /bottleGlass|bottleLiquid/.test(item.finish ?? '')) return 'glassware';
  const finish = item.finish ?? '';
  if (/brass|iron|steel/.test(finish) || item.metal) return 'ironwork';
  if (/mahogany|deal|plank|laboratoryDeal/.test(finish)) return 'timber';
  return 'thing';
}

// ---------------------------------------------------------------------------
// The classes. Each supplies a title, the free observation, three procedures,
// and the facts a custom question may draw on. `ctx` carries the measured size
// and the place; nothing here invents a number.

const CLASSES = {
  stone: {
    title: (ctx) => (ctx.metres >= 0.7 ? 'A boulder of schist' : 'A stone off the outcrop'),
    opening: (ctx) => `Grey rock, ${ctx.size} across, half sunk in the ground. `
      + `The face is banded, and the bands catch the light in flakes where the mica lies.`,
    procedures: [
      {
        id: 'grain', label: 'Look at the grain', minutes: 1,
        observation: (ctx) => `The bands run at a slant across the whole stone rather than lying flat, `
          + `and a seam of white quartz crosses them ${roll(['near the top', 'at one corner', 'down the middle'], ctx.id, 3)}. `
          + `The mica is what glitters; it comes away on a thumb.`,
        finding: () => ({ label: 'What it is', value: 'The mica schist the whole island stands on', confidence: 'probable' }),
      },
      {
        id: 'weather', label: 'Look at what grows on it', minutes: 1,
        observation: (ctx) => `${roll(['A grey-green crust of lichen', 'Rusty orange lichen', 'A dry pad of moss'], ctx.id, 7)} `
          + `covers the side away from the walk and stops short on the side the weather takes. `
          + `Underneath, the rock is damp and cold.`,
        finding: () => ({ label: 'How long it has lain here', value: 'Years undisturbed — lichen is slow', confidence: 'probable' }),
      },
      {
        id: 'marks', label: 'Look for marks', minutes: 1,
        observation: (ctx) => (ctx.metres >= 0.7
          ? 'Long parallel scratches run across the crown, all one way, too regular to be boots.'
          : 'The edges are rounded and the surface is scuffed pale where feet have gone over it.'),
        finding: (ctx) => (ctx.metres >= 0.7
          ? { label: 'The scratches', value: 'Cut by something that passed over it, not by use', confidence: 'uncertain' }
          : { label: 'Its wear', value: 'Rolled and walked on rather than freshly broken', confidence: 'certain' }),
      },
    ],
    facts: (ctx) => [
      `It is a grey banded rock, ${ctx.size} across, sitting half in the ground.`,
      'The banding runs at a slant and glitters in flakes where the mica lies.',
      'A seam of white quartz crosses the bands.',
      'Lichen covers the sheltered side and stops on the weather side.',
      'The underside is damp and cold.',
      'This is the schist the whole of Manhattan stands on; the park was laid out around outcrops of it rather than over them.',
      'Long parallel scratches on larger stones of this kind were left by something passing over them, not by use.',
      'Nothing here says who put it there, because nobody did.',
    ],
  },

  plant: {
    title: (ctx) => {
      const model = ctx.item.model ?? '';
      if (/flower/i.test(model)) return 'A patch of flowers';
      if (/bush/i.test(model)) return 'A bush';
      if (/clover/i.test(model)) return 'Grass and clover';
      return 'The grass';
    },
    opening: (ctx) => `Low growth, ${ctx.size} across where it is thickest, `
      + `and greener than the sward around it.`,
    procedures: [
      {
        id: 'close', label: 'Get down to it', minutes: 1,
        observation: (ctx) => `Close to, it is not one plant but four or five growing through one another. `
          + `${roll(['Clover is holding most of the ground.', 'A plantain rosette has flattened everything under it.', 'Half the blades are cut square where a scythe has been over.'], ctx.id, 41)}`,
        finding: () => ({ label: 'What is growing', value: 'A mixed sward, not a sown one', confidence: 'probable' }),
      },
      {
        id: 'insects', label: 'Watch it a minute', minutes: 2,
        observation: (ctx) => `${roll(['A bee works it in short hops and does not go far between flowers.', 'Small flies rise when a hand goes near and settle again at once.', 'A butterfly comes down, stays a moment, and goes on.'], ctx.id, 43)} `
          + 'Nothing here is disturbed by being watched.',
        finding: () => ({ label: 'What it feeds', value: 'Enough insects to be worth their while', confidence: 'certain' }),
      },
      {
        id: 'keeping', label: 'Look at the ground', minutes: 1,
        observation: () => 'Dry and pale between the stems, with the thatch of last year still lying under this year. '
          + 'Where feet cross it the growth gives out altogether and the earth is packed hard.',
        finding: () => ({ label: 'Its keeping', value: 'Cut but not watered, and worn where people cut across', confidence: 'probable' }),
      },
    ],
    facts: (ctx) => [
      `It is low green growth, about ${ctx.size} across where it is thickest.`,
      'Close to, it is four or five plants growing through one another rather than one.',
      'Some of it has been cut square by a scythe.',
      'Insects work it — bees, small flies, the occasional butterfly.',
      'The ground between the stems is dry and pale, with last year\'s thatch under this year\'s growth.',
      'Where people cut across it the growth gives out and the earth is packed hard.',
      'It is not watered.',
    ],
  },

  tree: {
    title: () => 'An elm',
    opening: (ctx) => `A grown elm, the trunk ${ctx.size} through at a man's chest, `
      + `the bark broken into long ridges. The crown goes up out of sight from here.`,
    procedures: [
      {
        id: 'bark', label: 'Look at the bark', minutes: 1,
        observation: () => 'The ridges are deep enough to lay a finger in, and grey-black in the bottom of them '
          + 'where the city\'s coal smoke has settled. Rubbed, the high parts come up brown.',
        finding: () => ({ label: 'The soot', value: 'Standing in city air, not country air', confidence: 'certain' }),
      },
      {
        id: 'girth', label: 'Judge its age', minutes: 2,
        observation: (ctx) => `Round the trunk is a little over ${measure(ctx.metres * Math.PI)}. `
          + 'An elm of this stand puts on about an inch of girth a year, which would make it a good deal older than the park it stands in.',
        finding: () => ({ label: 'Its age', value: 'Older than the park — planted or spared, not seeded here', confidence: 'uncertain' }),
      },
      {
        id: 'leaf', label: 'Take down a leaf', minutes: 1,
        observation: (ctx) => `The blade is lopsided at the base, one side running lower than the other, and toothed all round. `
          + `${roll(['Something has eaten a scallop out of the edge.', 'The underside is furred and holds the dust.', 'A gall the size of a pea sits on the midrib.'], ctx.id, 11)}`,
        finding: () => ({ label: 'The leaf', value: 'Elm — the uneven base settles it', confidence: 'certain' }),
      },
    ],
    facts: (ctx) => [
      `It is a grown elm with a trunk about ${ctx.size} through, in full June leaf.`,
      'The bark is broken into long deep ridges, grey-black in the bottoms with coal soot.',
      `The girth is a little over ${measure(ctx.metres * Math.PI)}.`,
      'An elm puts on roughly an inch of girth a year, so this one is likely older than the park around it.',
      'The leaves are toothed and lopsided at the base, which is how an elm is told.',
      'There is insect damage on some leaves.',
      'Nothing about the tree says who planted it or when.',
    ],
  },

  timber: {
    title: (ctx) => (/bench/i.test(ctx.item.model ?? '') ? 'A park bench' : 'A piece in wood'),
    opening: (ctx) => `Timber, ${ctx.size} across the longest way, `
      + `the paint worn back to bare grain wherever a hand or a coat has gone.`,
    procedures: [
      {
        id: 'surface', label: 'Look at the surface', minutes: 1,
        observation: (ctx) => `The grain stands proud where the soft wood between it has weathered away. `
          + `${roll(['Two sets of initials are cut into it, one over the other.', 'A knot has dropped out and left a hole a thumb would go into.', 'Somebody has scratched a date and rubbed most of it out again.'], ctx.id, 5)}`,
        finding: () => ({ label: 'Its use', value: 'In steady use, and long enough to be marked', confidence: 'certain' }),
      },
      {
        id: 'joints', label: 'Look at the joints', minutes: 1,
        observation: () => 'Bolted rather than jointed, and the iron has bled a rust stain into the wood around each head. '
          + 'One is proud of the surface and has been hammered flat more than once.',
        finding: () => ({ label: 'How it was made', value: 'Bolted, so it can be taken apart and mended', confidence: 'probable' }),
      },
      {
        id: 'wear', label: 'Feel where it is worn', minutes: 1,
        observation: () => 'Smooth and slightly hollowed in two places a shoulder\'s width apart, and rough everywhere else. '
          + 'The wear is on the sunny side.',
        finding: () => ({ label: 'Where people sit', value: 'Two places, both in the sun', confidence: 'certain' }),
      },
    ],
    facts: (ctx) => [
      `It is made of timber, about ${ctx.size} across the longest way.`,
      'The paint is worn back to bare grain wherever hands and coats go.',
      'The hard grain stands proud; the soft wood between it has weathered away.',
      'It is bolted rather than jointed, and each bolt head has bled rust into the wood.',
      'Two places a shoulder\'s width apart are worn smooth and slightly hollowed.',
      'The wear is on the side that gets the sun.',
      'There are cut marks — initials or a date — left by people who sat here.',
      'Nothing says who made it or who cut the marks.',
    ],
  },

  ironwork: {
    title: (ctx) => (/lamp/i.test(ctx.item.model ?? '') ? 'A gas standard' : 'Ironwork'),
    opening: (ctx) => `Cast iron, ${ctx.size} the long way, painted a dark green that has gone `
      + `nearly black. Cold to the hand even at this hour.`,
    procedures: [
      {
        id: 'paint', label: 'Look at the paint', minutes: 1,
        observation: (ctx) => `Blistered along the top surfaces and sound underneath. `
          + `${roll(['Rust is bleeding out from under a blister at the base.', 'Three coats show at a chip: green over green over red lead.', 'A run in the paint has set hard where somebody worked too fast.'], ctx.id, 13)}`,
        finding: () => ({ label: 'Its keeping', value: 'Painted more than once, and due again', confidence: 'certain' }),
      },
      {
        id: 'casting', label: 'Look at the casting', minutes: 1,
        observation: () => 'A mould seam runs the whole length, faint and unfiled, and the ornament repeats exactly. '
          + 'This came out of a pattern, one of many.',
        finding: () => ({ label: 'How it was made', value: 'Cast to a stock pattern, not wrought to order', confidence: 'certain' }),
      },
      {
        id: 'sound', label: 'Rap it with a knuckle', minutes: 1,
        observation: () => 'A short flat note with no ring behind it. Cast iron, and solid rather than hollow at this point.',
        finding: () => ({ label: 'The metal', value: 'Cast iron, solid where it was struck', confidence: 'probable' }),
      },
    ],
    facts: (ctx) => [
      `It is cast iron, about ${ctx.size} the long way, painted dark green gone nearly black.`,
      'It is cold to the hand.',
      'The paint is blistered on the upper surfaces and sound underneath; rust shows at the base.',
      'An unfiled mould seam runs its length and the ornament repeats exactly, so it came from a stock pattern.',
      'Rapped, it gives a short flat note with no ring: cast iron, solid at that point.',
      'Nothing on it carries a maker\'s name where it can be seen.',
    ],
  },

  masonry: {
    title: () => 'A wall',
    opening: (ctx) => `Brick and mortar, standing ${ctx.size} where it can be measured. `
      + `The face is darker than the mortar, and darker still under every projection.`,
    procedures: [
      {
        id: 'course', label: 'Read the courses', minutes: 1,
        observation: () => 'Headers every fifth course, and the mortar joints are thin and struck flat. '
          + 'The bricks vary in colour from one barrow-load to the next.',
        finding: () => ({ label: 'The work', value: 'Ordinary commercial bricklaying, well enough done', confidence: 'probable' }),
      },
      {
        id: 'soot', label: 'Try the soot', minutes: 1,
        observation: () => 'It comes off black on a finger and is heaviest on the sheltered faces, where no rain reaches it. '
          + 'Where the rain does reach, the brick is nearly its own colour again.',
        finding: () => ({ label: 'The staining', value: 'Coal smoke, laid on faster than the weather takes it off', confidence: 'certain' }),
      },
      {
        id: 'weather', label: 'Look at the damage', minutes: 1,
        observation: (ctx) => `${roll(['A course near the ground has spalled its faces off and shows raw red inside.', 'A crack steps down through the joints without cutting a single brick.', 'The mortar has washed back a finger\'s depth under the sill.'], ctx.id, 17)}`,
        finding: () => ({ label: 'Its condition', value: 'Water is getting in and has been for some time', confidence: 'probable' }),
      },
    ],
    facts: (ctx) => [
      `It is a brick wall, about ${ctx.size} where it can be measured.`,
      'Headers appear every fifth course; the joints are thin and struck flat.',
      'The bricks vary in colour between barrow-loads.',
      'Soot comes off black on a finger, heaviest on the faces the rain never reaches.',
      'Where rain washes the wall the brick is nearly its own colour.',
      'There is frost or water damage low down — spalled faces, or mortar washed back.',
      'Nothing on the wall names the builder or the date.',
    ],
  },

  ground: {
    title: () => 'The ground underfoot',
    opening: (ctx) => `${roll(['Rolled gravel, packed hard and pale.', 'Granite setts, worn round at the edges.', 'Beaten earth with the grass gone from it.'], ctx.id, 19)} `
      + `Dry at this hour, and dusty where the traffic goes over it.`,
    procedures: [
      {
        id: 'surface', label: 'Look at the surface', minutes: 1,
        observation: () => 'The fines have blown out from between the stones along the middle and banked at the sides. '
          + 'Boot marks show only where somebody stood still.',
        finding: () => ({ label: 'The surface', value: 'Kept up, but not swept lately', confidence: 'probable' }),
      },
      {
        id: 'traffic', label: 'Read the traffic', minutes: 1,
        observation: (ctx) => `Two wheel ruts a carriage-track apart, and between them ${roll(['a scatter of horse droppings gone dry', 'hoof marks cut deep where a team turned', 'the rounded prints of a walking horse'], ctx.id, 23)}. `
          + 'Foot traffic keeps to the edges.',
        finding: () => ({ label: 'Who uses it', value: 'Carriages down the middle, people at the sides', confidence: 'certain' }),
      },
      {
        id: 'edge', label: 'Look at the edge', minutes: 1,
        observation: () => 'Grass runs right up to the stones and then stops dead in a line. '
          + 'Beyond the line the growth is thick; on the walk itself nothing has taken.',
        finding: () => ({ label: 'Its keeping', value: 'The edge is cut deliberately and often', confidence: 'certain' }),
      },
    ],
    facts: (ctx) => [
      'It is a made surface — rolled gravel, setts, or beaten earth — dry and dusty at this hour.',
      'The fine material has blown out of the middle and banked at the sides.',
      'Two wheel ruts run down it a carriage-track apart, with horse traffic between them.',
      'Foot traffic keeps to the edges.',
      'The grass stops dead in a cut line where the walk begins.',
      'Nothing on the ground here says who passed most recently.',
    ],
  },

  water: {
    title: () => 'The water',
    opening: () => 'Still water, brown rather than green, taking the sky in the middle and '
      + 'nothing at all in the shade of the bank.',
    procedures: [
      {
        id: 'clarity', label: 'Look into it', minutes: 1,
        observation: () => 'A hand goes out of sight a foot down. What can be seen of the bottom is soft, and a step would raise it.',
        finding: () => ({ label: 'The water', value: 'A foot of clearness, and silt under that', confidence: 'certain' }),
      },
      {
        id: 'surface', label: 'Watch the surface', minutes: 1,
        observation: (ctx) => `${roll(['Insects work the film in short runs and leave dimples behind them.', 'A wind-line crosses it and dies against the far bank.', 'Pollen has drifted into a yellow scum along the lee side.'], ctx.id, 29)}`,
        finding: () => ({ label: 'The surface', value: 'Alive, and holding whatever the air drops on it', confidence: 'certain' }),
      },
      {
        id: 'edge', label: 'Look at the margin', minutes: 1,
        observation: () => 'A pale band of dried mud runs above the present level, a hand\'s width of it. '
          + 'The water has been higher this season and is not being kept up.',
        finding: () => ({ label: 'The level', value: 'Down a hand\'s width on its high mark', confidence: 'probable' }),
      },
    ],
    facts: () => [
      'It is still, brown rather than green, and reflects the sky except in the bank\'s shade.',
      'A hand goes out of sight about a foot down; the bottom is soft silt.',
      'Insects work the surface film.',
      'A pale band of dried mud a hand\'s width high runs above the present level.',
      'Nothing in the water says how deep it goes further out.',
    ],
  },

  glassware: {
    title: () => 'A glass vessel',
    opening: (ctx) => `Clear glass, ${ctx.size} tall, standing where somebody set it down. `
      + `Whatever is in it does not fill it.`,
    procedures: [
      {
        id: 'glass', label: 'Hold it to the light', minutes: 1,
        observation: (ctx) => `${roll(['Small bubbles are drawn out lengthwise in the wall.', 'A faint seam runs from base to shoulder on two sides.', 'The base is thick and carries a rough pontil scar.'], ctx.id, 31)} `
          + 'The glass has a green cast where it is thickest.',
        finding: (ctx) => ({ label: 'The glass', value: roll(['Blown, not moulded', 'Moulded in two parts', 'Blown into a mould'], ctx.id, 31), confidence: 'probable' }),
      },
      {
        id: 'contents', label: 'Look at the contents', minutes: 1,
        observation: () => 'A tidemark is dried on the inside above the present level, so it has stood a while at less than full. '
          + 'Nothing has settled out at the bottom.',
        finding: () => ({ label: 'The contents', value: 'Standing, and going down without being topped up', confidence: 'certain' }),
      },
      {
        id: 'stopper', label: 'Look at the mouth', minutes: 1,
        observation: () => 'The rim is chipped in one place and smooth everywhere else. '
          + 'Nothing closes it at present.',
        finding: () => ({ label: 'Its keeping', value: 'In use rather than in store', confidence: 'probable' }),
      },
    ],
    facts: (ctx) => [
      `It is a clear glass vessel about ${ctx.size} tall.`,
      'The glass has a green cast where it is thickest and carries bubbles, a seam, or a pontil scar.',
      'A dried tidemark inside sits above the present level.',
      'Nothing has settled at the bottom.',
      'The rim is chipped in one place and there is no stopper.',
      'Nothing on it names what it held or who used it.',
    ],
  },

  thing: {
    title: () => 'An object',
    opening: (ctx) => `${ctx.size} across, lying where somebody put it down. `
      + `Dull rather than bright, and worn rather than new.`,
    procedures: [
      {
        id: 'size', label: 'Take its measure', minutes: 1,
        observation: (ctx) => `Held up against a hand it comes to ${ctx.size} at the widest, and it weighs about what its size promises.`,
        finding: (ctx) => ({ label: 'Its size', value: `${ctx.size} at the widest`, confidence: 'certain' }),
      },
      {
        id: 'surface', label: 'Try the surface', minutes: 1,
        observation: (ctx) => `${roll(['Cool, and it stays cool under the hand.', 'It warms at once to the touch.', 'Gritty, with dust worked into every hollow.'], ctx.id, 37)} `
          + 'Nothing comes off on a finger.',
        finding: () => ({ label: 'Its material', value: 'Cannot be settled by looking alone', confidence: 'uncertain' }),
      },
      {
        id: 'wear', label: 'Look for wear', minutes: 1,
        observation: () => 'Rubbed pale on the parts that stand out and dull in the hollows, which is what handling does. '
          + 'No maker\'s mark anywhere on it.',
        finding: () => ({ label: 'Its history', value: 'Handled, and for some time', confidence: 'probable' }),
      },
    ],
    facts: (ctx) => [
      `It measures about ${ctx.size} at the widest.`,
      'It is dull rather than bright, and worn rather than new.',
      'The parts that stand out are rubbed pale; the hollows are dull with dust.',
      'There is no maker\'s mark on it anywhere.',
      'What it is made of cannot be settled by looking alone.',
      'Nothing about it says who left it here.',
    ],
  },
};

export function subjectClasses() {
  return Object.keys(CLASSES).sort();
}

/**
 * An examinable record for a picked thing. Same shape as an authored record in
 * examinables.js, so the panel and the session cannot tell them apart.
 *
 * `place` is the line under the title — the zone label, or the landmark the
 * player is standing at.
 */
export function subjectRecord({ item, id, place, className }) {
  const name = className ?? classifySubject(item);
  const shape = CLASSES[name] ?? CLASSES.thing;
  const metres = item ? span(item) : 1;
  const ctx = { item: item ?? {}, id, metres, size: measure(metres), place };
  return {
    title: shape.title(ctx),
    subtitle: place,
    opening: shape.opening(ctx),
    procedures: shape.procedures.map((step) => ({
      id: step.id,
      label: step.label,
      minutes: step.minutes,
      observation: step.observation(ctx),
      finding: step.finding(ctx),
    })),
    facts: shape.facts(ctx),
  };
}

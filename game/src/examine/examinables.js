// What can be examined closely, and what is true about it.
//
// One record per object. `opening` is what the player gets for free on
// entering; each procedure costs minutes and yields one observation and one
// finding; `facts` is everything a custom question may draw on. The panel
// shows nothing that is not written here, and the model renders these
// sentences rather than inventing its own.
//
// DRAFT content. The period detail is ordinary and uncontroversial — glove
// sizing, the parts of an opium layout, June garden flowers — but none of it
// is verified. Ben's call before it counts as settled game content
// (docs/decisions.md).

// Confidence tiers, shown under a finding. A finding the object cannot
// actually settle stays 'uncertain' rather than being left out: the player
// should see the limit of looking.
export const CONFIDENCE = {
  certain: 'plain to see',
  probable: 'inference · probable',
  uncertain: 'inference · uncertain',
};

const RECORDS = {
  'ladys-glove': {
    title: "A lady's glove",
    subtitle: 'Central Park · the Pond walk',
    opening:
      'One glove, left hand, lying palm down across the bench slats where '
      + 'somebody set it and did not come back for it. Pale kid leather, '
      + 'dulled with dust along the fingers.',
    procedures: [
      {
        id: 'wrist',
        label: 'Turn back the wrist',
        minutes: 1,
        observation:
          'The welt inside the wrist carries a stamped number: 6¼. Four '
          + 'buttons, three of mother-of-pearl, the fourth replaced by a loop '
          + 'of black thread.',
        finding: { label: 'The hand', value: "Small — a woman's, six and a quarter", confidence: 'certain' },
      },
      {
        id: 'wear',
        label: 'Look at the wear',
        minutes: 2,
        observation:
          'The kid is rubbed pale at the base of the thumb and glossy over the '
          + 'ring finger. The forefinger has been darned in silk a shade '
          + 'lighter than the leather.',
        finding: { label: 'Its condition', value: 'Mended and kept in wear, not new', confidence: 'certain' },
      },
      {
        id: 'lying',
        label: 'Feel the leather',
        minutes: 1,
        observation:
          'Dry through, and the slat beneath it is dry too. Kid takes up damp '
          + 'within the hour, and there was dew on this bench at six.',
        finding: { label: 'How long it has lain here', value: 'Since the morning, not overnight', confidence: 'probable' },
      },
    ],
    facts: [
      'It is a left-hand four-button glove in pale fawn glacé kid, a woman\'s.',
      'The size, 6¼, is stamped in the welt inside the wrist.',
      'Three mother-of-pearl buttons remain; the fourth is a loop of black thread.',
      'The forefinger is darned in silk a shade lighter than the leather.',
      'The kid is rubbed pale at the base of the thumb and glossy over the ring finger.',
      'It is dry, and so is the bench slat beneath it. The dew has been off for hours.',
      'There is no name written in it, no maker\'s stamp, and nothing else on the bench.',
      'Nothing here says whose it is or when they will miss it.',
    ],
  },

  'opium-pipe': {
    title: 'The opium pipe',
    subtitle: 'The study, behind the portière',
    opening:
      'It lies across a shallow lacquer tray on the side table: a length of '
      + 'bamboo the thickness of a broom handle, a brass saddle a third of the '
      + 'way along, and an earthenware bowl standing up from the saddle.',
    procedures: [
      {
        id: 'stem',
        label: 'Take up the stem',
        minutes: 1,
        observation:
          'Heavier than it looks, and cool. Horn caps close both ends. The '
          + 'mouthpiece is worn smooth on one side only, the way a thing wears '
          + 'when the same hand always takes it the same way.',
        finding: { label: 'Its use', value: 'Handled often, and by one person', confidence: 'probable' },
      },
      {
        id: 'bowl',
        label: 'Look into the bowl',
        minutes: 2,
        observation:
          'The aperture in the crown is no wider than a pin. The glaze around '
          + 'it is ringed hard and brown where the smoke has laid down its '
          + 'residue, and the ring has been scraped back more than once.',
        finding: { label: 'How much has been smoked', value: 'Repeatedly, over a long while', confidence: 'certain' },
      },
      {
        id: 'tray',
        label: 'Consider the tray',
        minutes: 1,
        observation:
          'A clean ring in the lacquer where a lamp has stood, and a scratch '
          + 'beside it where the chimney was set down. No lamp on the tray now, '
          + 'and no needle.',
        finding: { label: 'The layout', value: 'Lamp and needle are away somewhere else', confidence: 'certain' },
      },
    ],
    facts: [
      'The stem is bamboo, about eighteen inches, capped with horn at both ends, with a brass saddle a third of the way along.',
      'The bowl is earthenware, a flattened drum, with a pinhole aperture in the crown.',
      'The glaze around the aperture is ringed with hard brown residue, scraped back more than once.',
      'The mouthpiece is worn smooth on one side.',
      'A pipe of this kind cannot be smoked alone: the opium is cooked on a needle over a lamp and worked into the aperture.',
      'The tray shows a clean ring where a lamp stood and a scratch beside it. Neither lamp nor needle is on it now.',
      'The pipe stands in the physician\'s own study, a few feet from his bench, with laudanum and a tincture bottle on the shelf behind.',
      'It is his. Nobody else uses this room.',
    ],
    // Examining a thing may lead to using it. The ritual takes over from here.
    action: { id: 'smoke', label: 'Smoke it' },
  },

  'waiting-room-flowers': {
    title: 'The flowers on the table',
    subtitle: 'The waiting room',
    opening:
      'A glass vase on the centre table, holding roses and sweet peas cut from '
      + 'a garden rather than bought. Two of the roses have opened out flat and '
      + 'dropped their outer petals on the cloth.',
    procedures: [
      {
        id: 'water',
        label: 'Look at the water',
        minutes: 1,
        observation:
          'Clouded, and an inch below a green tidemark dried onto the inside of '
          + 'the glass. It has gone down and nobody has topped it up.',
        finding: { label: 'The water', value: 'Not changed since they were put in', confidence: 'certain' },
      },
      {
        id: 'stems',
        label: 'Lift a stem',
        minutes: 1,
        observation:
          'The cut end is soft and slimed and the stem gives under the thumb. '
          + 'The rose above it sheds two more petals on the way out of the glass.',
        finding: { label: 'How long they have stood', value: 'Three days, near enough', confidence: 'probable' },
      },
      {
        id: 'arrangement',
        label: 'Look at the arrangement',
        minutes: 1,
        observation:
          'Sweet peas, two roses and a stem of mignonette, put in as they were '
          + "cut — no wire and no florist's greenery. Mid-June is right for all "
          + 'three in a garden here.',
        finding: { label: 'Where they came from', value: "Somebody's garden, cut and carried in", confidence: 'probable' },
      },
    ],
    facts: [
      'The vase is plain pressed glass on a foot, standing on the centre table.',
      'It holds two roses, several sweet peas and a stem of mignonette.',
      'The water is clouded and an inch below a dried green tidemark on the glass.',
      'The cut ends are soft and slimed; the stems give under the thumb.',
      'Both roses have blown open and are shedding petals onto the table cloth.',
      'They were cut from a garden rather than bought: no wire, no florist\'s greenery.',
      'They have stood about three days.',
      'This is the room patients sit in to wait. The room is dressed and the flowers have not been seen to.',
      'Nothing here says who brought them in.',
    ],
  },
};

export function examinable(id) {
  return RECORDS[id] ?? null;
}

export function examinableIds() {
  return Object.keys(RECORDS).sort();
}

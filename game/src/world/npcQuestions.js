// What the ribbon offers the player to say. Built from the same context the
// rest of the dialogue uses — trade, place, hour, and whatever is happening —
// so a doorman in a hotel lobby is not asked what there is to see in the park.
//
// DRAFT CONTENT: the wording needs Ben's review before it is settled
// (docs/decisions.md, historical content).

import { pickSeeded } from './npcIdentity.js';

// Zone ids grouped into the few settings the questions care about. A zone the
// table does not know falls back to the street, which asks nothing specific.
const SETTINGS = Object.freeze({
  'central-park': 'park',
  'new-netherland-lobby': 'hotel',
  'metropolitan-club-lobby': 'club',
  foyer: 'office',
  'consulting-office': 'office',
  'cattell-lab': 'laboratory',
});

export function settingOf(place) {
  return SETTINGS[place] ?? 'street';
}

// Where the speaker believes they are standing. The dialogue route used to
// assert Central Park to everybody, including a doorman in a hotel lobby.
const WHERE = Object.freeze({
  park: 'You are in Central Park, New York City.',
  hotel: 'You are inside the lobby of the New Netherland Hotel on Fifth Avenue.',
  club: 'You are inside the lobby of the Metropolitan Club on Fifth Avenue.',
  office: 'You are inside the lobby of an office building in Manhattan.',
  laboratory: 'You are inside a psychological laboratory at Columbia College.',
  street: 'You are on a Manhattan street beside Central Park.',
});

export function whereSentence(place) {
  return WHERE[settingOf(place)];
}

// Park news is common talk out of doors; indoors it is not what is in front
// of them, so the bulletin stays outside.
export function bulletinApplies(place) {
  const setting = settingOf(place);
  return setting === 'park' || setting === 'street';
}

// Their trade or station is the most interesting thing to ask about.
const BY_ARCHETYPE = Object.freeze({
  v: ['What are you selling today?', 'Do the police trouble you on this corner?'],
  c: ['What would you take me downtown for?', 'What do you make of the motor carriages?'],
  x: ['What is in the papers today?', 'How many do you sell in a day?'],
  p: ['Is there trouble hereabouts?', 'Has it been a busy watch?'],
  dm: ['Who is stopping at the house just now?', 'Is the dining room open?'],
  hm: ['Is it a long day for you?', 'Do the guests give you much trouble?'],
  bh: ['Is the manager about?', 'How long have you been at this house?'],
  g: ['What are you planting there?', 'Does anyone trouble your beds?'],
  y: ['Do you know this house well?', 'Whom does one meet here?'],
  b: ['Should you not be at school?', 'What do you play at out here?'],
  n: ['Whose child is that?', 'Is this your usual walk?'],
  r: ['How do you find the wheel?', 'Do people stare at the costume?'],
  o: ['Did you serve in the war?', 'How long have you known this place?'],
  s: ['Are you quite well, ma’am?', 'You are in mourning — is it recent?'],
  f: ['Do you come this way often?', 'Is the neighbourhood much changed?'],
  m: ['What line of work are you in?', 'Is your office far from here?'],
  w: ['Is it a long day for you?', 'What sort of work keeps you busy?'],
  h: ['Do you take this walk often?', 'What do you make of the season?'],
  d: ['Are you waiting on somebody?', 'A fine day for it, is it not?'],
  l: ['Do you come this way often?', 'Is there anything worth seeing hereabouts?'],
});

// The carousel question is gated to the hours parkBulletin.js says it runs;
// asking at dawn contradicts what the same person would tell you.
const CAROUSEL_HOURS = Object.freeze([8, 19]);

const BY_SETTING = Object.freeze({
  park: ['What is there to see in the park?', 'Is the carousel running today?'],
  hotel: ['Is this a respectable house?', 'What would a room cost here?'],
  club: ['Must one be a member to sit down?', 'Who are the gentlemen in the reading room?'],
  office: ['Which floor am I wanting?', 'Is the building always this quiet?'],
  laboratory: ['What is all this apparatus for?', 'Is Professor Cattell about?'],
  street: ['Is it far to the avenue?', 'What street is this?'],
});

const BY_HOUR = Object.freeze({
  early: ['You are about early. Always at this hour?'],
  midday: [],
  evening: ['It is getting on for dark. Not going home?'],
  night: ['It is late to be out. Is all well?'],
});

function hourBand(hour) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  if (h < 8) return 'early';
  if (h < 18) return 'midday';
  if (h < 21) return 'evening';
  return 'night';
}

// Only somebody actually going somewhere can be asked where they are bound.
const MOBILE_ROLES = new Set([
  'commuter', 'errand', 'stroller', 'promenader', 'resident', 'nursing', 'wheeling', 'play',
]);

const GENERAL = Object.freeze(['What is the news of the street?']);

// Situational questions come first: they are about something that just
// happened, and they expire. The rest fill the remaining slots.
export function suggestedQuestions({
  archetype, role, place, hour, seed = 1, situational = [], limit = 3,
}) {
  const setting = settingOf(place);
  const questions = [...situational];

  const push = (value) => {
    if (value && !questions.includes(value)) questions.push(value);
  };

  push(pickSeeded(BY_ARCHETYPE[archetype] ?? [], seed, 41));
  const band = hourBand(hour);
  const settingPool = (BY_SETTING[setting] ?? []).filter((question) => {
    if (!question.includes('carousel')) return true;
    const h = ((Number(hour) || 0) % 24 + 24) % 24;
    return h >= CAROUSEL_HOURS[0] && h < CAROUSEL_HOURS[1];
  });
  push(pickSeeded(settingPool, seed, 42));
  if (MOBILE_ROLES.has(role)) push('Where are you bound?');
  push(pickSeeded(BY_HOUR[band] ?? [], seed, 43));
  push(GENERAL[0]);
  // A second trade question beats repeating the setting to fill a slot.
  push((BY_ARCHETYPE[archetype] ?? [])[1]);

  return questions.slice(0, limit);
}

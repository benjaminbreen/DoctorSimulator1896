// Procedural street events: brief encounters that stop the player with a
// decision. Identity comes from the shared roll; the situation and every
// outcome come from these tables. Same contract as callers.js: the module
// decides, DayFlow presents.
//
// DRAFT CONTENT: situations and outcomes need Ben's review before they are
// treated as settled.

import { rollIdentity } from './npcIdentity.js';

// At most one event per window; each window fires with its own chance. Many
// light windows beat few heavy ones: the street stays alive without every
// card being a weighty decision.
const EVENT_WINDOWS = Object.freeze([
  [9.5, 11.5],
  [11.5, 13.5],
  [13.5, 15.5],
  [15.5, 17.5],
  [17.5, 20.0],
]);
const WINDOW_CHANCE = 0.5;
// An event not taken within this many minutes is gone, no penalty. Generous:
// the player is often mid-appointment when the window opens.
const EXPIRY_MINUTES = 90;

// Each event: an archetype for the identity roll, an `art` key for its
// illustration (/ui/events/<art>.webp), a `weight` for how often it deals
// (roughly: 4 constant street texture, 2 ordinary, 1 an occasion), pithy
// text, and flat deterministic choices. Effects: cents (+received, -paid),
// standing, minutes. `press: (who) => text` plants a morning-paper item;
// `referral: true` on a choice books the speaker's daughter for tomorrow.
// `contentStatus: 'draft'` keeps unsettled situations visible in review tools.
export const EVENT_DECK = Object.freeze([
  {
    id: 'curbstone-consult',
    weight: 1,
    heading: 'A Word in Passing',
    art: 'curbstone-consult',
    archetype: 'm',
    text: (who) => `${who.name}, ${who.profession}, stops you on the walk. He heard you are a doctor. He rolls back a sleeve: a red rash, a week old.`,
    choices: [
      { id: 'look', label: 'Look at it here', effects: { minutes: 5, standing: 1 }, note: 'Heat rash. You tell him so and he pumps your hand twice.' },
      { id: 'office', label: 'Bid him call at your office', effects: {}, note: 'He says he will. Men who say so on the street mostly do not.' },
      { id: 'pass', label: 'Beg off and walk on', effects: { standing: -1 }, note: 'He watches you go. So do two others.' },
    ],
  },
  {
    id: 'man-down',
    weight: 1,
    heading: 'A Crowd at the Curb',
    art: 'man-down',
    archetype: 'm',
    text: (who) => `A knot of people at the curb. A man is down in the heat — ${who.name}, ${who.profession}, someone says. Nobody in the crowd has touched him.`,
    choices: [
      { id: 'attend', label: 'Push through and attend him', effects: { minutes: 15, standing: 3 }, note: 'Heat prostration. You loosen his collar, get him into shade, and leave him sitting up. The crowd has your name before you go.' },
      { id: 'ambulance', label: 'Send a boy for the ambulance', effects: { minutes: 2, standing: 1 }, note: 'The boy runs. The ambulance surgeon can have him.' },
      { id: 'pass', label: 'Walk on', effects: { standing: -2 }, note: 'A woman at the edge of the crowd knows your face.' },
    ],
  },
  {
    id: 'tonic-agent',
    weight: 1,
    heading: 'A Man with a Proposition',
    art: 'tonic-agent',
    archetype: 'y',
    text: (who) => `${who.name}, an agent for Kickapoo Sagwa, falls into step beside you. Three dollars a month for your name on a testimonial. Half the doctors in Brooklyn are on his list, he says.`,
    choices: [
      { id: 'take', label: 'Take the three dollars', effects: { cents: 300, standing: -4 }, note: 'The money is real. So is the circular that will carry your name.', press: () => 'A Kickapoo circular is going about with a physician’s endorsement at the foot of it. The name is yours.' },
      { id: 'decline', label: 'Decline, civilly', effects: { standing: 1 }, note: 'He touches his hat and moves down the block to the next brass plate.' },
      { id: 'scold', label: 'Tell him what you think of his list', effects: { standing: 2 }, note: 'He is unbothered. But a man passing overheard, and approved.' },
    ],
  },
  {
    id: 'lost-child',
    weight: 2,
    heading: 'A Lost Child',
    art: 'lost-child',
    archetype: 'b',
    text: (who) => `A boy of about ${who.age} is planted in the middle of the walk, crying without noise. He has lost his nurse and will not say more.`,
    choices: [
      { id: 'walk', label: 'Walk him to the Arsenal police post', effects: { minutes: 10, standing: 2 }, note: 'The sergeant knows the drill. Halfway there the boy tells you his street, his dog, and his opinion of nurses.' },
      { id: 'point', label: 'Point him toward the gate and a policeman', effects: {}, note: 'He goes the way you pointed. You do not see whether he arrives.' },
      { id: 'pass', label: 'Not your affair', effects: { standing: -1 }, note: 'A nursemaid takes him up half a block on. She saw you first.' },
    ],
  },
  {
    id: 'reporter',
    weight: 1,
    heading: 'A Man from the Papers',
    art: 'reporter',
    archetype: 'y',
    text: (who) => `${who.name} of the Evening World, notebook out. He is writing on nerves and the wheel — do lady cyclists ruin their health, in your professional view?`,
    choices: [
      { id: 'sober', label: 'Give him a sober word', effects: { standing: 2 }, note: '"Exercise in the open air harms nobody who takes it sensibly." He writes it down without joy, but he writes it down.', press: () => 'The World prints your word on wheelwomen: “Exercise in the open air harms nobody who takes it sensibly.”' },
      { id: 'colorful', label: 'Give him something quotable', effects: { standing: -2 }, note: 'It reads worse in print. It always reads worse in print.', press: () => 'Your remark to the World is printed this morning, trimmed to read twice as rash as you said it.' },
      { id: 'refuse', label: 'No comment for the World', effects: {}, note: 'He shrugs. The item runs anyway, with somebody else’s name.' },
    ],
  },
  {
    id: 'extra',
    weight: 4,
    heading: 'Extra! Extra!',
    art: 'extra',
    archetype: 'x',
    text: (who) => `${who.name}, a newsboy, plants himself in your path with the last of an armful. "Extra! Get it here!" He has already decided you will buy.`,
    choices: [
      { id: 'buy', label: 'Buy the paper', effects: { cents: -2 }, note: 'The extra is thin stuff. The boy is already crying it at the next corner.' },
      { id: 'coin', label: 'Give him a cent and skip the paper', effects: { cents: -1, standing: 1 }, note: '"Suit yourself, mister." He pockets it. He will know you next time.' },
      { id: 'pass', label: 'Step around him', effects: {}, note: 'He is already calling to the next man.' },
    ],
  },
  {
    id: 'veteran-alms',
    weight: 3,
    heading: 'An Old Soldier',
    art: 'veteran-alms',
    contentStatus: 'draft',
    archetype: 'o',
    text: (who) => `${who.name}, ${who.profession}, touches his hat brim. He does not beg, exactly. He mentions Cold Harbor, and that he has not eaten today.`,
    choices: [
      { id: 'dime', label: 'Give him a dime', effects: { cents: -10 }, note: '"Obliged, sir." He is already moving on, dignity intact.' },
      { id: 'hear', label: 'Stop and hear him out', effects: { minutes: 5, standing: 1 }, note: 'Cold Harbor, the Wilderness, and a pension clerk who will not answer letters. He wanted the hearing more than the coin.' },
      { id: 'pass', label: 'Not today', effects: {}, note: 'He touches his hat again all the same.' },
    ],
  },
  {
    id: 'bootblack',
    weight: 3,
    heading: 'Shine, Sir?',
    art: 'bootblack',
    contentStatus: 'draft',
    archetype: 'b',
    text: (who) => `A boy of about ${who.age} with a box and a brush plants himself in your way. "Shine, sir? Can't have a medical man calling in dusty boots."`,
    choices: [
      { id: 'shine', label: 'Take the shine', effects: { cents: -5, minutes: 5, standing: 1 }, note: 'He works fast and talks the whole time. The boots end up gleaming.' },
      { id: 'coin', label: 'Give him the nickel and skip the shine', effects: { cents: -5 }, note: '"Suit yourself." He pockets it and moves on.' },
      { id: 'pass', label: 'Walk on', effects: {}, note: 'He is already hailing the next pair of boots.' },
    ],
  },
  {
    id: 'prescription-boy',
    weight: 2,
    heading: 'A Word from the Druggist',
    art: 'prescription-boy',
    contentStatus: 'draft',
    archetype: 'm',
    text: (who) => `A druggist’s boy, out of breath, holds up a paper: ${who.name} of the pharmacy sends a morphine prescription wanting renewal. "The old doctor always signed it, sir."`,
    choices: [
      { id: 'sign', label: 'Sign the renewal', effects: { cents: 50 }, note: 'Signed, and half a dollar for the signature. The prescription will be filled today, and every week after.' },
      { id: 'refuse', label: 'Refuse without seeing the patient', effects: { standing: -1 }, note: 'The boy shrugs. The druggist will find another signature by supper.' },
      { id: 'inquire', label: 'Ask who it is for, and call on them', effects: { minutes: 15, standing: 2 }, note: 'A widow on East Fifty-eighth, three years on the needle since her operation. You leave a card and a plan to taper the dose. It might even work.' },
    ],
  },
  {
    id: 'tract-hander',
    weight: 3,
    heading: 'A Tract, Freely Given',
    art: 'tract-hander',
    contentStatus: 'draft',
    archetype: 'l',
    text: (who) => `${who.name}, ${who.profession}, is pressing a temperance tract into every passing hand. Yours is next: "The Serpent in the Glass."`,
    choices: [
      { id: 'take', label: 'Take it civilly', effects: { standing: 1 }, note: 'It goes into your pocket. You will never read it.' },
      { id: 'debate', label: 'Observe that wine has its medical uses', effects: { minutes: 10, standing: -1 }, note: 'The argument costs you a quarter of an hour, and she does not concede an inch.' },
      { id: 'pass', label: 'Wave it off', effects: {}, note: 'She has seen worse manners this morning and will see worse by noon.' },
    ],
  },
  {
    id: 'scorcher',
    weight: 2,
    heading: 'The Scorcher',
    art: 'scorcher',
    contentStatus: 'draft',
    archetype: 'w',
    text: (who) => `A wheelman takes the path at racing speed. ${who.name}, ${who.profession}, spins half around; her parcels scatter across the walk. He does not look back.`,
    choices: [
      { id: 'help', label: 'Gather her parcels', effects: { minutes: 5, standing: 1 }, note: 'You gather everything up and set it right. She thanks you, then says exactly what she thinks of wheelmen.' },
      { id: 'shout', label: 'Shout after him', effects: {}, note: 'He is a block away already. The man next to you swears on your behalf.' },
      { id: 'pass', label: 'Keep walking', effects: { standing: -1 }, note: 'She gathers them herself, slowly, watched by everyone and helped by no one.' },
    ],
  },
  {
    id: 'pickpocket',
    weight: 1,
    heading: 'A Hand at Your Coat',
    art: 'pickpocket',
    contentStatus: 'draft',
    archetype: 'm',
    text: () => 'The crowd tightens at the crossing, and there is a hand at your coat — light, quick, and certain of itself.',
    choices: [
      { id: 'seize', label: 'Seize the hand', effects: { standing: 1 }, note: 'You catch a boy’s thin wrist. He twists loose and runs, empty-handed. Your watch and purse are safe.' },
      { id: 'shy', label: 'Pull back and check your pockets', effects: { cents: -25 }, note: 'Too late. A quarter is gone.' },
      { id: 'cry', label: 'Cry “Stop, thief!”', effects: {}, note: 'Hats turn. The hand is gone as if it had never been there.' },
    ],
  },
  {
    id: 'matron',
    weight: 1,
    heading: 'A Delicate Inquiry',
    art: 'matron',
    contentStatus: 'draft',
    archetype: 'l',
    text: (who) => `${who.name} knows you by sight — her set knows everything by sight. Her daughter, she says, has nerves: sleepless, weeping at nothing. Might a doctor be consulted... informally?`,
    choices: [
      { id: 'card', label: 'Offer your card, and a proper appointment', effects: { standing: 1 }, referral: true, note: 'She takes the card as if accepting a small favor from an equal. Her daughter will call tomorrow.' },
      { id: 'here', label: 'Advise her plainly, here', effects: { standing: 1 }, note: 'Rest, air, and less cordial in the sleeping draught. She hears "no fee" and is pleased; the daughter stays unseen.' },
      { id: 'decline', label: 'Decline street practice', effects: { standing: -1 }, note: '"Quite right," she says, in the tone that means quite wrong.' },
    ],
  },
]);

// Weighted pick from the deck: `roll` in [0,1).
export function pickEvent(roll) {
  const total = EVENT_DECK.reduce((sum, event) => sum + (event.weight || 1), 0);
  let remaining = roll * total;
  for (const event of EVENT_DECK) {
    remaining -= event.weight || 1;
    if (remaining < 0) return event;
  }
  return EVENT_DECK[EVENT_DECK.length - 1];
}

// Deterministic assignment: which window fires, when, and which event with
// which rolled identity. Same LCG shape as createCallerDay.
export function createEventDay({ seed = 1 } = {}) {
  let state = ((Math.trunc(seed) || 1) * 2654435761) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const events = EVENT_WINDOWS
    .map(([from, to]) => {
      if (next() >= WINDOW_CHANCE) return null;
      const hours = from + next() * (to - from);
      const event = pickEvent(next());
      // The identity seed is kept on the entry: the plate art varies by it.
      const identitySeed = Math.floor(next() * 1e9) + 1;
      const identity = rollIdentity(event.archetype, identitySeed);
      return { hours, event, identity, seed: identitySeed, status: 'pending' };
    })
    .filter(Boolean);

  return {
    list: () => events.map((item) => ({ ...item })),

    // The event in front of the player: due, not expired, not yet taken.
    // Marks the entry engaged so it cannot expire under an open card.
    due(hours) {
      const found = events.find((item) => item.status === 'pending'
        && hours >= item.hours
        && (hours - item.hours) * 60 <= EXPIRY_MINUTES);
      if (found) found.engaged = true;
      return found || null;
    },

    // Quietly retire events the player never crossed. No penalty: the street
    // does not know what it missed.
    expire(hours) {
      for (const item of events) {
        if (item.status === 'pending' && !item.engaged
          && (hours - item.hours) * 60 > EXPIRY_MINUTES) {
          item.status = 'expired';
        }
      }
    },

    resolve(entry, choiceId) {
      const found = events.find((item) => item === entry || item.hours === entry.hours);
      if (!found || found.status !== 'pending') return null;
      const choice = found.event.choices.find((option) => option.id === choiceId);
      if (!choice) return null;
      found.status = 'taken';
      found.choice = choiceId;
      return choice;
    },
  };
}

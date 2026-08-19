// Walk-in callers at the consulting office: procedural people wanting a
// remedy or a word of advice over the counter. Identity comes from the
// shared roll; the request and every outcome come from these tables. No
// portrait, no model — a caller is a panel and a decision.

import { rollIdentity } from './npcIdentity.js';

// Two or three callers a day, placed in the gaps between appointments.
const CALLER_WINDOWS = Object.freeze([
  [10.4, 11.2],
  [12.4, 14.0],
  [15.0, 20.5],
]);
// A caller waits this long before going elsewhere. Long enough that a
// messenger reaching the player across town still leaves time to respond.
const PATIENCE_MINUTES = 90;

// Requests pair a complaint with three ways to answer it. Prices in cents,
// standing deltas small: this is shop trade, not a consultation.
// `gist` is what the messenger boy says when the doctor is out: short,
// secondhand, the way a boy would carry it.
export const REQUESTS = Object.freeze([
  {
    id: 'teething-syrup',
    art: 'teething-syrup',
    gist: 'something about a baby crying all night',
    text: (who) => `${who.name}, ${who.profession}, asks a soothing syrup for a teething child who has cried two nights together.`,
    sell: { label: 'Sell a mild chamomile syrup', price: 35, standing: 1, note: 'The syrup is harmless and the family sleeps.' },
    advise: { label: 'Advise cool compresses, no charge', price: 0, standing: 2, note: 'Sound advice freely given is remembered.' },
    refuse: { label: 'Send them to a druggist', price: 0, standing: -1, note: 'They will not climb your stair again.' },
  },
  {
    id: 'dyspepsia-powder',
    art: 'dyspepsia-powder',
    gist: 'stomach trouble, he says',
    text: (who) => `${who.name}, ${who.profession}, wants a powder for dyspepsia after every dinner taken at a lunch counter.`,
    sell: { label: 'Sell bismuth and soda powders', price: 50, standing: 1, note: 'The powders settle the stomach well enough.' },
    advise: { label: 'Advise slower meals, no charge', price: 0, standing: 1, note: 'Advice against the lunch counter is heard politely.' },
    refuse: { label: 'Decline counter trade', price: 0, standing: -1, note: 'The caller shrugs and goes to the corner pharmacy.' },
  },
  {
    id: 'nerve-tonic',
    art: 'nerve-tonic',
    gist: 'wants that nerve tonic from the paper',
    text: (who) => `${who.name}, ${who.profession}, asks for the nerve tonic advertised in the World, or something as good.`,
    sell: { label: 'Sell a gentian bitter instead', price: 60, standing: 1, note: 'A plain bitter, honestly priced, does no harm.' },
    advise: { label: 'Warn against patent tonics', price: 0, standing: 2, note: 'A doctor who talks a caller out of a purchase earns talk of another kind.' },
    refuse: { label: 'Refuse anything of the sort', price: 0, standing: -2, note: 'They wanted the tonic, not a sermon.' },
  },
  {
    id: 'liniment',
    art: 'liniment',
    gist: 'hurt his shoulder at work',
    text: (who) => `${who.name}, ${who.profession}, wants liniment for a shoulder strained lifting crates.`,
    sell: { label: 'Sell camphor liniment', price: 40, standing: 1, note: 'The shoulder is rubbed and the caller satisfied.' },
    advise: { label: 'Advise rest and a sling, no charge', price: 0, standing: 1, note: 'Rest is good counsel a working man cannot always take.' },
    refuse: { label: 'Turn the request away', price: 0, standing: -1, note: 'The crates will not wait; neither does he.' },
  },
  {
    id: 'cough-bottle',
    art: 'cough-bottle',
    gist: 'a cough that keeps the whole house up',
    text: (who) => `${who.name}, ${who.profession}, asks a bottle for a dry cough that keeps the whole floor of the boarding house awake.`,
    sell: { label: 'Sell a simple syrup with wild cherry', price: 45, standing: 1, note: 'The floor sleeps; your name travels the house.' },
    advise: { label: 'Advise steam and flannel, no charge', price: 0, standing: 1, note: 'Old counsel, kindly meant.' },
    refuse: { label: 'Decline without examining', price: 0, standing: -1, note: 'Caution reads as coldness to a tired caller.' },
  },
  {
    id: 'headache-seltzer',
    art: 'headache-seltzer',
    gist: 'headaches, every afternoon regular',
    text: (who) => `${who.name}, ${who.profession}, asks what is good for a headache that arrives every afternoon at the same hour.`,
    sell: { label: 'Sell bromo-seltzer papers', price: 30, standing: 0, note: 'The seltzer answers today and says nothing of tomorrow.' },
    advise: { label: 'Suggest spectacles may be wanted', price: 0, standing: 2, note: 'An afternoon headache over close work: the guess lands, and is repeated.' },
    refuse: { label: 'Wave the question off', price: 0, standing: -2, note: 'A question waved off is a story told twice.' },
  },
]);

// Deterministic assignment: which window gets a caller, when, and who.
export function createCallerDay({ seed = 1 } = {}) {
  let state = ((Math.trunc(seed) || 1) * 2654435761) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const archetypes = ['m', 'w', 'f'];
  const callers = CALLER_WINDOWS
    .filter(() => next() < 0.85)
    .map(([from, to]) => {
      const hours = from + next() * (to - from);
      const identity = rollIdentity(archetypes[Math.floor(next() * archetypes.length)], Math.floor(next() * 1e9) + 1);
      const request = REQUESTS[Math.floor(next() * REQUESTS.length)];
      return { hours, identity, request, status: 'pending' };
    });

  return {
    list: () => callers.map((item) => ({ ...item })),

    // The caller at the door: due, still waiting, not yet answered. Held from
    // here on, so patience cannot run out under the open card.
    due(hours) {
      const found = callers.find((item) => item.status === 'pending'
        && hours >= item.hours
        && (hours - item.hours) * 60 <= PATIENCE_MINUTES);
      if (found) found.held = true;
      return found || null;
    },

    // A boy runs to fetch the doctor: first caller due and not yet relayed.
    // Marks the caller told so the boy comes once.
    takeMessage(hours) {
      const found = callers.find((item) => item.status === 'pending'
        && !item.told
        && hours >= item.hours
        && (hours - item.hours) * 60 <= PATIENCE_MINUTES);
      if (!found) return null;
      found.told = true;
      return found;
    },

    // The boy carries back word that the doctor is coming; the caller waits
    // out the trip instead of lapsing on the way.
    holdForArrival(caller) {
      const found = callers.find((item) => item === caller || item.hours === caller.hours);
      if (found && found.status === 'pending') found.held = true;
    },

    // A caller whose patience ran out while the doctor was elsewhere.
    takeLapsed(hours) {
      const found = callers.find((item) => item.status === 'pending'
        && !item.held
        && (hours - item.hours) * 60 > PATIENCE_MINUTES);
      if (!found) return null;
      found.status = 'lapsed';
      return found;
    },

    resolve(caller, choice) {
      const found = callers.find((item) => item === caller || item.hours === caller.hours);
      if (!found || found.status !== 'pending') return null;
      found.status = 'answered';
      found.choice = choice;
      return found.request[choice] || null;
    },
  };
}

// Placeholder ground truth for the working chrome. Every value the top bar
// shows lives here, so when the real systems arrive (calendar, patient queue,
// post) they replace this module and the chrome does not change. Player meters
// already come from world/player.js rather than placeholder HUD data.
//
// Nothing here is invented by the renderer: the HUD draws exactly what this
// module says, the same contract the LLM systems keep.

import { notice } from '../world/notices.js';

// The campaign opens on the Monday after William James wrote about his
// unsuccessful mescal experiment. The weekday is always computed below.
export const day = {
  year: 1896,
  month: 6, // 1-based
  date: 15,
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function weekdayName({ year, month, date }) {
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
}

export function monthName({ month }) {
  return MONTHS[month - 1];
}

// Demo queue: two patients already seen this morning, three still waiting.
// `silhouette` picks a cameo variant until real portraits exist.
export const patientQueue = [
  { id: 'q1', seen: true, silhouette: 'woman' },
  { id: 'q2', seen: true, silhouette: 'man' },
  { id: 'q3', seen: false, silhouette: 'bearded' },
  { id: 'q4', seen: false, silhouette: 'woman' },
  { id: 'q5', seen: false, silhouette: 'man' },
];

// This is a fictional delivery of a documented letter. The recipient and
// greeting are adapted for play; the displayed source note makes that change
// explicit instead of presenting the prop as untouched correspondence.
export const letters = [
  {
    id: 'james-mescal-1896',
    sender: 'Professor William James',
    place: 'Chocorua, New Hampshire',
    date: 'June 11, 1896',
    subject: 'A Psychological Experiment with Mescal',
    body: [
      'Dear Doctor,',
      'All that the telegraph imparts are the shocks; the “happy homes,” good husbands and fathers, fine weather, honest business men, neat new houses, punctual meetings of engagements, etc., of which the country mainly consists, are never cabled over.',
      'The really bad thing here is the silly wave that has gone over the public mind—protection humbug, silver, jingoism, etc. It is a case of “mob-psychology.” Any country is liable to it if circumstances conspire, and our circumstances have conspired.',
      'I had two days spoiled by a psychological experiment with mescal, an intoxicant used by some of our Southwestern Indians in their religious ceremonies, a sort of cactus bud, of which the U. S. Government had distributed a supply to certain medical men, including Weir Mitchell, who sent me some to try. He had himself been “in fairyland.” It gives the most glorious visions of color—every object thought of appears in a jeweled splendor unknown to the natural world.',
      'It disturbs the stomach somewhat, but that, according to W. M., was a cheap price, etc. I took one bud three days ago, was violently sick for 24 hours, and had no other symptom whatever except that and the Katzenjammer the following day. I will take the visions on trust!',
      'We have had three days of delicious rain—it all soaks into the sandy soil here and leaves no mud whatever.',
    ],
    valediction: 'Yours ever,',
    signature: 'Wm. James',
    signatureTitle: 'Harvard University',
    provenance: {
      label: 'Fictionalized delivery of a primary source',
      note: 'William James wrote this passage to his brother Henry on June 11, 1896. The greeting and recipient are adapted for the game; the remaining displayed text follows the published letter.',
      sourceLabel: 'The Letters of William James, volume II',
      sourceUrl: 'https://www.gutenberg.org/files/38091/38091-h/38091-h.htm',
    },
  },
];

// Spell a clock reading the way a person would say it, for the watch notice.
function spokenTime(hours) {
  const h24 = Math.floor(hours);
  const m = Math.round((hours - h24) * 60) % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  const period = h24 < 12 ? 'in the morning' : h24 < 17 ? 'in the afternoon' : 'in the evening';
  if (m === 0) return `${h12} o'clock ${period}`;
  if (m === 15) return `a quarter past ${h12} ${period}`;
  if (m === 30) return `half past ${h12} ${period}`;
  if (m === 45) return `a quarter to ${((h12 % 12) + 1)} ${period}`;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// The three verbs are placeholders: each answers through the notice channel
// so pressing them already feels like the game, not a dead control.
export function checkWatch(hours) {
  notice(`You draw your watch: ${spokenTime(hours)}.`, { key: 'watch' });
}

export function checkWallet() {
  notice('Four dollars and eighty-five cents, in coin and small notes.', { key: 'wallet' });
}

// Short front-page headings transcribed from the June 15 issue shipped in
// public/newspapers. Keeping the list small is preferable to filling the
// panel with plausible but unverified events.
export const dayNews = [
  'McKinley sold out to Foraker.',
  'Nothing but gold will do.',
];

export const dayNewsSource = Object.freeze({
  publication: 'The Journal',
  date: 'June 15, 1896',
  sourceUrl: 'https://www.loc.gov/item/sn84031792/1896-06-15/ed-1/',
});

// Letter verbs, placeholders like the pocket verbs above. Learn is the hook
// for the educational layer: the primary source and a historical note.
export function learnFromLetter(letter) {
  const provenance = letter?.provenance;
  notice(provenance?.note || 'No historical note is available for this letter.', { key: 'learn' });
}

export function replyToLetterLater() {
  notice('You set the letter aside to answer this evening.', { key: 'reply' });
}

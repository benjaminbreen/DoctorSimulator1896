// Placeholder ground truth for the working chrome. Every value the top bar
// shows lives here, so when the real systems arrive (calendar, patient queue,
// post) they replace this module and the chrome does not change. Player meters
// already come from world/player.js rather than placeholder HUD data.
//
// Nothing here is invented by the renderer: the HUD draws exactly what this
// module says, the same contract the LLM systems keep.

import { notice } from '../world/notices.js';

// The campaign opens in mid-May 1896. The weekday is computed, not typed:
// May 14, 1896 was a Thursday, whatever a mockup says.
export const day = {
  year: 1896,
  month: 5, // 1-based
  date: 14,
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

// Demo letters for the modal. PLACEHOLDER FIXTURES: the Roosevelt body is
// from Ben's mockup; the Mitchell, Osler, and Lister bodies are drafts that
// put words in real men's mouths and need Ben's verification before any of
// it ships as content. The real letter system replaces this array.
export const demoLetters = [
  {
    id: 'roosevelt-referral',
    sender: 'Roosevelt Hospital',
    place: 'New York',
    date: 'May 13, 1896',
    subject: 'Referral of New Patient',
    body: [
      'Dear Doctor,',
      'We respectfully refer to you Mr. James H. Alden, aged 28, clerk, who presents with nervous exhaustion following a period of great mental strain and overwork.',
      'He suffers from insomnia, palpitation, and general debility of nervous origin.',
      'We commend him to your kindly care and expertise.',
    ],
    valediction: 'Respectfully,',
    signature: 'John C. Minor, M.D.',
    signatureTitle: 'Attending Physician',
  },
  {
    id: 'mitchell-rest',
    sender: 'Dr. S. Weir Mitchell',
    place: 'Philadelphia',
    date: 'May 11, 1896',
    subject: 'On Rest and the Nerves',
    body: [
      'Dear Colleague,',
      'I thank you for your note on the case of nervous exhaustion. In such patients I hold that rest, seclusion, abundant feeding, and massage do more than any drug.',
      'Begin the regimen early and hold to it strictly; the half-rest is no rest at all.',
    ],
    valediction: 'Yours faithfully,',
    signature: 'S. Weir Mitchell, M.D.',
    signatureTitle: 'Philadelphia',
  },
  {
    id: 'osler-diet',
    sender: 'Dr. William Osler',
    place: 'Baltimore',
    date: 'May 8, 1896',
    subject: 'Notes on Convalescent Diet',
    body: [
      'Dear Doctor,',
      'In convalescence from nervous exhaustion I favour milk in divided doses, beef juice, and a slow return to solid fare.',
      'Small meals, often; fresh air on a fixed schedule; and no tobacco whatever the patient pleads.',
    ],
    valediction: 'Very truly yours,',
    signature: 'William Osler, M.D.',
    signatureTitle: 'Johns Hopkins Hospital',
  },
  {
    id: 'lister-antiseptic',
    sender: 'Dr. Joseph Lister',
    place: 'London',
    date: 'April 30, 1896',
    subject: 'Antiseptic Observations',
    body: [
      'Dear Sir,',
      'Your inquiry on the antiseptic method is welcome. Cleanliness of the wound, of the instruments, and of the hands remains the whole of the doctrine.',
      'The rest is diligence, and the humility to repeat what one already knows.',
    ],
    valediction: 'I remain, faithfully,',
    signature: 'Joseph Lister',
    signatureTitle: 'London',
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

// Headlines for the day panel. PLACEHOLDER FIXTURES copied from Ben's
// mockup — several are anachronistic for May 14, 1896 (Homestead was 1892,
// Earnest premiered February 1895, Marconi's over-water work came 1897) and
// all of it awaits Ben's verification. The real feed comes with the weekly
// newspaper system; the front page image will come from a real archive at
// public/newspapers/<year-month-day>.jpg.
export const dayNews = [
  'Gold standard bill debated in the U.S. House; vote expected soon.',
  'Homestead Strike continues in Pittsburgh as negotiations break down.',
  'The New Elevated station at 42nd Street opens to the public.',
  'Dr. Emil von Behring announces breakthrough in diphtheria antitoxin serum.',
  'Oscar Wilde’s “The Importance of Being Earnest” premieres in London.',
  'First successful wireless message sent over water by Guglielmo Marconi.',
  'Baseball: Brooklyn Bridegrooms defeat New York Giants, 6–3.',
  'Mild spring weather continues across New York City.',
];

// Letter verbs, placeholders like the pocket verbs above. Learn is the hook
// for the educational layer: the primary source and a historical note.
export function learnFromLetter() {
  notice('The primary source and historical note for this letter are not yet bound in.', {
    key: 'learn',
  });
}

export function replyToLetterLater() {
  notice('You set the letter aside to answer this evening.', { key: 'reply' });
}

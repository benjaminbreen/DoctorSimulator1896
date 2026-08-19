// Proof sheet for street events and callers: every card, rendered with a few
// seeded identities, all choices and outcomes inline. For reading the writing
// in one place. Usage: npm run events:proof [-- --seeds=5]
//
// Pipe to a file and read it like copy: node scripts/event-proof.mjs > proof.md

import { EVENT_DECK, createEventDay } from '../src/world/streetEvents.js';
import { REQUESTS, createCallerDay } from '../src/world/callers.js';
import { rollIdentity } from '../src/world/npcIdentity.js';

const seedCount = Number(process.argv.find((arg) => arg.startsWith('--seeds='))?.split('=')[1]) || 3;
const seeds = Array.from({ length: seedCount }, (_, i) => (i + 1) * 7919);

const fx = (effects = {}) => {
  const parts = [];
  if (effects.cents) parts.push(`${effects.cents > 0 ? '+' : ''}${effects.cents}¢`);
  if (effects.standing) parts.push(`standing ${effects.standing > 0 ? '+' : ''}${effects.standing}`);
  if (effects.minutes) parts.push(`${effects.minutes} min`);
  return parts.length ? ` _(${parts.join(', ')})_` : '';
};

console.log('# Street events\n');
for (const event of EVENT_DECK) {
  const status = event.contentStatus === 'draft' ? ' — DRAFT' : '';
  console.log(`## ${event.heading} \`${event.id}\`${status}\n`);
  for (const seed of seeds) {
    console.log(`- ${event.text(rollIdentity(event.archetype, seed))}`);
  }
  console.log('');
  for (const choice of event.choices) {
    console.log(`- **${choice.label}**${fx(choice.effects)} → ${choice.note}`);
  }
  console.log('');
}

console.log('# Callers\n');
for (const request of REQUESTS) {
  console.log(`## \`${request.id}\` — boy says: “${request.gist}”\n`);
  for (const seed of seeds) {
    console.log(`- ${request.text(rollIdentity(['m', 'w', 'f'][seed % 3], seed))}`);
  }
  console.log('');
  for (const kind of ['sell', 'advise', 'refuse']) {
    const option = request[kind];
    console.log(`- **${option.label}**${fx({ cents: option.price, standing: option.standing })} → ${option.note}`);
  }
  console.log('');
}

console.log('# Sample days\n');
for (const seed of seeds) {
  const hh = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const events = createEventDay({ seed }).list().map((item) => `${hh(item.hours)} ${item.event.id}`);
  const callers = createCallerDay({ seed }).list().map((item) => `${hh(item.hours)} caller:${item.request.id}`);
  console.log(`- seed ${seed}: ${[...events, ...callers].join(' · ') || '(quiet day)'}`);
}

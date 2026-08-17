// Papers the player can hold and read. One entry per edition: a scan in
// public/newspapers and the masthead line the reader prints above it.
//
// DRAFT CONTENT: the cover price and the archive link need Ben's
// verification before they are settled (docs/decisions.md).

import { WALK_TOP } from './streetGrid.js';
import { POSTED_NPCS } from './postedNpcs.js';

// `headlines` are what a newsboy shouts, shortened from the front page of the
// scan in the same folder — every one is on the page the player can open.
// They are the day's news for the whole game: nothing may invent another.
export const EDITIONS = Object.freeze({
  'sun-1896-06-15': Object.freeze({
    id: 'sun-1896-06-15',
    masthead: 'The Sun',
    dateline: 'New York, Monday, June 15, 1896',
    priceCents: 2,
    image: '/newspapers/1896-06-15-sun.jpg',
    sourceUrl: 'https://chroniclingamerica.loc.gov/lccn/sn83030272/1896-06-15/ed-1/seq-1/',
    headlines: Object.freeze([
      'Ultimatum to Hanna! Platt says a gold plank or a fight in the convention!',
      'The majority for gold — but some are afraid to put the word in the platform!',
      'The tail of the ticket! Candidates a-plenty for the Vice-Presidency!',
      'Bradley out of the race — the Governor’s name will not go before the convention!',
      'A red-hot fight before the National Committee! The New York contests, all night!',
      'Hetty Green expected — she will fight for her son, unseated as a delegate!',
      'Cullom visits McKinley! Sound money and no straddle, he says!',
      'Governor Morton’s declination — and the Platt men sore to hear it first from Depew!',
      'Fair and warmer to-day, northerly winds! If you see it in the Sun, it’s so!',
    ]),
  }),
  'journal-1896-06-15': Object.freeze({
    id: 'journal-1896-06-15',
    masthead: 'The Journal',
    dateline: 'New York, Monday, June 15, 1896',
    priceCents: 1,
    image: '/newspapers/1896-06-15.jpg',
    // DRAFT: the scan is in the repo but its archive link is not recorded.
    sourceUrl: null,
    headlines: Object.freeze([
      'McKinley sold out to Foraker! All Ohio patronage pledged away!',
      'Nothing but gold will do! Platt musters three hundred and forty-eight votes of nine hundred and eighteen!',
      'Hanna writes a straddle plank — and works for its adoption!',
      'McKinley worried at the outlook, wires Hanna to leave gold out!',
      'Depew says he is right! Morton will not take the second place!',
      'New York sends an ultimatum against a silver sop!',
      'Oom Tom hears the music of the passing band wagon — see the cartoon!',
    ]),
  }),
});

/**
 * The headline this boy is crying. It turns over with the hour so the corner
 * does not repeat itself all morning, and `offset` keeps two boys on the same
 * paper from crying the same line at the same time.
 */
export function headlineFor(editionId, hour = 12, offset = 0) {
  const lines = EDITIONS[editionId]?.headlines;
  if (!lines?.length) return null;
  const h = Math.floor(((Number(hour) || 0) % 24 + 24) % 24);
  return lines[Math.abs(h + Math.trunc(offset)) % lines.length];
}

// What the newsboy is crying today. One edition until the calendar moves.
export const TODAYS_EDITION = EDITIONS['sun-1896-06-15'];

export function edition(id) {
  return EDITIONS[id] ?? null;
}

// A bundle at each newsboy's feet, on the side he faces so a buyer sees it
// before he does. He owns it, so helping yourself is theft against him and
// not a victimless pickup.
//
// Figure yaw turns the model's own +Z, so forward is (sin yaw, cos yaw) and
// his right hand is (cos yaw, -sin yaw). Same convention as PostedNpcs.
const STACK_AHEAD = 0.7;
const STACK_ASIDE = 0.5;

export const NEWSPAPER_STACKS = Object.freeze(POSTED_NPCS
  .filter((npc) => npc.role === 'newsboy' && npc.paper)
  .map((npc) => {
    const [x, , z] = npc.position;
    return Object.freeze({
      id: `${npc.id}-papers`,
      ownerId: npc.id,
      editionId: npc.paper,
      goodId: npc.sells?.[0]?.id ?? 'newspaper',
      position: Object.freeze([
        x + Math.sin(npc.yaw) * STACK_AHEAD + Math.cos(npc.yaw) * STACK_ASIDE,
        WALK_TOP,
        z + Math.cos(npc.yaw) * STACK_AHEAD - Math.sin(npc.yaw) * STACK_ASIDE,
      ]),
      yaw: npc.yaw,
      count: 16,
    });
  }));

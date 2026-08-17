// Who is stopping at the New Netherland today. Rolled once per playthrough
// from the run seed, so the register is the same all day and different next
// game.
//
// This exists because a doorman with no register invents one: asked after a
// guest who does not exist, he agreed the man was in room 234. The list is
// complete by definition — a name not on it is not stopping here.
//
// DRAFT CONTENT: the guests are fictional. Ben's review before it is settled.

import { hashSeed, pickSeeded } from './npcIdentity.js';
import { getRunSeed } from './runSeed.js';

const TITLES = ['Mr.', 'Mr.', 'Mr.', 'Mrs.', 'Miss', 'Dr.', 'Judge', 'Colonel'];

const SURNAMES = [
  'Pelham', 'Vandergrift', 'Ochterlony', 'Bass', 'Considine', 'Whitcomb',
  'Rensselaer', 'Ffoulkes', 'Marchetti', 'Sandoval', 'Kwan', 'Oyelaran',
  'Devereux', 'Stackpole', 'Bellingham', 'Ruthven',
];

// A married woman signs the book under her husband's name — "Mrs. Cornelius
// Vandergrift" — which is why Mrs. draws from the men's list.
const MEN_FIRST = ['Edward', 'Cornelius', 'Horace', 'Augustus', 'Ellery', 'Rufus', 'Percival'];
const WOMEN_FIRST = ['Wilhelmina', 'Beatrice', 'Constance', 'Adelaide', 'Harriet'];

// What brings a person to a Fifth Avenue hotel for a few days.
const BUSINESS = [
  'up from Baltimore on railway business',
  'over from London and complaining of the heat',
  'here for a wedding at Grace Church',
  'a cotton man from Savannah, in for the week',
  'seeing doctors, and seeing nobody else',
  'here on a matter before the courts',
  'travelling with a great many trunks and one small dog',
  'an engineer, up for the bridge works',
];

const FLOORS = [2, 3, 4, 5];
const GUEST_COUNT = 6;

export const HOTEL_REGISTER_ZONES = new Set(['new-netherland-lobby', 'central-park']);

/**
 * The house register, newest arrival last. Deterministic in the run seed:
 * the same playthrough always has the same people upstairs.
 */
export function hotelRegister(seed = getRunSeed()) {
  const guests = [];
  const usedRooms = new Set();
  const usedBusiness = new Set();
  for (let index = 0; index < GUEST_COUNT; index += 1) {
    const roll = hashSeed(seed, 101 + index * 7);
    const title = pickSeeded(TITLES, roll, 1);
    const surname = pickSeeded(SURNAMES, roll, 2);
    const floor = FLOORS[roll % FLOORS.length];
    let room = floor * 100 + 4 + (hashSeed(roll, 3) % 40);
    while (usedRooms.has(room)) room += 1;
    usedRooms.add(room);
    // A man of business is Mr. Surname on the book; the rest carry a first name.
    const first = title === 'Mr.' || title === 'Dr.' ? ''
      : `${pickSeeded(title === 'Miss' ? WOMEN_FIRST : MEN_FIRST, roll, 4)} `;
    // Two guests both over from London and both complaining of the heat reads
    // as a bug when the doorman runs down the book.
    let business = pickSeeded(BUSINESS, roll, 5);
    while (usedBusiness.has(business)) {
      business = BUSINESS[(BUSINESS.indexOf(business) + 1) % BUSINESS.length];
    }
    usedBusiness.add(business);
    guests.push({ name: `${title} ${first}${surname}`, room, business });
  }
  return guests;
}

// Only hotel staff carry the register: a policeman on the corner has no idea
// who is upstairs, and should not pretend to.
export function registerFor(archetype, place) {
  const staff = archetype === 'dm' || archetype === 'bh' || archetype === 'hm';
  if (!staff || !HOTEL_REGISTER_ZONES.has(place)) return [];
  return hotelRegister();
}

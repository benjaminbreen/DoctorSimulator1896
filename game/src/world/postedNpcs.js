// Street figures who hold one spot all day: the hackman touting for fares and
// the newsboy crying the papers. Both are talkable through the procedural
// dialogue system; their archetypes live in npcIdentity.js.

import { WALK_TOP } from './streetGrid.js';
import { figureHeight } from './figureHeights.js';

// Everyone here stands on pavement, never in a roadbed. Fifth Avenue's road
// is x 99-107, so its park-side walk is the 95.8-99 band; Central Park South
// is z 86-96, giving walks at 82.8-86 (park side) and 96-99.2 (south side).
// The vendors stand just behind their carts at the curb.
const SIDEWALK = WALK_TOP;
const CPS_SOUTH_SIDEWALK_Z = 97.4;

export const POSTED_NPCS = Object.freeze([
  // The two vendors stand by real carts from pushcarts.js. `ownsId` is what
  // makes a wagon hitting that cart their loss rather than a passing sight.
  Object.freeze({
    id: 'plaza-pushcart-vendor',
    label: 'Pushcart vendor (Plaza)',
    location: 'Fifth Avenue at the Plaza',
    modelFile: '/models/pushcart-vendor.glb',
    motionFile: '/models/strawhat-motions.glb',
    idleClip: 'VendorIdle',
    ambientClips: Object.freeze(['StandingAcknowledging', 'AnnoyedHeadShake']),
    position: Object.freeze([97.2, SIDEWALK, 76]),
    yaw: Math.PI / 2,
    height: figureHeight('pushcart-vendor'),
    archetype: 'v',
    role: 'vendor',
    activity: 'standing',
    dialogueName: 'A pushcart vendor',
    ownsId: 'cart-plaza',
    // A penny an apple, which is what they cost off a cart in 1896.
    sells: Object.freeze([
      Object.freeze({ id: 'apple', label: 'an apple', priceCents: 1 }),
    ]),
  }),
  Object.freeze({
    id: 'park-south-pushcart-vendor',
    label: 'Pushcart vendor (Central Park South)',
    location: 'Central Park South',
    modelFile: '/models/pushcart-vendor.glb',
    motionFile: '/models/strawhat-motions.glb',
    idleClip: 'VendorIdle',
    ambientClips: Object.freeze(['StandingAcknowledging', 'StandingArguing']),
    position: Object.freeze([-20, SIDEWALK, 84.3]),
    yaw: 0,
    height: figureHeight('pushcart-vendor'),
    archetype: 'v',
    role: 'vendor',
    activity: 'standing',
    dialogueName: 'A pushcart vendor',
    ownsId: 'cart-cps',
    sells: Object.freeze([
      Object.freeze({ id: 'herring', label: 'a smoked herring', priceCents: 3 }),
    ]),
  }),
  Object.freeze({
    id: 'central-park-south-hackman',
    label: 'Hansom cab driver',
    location: 'Central Park South near Grand Army Plaza',
    modelFile: '/models/cab-driver.glb',
    // 65-bone rig: shares the crowd pack rather than shipping its own copy.
    motionFile: '/models/strawhat-motions.glb',
    idleClip: 'CabDriverIdle',
    ambientClips: Object.freeze(['StandingAcknowledging', 'QuickFormalBow']),
    position: Object.freeze([80, SIDEWALK, CPS_SOUTH_SIDEWALK_Z]),
    yaw: Math.PI,
    height: figureHeight('cab-driver'),
    archetype: 'c',
    role: 'cabman',
    activity: 'standing',
    dialogueName: 'A cab driver',
  }),
  Object.freeze({
    id: 'scholars-gate-newsboy',
    label: 'Newsboy',
    location: 'Central Park South at Scholars’ Gate',
    modelFile: '/models/news-boy.glb',
    // 33-bone rig: the crowd gestures target finger bones he does not have,
    // so he keeps his own pack. Re-rig him at 65 to share the crowd set.
    motionFile: '/models/news-boy-motions.glb',
    idleClip: 'NewsBoyIdle',
    ambientClips: Object.freeze([]),
    position: Object.freeze([60, SIDEWALK, CPS_SOUTH_SIDEWALK_Z]),
    yaw: Math.PI,
    height: figureHeight('news-boy'),
    archetype: 'x',
    role: 'newsboy',
    activity: 'standing',
    dialogueName: 'A newsboy',
    paper: 'sun-1896-06-15',
    // Two cents is the price on the Sun's own masthead for this issue.
    sells: Object.freeze([
      Object.freeze({ id: 'newspaper', label: 'a copy of The Sun', priceCents: 2 }),
    ]),
  }),
  // Two more corners, chosen where the block is otherwise empty: the park-side
  // walk of Fifth well north of the hotel, and the west end of Central Park
  // South by Sixth Avenue. Both are lit and paved sidewalk (streetGrid.js).
  Object.freeze({
    id: 'fifth-avenue-newsboy',
    label: 'Newsboy (Fifth Avenue)',
    location: 'Fifth Avenue at the park wall, above Sixty-second Street',
    modelFile: '/models/news-boy.glb',
    motionFile: '/models/news-boy-motions.glb',
    idleClip: 'NewsBoyIdle',
    ambientClips: Object.freeze([]),
    position: Object.freeze([97.2, SIDEWALK, -20]),
    yaw: Math.PI / 2,
    height: figureHeight('news-boy'),
    archetype: 'x',
    role: 'newsboy',
    activity: 'standing',
    dialogueName: 'A newsboy',
    // The Journal undercuts the Sun by a cent, which is its own selling point.
    paper: 'journal-1896-06-15',
    sells: Object.freeze([
      Object.freeze({ id: 'journal', label: 'a copy of The Journal', priceCents: 1 }),
    ]),
  }),
  Object.freeze({
    id: 'park-south-west-newsboy',
    label: 'Newsboy (Central Park South at Sixth Avenue)',
    modelFile: '/models/news-boy.glb',
    motionFile: '/models/news-boy-motions.glb',
    location: 'Central Park South near Sixth Avenue',
    idleClip: 'NewsBoyIdle',
    ambientClips: Object.freeze([]),
    position: Object.freeze([-66, SIDEWALK, CPS_SOUTH_SIDEWALK_Z]),
    yaw: Math.PI,
    height: figureHeight('news-boy'),
    archetype: 'x',
    role: 'newsboy',
    activity: 'standing',
    dialogueName: 'A newsboy',
    paper: 'sun-1896-06-15',
    sells: Object.freeze([
      Object.freeze({ id: 'newspaper', label: 'a copy of The Sun', priceCents: 2 }),
    ]),
  }),
]);

// Stable arrays: useLoader re-suspends forever if handed a fresh array each
// render, and the Suspense fallback is null, so the figures never appear.
export const POSTED_NPC_MODEL_FILES = Object.freeze(POSTED_NPCS.map((npc) => npc.modelFile));
export const POSTED_NPC_MOTION_FILES = Object.freeze(POSTED_NPCS.map((npc) => npc.motionFile));

export function postedNpcsForZone(zone) {
  return zone === 'central-park' ? POSTED_NPCS : [];
}

// Who is out of pocket when goods leave a given cart.
export function ownerOfCart(cartId) {
  return POSTED_NPCS.find((npc) => npc.ownsId === cartId) ?? null;
}

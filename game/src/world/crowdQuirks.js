// Occasional visible habits for crowd walkers: pausing at a flower bed, a
// gallant tip of the hat (usually rebuffed), a brief quarrel when two short
// tempers clip shoulders. Triggers are seeded and rate-budgeted so the park
// reads as alive, never as slapstick. Pure logic; the scene layer animates.

import { hashSeed, rollIdentity } from './npcIdentity.js';
import { getRunSeed } from './runSeed.js';

// The gardener's planting beds (parkGardener.js sites; duplicated on purpose,
// one-line note beats an import for three coordinates).
export const FLOWER_SPOTS = Object.freeze([
  [28.5, -44], [46, -34], [62, -8],
]);

const FLOWER_REACH = 2.8;
const GALLANT_REACH = 3.2;
const QUARREL_REACH = 1.5;
const WOMEN = new Set(['w', 'f', 'h', 's']);

export function createQuirkState() {
  return { kind: null, until: 0, faceYaw: 0, partnerId: null, cooldownUntil: 0 };
}

// The walker's quirk follows the assignment seed: one rig plays several
// logical people over a day, and each of them rolls their own habits.
export function rollWalkerQuirk(archetype, assignmentSeed) {
  return rollIdentity(archetype, hashSeed(getRunSeed(), assignmentSeed))?.quirk ?? null;
}

function yawToward(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

// Decide whether a quirk fires this check. `others` are candidate partners:
// { id, x, z, archetype, quirk, moving, busy }. Returns null or an action:
// { kind, until, faceYaw, partnerId, partner?: {id, kind, until, faceYaw} }.
export function maybeStartQuirk({
  quirk, x, z, now, roll, partnerRoll, others = [], quarrelAllowed = false,
}) {
  if (quirk === 'flower-fancier') {
    for (const [fx, fz] of FLOWER_SPOTS) {
      if (Math.hypot(fx - x, fz - z) <= FLOWER_REACH && roll < 0.55) {
        return {
          kind: 'flowers',
          until: now + 5 + roll * 6,
          faceYaw: yawToward(x, z, fx, fz),
          partnerId: null,
        };
      }
    }
    return null;
  }
  if (quirk === 'gallant') {
    for (const other of others) {
      if (other.busy || !WOMEN.has(other.archetype)) continue;
      if (Math.hypot(other.x - x, other.z - z) > GALLANT_REACH) continue;
      if (roll >= 0.4) return null;
      const rebuffed = partnerRoll < 0.7;
      return {
        kind: rebuffed ? 'gallant-rebuffed' : 'gallant-received',
        until: now + (rebuffed ? 3 : 4),
        faceYaw: yawToward(x, z, other.x, other.z),
        partnerId: other.id,
        partner: {
          id: other.id,
          kind: rebuffed ? 'rebuff' : 'pleasantry',
          until: now + (rebuffed ? 2.6 : 3),
          faceYaw: yawToward(other.x, other.z, x, z),
        },
      };
    }
    return null;
  }
  if (quirk === 'quarrelsome') {
    if (!quarrelAllowed) return null;
    for (const other of others) {
      if (other.busy || WOMEN.has(other.archetype)) continue;
      if (Math.hypot(other.x - x, other.z - z) > QUARREL_REACH) continue;
      if (roll >= 0.5) return null;
      return {
        kind: 'quarrel',
        until: now + 7,
        faceYaw: yawToward(x, z, other.x, other.z),
        partnerId: other.id,
        partner: {
          id: other.id,
          kind: 'quarrel',
          until: now + 7,
          faceYaw: yawToward(other.x, other.z, x, z),
        },
      };
    }
    return null;
  }
  return null;
}

// Cooldowns keep a habit from looping: the flower-fancier admires once per
// stretch of path, the gallant is not a pest, quarrels stay rare.
export function quirkCooldown(kind, now) {
  if (kind === 'flowers') return now + 120;
  if (kind === 'quarrel') return now + 180;
  return now + 60;
}

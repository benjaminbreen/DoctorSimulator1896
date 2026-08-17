// Service staff inside lobbies: a bellhop on call, and a maid keeping the
// public rooms. Hand-placed in the three authored lobbies; in a generated
// interior the hall boy's post is derived from the room's own blueprint, so
// any building large enough to keep one gets one without an authored entry.
//
// DRAFT CONTENT: 1896 hotel and club service on Fifth Avenue was very largely
// Black labour. The staffing needs Ben's review before it is settled.

// The Metropolitan Club is members and their guests. The doctor is neither,
// which is the whole of what the hall boy has to say to him.
export const PLAYER_IS_CLUB_MEMBER = false;

export const LOBBY_STAFF_MODELS = Object.freeze({
  bellhop: '/models/hotel-bellhop.glb',
  maid: '/models/hotel-maid.glb',
});

// Facing the arriving player rather than a wall.
function facing(from, to) {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

function bellhop(id, zone, position, look) {
  return Object.freeze({
    id,
    zone,
    kind: 'bellhop',
    archetype: 'bh',
    role: 'bellhop',
    dialogueName: 'A bellhop',
    idleClip: 'StandingIdle',
    position: Object.freeze(position),
    yaw: facing(position, look),
    ambientClips: Object.freeze(['StandingAcknowledging', 'QuickFormalBow']),
  });
}

function maid(id, zone, position, look) {
  return Object.freeze({
    id,
    zone,
    kind: 'maid',
    archetype: 'hm',
    role: 'housekeeping',
    dialogueName: 'A maid in cap and apron',
    idleClip: 'StandingIdle',
    position: Object.freeze(position),
    yaw: facing(position, look),
    // No dusting or sweeping clip exists yet, so her work reads from where she
    // stands. Swap one in here when it is exported.
    ambientClips: Object.freeze(['AnnoyedHeadShake', 'StandingAcknowledging']),
  });
}

// Positions sit inside each blueprint outline and clear of its spawn point.
const AUTHORED = Object.freeze([
  bellhop('new-netherland-bellhop', 'new-netherland-lobby', [5.5, -3.5], [-5.4, 0]),
  maid('new-netherland-maid', 'new-netherland-lobby', [-4, -6], [0, 0]),
  bellhop('metropolitan-club-hall-boy', 'metropolitan-club-lobby', [-5.5, -2.5], [6.2, 0]),
  bellhop('foyer-hall-boy', 'foyer', [-2.8, -1.5], [0, 4.25]),
]);

export function lobbyStaffForZone(zoneId, zone = null) {
  const authored = AUTHORED.filter((entry) => entry.zone === zoneId);
  if (authored.length > 0) return authored;
  if (!zoneId?.startsWith('interior:')) return [];
  // The same rule interiors.js uses to declare the feature, read off the same
  // field. Two gates that could disagree is one gate too many.
  if (zone?.interior?.wealth !== 'grand') return [];
  const dimensions = zone?.blueprint?.dimensions;
  const spawn = zone?.blueprint?.navigation?.defaultSpawn;
  if (!dimensions || !spawn) return [];
  // Stand him against the wall behind the entrance, out of the walking line.
  const x = (dimensions.width / 2 - 1.6) * (spawn[0] > 0 ? -1 : 1);
  const z = -(dimensions.depth / 2 - 1.8);
  return [bellhop(`${zoneId}:hall-boy`, zoneId, [x, z], [spawn[0], spawn[2] ?? 0])];
}

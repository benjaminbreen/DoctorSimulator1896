// Ambient crowd scheduler. Each pool slot lives on a deterministic timeline:
// a chain of assignments (walk somewhere, dwell, walk on) derived from a day
// seed, the slot index, and the assignment count. The logical position at any
// civil second is therefore a pure function of time, so a clock jump means
// re-deriving, never integrating through. The scene layer only decides when
// a slot may visibly appear or vanish (far from the player).

import { findWalkPath, nearestGraphNode, walkPathPolyline } from './walkGraph.js';
import { spotClip, spotsForArchetype } from './crowdSpots.js';
import { DEFAULT_CLOCK_RATE } from './clock.js';

// Slots are typed by archetype because a rig cannot swap meshes. The mix
// leans male to match street photographs of the period. The summer-dress
// woman (d) is excluded: she is the carousel visitor, and duplicates of a
// distinctive figure read as clones. The forties woman (f) is excluded too:
// her walk cycle is broken, so she only stands.
export const CROWD_SLOT_ARCHETYPES = Object.freeze([
  'm', 'w', 'l', 'h', 'm', 'w', 'hm', 'bh', 'h', 'r', 'm', 'l', 'm', 'w',
]);

// Fraction of the pool on the street by hour (1896: dawn deliveries, a long
// daytime plateau, thin gaslit evenings).
const HOUR_LEVELS = [
  0.08, 0.05, 0.05, 0.05, 0.1, 0.18, 0.35, 0.55, 0.75, 0.9, 0.92, 0.92,
  0.88, 0.88, 0.85, 0.82, 0.78, 0.72, 0.6, 0.45, 0.32, 0.22, 0.16, 0.1,
];

// Dwell is in game seconds. Rest is a real sit on a bench or lawn; resident
// dwell is time spent indoors behind a door, hidden.
const ROLES = Object.freeze({
  commuter: { pace: [1.35, 1.62], dwell: [2, 8], hurry: [0.55, 1] },
  errand: { pace: [1.2, 1.45], dwell: [25, 80], hurry: [0.3, 0.8] },
  stroller: { pace: [0.95, 1.2], dwell: [15, 60], hurry: [0, 0.35] },
  promenader: { pace: [0.9, 1.15], dwell: [20, 90], hurry: [0, 0.3] },
  rest: { pace: [1.0, 1.25], dwell: [600, 2400], hurry: [0, 0.3] },
  resident: { pace: [1.25, 1.5], dwell: [600, 3600], hurry: [0.3, 0.8] },
});

// Role weights per day period: [night, dawn, morning, midday, afternoon, evening].
const ROLE_WEIGHTS = Object.freeze({
  commuter: [0.35, 0.5, 0.5, 0.15, 0.3, 0.2],
  errand: [0.15, 0.25, 0.2, 0.3, 0.25, 0.1],
  stroller: [0.05, 0.05, 0.1, 0.2, 0.15, 0.15],
  promenader: [0.05, 0.05, 0.05, 0.15, 0.1, 0.1],
  rest: [0, 0.05, 0.15, 0.3, 0.3, 0.1],
  resident: [0.4, 0.1, 0.15, 0.2, 0.25, 0.45],
});

function dayPeriod(hour) {
  if (hour < 5) return 0;
  if (hour < 8) return 1;
  if (hour < 11) return 2;
  if (hour < 15) return 3;
  if (hour < 19) return 4;
  return 5;
}

export function crowdPopulationLevel(hour) {
  const wrapped = ((hour % 24) + 24) % 24;
  const low = Math.floor(wrapped);
  const high = (low + 1) % 24;
  const mix = wrapped - low;
  return HOUR_LEVELS[low] + (HOUR_LEVELS[high] - HOUR_LEVELS[low]) * mix;
}

export function activeSlotCount(hour, slotCount = CROWD_SLOT_ARCHETYPES.length) {
  return Math.round(crowdPopulationLevel(hour) * slotCount);
}

function hashSeed(...parts) {
  let h = 2166136261;
  for (const part of parts) {
    h ^= Math.imul(Math.trunc(part) & 0xffffffff, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function rng01(seed, salt) {
  return hashSeed(seed, salt) / 4294967296;
}

function pick(seed, salt, list) {
  return list[Math.floor(rng01(seed, salt) * list.length) % list.length];
}

function range(seed, salt, [low, high]) {
  return low + rng01(seed, salt) * (high - low);
}

function pickRole(seed, salt, hour) {
  const period = dayPeriod(hour);
  const entries = Object.entries(ROLE_WEIGHTS);
  const total = entries.reduce((sum, [, weights]) => sum + weights[period], 0);
  let roll = rng01(seed, salt) * total;
  for (const [role, weights] of entries) {
    roll -= weights[period];
    if (roll <= 0) return role;
  }
  return 'commuter';
}

function nodeIndexesByKind(graph) {
  const byKind = { edge: [], corner: [], end: [], junction: [] };
  for (const [index, node] of graph.nodes.entries()) {
    (byKind[node.kind] ?? (byKind[node.kind] = [])).push(index);
  }
  return byKind;
}

// Chains replay from the day's start on every fresh state, so route lookups
// repeat heavily. Cache A* results per graph; polylines resolve lazily and
// only for the assignment actually being walked.
const pathCaches = new WeakMap();

function cachedPath(graph, from, to) {
  let cache = pathCaches.get(graph);
  if (!cache) {
    cache = new Map();
    pathCaches.set(graph, cache);
  }
  const key = `${from}>${to}`;
  if (!cache.has(key)) cache.set(key, findWalkPath(graph, from, to));
  return cache.get(key);
}

export function ensureAssignmentRoute(graph, assignment) {
  if (!assignment.path || assignment.polyline) return assignment;
  const { points, segments } = walkPathPolyline(graph, assignment.path);
  if (assignment.occupy) {
    // The last leg leaves the walk and crosses open ground to the spot.
    points.push([assignment.occupy.x, assignment.occupy.z]);
    segments.push({ surface: 'terrain', roadId: null, crossesGapstow: false, kind: 'approach' });
  }
  assignment.polyline = points;
  assignment.segments = segments;
  return assignment;
}

function destinationPool(byKind, role, park) {
  if (role === 'commuter') return byKind.edge;
  if (role === 'errand') return [...byKind.corner, ...byKind.end];
  if (role === 'stroller') return park ? byKind.junction : [...byKind.junction, ...byKind.corner];
  return byKind.junction;
}

// Rest spots are exclusive. A slot holds its seat from the moment it sets out
// for it until it stands up, so nobody else walks to a taken bench and settles
// into the same pose. Which slot wins a contested seat depends on generation
// order, which is fine: the seat is always held by exactly one.
function spotFree(state, spotId, start, end) {
  const claims = state.claims.get(spotId);
  if (!claims) return true;
  return !claims.some((claim) => start < claim.end && end > claim.start);
}

function claimSpot(state, spotId, slot, index, start, end) {
  const claims = state.claims.get(spotId);
  if (claims) claims.push({ slot, index, start, end });
  else state.claims.set(spotId, [{ slot, index, start, end }]);
}

// Drop a slot's claims for assignments that are no longer in its chain, or
// the seat stays held forever.
function releaseClaims(state, slot, belowIndex) {
  for (const [spotId, claims] of state.claims) {
    const kept = claims.filter((claim) => claim.slot !== slot || claim.index >= belowIndex);
    if (kept.length === claims.length) continue;
    if (kept.length === 0) state.claims.delete(spotId);
    else state.claims.set(spotId, kept);
  }
}

export function createCrowdState(daySeed, slotCount = CROWD_SLOT_ARCHETYPES.length) {
  return {
    daySeed: Math.trunc(daySeed),
    claims: new Map(),
    slots: Array.from({ length: slotCount }, (_, index) => ({
      slot: index,
      archetype: CROWD_SLOT_ARCHETYPES[index % CROWD_SLOT_ARCHETYPES.length],
      assignments: [],
      byKind: null,
    })),
  };
}

// One assignment: from a node, walk a routed polyline, dwell at the far end.
// The chain is generated lazily; assignment k is fully determined by
// (daySeed, slot, k) and the arrival node of assignment k-1.
function generateAssignment(state, slotState, graph, index, startSeconds, previous) {
  const seed = hashSeed(state.daySeed, slotState.slot, index);
  const byKind = slotState.byKind ?? (slotState.byKind = nodeIndexesByKind(graph));
  const hour = (startSeconds / 3600) % 24;
  const role = pickRole(seed, 1, hour);
  const from = previous
    ? previous.to
    : pick(seed, 2, [...byKind.edge, ...(byKind.door ?? [])]);
  const spec = ROLES[role];
  const pace = range(seed, 6, spec.pace);
  // The schedule lives in civil seconds, which run DEFAULT_CLOCK_RATE times
  // faster than the real seconds the visible figure walks in. Logical
  // motion therefore uses the civil pace; the figure's legs use `pace`.
  const civilPace = pace / DEFAULT_CLOCK_RATE;
  const dwellSeconds = range(seed, 7, spec.dwell);

  // A rest walks to a bench or lawn spot via its approach node and settles
  // there with a sitting clip. A resident walks to a door and goes inside.
  let occupy = null;
  let to = from;
  if (role === 'rest') {
    // Try seats from a seeded starting point, taking the first one free for
    // the whole trip; if every seat is claimed, fall through and stroll.
    const spots = spotsForArchetype(slotState.archetype);
    const offset = Math.floor(rng01(seed, 10) * spots.length);
    for (let i = 0; i < spots.length && !occupy; i += 1) {
      const spot = spots[(offset + i) % spots.length];
      const approach = graph.byKey.get(`${Math.round(spot.approach[0] * 100)}/${Math.round(spot.approach[1] * 100)}`);
      if (approach === undefined || approach === from) continue;
      const spotPath = cachedPath(graph, from, approach);
      if (!spotPath || spotPath.edgeIndexes.length === 0) continue;
      const legLength = Math.hypot(spot.x - graph.nodes[approach].x, spot.z - graph.nodes[approach].z);
      const endSeconds = startSeconds + (spotPath.length + legLength) / civilPace + dwellSeconds;
      if (!spotFree(state, spot.id, startSeconds, endSeconds)) continue;
      claimSpot(state, spot.id, slotState.slot, index, startSeconds, endSeconds);
      to = approach;
      occupy = {
        spotId: spot.id,
        x: spot.x,
        z: spot.z,
        yaw: spot.yaw,
        clip: spotClip(spot, slotState.archetype),
      };
    }
  }
  if (!occupy && role === 'resident' && (byKind.door ?? []).length > 0) {
    for (let attempt = 0; attempt < 4 && to === from; attempt += 1) {
      to = pick(seed, 20 + attempt, byKind.door);
    }
  } else if (!occupy) {
    for (let attempt = 0; attempt < 6 && to === from; attempt += 1) {
      to = pick(seed, 3 + attempt, destinationPool(byKind, role, rng01(seed, 9) < 0.5));
    }
  }
  const path = to === from ? null : cachedPath(graph, from, to);
  if (!path || path.edgeIndexes.length === 0) {
    // Unreachable or degenerate: stand a while where we are, try again next.
    const dwell = range(seed, 4, [10, 30]);
    return {
      index, role, from, to: from, seed,
      path: null, polyline: null, segments: null, length: 0,
      occupy: null, insideDoor: false, fromDoor: false,
      pace: 1.2, startSeconds, walkSeconds: 0, dwellSeconds: dwell,
      endSeconds: startSeconds + dwell,
      traits: { attention: range(seed, 5, [0.35, 1]), hurry: 0.2 },
    };
  }
  const approachLength = occupy
    ? Math.hypot(occupy.x - graph.nodes[to].x, occupy.z - graph.nodes[to].z)
    : 0;
  const length = path.length + approachLength;
  const walkSeconds = length / civilPace;
  return {
    index, role, from, to, seed,
    path, polyline: null, segments: null, length, civilPace,
    occupy,
    insideDoor: graph.nodes[to].kind === 'door',
    fromDoor: graph.nodes[from].kind === 'door',
    pace, startSeconds, walkSeconds, dwellSeconds,
    endSeconds: startSeconds + walkSeconds + dwellSeconds,
    traits: {
      attention: range(seed, 5, [0.35, 1]),
      hurry: range(seed, 8, spec.hurry),
    },
  };
}

// Extend a slot's assignment chain to cover the given civil second, dropping
// finished assignments older than one behind the current.
export function ensureSlotCoverage(state, slotIndex, graph, civilSeconds) {
  const slotState = state.slots[slotIndex];
  // A backward jump (the dev time dial) invalidates the chain; rebuild.
  if (slotState.assignments[0]?.startSeconds > civilSeconds) {
    slotState.assignments = [];
    releaseClaims(state, slotIndex, Infinity);
  }
  let last = slotState.assignments.at(-1);
  if (!last) {
    // Anchor at the day's start so the chain is a pure function of the day
    // seed: a fresh state jumped to 4 pm equals one that lived since dawn.
    // The path cache keeps the replay cheap.
    const anchor = Math.floor(civilSeconds / 86400) * 86400;
    last = generateAssignment(state, slotState, graph, 0, anchor, null);
    slotState.assignments.push(last);
  }
  let guard = 0;
  while (last.endSeconds < civilSeconds && guard < 2000) {
    const next = generateAssignment(
      state, slotState, graph, last.index + 1, last.endSeconds, last,
    );
    slotState.assignments.push(next);
    last = next;
    guard += 1;
  }
  let dropped = false;
  while (slotState.assignments.length > 2
    && slotState.assignments[1].endSeconds < civilSeconds) {
    slotState.assignments.shift();
    dropped = true;
  }
  if (dropped) releaseClaims(state, slotIndex, slotState.assignments[0].index);
  return slotState.assignments.find((entry) => entry.endSeconds >= civilSeconds) ?? last;
}

// Logical pose for a slot at a civil second: assignment, distance along the
// walk, and whether the slot is dwelling at the destination.
export function crowdSlotLogical(state, slotIndex, graph, civilSeconds) {
  const assignment = ensureSlotCoverage(state, slotIndex, graph, civilSeconds);
  ensureAssignmentRoute(graph, assignment);
  const into = civilSeconds - assignment.startSeconds;
  const walking = assignment.polyline && into < assignment.walkSeconds;
  return {
    assignment,
    distance: walking
      ? Math.max(0, into) * (assignment.civilPace ?? assignment.pace)
      : assignment.length,
    dwelling: !walking,
  };
}

// Spawn nodes for a newly visible slot: world edges, park gates, and doors.
export function crowdSpawnNodes(graph) {
  const nodes = [];
  for (const [index, node] of graph.nodes.entries()) {
    if (node.kind === 'edge' || node.kind === 'door') nodes.push(index);
  }
  for (const edge of graph.edges) {
    if (edge.kind === 'gate') nodes.push(edge.a, edge.b);
  }
  return nodes;
}

export function isSlotActive(hour, slotIndex, slotCount = CROWD_SLOT_ARCHETYPES.length) {
  return slotIndex < activeSlotCount(hour, slotCount);
}

// Deterministic roll for scene-layer decisions (crossing lapses), so a run
// is reproducible for debugging while physics stays free.
export function crowdRoll(seed, salt) {
  return rng01(seed, salt);
}

// Incident rate budget: serious lapses are rationed in civil time so the
// street never reads as slapstick.
export function createIncidentBudget(minGapSeconds = 480) {
  return { lastAt: -Infinity, minGapSeconds };
}

export function incidentAllowed(budget, civilSeconds) {
  return civilSeconds - budget.lastAt >= budget.minGapSeconds;
}

export function recordIncident(budget, civilSeconds) {
  budget.lastAt = civilSeconds;
}

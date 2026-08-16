// Walkable graph for background pedestrians. Nodes and edges are derived
// once from the same authored data the renderers pave: street sidewalk
// centerlines (streetGrid ROADS), the park walks (centralPark PATHS), the
// crossings between opposite corners, and the gates joining park to
// pavement. Routing is plain A*. No Three.js, no React.

import { ROADS, SIDEWALK_WIDTH, WORLD_BOUNDS } from './streetGrid.js';
import { PATHS } from './centralPark.js';
import { CROWD_DOORS, CROWD_SPOTS } from './crowdSpots.js';

const HALF_WALK = SIDEWALK_WIDTH / 2;
const EDGE_BOUND_TOLERANCE = 2;

// Park paths whose route passes over the Gapstow apron; consumers resolve
// the exact height by position, the flag only opts the edge in.
const GAPSTOW_PATHS = new Set(['north-walk']);

// Authored gate chains joining a park path endpoint to a street corner.
// Points run park-side first. Scholars' Gate follows the proven visitor
// itinerary across the Plaza apron.
const GATES = [
  {
    id: 'scholars-gate',
    points: [[88, 70], [94, 80], [97.4, 84.4]],
    surface: 'terrain',
  },
];

// Short park links the authored PATHS leave implicit: the Plaza apron
// between the pond walk and Center Drive, and the lawn cut from Center
// Drive down to the Green that the visitor itinerary already walks.
const PARK_LINKS = [
  { id: 'plaza-apron-link', points: [[86, 66], [88, 70]], surface: 'terrain' },
  { id: 'green-lawn-link', points: [[0, -36], [-8, -46]], surface: 'terrain' },
];

function key(x, z) {
  return `${Math.round(x * 100)}/${Math.round(z * 100)}`;
}

function polylineLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return total;
}

function sidewalkLines(road) {
  return [road.lo - HALF_WALK, road.hi + HALF_WALK];
}

// Crossing coordinates along a road's sidewalk line: where each properly
// crossing perpendicular road's two sidewalk lines intersect it.
function lineStops(road, line, perpendiculars) {
  const stops = [];
  for (const other of perpendiculars) {
    if (line < other.from || line > other.to) continue;
    for (const cross of sidewalkLines(other)) {
      if (cross < road.from || cross > road.to) continue;
      stops.push({ at: cross, roadId: other.id, band: [other.lo, other.hi] });
    }
  }
  return stops.sort((a, b) => a.at - b.at);
}

function graphBuilder() {
  const nodes = [];
  const edges = [];
  const byKey = new Map();
  const adjacency = [];

  const node = (x, z, kind) => {
    const id = key(x, z);
    const existing = byKey.get(id);
    if (existing !== undefined) {
      // A corner shared by two lines keeps the more specific kind.
      if (kind === 'corner') nodes[existing].kind = 'corner';
      return existing;
    }
    const index = nodes.length;
    nodes.push({ id, x, z, kind });
    byKey.set(id, index);
    adjacency.push([]);
    return index;
  };

  const edge = (a, b, kind, surface, points, extra = {}) => {
    const length = polylineLength(points);
    if (length < 1e-6 || a === b) return;
    const index = edges.length;
    edges.push({ id: `${kind}-${index}`, a, b, kind, surface, length, points, ...extra });
    adjacency[a].push({ edge: index, to: b });
    adjacency[b].push({ edge: index, to: a });
  };

  return { nodes, edges, byKey, adjacency, node, edge };
}

// Door landings sitting on this sidewalk line become extra plain stops, so
// the line splits there and the door edge has a node to attach to.
function landingStops(road, line, alongIndex, lineIndex) {
  const stops = [];
  for (const door of CROWD_DOORS) {
    if (Math.abs(door.landing[lineIndex] - line) > 0.01) continue;
    const at = door.landing[alongIndex];
    if (at <= road.from || at >= road.to) continue;
    stops.push({ at, band: null, roadId: null });
  }
  return stops;
}

function buildStreets(builder) {
  const horizontal = ROADS.filter((road) => road.axis === 'z');
  const vertical = ROADS.filter((road) => road.axis === 'x');

  const buildLine = (road, line, perpendiculars, pointAt, boundLo, boundHi, alongIndex) => {
    const stops = [
      ...lineStops(road, line, perpendiculars),
      ...landingStops(road, line, alongIndex, 1 - alongIndex),
    ].sort((a, b) => a.at - b.at);
    const coords = [road.from, ...stops.map((stop) => stop.at), road.to];
    const kinds = coords.map((at) => {
      if (Math.abs(at - boundLo) < EDGE_BOUND_TOLERANCE
        || Math.abs(at - boundHi) < EDGE_BOUND_TOLERANCE) return 'edge';
      const stop = stops.find((entry) => entry.at === at);
      if (!stop) return 'end';
      return stop.band ? 'corner' : 'landing';
    });
    for (let i = 0; i < coords.length - 1; i += 1) {
      if (coords[i + 1] - coords[i] < 1e-6) continue;
      const a = builder.node(...pointAt(coords[i]), kinds[i]);
      const b = builder.node(...pointAt(coords[i + 1]), kinds[i + 1]);
      // A segment overlapping a perpendicular road band is that road's
      // crossing; everything else is plain pavement.
      const spanning = stops.find(
        (stop) => stop.band && coords[i] < stop.band[1] && coords[i + 1] > stop.band[0],
      );
      const points = [pointAt(coords[i]), pointAt(coords[i + 1])];
      if (spanning) {
        builder.edge(a, b, 'crossing', 'road', points, { roadId: spanning.roadId });
      } else {
        builder.edge(a, b, 'sidewalk', 'walk', points);
      }
    }
  };

  for (const road of horizontal) {
    for (const line of sidewalkLines(road)) {
      buildLine(
        road,
        line,
        vertical,
        (at) => [at, line],
        WORLD_BOUNDS.minX,
        WORLD_BOUNDS.maxX,
        0,
      );
    }
  }
  for (const road of vertical) {
    for (const line of sidewalkLines(road)) {
      buildLine(
        road,
        line,
        horizontal,
        (at) => [line, at],
        WORLD_BOUNDS.minZ,
        WORLD_BOUNDS.maxZ,
        1,
      );
    }
  }

  for (const door of CROWD_DOORS) {
    const landing = builder.byKey.get(key(...door.landing));
    if (landing === undefined) throw new Error(`Door landing off any sidewalk: ${door.id}`);
    const node = builder.node(door.x, door.z, 'door');
    builder.edge(landing, node, 'door', 'walk', [door.landing, [door.x, door.z]]);
  }
}

function buildPark(builder) {
  // A point shared by two paths (or used twice by one, as a loop closure)
  // becomes a junction node, as does any point a link or gate attaches to.
  const seen = new Map();
  for (const path of PATHS) {
    for (const [x, z] of path.points) {
      const id = key(x, z);
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  const forced = new Set();
  for (const entry of [...PARK_LINKS, ...GATES]) {
    forced.add(key(...entry.points[0]));
    forced.add(key(...entry.points.at(-1)));
  }
  // Occupancy spots (benches, lawns) attach at their approach points.
  for (const spot of CROWD_SPOTS) {
    forced.add(key(...spot.approach));
  }

  for (const path of PATHS) {
    const points = path.points;
    const crossesGapstow = GAPSTOW_PATHS.has(path.id);
    const isNode = (index) => index === 0
      || index === points.length - 1
      || (seen.get(key(...points[index])) ?? 0) > 1
      || forced.has(key(...points[index]));

    let runStart = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (!isNode(i)) continue;
      const run = points.slice(runStart, i + 1);
      const a = builder.node(...run[0], 'junction');
      const b = builder.node(...run.at(-1), 'junction');
      if (a === b && run.length > 2) {
        // A loop (the Green ring) splits at its midpoint so A* can use it.
        const mid = Math.floor(run.length / 2);
        const midNode = builder.node(...run[mid], 'junction');
        builder.edge(a, midNode, 'path', 'terrain', run.slice(0, mid + 1), { crossesGapstow });
        builder.edge(midNode, b, 'path', 'terrain', run.slice(mid), { crossesGapstow });
      } else {
        builder.edge(a, b, 'path', 'terrain', run, { crossesGapstow });
      }
      runStart = i;
    }
  }

  for (const link of PARK_LINKS) {
    const a = builder.node(...link.points[0], 'junction');
    const b = builder.node(...link.points.at(-1), 'junction');
    builder.edge(a, b, 'path', link.surface, link.points);
  }

  for (const gate of GATES) {
    const a = builder.node(...gate.points[0], 'gate');
    const b = builder.node(...gate.points.at(-1), 'gate');
    builder.edge(a, b, 'gate', gate.surface, gate.points);
  }
}

export function buildWalkGraph() {
  const builder = graphBuilder();
  buildStreets(builder);
  buildPark(builder);
  return {
    nodes: builder.nodes,
    edges: builder.edges,
    adjacency: builder.adjacency,
    byKey: builder.byKey,
  };
}

export function nearestGraphNode(graph, x, z, accept = null) {
  let best = null;
  for (const [index, node] of graph.nodes.entries()) {
    if (accept && !accept(node)) continue;
    const distance = Math.hypot(node.x - x, node.z - z);
    if (!best || distance < best.distance) best = { index, distance };
  }
  return best ? best.index : -1;
}

// A* over node indices. Returns { nodeIndexes, edgeIndexes, length } or null.
export function findWalkPath(graph, fromIndex, toIndex) {
  if (fromIndex === toIndex) return { nodeIndexes: [fromIndex], edgeIndexes: [], length: 0 };
  const target = graph.nodes[toIndex];
  const heuristic = (index) => {
    const node = graph.nodes[index];
    return Math.hypot(node.x - target.x, node.z - target.z);
  };
  const open = [{ index: fromIndex, priority: heuristic(fromIndex) }];
  const cost = new Map([[fromIndex, 0]]);
  const cameFrom = new Map();

  while (open.length > 0) {
    let bestAt = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i].priority < open[bestAt].priority) bestAt = i;
    }
    const current = open.splice(bestAt, 1)[0];
    if (current.index === toIndex) break;
    const base = cost.get(current.index);
    for (const { edge, to } of graph.adjacency[current.index]) {
      const next = base + graph.edges[edge].length;
      if (next >= (cost.get(to) ?? Infinity)) continue;
      cost.set(to, next);
      cameFrom.set(to, { from: current.index, edge });
      open.push({ index: to, priority: next + heuristic(to) });
    }
  }

  if (!cameFrom.has(toIndex)) return null;
  const nodeIndexes = [toIndex];
  const edgeIndexes = [];
  let cursor = toIndex;
  while (cursor !== fromIndex) {
    const step = cameFrom.get(cursor);
    edgeIndexes.push(step.edge);
    cursor = step.from;
    nodeIndexes.push(cursor);
  }
  nodeIndexes.reverse();
  edgeIndexes.reverse();
  return { nodeIndexes, edgeIndexes, length: cost.get(toIndex) };
}

// Flatten a path into a polyline plus one surface record per segment, ready
// for the existing routePoint follower. Points are deduplicated at joins.
export function walkPathPolyline(graph, path) {
  const points = [];
  const segments = [];
  for (const [step, edgeIndex] of path.edgeIndexes.entries()) {
    const edge = graph.edges[edgeIndex];
    const fromIndex = path.nodeIndexes[step];
    const forward = edge.a === fromIndex;
    const run = forward ? edge.points : [...edge.points].reverse();
    for (const [i, point] of run.entries()) {
      if (i === 0) {
        if (points.length === 0) points.push(point);
      } else {
        points.push(point);
        segments.push({
          surface: edge.surface,
          roadId: edge.roadId ?? null,
          crossesGapstow: edge.crossesGapstow ?? false,
          kind: edge.kind,
        });
      }
    }
  }
  return { points, segments };
}

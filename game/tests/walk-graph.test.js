import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWalkGraph,
  findWalkPath,
  nearestGraphNode,
  walkPathPolyline,
} from '../src/world/walkGraph.js';
import { ROADS, SIDEWALK_WIDTH, WORLD_BOUNDS } from '../src/world/streetGrid.js';

const HALF = SIDEWALK_WIDTH / 2;

function road(id) {
  return ROADS.find((entry) => entry.id === id);
}

test('the graph builds deterministically with sane geometry', () => {
  const first = buildWalkGraph();
  const second = buildWalkGraph();
  assert.deepEqual(
    { nodes: first.nodes, edges: first.edges },
    { nodes: second.nodes, edges: second.edges },
  );
  assert.ok(first.nodes.length > 60, `nodes ${first.nodes.length}`);
  assert.ok(first.edges.length > 80, `edges ${first.edges.length}`);
  for (const edge of first.edges) {
    assert.ok(edge.length > 0);
    assert.notEqual(edge.a, edge.b);
    assert.ok(edge.points.length >= 2);
  }
  // Adjacency is symmetric: each edge appears once from each endpoint.
  for (const [index, edge] of first.edges.entries()) {
    assert.ok(first.adjacency[edge.a].some((entry) => entry.edge === index && entry.to === edge.b));
    assert.ok(first.adjacency[edge.b].some((entry) => entry.edge === index && entry.to === edge.a));
  }
});

test('street corners join sidewalk lines and carry road crossings', () => {
  const graph = buildWalkGraph();
  const fifth = road('fifth-ave');
  const cps = road('cps');
  // The Plaza corner: Fifth's west line meets CPS's north line.
  const corner = graph.byKey.get(
    `${Math.round((fifth.lo - HALF) * 100)}/${Math.round((cps.lo - HALF) * 100)}`,
  );
  assert.notEqual(corner, undefined);
  assert.equal(graph.nodes[corner].kind, 'corner');
  const kinds = graph.adjacency[corner].map((entry) => graph.edges[entry.edge].kind).sort();
  assert.ok(kinds.includes('crossing'), `corner reaches a crossing: ${kinds}`);
  assert.ok(kinds.includes('sidewalk'), `corner reaches pavement: ${kinds}`);
  const crossings = graph.adjacency[corner]
    .map((entry) => graph.edges[entry.edge])
    .filter((edge) => edge.kind === 'crossing');
  for (const crossing of crossings) {
    assert.ok(['fifth-ave', 'cps'].includes(crossing.roadId));
    assert.equal(crossing.surface, 'road');
  }
});

test('map edges, park junctions, and the gate are all present', () => {
  const graph = buildWalkGraph();
  const edgeNodes = graph.nodes.filter((node) => node.kind === 'edge');
  assert.ok(edgeNodes.length >= 8, `world-edge spawn nodes ${edgeNodes.length}`);
  for (const node of edgeNodes) {
    const onX = Math.abs(node.x - WORLD_BOUNDS.minX) < 2 || Math.abs(node.x - WORLD_BOUNDS.maxX) < 2;
    const onZ = Math.abs(node.z - WORLD_BOUNDS.minZ) < 2 || Math.abs(node.z - WORLD_BOUNDS.maxZ) < 2;
    assert.ok(onX || onZ, `edge node at world boundary: ${node.x},${node.z}`);
  }
  assert.ok(graph.edges.some((edge) => edge.kind === 'gate'));
  // Center Drive and the north walk share a junction at [52, -6].
  const junction = graph.byKey.get('5200/-600');
  assert.notEqual(junction, undefined);
  assert.ok(graph.adjacency[junction].length >= 3, 'park junction has at least three ways out');
});

test('a walker can route from the city pavement into the park', () => {
  const graph = buildWalkGraph();
  // West end of Central Park South to the Dairy door.
  const from = nearestGraphNode(graph, WORLD_BOUNDS.minX, road('cps').lo - HALF);
  const to = nearestGraphNode(graph, 25.5, -45.5);
  const path = findWalkPath(graph, from, to);
  assert.notEqual(path, null);
  const kinds = path.edgeIndexes.map((index) => graph.edges[index].kind);
  assert.ok(kinds.includes('gate'), 'the route passes a park gate');
  const direct = Math.hypot(
    graph.nodes[to].x - graph.nodes[from].x,
    graph.nodes[to].z - graph.nodes[from].z,
  );
  assert.ok(path.length >= direct, 'network route is no shorter than the crow flies');
  assert.ok(path.length < direct * 3, `route is not absurd: ${path.length} vs ${direct}`);

  const { points, segments } = walkPathPolyline(graph, path);
  assert.equal(segments.length, points.length - 1);
  const surfaces = new Set(segments.map((segment) => segment.surface));
  assert.ok(surfaces.has('walk') || surfaces.has('road'), 'route uses street surfaces');
  assert.ok(surfaces.has('terrain'), 'route uses park terrain');
});

test('A* matches brute-force shortest distances', () => {
  const graph = buildWalkGraph();
  const dijkstra = (source) => {
    const dist = new Array(graph.nodes.length).fill(Infinity);
    dist[source] = 0;
    const visited = new Set();
    while (visited.size < graph.nodes.length) {
      let best = -1;
      for (let i = 0; i < dist.length; i += 1) {
        if (!visited.has(i) && (best === -1 || dist[i] < dist[best])) best = i;
      }
      if (best === -1 || dist[best] === Infinity) break;
      visited.add(best);
      for (const { edge, to } of graph.adjacency[best]) {
        dist[to] = Math.min(dist[to], dist[best] + graph.edges[edge].length);
      }
    }
    return dist;
  };
  const sources = [0, Math.floor(graph.nodes.length / 2)];
  for (const source of sources) {
    const dist = dijkstra(source);
    for (const target of [3, 11, graph.nodes.length - 1]) {
      const path = findWalkPath(graph, source, target);
      if (dist[target] === Infinity) {
        assert.equal(path, null);
      } else {
        assert.ok(Math.abs(path.length - dist[target]) < 1e-6,
          `A* ${path.length} vs dijkstra ${dist[target]} for ${source}->${target}`);
      }
    }
  }
});

test('crossing edges are short and confined to their road band', () => {
  const graph = buildWalkGraph();
  const crossings = graph.edges.filter((edge) => edge.kind === 'crossing');
  assert.ok(crossings.length >= 10, `crossings ${crossings.length}`);
  for (const crossing of crossings) {
    const band = road(crossing.roadId);
    assert.ok(band, `crossing names a road: ${crossing.roadId}`);
    const width = band.hi - band.lo;
    assert.ok(
      crossing.length <= width + SIDEWALK_WIDTH * 2 + 1e-6,
      `crossing ${crossing.roadId} spans ${crossing.length} for band ${width}`,
    );
  }
});

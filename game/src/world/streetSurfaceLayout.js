// Partition an axis-aligned street grid into non-overlapping road,
// intersection, sidewalk, gutter, and curb rectangles. Rendering and
// collision both consume this result, so a crossing cannot look flat while
// retaining an invisible sidewalk lip.

const EPSILON = 1e-4;

function subtractIntervals(from, to, cuts) {
  const clipped = cuts
    .map(([lo, hi]) => [Math.max(from, lo), Math.min(to, hi)])
    .filter(([lo, hi]) => hi - lo > EPSILON)
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const cut of clipped) {
    const previous = merged.at(-1);
    if (previous && cut[0] <= previous[1] + EPSILON) previous[1] = Math.max(previous[1], cut[1]);
    else merged.push([...cut]);
  }

  const ranges = [];
  let cursor = from;
  for (const [lo, hi] of merged) {
    if (lo - cursor > EPSILON) ranges.push([cursor, lo]);
    cursor = Math.max(cursor, hi);
  }
  if (to - cursor > EPSILON) ranges.push([cursor, to]);
  return ranges;
}

function crosses(horizontal, vertical) {
  const x = (vertical.lo + vertical.hi) / 2;
  const z = (horizontal.lo + horizontal.hi) / 2;
  return x >= horizontal.from && x <= horizontal.to && z >= vertical.from && z <= vertical.to;
}

function horizontalRect(id, range, z, depth, details = {}) {
  return {
    id,
    x: (range[0] + range[1]) / 2,
    z,
    sx: range[1] - range[0],
    sz: depth,
    axis: 'z',
    ...details,
  };
}

function verticalRect(id, range, x, width, details = {}) {
  return {
    id,
    x,
    z: (range[0] + range[1]) / 2,
    sx: width,
    sz: range[1] - range[0],
    axis: 'x',
    ...details,
  };
}

function arcPoints(center, radius, start, end, segments = 7) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / segments;
    return [
      center[0] + Math.cos(angle) * radius,
      center[1] + Math.sin(angle) * radius,
    ];
  });
}

function cornerAngles(xSide, zSide) {
  const start = xSide < 0 ? 0 : Math.PI;
  let end = zSide < 0 ? Math.PI / 2 : -Math.PI / 2;
  if (xSide > 0 && zSide > 0) end += Math.PI * 2;
  return [start, end];
}

function intersectionCorners(horizontal, vertical, sidewalkWidth, gutterWidth, curbWidth) {
  const corners = [];
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      const streetCorner = [
        xSide < 0 ? vertical.lo : vertical.hi,
        zSide < 0 ? horizontal.lo : horizontal.hi,
      ];
      const center = [
        streetCorner[0] + xSide * sidewalkWidth,
        streetCorner[1] + zSide * sidewalkWidth,
      ];
      const [start, end] = cornerAngles(xSide, zSide);
      const sidewalkArc = arcPoints(center, sidewalkWidth, start, end);
      const outerGutterArc = arcPoints(center, sidewalkWidth + gutterWidth, start, end);
      const innerCurbArc = arcPoints(center, sidewalkWidth - curbWidth / 2, start, end);
      const outerCurbArc = arcPoints(center, sidewalkWidth + curbWidth / 2, start, end);
      const id = `${horizontal.id}-${vertical.id}-${xSide < 0 ? 'w' : 'e'}${zSide < 0 ? 'n' : 's'}`;
      corners.push({
        id,
        center,
        streetCorner,
        axis: 'corner',
        sidewalk: [center, ...sidewalkArc],
        road: [streetCorner, ...sidewalkArc],
        gutter: [...sidewalkArc, ...outerGutterArc.reverse()],
        curb: [...innerCurbArc, ...outerCurbArc.reverse()],
      });
    }
  }
  return corners;
}

export function buildStreetSurfaceLayout(roads, options = {}) {
  const sidewalkWidth = options.sidewalkWidth ?? 3.2;
  const gutterWidth = options.gutterWidth ?? 0.42;
  const horizontal = roads.filter((road) => road.axis === 'z');
  const vertical = roads.filter((road) => road.axis === 'x');
  const roadbeds = [];
  const intersections = [];
  const sidewalks = [];
  const gutters = [];
  const curbs = [];
  const corners = [];

  for (const road of horizontal) {
    const perpendicular = vertical.filter((other) => crosses(road, other));
    const roadCuts = perpendicular.map((other) => [other.lo, other.hi]);
    const cornerCuts = perpendicular.map((other) => [
      other.lo - sidewalkWidth,
      other.hi + sidewalkWidth,
    ]);
    const center = (road.lo + road.hi) / 2;
    const width = road.hi - road.lo;
    for (const [index, range] of subtractIntervals(road.from, road.to, roadCuts).entries()) {
      roadbeds.push(horizontalRect(`${road.id}-road-${index}`, range, center, width, {
        roadId: road.id,
        roadCenter: center,
        roadWidth: width,
      }));
    }

    for (const side of [-1, 1]) {
      const sidewalkZ = side < 0 ? road.lo - sidewalkWidth / 2 : road.hi + sidewalkWidth / 2;
      const curbZ = side < 0 ? road.lo : road.hi;
      const gutterZ = side < 0 ? road.lo + gutterWidth / 2 : road.hi - gutterWidth / 2;
      for (const [index, range] of subtractIntervals(road.from, road.to, cornerCuts).entries()) {
        sidewalks.push(horizontalRect(`${road.id}-walk-${side}-${index}`, range, sidewalkZ, sidewalkWidth));
        gutters.push(horizontalRect(`${road.id}-gutter-${side}-${index}`, range, gutterZ, gutterWidth));
        curbs.push(horizontalRect(`${road.id}-curb-${side}-${index}`, range, curbZ, options.curbWidth ?? 0.18));
      }
    }
  }

  for (const road of vertical) {
    const perpendicular = horizontal.filter((other) => crosses(other, road));
    const roadCuts = perpendicular.map((other) => [other.lo, other.hi]);
    const sidewalkCuts = perpendicular.map((other) => [
      other.lo - sidewalkWidth,
      other.hi + sidewalkWidth,
    ]);
    const center = (road.lo + road.hi) / 2;
    const width = road.hi - road.lo;
    for (const [index, range] of subtractIntervals(road.from, road.to, roadCuts).entries()) {
      roadbeds.push(verticalRect(`${road.id}-road-${index}`, range, center, width, {
        roadId: road.id,
        roadCenter: center,
        roadWidth: width,
      }));
    }

    for (const side of [-1, 1]) {
      const sidewalkX = side < 0 ? road.lo - sidewalkWidth / 2 : road.hi + sidewalkWidth / 2;
      const curbX = side < 0 ? road.lo : road.hi;
      const gutterX = side < 0 ? road.lo + gutterWidth / 2 : road.hi - gutterWidth / 2;
      for (const [index, range] of subtractIntervals(road.from, road.to, sidewalkCuts).entries()) {
        sidewalks.push(verticalRect(`${road.id}-walk-${side}-${index}`, range, sidewalkX, sidewalkWidth));
      }
      for (const [index, range] of subtractIntervals(road.from, road.to, sidewalkCuts).entries()) {
        gutters.push(verticalRect(`${road.id}-gutter-${side}-${index}`, range, gutterX, gutterWidth));
        curbs.push(verticalRect(`${road.id}-curb-${side}-${index}`, range, curbX, options.curbWidth ?? 0.18));
      }
    }
  }

  for (const horizontalRoad of horizontal) {
    for (const verticalRoad of vertical) {
      if (!crosses(horizontalRoad, verticalRoad)) continue;
      intersections.push({
        id: `${horizontalRoad.id}-${verticalRoad.id}-intersection`,
        x: (verticalRoad.lo + verticalRoad.hi) / 2,
        z: (horizontalRoad.lo + horizontalRoad.hi) / 2,
        sx: verticalRoad.hi - verticalRoad.lo,
        sz: horizontalRoad.hi - horizontalRoad.lo,
        axis: 'intersection',
        roadIds: [horizontalRoad.id, verticalRoad.id],
      });
      corners.push(...intersectionCorners(
        horizontalRoad,
        verticalRoad,
        sidewalkWidth,
        gutterWidth,
        options.curbWidth ?? 0.18,
      ));
    }
  }

  return {
    roads: roadbeds,
    intersections,
    sidewalks,
    gutters,
    curbs,
    corners,
  };
}

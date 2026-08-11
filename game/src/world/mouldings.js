// Skirting, chair rail, picture rail and cornice for a hand-authored room.
// A room whose walls run straight into the floor and ceiling is the clearest
// tell that an interior was not built by a joiner.
//
// Generated interiors build their own trim inside `interiors.js`, where the
// wall frame is already in hand. This one works from a blueprint instead, so
// the authored rooms can have the same joinery without their walls being
// generated.

const round = (value) => Math.round(value * 1000) / 1000;

// Small hex helpers, so a frieze can be mixed from the colours a room
// already has rather than needing its own palette.
function parse(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function mix(a, b, amount) {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x, y) => Math.round(x + (y - x) * amount);
  return `#${[channel(ar, br), channel(ag, bg), channel(ab, bb)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

function bounds(outline) {
  const xs = outline.map(([x]) => x);
  const zs = outline.map(([, z]) => z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

// The spans a member actually runs along: a moulding stops at an opening and
// picks up on the far side. Only openings whose own height band this member
// crosses count, so the skirting ignores a window with a raised sill while
// the chair rail below its head does not.
function spansFor(wall, length, low, high) {
  const blocked = (wall.openings ?? [])
    .filter((opening) => {
      const bottom = opening.center[1] - opening.size[1] / 2;
      const top = opening.center[1] + opening.size[1] / 2;
      return high > bottom && low < top;
    })
    .map((opening) => [
      opening.center[0] - opening.size[0] / 2 - 0.09,
      opening.center[0] + opening.size[0] / 2 + 0.09,
    ])
    .sort((a, b) => a[0] - b[0]);

  const spans = [];
  let cursor = -length / 2;
  for (const [from, to] of blocked) {
    if (from - cursor > 0.25) spans.push([cursor, from]);
    cursor = Math.max(cursor, to);
  }
  if (length / 2 - cursor > 0.25) spans.push([cursor, length / 2]);
  return spans;
}

// Which way a wall runs, and which of its two faces is the room side.
function frameOf(wall, centre) {
  const alongX = wall.size[0] >= wall.size[2];
  const wallAt = wall.position[alongX ? 2 : 0];
  return {
    alongX,
    wallAt,
    length: alongX ? wall.size[0] : wall.size[2],
    halfThickness: (alongX ? wall.size[2] : wall.size[0]) / 2,
    inward: Math.sign((alongX ? centre.z : centre.x) - wallAt) || 1,
    offset: alongX ? wall.position[0] : wall.position[2],
  };
}

// A picture rail hung a little above the window heads, as it was, and never
// so high it fouls the cornice.
export function pictureRailHeight(blueprint) {
  const height = blueprint.dimensions.ceiling;
  const heads = blueprint.walls.flatMap((wall) =>
    (wall.openings ?? [])
      .filter((opening) => opening.type === 'window')
      .map((opening) => opening.center[1] + opening.size[1] / 2),
  );
  return round(Math.min(height - 0.5, (heads.length ? Math.max(...heads) : height - 1.2) + 0.3));
}

/**
 * Trim boxes for every wall in a blueprint, as furniture items.
 * `dado` adds a chair rail; `pictureRail` sets its height, and defaults to
 * a little above the window heads.
 */
export function blueprintMouldings(blueprint, options = {}) {
  const { trim = '#3a2c1e', ceiling = '#eef0ed', dado = false } = options;
  const floorY = blueprint.dimensions.floorY ?? 0;
  const height = blueprint.dimensions.ceiling;
  const centre = bounds(blueprint.outline);
  const items = [];
  const railY = options.pictureRail ?? pictureRailHeight(blueprint);

  for (const wall of blueprint.walls) {
    const { alongX, length, halfThickness, wallAt, inward, offset } = frameOf(wall, centre);

    const member = (id, y, memberHeight, factor, color) => {
      const thickness = 0.09 * factor;
      for (const [from, to] of spansFor(wall, length, y - memberHeight / 2, y + memberHeight / 2)) {
        const along = (from + to) / 2 + offset;
        // Sits proud of the wall face by half its own depth.
        const fixed = wallAt + inward * (halfThickness + thickness / 2);
        items.push({
          id: `${id}-${wall.id}-${round(along)}`,
          kind: 'furniture',
          position: alongX ? [round(along), round(y), round(fixed)] : [round(fixed), round(y), round(along)],
          size: alongX
            ? [round(to - from), round(memberHeight), round(thickness)]
            : [round(thickness), round(memberHeight), round(to - from)],
          yaw: 0,
          color,
          collider: false,
        });
      }
    };

    // Each moulding is stepped rather than one flat board. A single box
    // reads as a painted stripe; the step is what catches the light.
    member('skirting', floorY + 0.11, 0.22, 1.0, trim);
    member('skirting-cap', floorY + 0.245, 0.05, 1.9, trim);
    if (dado) {
      member('chair-rail', floorY + 0.95, 0.07, 2.0, trim);
      member('chair-bead', floorY + 0.895, 0.03, 1.3, trim);
    }
    member('picture-rail', railY, 0.05, 1.9, trim);
    member('picture-bead', railY - 0.045, 0.03, 1.2, trim);
    // Cornice takes the ceiling's colour, not the trim's: it is plaster run
    // in place, and it was whitened with the ceiling.
    member('cornice', floorY + height - 0.1, 0.2, 2.6, ceiling);
    member('cornice-bed', floorY + height - 0.235, 0.08, 1.6, ceiling);
  }

  return items;
}

/**
 * The frieze: the band of wall between the picture rail and the cornice,
 * papered or painted differently from the fill below it. Dividing the wall
 * into dado, fill and frieze is the single most recognisable thing about a
 * room of this date, and one paper run floor to ceiling is what makes a
 * reconstruction read as modern.
 */
export function friezeBand(blueprint, options = {}) {
  const { wall: wallColor = '#8d8371', ceiling = '#eef0ed' } = options;
  const floorY = blueprint.dimensions.floorY ?? 0;
  const height = blueprint.dimensions.ceiling;
  const centre = bounds(blueprint.outline);
  const railY = options.pictureRail ?? pictureRailHeight(blueprint);
  // Between the top of the picture rail and the underside of the cornice.
  const low = railY + 0.05;
  const high = floorY + height - 0.28;
  if (high - low < 0.15) return [];
  // A light ground, as friezes usually took: it lifts the top of the room
  // and keeps the ceiling from starting abruptly.
  const color = options.color ?? mix(ceiling, wallColor, 0.32);
  const items = [];

  for (const wall of blueprint.walls) {
    const { alongX, length, halfThickness, wallAt, inward, offset } = frameOf(wall, centre);
    const thickness = 0.02;
    for (const [from, to] of spansFor(wall, length, low, high)) {
      const along = (from + to) / 2 + offset;
      const fixed = wallAt + inward * (halfThickness + thickness / 2);
      items.push({
        id: `frieze-${wall.id}-${round(along)}`,
        kind: 'furniture',
        position: alongX
          ? [round(along), round((low + high) / 2), round(fixed)]
          : [round(fixed), round((low + high) / 2), round(along)],
        size: alongX
          ? [round(to - from), round(high - low), thickness]
          : [thickness, round(high - low), round(to - from)],
        yaw: 0,
        color,
        collider: false,
      });
    }
  }
  return items;
}

/**
 * A run of moulding set in from the cornice, boxing a panel out of the
 * ceiling. Plain plaster overhead is the last flat surface left in a room
 * that has had its walls divided.
 */
export function ceilingPanel(blueprint, options = {}) {
  const { ceiling = '#eef0ed', inset = 1.1 } = options;
  const floorY = blueprint.dimensions.floorY ?? 0;
  const height = blueprint.dimensions.ceiling;
  const centre = bounds(blueprint.outline);
  const xs = blueprint.outline.map(([x]) => x);
  const zs = blueprint.outline.map(([, z]) => z);
  const halfW = (Math.max(...xs) - Math.min(...xs)) / 2 - inset;
  const halfD = (Math.max(...zs) - Math.min(...zs)) / 2 - inset;
  // Too small a panel reads as a box on the ceiling rather than a border.
  if (halfW < 1.2 || halfD < 1.2) return [];

  const width = 0.14;
  const depth = 0.06;
  const y = round(floorY + height - depth / 2);
  const runs = [
    ['n', centre.x, centre.z - halfD, halfW * 2 + width, width],
    ['s', centre.x, centre.z + halfD, halfW * 2 + width, width],
    ['w', centre.x - halfW, centre.z, width, halfD * 2 + width],
    ['e', centre.x + halfW, centre.z, width, halfD * 2 + width],
  ];
  return runs.map(([id, x, z, sx, sz]) => ({
    id: `ceiling-panel-${id}`,
    kind: 'furniture',
    position: [round(x), y, round(z)],
    size: [round(sx), depth, round(sz)],
    yaw: 0,
    color: ceiling,
    collider: false,
  }));
}

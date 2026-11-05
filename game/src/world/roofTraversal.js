import { roofCapTop, rooftops } from './rooftops.js';
import { streetItems, WALK_TOP } from './streetGrid.js';

const buildings = streetItems.filter((item) => item.roofRun);
const alleyFloor = WALK_TOP - 0.015;

export const STREET_ROOF_LADDERS = [];
export const STREET_ROOF_ITEMS = [];

function solid(id, position, size, yaw = 0, shape) {
  STREET_ROOF_ITEMS.push({ id, kind: 'roof-collider', position, size, yaw, shape, absoluteY: true, render: false });
}

function iron(id, position, size, yaw, color = '#49392f') {
  STREET_ROOF_ITEMS.push({ id, kind: 'block-infill', infillType: 'roof-ironwork', position, size, yaw, color, absoluteY: true, collider: false });
}

for (const item of buildings) {
  const [x, , z] = item.position;
  const width = item.size[0] + 0.5;
  const depth = item.size[2] + 0.5;
  const roof = roofCapTop(item);
  solid(`${item.id}-walkable-roof`, [x, roof - 0.25, z], [width, 0.5, depth]);

  // Leave both ends of the street-side run open for jumps.
  for (const side of [-1, 1]) {
    const position = [x, roof + 0.22, z + side * (depth / 2 - 0.13)];
    const size = [width - 0.14, 0.44, 0.23];
    STREET_ROOF_ITEMS.push({ id: `${item.id}-parapet-${side}`, kind: 'block-infill', infillType: 'roof-parapets',
      position, size, color: '#6f5a4b', absoluteY: true });
  }
}

const dressing = rooftops(buildings);
for (const [kind, pieces] of Object.entries({ chimney: dressing.stacks, bulkhead: dressing.bulkheads, skylight: dressing.skylights })) {
  pieces.forEach(({ x, y, z, width, height = 0.5, length, yaw }, index) => {
    solid(`traversal-${kind}-${index}`, [x, y + height / 2, z], [width, height, length], yaw);
  });
}
dressing.tanks.forEach(({ x, y, z, radius, height, legs }, index) => {
  solid(`traversal-tank-${index}`, [x, y + legs + height / 2, z], [radius * 2, height, radius * 2], 0, 'cylinder');
  solid(`traversal-tank-deck-${index}`, [x, y + legs - 0.125, z], [radius * 2, 0.25, radius * 2]);
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    solid(`traversal-tank-leg-${index}-${dx}-${dz}`, [x + dx * radius * 0.72, y + legs / 2, z + dz * radius * 0.72], [0.24, legs, 0.24]);
  }
});

for (const [index, side] of [[0, -1], [buildings.length - 1, 1]]) {
  const item = buildings[index];
  const wall = item.position[0] + side * item.size[0] / 2;
  const z = item.position[2] - 3.45;
  const x = wall + side * 0.33;
  const roof = roofCapTop(item);
  const yaw = side * Math.PI / 2;
  const id = `${item.id}-roof-ladder`;
  const rungSpacing = 0.28;
  const rungBase = alleyFloor + 0.19;
  const rungCount = Math.floor((roof - rungBase) / rungSpacing) + 1;
  const ladder = {
    id, type: 'ladder', yaw, rungSpacing, rungBase, rungCount,
    rungPosition: [x, z], climbSpeed: 1.65,
    low: [x + side * 0.43, alleyFloor + 0.05, z],
    high: [x + side * 0.43, roof + 0.15, z],
    top: [wall - side * 0.64, roof + 0.05, z],
    upLabel: 'Climb to the roof', downLabel: 'Climb down to the alley',
    alleyViewZ: side < 0 ? z - 3.2 : undefined,
  };
  STREET_ROOF_LADDERS.push(ladder);
  solid(`${id}-approach`, [wall + side * 0.79, alleyFloor - 0.1, z - 0.8], [1.48, 0.2, 3.5]);
  const railHeight = roof + 0.89 - alleyFloor;
  for (const rail of [-1, 1]) {
    const railZ = z + rail * 0.34;
    iron(`${id}-rail-${rail}`, [x, alleyFloor + railHeight / 2, railZ], [0.062, railHeight, 0.072], yaw);
    for (let y = alleyFloor + 0.55, n = 0; y < roof - 0.45; y += 2.2, n += 1) {
      iron(`${id}-bracket-${rail}-${n}`, [wall + side * 0.165, y, railZ], [0.09, 0.09, 0.37], yaw);
    }
  }
  for (let rung = 0; rung < rungCount; rung += 1) {
    iron(`${id}-rung-${rung}`, [x, rungBase + rung * rungSpacing, z], [0.69, 0.046, 0.052], yaw, '#5a4940');
  }
}

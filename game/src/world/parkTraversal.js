import { terrainHeight } from './terrain.js';

const x = 93;
const z = 56.8;
const ground = terrainHeight(x, z);
const deck = ground + 2.25;

// A maintenance platform off the drive near Scholars' Gate. Keep its climb
// path and physical parts together so moving the platform moves its rungs.
export const PARK_TRAVERSAL = [
  {
    type: 'ladder', id: 'maintenance-ladder', yaw: 0,
    low: [x, ground + 0.05, z + 0.43],
    high: [x, deck + 0.12, z + 0.43],
    top: [x, deck + 0.05, z - 0.59],
    rungBase: ground + 0.19, rungSpacing: 0.26, rungCount: 9, rungPosition: [x, z],
  },
  {
    type: 'vault', id: 'maintenance-crate', yaw: 0,
    position: [94, terrainHeight(94, z + 3.2), z + 3.2],
    height: 0.64,
  },
];

function board(id, position, size, color, collider = true) {
  return { id, kind: 'prop', position, size, color, finish: 'plank', collider, absoluteY: true };
}

const ladder = PARK_TRAVERSAL[0];
const crate = PARK_TRAVERSAL[1];
export const PARK_TRAVERSAL_ITEMS = [
  board('maintenance-platform', [x, deck - 0.09, z - 1.12], [2.7, 0.18, 2.14], '#6c4b33'),
  ...[-1, 1].flatMap((side) => [
    ...[0.28, 1.94].map((back, index) => board(
      `maintenance-post-${side}-${index}`, [x + side * 1.12, (ground + deck) / 2, z - back],
      [0.13, deck - ground, 0.13], '#63432c',
    )),
    board(`maintenance-rail-${side}`, [x + side * 0.34, ground + 1.58, z], [0.072, 3.16, 0.09], '#563d2b', false),
  ]),
  ...Array.from({ length: ladder.rungCount }, (_, index) => board(
    `maintenance-rung-${index}`, [x, ladder.rungBase + index * ladder.rungSpacing, z],
    [0.7, 0.052, 0.065], '#79543a', false,
  )),
  board(crate.id, [crate.position[0], crate.position[1] + crate.height / 2, crate.position[2]], [1.28, crate.height, 0.75], '#927354'),
  ...[-1, 1].map((side) => board(`crate-batten-${side}`, [crate.position[0] + side * 0.44, crate.position[1] + 0.31, crate.position[2] + 0.386], [0.085, 0.59, 0.035], '#6c4b33', false)),
];

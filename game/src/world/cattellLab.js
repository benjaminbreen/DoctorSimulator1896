// What stands in Cattell's laboratory, and where.
//
// The room is laid out the way the testing programme ran it. A freshman came
// in at the corridor door, sat at the testing table nearest it, and was taken
// through the ten measurements in order; the timing apparatus stood on its
// own bench away from the traffic, because a chronoscope knocked out of level
// reads wrong and has to be recalibrated against a falling weight.
//
// Bench height is 0.9m throughout, so anything standing on one is placed at
// that height and nothing has to be measured twice.

import {
  labBench,
  labStool,
  dynamometer,
  movementRail,
  aesthesiometer,
  algometer,
  liftedWeights,
  hippChronoscope,
  reactionKey,
  colourWheel,
  lineBisector,
  secondsPendulum,
  cardRack,
  kymograph,
  tachistoscope,
  inductionCoil,
  tuningForks,
  batteryJars,
  pendantLamp,
} from './instruments.js';
import { bookcase } from './furnishings.js';
import { blueprintMouldings } from './mouldings.js';

const BENCH = 0.9;

export function cattellLabItems(blueprint, lighting) {
  const { width: W, depth: D, ceiling: H } = blueprint.dimensions;
  const wx = -W / 2 + 0.15;
  const ex = W / 2 - 0.15;
  const nz = -D / 2 + 0.25;
  const items = [];
  const add = (list) => items.push(...list);

  // Benches: two under the windows, one down each party wall, and an island
  // across the middle of the room.
  add(labBench('bench-window-w', -2.2, nz + 0.42, 0, { length: 3.4 }));
  add(labBench('bench-window-e', 2.2, nz + 0.42, 0, { length: 3.4 }));
  add(labBench('bench-east', ex - 0.4, -0.6, Math.PI / 2, { length: 4.4 }));
  add(labBench('bench-west', wx + 0.4, -1.4, Math.PI / 2, { length: 3.2 }));
  add(labBench('bench-island', 0, 2.2, 0, { length: 3.0, depth: 0.9 }));

  // Timing apparatus, on the east bench and out of the walking line. The
  // chronoscope, its key, and the battery and coil that drive them.
  add(hippChronoscope('chronoscope', ex - 0.5, BENCH, -1.6, -Math.PI / 2));
  add(reactionKey('reaction-key', ex - 0.55, BENCH, -0.7, -Math.PI / 2));
  add(batteryJars('battery', ex - 0.5, BENCH, 0.6, -Math.PI / 2));
  const coil = inductionCoil('coil', ex - 0.5, BENCH, 1.5, -Math.PI / 2);
  coil[0] = {
    ...coil[0],
    affordance: {
      verb: 'Use',
      name: 'the induction coil',
      kind: 'instrument',
      instrument: 'induction-coil',
      group: 'coil',
    },
  };
  add(coil);

  // Recording and stimulus apparatus on the west bench.
  add(kymograph('kymograph', wx + 0.5, BENCH, -2.5));
  // The one piece wired for instrument mode so far. The affordance rides on
  // the item the player can reach — the foot of the frame.
  const tach = tachistoscope('tachistoscope', wx + 0.55, BENCH, -1.1, Math.PI / 2);
  tach[0] = {
    ...tach[0],
    affordance: {
      verb: 'Use',
      name: 'the tachistoscope',
      kind: 'instrument',
      instrument: 'tachistoscope',
      // Every item whose id starts with this belongs to the piece, so the room
      // copy can be taken down while the working copy is standing in for it.
      group: 'tachistoscope',
    },
  };
  add(tach);
  add(tuningForks('forks', wx + 0.5, BENCH, -0.1, Math.PI / 2));
  const wheel = colourWheel('colour-wheel', -2.2, BENCH, nz + 0.42, 0);
  wheel[0] = {
    ...wheel[0],
    affordance: {
      verb: 'Use',
      name: 'the colour wheel',
      kind: 'instrument',
      instrument: 'colour-wheel',
      group: 'colour-wheel',
    },
  };
  add(wheel);

  // The testing table itself: the ten measurements in the order they were
  // taken, left to right along the island.
  add(dynamometer('dynamometer', -1.15, BENCH, 2.0));
  add(movementRail('movement-rail', -0.35, BENCH, 2.25));
  add(aesthesiometer('aesthesiometer', 0.45, BENCH, 2.0));
  add(algometer('algometer', 0.95, BENCH, 2.35));
  add(liftedWeights('weights', 1.35, BENCH, 2.0));
  add(lineBisector('line-bisector', 0.1, BENCH, 1.9));
  add(cardRack('card-rack', -1.3, BENCH, 2.45));

  // Under the window, where the subject sits to judge ten seconds.
  add(secondsPendulum('pendulum', 3.3, BENCH, nz + 0.42, Math.PI));

  // Stools: two at the island, one at each working bench.
  add(labStool('stool-island-w', -0.8, 3.05));
  add(labStool('stool-island-e', 0.6, 3.05));
  add(labStool('stool-east', ex - 1.3, -1.0));
  add(labStool('stool-west', wx + 1.3, -1.9));

  // A case of journals and the recording books.
  add(bookcase('lab-case', wx + 0.35, 3.4, Math.PI / 2, { height: 2.2, width: 1.8, depth: 0.36 }));

  // Three pendants down the middle of the room, matching the light markers.
  for (const z of [-3.4, 0.4, 4.0]) {
    add(pendantLamp(`pendant-${z}`, 0, H, z, { drop: 0.85 }));
  }

  // Plain joinery: skirting, a picture rail, and a cornice. No dado and no
  // frieze — a laboratory wall took one coat of distemper.
  add(
    blueprintMouldings(blueprint, {
      trim: lighting.materials.trim,
      ceiling: lighting.materials.ceiling,
      pictureRail: 3.5,
    }),
  );

  // A blackboard on the corridor wall, which is where the day's series and
  // the constants for the chronoscope were kept.
  const board = (suffix, x, y, z, size, color) =>
    items.push({
      id: `blackboard-${suffix}`,
      kind: 'furniture',
      position: [x, y, z],
      size,
      yaw: 0,
      color,
      collider: false,
    });
  const sz = D / 2 - 0.16;
  board('face', -1.6, 1.9, sz, [2.6, 1.3, 0.03], '#23282a');
  board('frame-top', -1.6, 2.58, sz - 0.01, [2.72, 0.06, 0.05], '#4a4038');
  board('frame-foot', -1.6, 1.19, sz - 0.02, [2.72, 0.1, 0.08], '#4a4038');
  for (const side of [-1, 1]) {
    board(`frame-${side}`, -1.6 + side * 1.33, 1.9, sz - 0.01, [0.06, 1.36, 0.05], '#4a4038');
  }

  return items;
}

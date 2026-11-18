import { blueprintMouldings } from './mouldings.js';
import { colourWheel, tuningForks } from './instruments.js';

const spawn = [3.9, 0, 1.35];
const facing = [-0.7, 0, -0.85];

export const notebookTransition = {
  id: 'harvard-notebook',
  label: 'Open your Harvard notebook · Dane Hall',
  position: [-0.5, 5.57],
  radius: 0.92,
  to: { zone: 'dane-hall', spawn, facing },
};

const door = (id, x, width, blocked) => ({
  id,
  type: 'door',
  center: [x, 1.4],
  size: [width, 2.8],
  sillHeight: 0,
  blocked,
});
const windows = [-3.85, -1.65, 0.55, 2.75].map((z, i) => ({
  id: 'yard-' + i,
  type: 'window',
  center: [z, 2.12],
  size: [1.48, 2.62],
  sillHeight: 0.81,
}));
function wall(id, x, z, width, depth, openings = []) {
  return { id, position: [x, 2.25, z], size: [width, 4.5, depth], yaw: 0, openings };
}

const blueprint = {
  id: 'DANE_HALL',
  label: 'Dane Hall · Harvard',
  schemaVersion: 1,
  dimensions: { width: 13.4, depth: 11.8, ceiling: 4.5, floorY: 0 },
  outline: [
    [-6.7, 5.9],
    [6.7, 5.9],
    [6.7, -5.9],
    [-6.7, -5.9],
  ],
  navigation: { defaultSpawn: spawn, defaultFacing: facing },
  walls: [
    wall('cabinet-wall', 0, -5.9, 13.4, 0.3),
    wall('landing-wall', 0, 5.9, 13.4, 0.3, [door('stairs', 4.45, 1.28, true)]),
    wall('partition', 0, 3.7, 13.4, 0.18, [door('classroom-door', 4.45, 1.65, false)]),
    wall('slate-wall', -6.7, 0, 0.3, 11.8),
    wall('yard-wall', 6.7, 0, 0.36, 11.8, windows),
  ],
  transitions: [
    {
      id: 'return-office',
      label: 'Return to your consulting room',
      position: [4.45, 5.27],
      radius: 0.78,
      to: { zone: 'consulting-office', spawn: [-1.65, 0, 5.35], facing: [-0.25, 0, -1] },
    },
  ],
  furniture: [],
  props: [],
};

const lighting = {
  id: 'DANE_DAYLIGHT',
  ambient: { color: '#f2dfc6', intensity: 0.44 },
  hemisphere: { skyColor: '#e3edfa', groundColor: '#ae8b64', intensity: 0.83 },
  windowSky: '#e3e4d8',
  windowPortals: windows.map((w, i) => ({
    windowId: w.id,
    color: '#fff0d3',
    intensity: i === 1 ? 1.5 : 0.15,
    azimuthDeg: -27,
    elevationDeg: 29,
    castShadow: i === 1,
  })),
  gaslights: [],
  exposureBase: 1,
  materials: {
    wall: '#d2c8ae',
    floor: '#938069',
    ceiling: '#e6dfcd',
    trim: '#54412f',
    floorTexture: 'dane-hall/floor.webp',
    floorTextureFitsRoom: true,
    floorRoughness: 0.7,
  },
};

export const tables = [
  { x: -2.7, z: -1.65 },
  { x: 1.4, z: -1.65 },
  { x: -2.7, z: 1.12 },
  { x: 1.4, z: 1.12 },
];
export const seats = tables.flatMap(({ x, z }, row) =>
  [-0.65, 0.67].map((offset, side) => ({
    x: x + offset,
    z: z + 0.7,
    yaw: Math.PI + [0.12, 0.24, -0.08, 0.16][row] + side * 0.05,
    occupied: !((row === 3 && side === 1) || (row === 2 && side === 0)),
  })),
);

function framed(id, file, x, y, z, width, height, yaw = 0) {
  return {
    id,
    kind: 'wallArt',
    art: 'engraving',
    artTexture: '/textures/dane-hall/' + file,
    moulding: 'walnut',
    frameRail: 0.04,
    mount: 0.008,
    position: [x, y, z],
    size: [width, height, 0.05],
    yaw,
    collider: false,
  };
}

export const daneHall = {
  blueprint,
  lighting,
  features: ['dane-classroom'],
  extraItems: [
    ...blueprintMouldings(blueprint, {
      trim: lighting.materials.trim,
      ceiling: lighting.materials.ceiling,
      pictureRail: 3.77,
    }),
    framed('dane-slate', 'slate.webp', -6.49, 2.28, -1.48, 4.15, 1.85, Math.PI / 2),
    { ...framed('hanging-chart', 'plate-2.webp', 0.27, 2.19, 3.54, 1.77, 1.52, Math.PI), moulding: 'none' },
    framed('spinal-chart', 'spine.webp', -6.48, 2.28, -4.56, 0.64, 1.61, Math.PI / 2),
    framed('cerebrum-plate', 'plate-2.webp', -4.42, 3.76, -5.56, 1.08, 0.93),
    framed('cortex-plate', 'plate-1.webp', -2.96, 3.77, -5.54, 0.95, 0.82),
    ...colourWheel('dane-disc', -5.78, 0.9, -2.76, Math.PI / 2),
    ...tuningForks('dane-forks', -5.85, 0.9, -0.5, Math.PI / 2),
    ...seats.flatMap((seat, i) =>
      seat.occupied
        ? []
        : [
            {
              id: 'student-seat-' + i,
              kind: 'furniture',
              position: [seat.x, 0, seat.z],
              yaw: seat.yaw,
              size: [0.002, 0.002, 0.002],
              collider: false,
              color: '#543923',
              affordance: { kind: 'seat', verb: 'Take', name: 'an empty place in class' },
            },
          ],
    ),
  ],
};

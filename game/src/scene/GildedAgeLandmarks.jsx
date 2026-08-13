import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createFacadeMaterial } from './facadeMaterials.js';
import { notice } from '../world/notices.js';

const SUPPORTED_MODELS = new Set([
  'vanderbilt-mansion',
  'new-netherland-hotel',
  'savoy-hotel',
  'bolkenhayn-apartments',
  'marble-row',
  'huntington-mansion',
  'gerry-mansion',
]);

const PALE_STONE = '#d9d0bd';
const LIGHT_STONE = '#eee6d3';
const SHADOW_STONE = '#a99f8e';
const DARK_STONE = '#746b61';
const BRICK = '#805143';
const BRICK_LIGHT = '#a36d54';
const SLATE = '#343c40';
const SLATE_LIGHT = '#475257';
const COPPER = '#4d766d';
const GLASS = '#35464d';
const GLASS_LIGHT = '#687675';
const SASH = '#292c2a';
const IRON = '#252a29';
const DOOR = '#3a2b24';

const NO_RAYCAST = () => {};

export function isGildedAgeLandmark(item) {
  return SUPPORTED_MODELS.has(item?.landmarkModel);
}

function part(position, size, color, rotation = [0, 0, 0], item = null) {
  return { position, size, color, rotation, item };
}

function worldPart(item, localPosition, size, color, rotation = [0, 0, 0]) {
  const yaw = item.yaw ?? 0;
  const [x, y, z] = localPosition;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return part(
    [
      item.position[0] + x * cos + z * sin,
      item.position[1] + y,
      item.position[2] - x * sin + z * cos,
    ],
    size,
    color,
    [rotation[0], rotation[1] + yaw, rotation[2]],
    item,
  );
}

function createGableGeometry() {
  const geometry = new THREE.BufferGeometry();
  // Six shared vertices and outward-wound faces make a watertight triangular
  // prism. The earlier triangle soup wound both end caps inward, which made
  // mansion roofs disappear from common street-view angles.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, -0.5, // 0 front left
    0.5, -0.5, -0.5, // 1 front right
    0, 0.5, -0.5, // 2 front ridge
    -0.5, -0.5, 0.5, // 3 rear left
    0.5, -0.5, 0.5, // 4 rear right
    0, 0.5, 0.5, // 5 rear ridge
  ], 3));
  geometry.setIndex([
    0, 2, 1, // front
    3, 4, 5, // rear
    0, 3, 5, 0, 5, 2, // left roof plane
    1, 2, 5, 1, 5, 4, // right roof plane
    0, 1, 4, 0, 4, 3, // closed underside
  ]);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function useSharedGeometry() {
  const geometry = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    pyramid: new THREE.ConeGeometry(1, 1, 4),
    cone: new THREE.ConeGeometry(1, 1, 14),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    gable: createGableGeometry(),
  }), []);
  useEffect(() => () => Object.values(geometry).forEach((entry) => entry.dispose()), [geometry]);
  return geometry;
}

// Near-white grain with faint joint lines; instance colors multiply on top,
// so one texture serves marble, brownstone, and granite trim alike.
function makeStoneTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = (hash - Math.floor(hash)) * 16 - 8;
      const wave = Math.sin(x * 0.35 + Math.sin(y * 0.22) * 2.2) * 4;
      const joint = y % 32 < 2 ? -18 : 0;
      const value = 234 + noise + wave + joint;
      data[index] = value;
      data[index + 1] = value - 2;
      data[index + 2] = value - 5;
      data[index + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  return map;
}

function useSharedMaterials() {
  // No vertexColors flag: the shared geometries carry no color attribute, so
  // enabling it multiplied every instance by black. Per-instance color comes
  // from setColorAt alone.
  const materials = useMemo(() => {
    const stoneMap = makeStoneTexture();
    return {
      stoneMap,
      stone: new THREE.MeshStandardMaterial({ color: '#ffffff', map: stoneMap, bumpMap: stoneMap, bumpScale: 0.02, roughness: 0.9 }),
      roof: new THREE.MeshStandardMaterial({ color: '#ffffff', map: stoneMap, bumpMap: stoneMap, bumpScale: 0.012, roughness: 0.78, metalness: 0.04 }),
      glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.02 }),
      iron: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.54, metalness: 0.68 }),
      copper: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.58, metalness: 0.48 }),
    };
  }, []);
  useEffect(() => () => Object.values(materials).forEach((entry) => entry.dispose()), [materials]);
  return materials;
}

function InstancedParts({ name, parts, geometry, material, shadows = false }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    parts.forEach((record, index) => {
      dummy.position.set(...record.position);
      dummy.rotation.set(...record.rotation);
      dummy.scale.set(...record.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(record.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [color, dummy, parts]);
  if (!parts.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, parts.length]}
      castShadow={shadows}
      receiveShadow
      raycast={NO_RAYCAST}
    />
  );
}

function ShellBatch({ entries, facadeTextures, style }) {
  const ref = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tint = useMemo(() => new THREE.Color(), []);
  const material = useMemo(
    () => createFacadeMaterial(facadeTextures, style, style * 137 + 19, false, 0, null, true),
    [facadeTextures, style],
  );
  useEffect(() => () => material.dispose(), [material]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    entries.forEach((record, index) => {
      dummy.position.set(...record.position);
      dummy.rotation.set(...record.rotation);
      dummy.scale.set(...record.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, tint.set(record.color ?? '#ffffff'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [dummy, entries, tint]);
  const identify = (event) => {
    if ((event.delta ?? 0) > 5) return;
    const item = entries[event.instanceId]?.item;
    if (!item?.landmarkLabel) return;
    event.stopPropagation();
    notice(item.landmarkLabel, { key: 'building-identification', seconds: 4, detail: 'Landmark' });
  };
  if (!entries.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={`landmark-shell-style-${style}`}
      args={[undefined, undefined, entries.length]}
      material={material}
      receiveShadow
      onClick={identify}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}

function addShell(batches, item, localPosition, size, style, tint = '#ffffff') {
  const list = batches.shells.get(style) ?? [];
  list.push(worldPart(item, localPosition, size, tint));
  batches.shells.set(style, list);
}

function addBox(batches, bucket, item, localPosition, size, color, rotation) {
  batches[bucket].push(worldPart(item, localPosition, size, color, rotation));
}

function facePlacement(item, face, along, y, out, width, height, depth = 0.08) {
  const [sx, , sz] = item.size;
  if (face === '+x') return worldPart(item, [sx / 2 + out, y, along], [depth, height, width], GLASS);
  if (face === '-x') return worldPart(item, [-sx / 2 - out, y, along], [depth, height, width], GLASS);
  if (face === '+z') return worldPart(item, [along, y, sz / 2 + out], [width, height, depth], GLASS);
  return worldPart(item, [along, y, -sz / 2 - out], [width, height, depth], GLASS);
}

function addWindow(batches, item, face, along, y, width = 1.25, height = 2.0, options = {}) {
  const surround = facePlacement(item, face, along, y, 0.035, width + 0.42, height + 0.42, 0.14);
  surround.color = options.stone ?? PALE_STONE;
  batches.stone.push(surround);
  const pane = facePlacement(item, face, along, y, 0.115, width, height, 0.075);
  pane.color = options.lit ? GLASS_LIGHT : GLASS;
  batches.glass.push(pane);
  const vertical = facePlacement(item, face, along, y, 0.165, 0.075, height, 0.05);
  vertical.color = SASH;
  batches.iron.push(vertical);
  const horizontal = facePlacement(item, face, along, y, 0.17, width, 0.075, 0.05);
  horizontal.color = SASH;
  batches.iron.push(horizontal);
  if (options.hood) {
    const hood = facePlacement(item, face, along, y + height / 2 + 0.22, 0.18, width + 0.64, 0.18, 0.3);
    hood.color = options.stone ?? LIGHT_STONE;
    batches.stone.push(hood);
  }
}

function addWindowGrid(batches, item, faces, alongValues, floorValues, options = {}) {
  faces.forEach((face, faceIndex) => {
    alongValues(face).forEach((along, column) => {
      floorValues.forEach((y, floor) => addWindow(batches, item, face, along, y, options.width, options.height, {
        ...options,
        hood: options.hood && floor === floorValues.length - 1,
        lit: (column + floor * 2 + faceIndex) % 7 === 1,
      }));
    });
  });
}

function addCourse(batches, item, y, color = PALE_STONE, extension = 0.35, thickness = 0.22) {
  const [sx, , sz] = item.size;
  addBox(batches, 'stone', item, [0, y, 0], [sx + extension, thickness, sz + extension], color);
}

// Frame and leaf sit well proud of the wall so no base plinth or shell face
// (they vary from +0.15 to +0.2 per building) can z-fight the surround.
function addDoor(batches, item, face, along, y, width = 1.7, height = 3.1, canopy = true) {
  const frame = facePlacement(item, face, along, y, 0.24, width + 0.65, height + 0.55, 0.2);
  frame.color = LIGHT_STONE;
  batches.stone.push(frame);
  const door = facePlacement(item, face, along, y - 0.04, 0.38, width, height, 0.12);
  door.color = DOOR;
  batches.iron.push(door);
  if (canopy) {
    const canopyPart = facePlacement(item, face, along, y + height / 2 + 0.32, 0.65, width + 1.0, 0.16, 1.05);
    canopyPart.color = COPPER;
    batches.copper.push(canopyPart);
  }
}

function addDormer(batches, item, face, along, y, width = 1.2, height = 1.5) {
  addWindow(batches, item, face, along, y, width, height, { stone: LIGHT_STONE });
  const roof = facePlacement(item, face, along, y + height / 2 + 0.48, 0.28, width * 0.86, 0.72, 0.7);
  roof.color = SLATE;
  batches.roofBoxes.push(roof);
}

function buildVanderbilt(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  addShell(batches, item, [0, -0.35, 0], [sx - 1.1, sy - 0.7, sz - 1.4], 2, '#efe6d6');
  addShell(batches, item, [sx * 0.32, 0.65, sz * 0.31], [sx * 0.33, sy + 1.3, sz * 0.31], 2, '#f0e7d9');
  addShell(batches, item, [sx * 0.34, 0.2, -sz * 0.29], [sx * 0.27, sy + 0.4, sz * 0.3], 2, '#e6ddce');
  addCourse(batches, item, bottom + 3.1, SHADOW_STONE, 0.8, 0.45);
  addCourse(batches, item, bottom + 7.1, PALE_STONE, 0.7, 0.3);
  addCourse(batches, item, sy / 2 - 0.4, LIGHT_STONE, 1.25, 0.5);
  batches.roofPyramids.push(worldPart(item, [-sx * 0.08, sy / 2 + 2.7, 0], [sx * 0.54, 5.4, sz * 0.56], SLATE, [0, Math.PI / 4, 0]));
  batches.roofPyramids.push(worldPart(item, [sx * 0.33, sy / 2 + 3.2, sz * 0.31], [sx * 0.22, 5.3, sz * 0.19], SLATE_LIGHT, [0, Math.PI / 4, 0]));
  batches.roofPyramids.push(worldPart(item, [sx * 0.34, sy / 2 + 3.0, -sz * 0.29], [sx * 0.19, 5.0, sz * 0.18], SLATE, [0, Math.PI / 4, 0]));
  for (const z of [-sz * 0.39, sz * 0.39]) {
    batches.towers.push(worldPart(item, [-sx * 0.39, sy / 2 - 0.1, z], [1.8, 5.4, 1.8], PALE_STONE));
    batches.roofCones.push(worldPart(item, [-sx * 0.39, sy / 2 + 4.0, z], [2.15, 3.2, 2.15], SLATE));
  }
  const floors = [bottom + 4.7, bottom + 8.5, bottom + 12.2, bottom + 15.8];
  addWindowGrid(
    batches,
    item,
    ['+x'],
    () => [-sz * 0.35, -sz * 0.12, sz * 0.13, sz * 0.36],
    floors,
    { width: 1.25, height: 2.05, hood: true },
  );
  addWindowGrid(
    batches,
    item,
    ['+z', '-z'],
    () => [-sx * 0.3, -sx * 0.05, sx * 0.2],
    floors.slice(0, 3),
    { width: 1.2, height: 1.95 },
  );
  for (const z of [-sz * 0.31, -sz * 0.1, sz * 0.12, sz * 0.32]) {
    addDormer(batches, item, '+x', z, sy / 2 + 1.55, 1.15, 1.35);
  }
  addDoor(batches, item, '+x', sz * 0.23, bottom + 2.3, 2.1, 3.8, true);
  for (const x of [-sx * 0.34, sx * 0.02, sx * 0.28]) {
    addBox(batches, 'stone', item, [x, sy / 2 + 3.5, -sz * 0.2], [0.7, 5.0, 0.7], BRICK);
  }
}

function buildNewNetherland(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  const top = sy / 2;
  // Light tints keep the brick courses legible; dark multipliers crushed the
  // texture into a flat maroon slab.
  addShell(batches, item, [0, -1.2, 0], [sx, sy - 2.4, sz], 1, '#c08862');
  addShell(batches, item, [-sx * 0.18, sy * 0.23, -sz * 0.12], [sx * 0.57, sy * 0.38, sz * 0.67], 1, '#b57e5c');

  // Rock-faced brownstone base after the street-level photographs: heavy
  // piers between square-headed ground openings, a two-storey round-arched
  // arcade above them, and a deep entrance portal on Fifth Avenue.
  const baseTop = bottom + 8.2;
  // Textured rock-faced brownstone: the weathered facade surface reads as
  // rustication where flat-colour boxes read as plastic.
  addShell(batches, item, [0, bottom + 4.1, 0], [sx + 0.4, 8.2, sz + 0.4], 3, '#b3906d');
  const groundWindow = (face, along) => {
    if (face === '-x') {
      addBox(batches, 'glass', item, [-sx / 2 - 0.26, bottom + 2.3, along], [0.1, 2.2, 1.4], GLASS);
      addBox(batches, 'iron', item, [-sx / 2 - 0.3, bottom + 2.3, along], [0.05, 2.2, 0.08], SASH);
      addBox(batches, 'iron', item, [-sx / 2 - 0.3, bottom + 2.85, along], [0.05, 0.08, 1.4], SASH);
      addBox(batches, 'stone', item, [-sx / 2 - 0.34, bottom + 3.7, along], [0.3, 0.45, 1.8], '#84654c');
      addBox(batches, 'stone', item, [-sx / 2 - 0.3, bottom + 1.05, along], [0.24, 0.28, 1.7], '#69503f');
    } else {
      addBox(batches, 'glass', item, [along, bottom + 2.3, sz / 2 + 0.26], [1.4, 2.2, 0.1], GLASS);
      addBox(batches, 'iron', item, [along, bottom + 2.3, sz / 2 + 0.3], [0.08, 2.2, 0.05], SASH);
      addBox(batches, 'iron', item, [along, bottom + 2.85, sz / 2 + 0.3], [1.4, 0.08, 0.05], SASH);
      addBox(batches, 'stone', item, [along, bottom + 3.7, sz / 2 + 0.34], [1.8, 0.45, 0.3], '#84654c');
      addBox(batches, 'stone', item, [along, bottom + 1.05, sz / 2 + 0.3], [1.7, 0.28, 0.24], '#69503f');
    }
  };
  const pier = (face, along) => {
    if (face === '-x') addBox(batches, 'stone', item, [-sx / 2 - 0.3, bottom + 2.1, along], [0.3, 4.2, 0.9], '#84654c');
    else addBox(batches, 'stone', item, [along, bottom + 2.1, sz / 2 + 0.3], [0.9, 4.2, 0.3], '#84654c');
  };
  // A continuous ring of radially rotated blocks reads as arch voussoirs; the
  // tangential width slightly exceeds the arc step so no wall shows between
  // blocks, and the middle block is enlarged into the keystone.
  const voussoirs = (face, along, cy, radius, block) => {
    const count = 11;
    const step = Math.PI / (count - 1);
    const tangential = radius * step * 1.14;
    for (let i = 0; i < count; i += 1) {
      const angle = i * step;
      const key = i === (count - 1) / 2;
      const radial = key ? block * 1.3 : block;
      const rise = cy + Math.sin(angle) * radius;
      const run = Math.cos(angle) * radius;
      if (face === '-x') {
        addBox(batches, 'stone', item, [-sx / 2 - 0.32, rise, along + run], [0.3, radial, tangential], key ? '#97755c' : '#8d6b54', [Math.PI / 2 - angle, 0, 0]);
      } else {
        addBox(batches, 'stone', item, [along + run, rise, sz / 2 + 0.32], [tangential, radial, 0.3], key ? '#97755c' : '#8d6b54', [0, 0, angle - Math.PI / 2]);
      }
    }
  };
  for (const z of [-6.7, -3.9, 3.9, 6.7]) groundWindow('-x', z);
  for (const z of [-2.4, -5.2, -7.9, 2.4, 5.2, 7.9]) pier('-x', z);
  for (const x of [-6.6, -3.4, 3.9, 6.9]) groundWindow('+z', x);
  for (const x of [-8.2, -5.0, -1.8, 2.4, 5.4, 8.2]) pier('+z', x);
  // Entrance portal: dark tympanum continuing the door opening, a voussoir
  // arch around it, engaged columns, and a balcony above.
  addDoor(batches, item, '-x', 0, bottom + 2.6, 2.5, 4.2, false);
  batches.towers.push(worldPart(item, [-sx / 2 - 0.24, bottom + 4.7, 0], [1.25, 0.16, 1.25], '#20262a', [0, 0, Math.PI / 2]));
  voussoirs('-x', 0, bottom + 4.7, 1.6, 0.62);
  for (const dz of [-1.9, 1.9]) {
    batches.towers.push(worldPart(item, [-sx / 2 - 0.42, bottom + 2.0, dz], [0.24, 3.6, 0.24], '#8a6a55'));
    addBox(batches, 'stone', item, [-sx / 2 - 0.42, bottom + 4.0, dz], [0.56, 0.4, 0.56], '#84654c');
    addBox(batches, 'stone', item, [-sx / 2 - 0.42, bottom + 0.25, dz], [0.6, 0.5, 0.6], '#69503f');
  }
  addBox(batches, 'stone', item, [-sx / 2 - 0.55, bottom + 5.45, 0], [1.1, 0.24, 3.6], '#84604e');
  for (let i = 0; i < 8; i += 1) {
    addBox(batches, 'iron', item, [-sx / 2 - 0.92, bottom + 5.95, -1.6 + i * 0.457], [0.05, 0.8, 0.05], IRON);
  }
  addBox(batches, 'iron', item, [-sx / 2 - 0.92, bottom + 6.4, 0], [0.06, 0.06, 3.4], IRON);
  for (const dz of [-0.95, 0.95]) {
    addBox(batches, 'glass', item, [-sx / 2 - 0.26, bottom + 6.6, dz], [0.1, 2.0, 1.35], GLASS_LIGHT);
    addBox(batches, 'iron', item, [-sx / 2 - 0.3, bottom + 6.6, dz], [0.05, 2.0, 0.07], SASH);
  }
  // Two-storey arcade: recessed glazing, stone archivolt behind a glass
  // tympanum disc, keystones breaking the string course, paired colonnettes.
  // Each arcade bay holds a pair of narrow lights split by a centre
  // colonnette, with radiating mullions in the tympanum — masonry stays
  // dominant, as in the photographs.
  const arcade = (face, along, width) => {
    const r = width / 2;
    if (face === '-x') {
      addBox(batches, 'glass', item, [-sx / 2 - 0.24, bottom + 5.9, along], [0.1, 2.2, width - 0.24], GLASS);
      addBox(batches, 'iron', item, [-sx / 2 - 0.28, bottom + 5.9, along], [0.05, 2.2, 0.07], SASH);
      addBox(batches, 'iron', item, [-sx / 2 - 0.28, bottom + 6.55, along], [0.05, 0.07, width - 0.24], SASH);
      batches.towers.push(worldPart(item, [-sx / 2 - 0.31, bottom + 5.9, along], [0.09, 2.2, 0.09], '#a58a70'));
      batches.towers.push(worldPart(item, [-sx / 2 - 0.26, bottom + 7.0, along], [r, 0.16, r], GLASS, [0, 0, Math.PI / 2]));
      addBox(batches, 'iron', item, [-sx / 2 - 0.31, bottom + 7.0 + r * 0.42, along], [0.05, r * 0.9, 0.07], SASH);
      for (const spoke of [-1, 1]) {
        addBox(batches, 'iron', item, [-sx / 2 - 0.31, bottom + 7.0 + r * 0.3, along + spoke * r * 0.3], [0.05, r * 0.85, 0.07], SASH, [spoke * Math.PI / 4, 0, 0]);
      }
      voussoirs('-x', along, bottom + 7.0, r + 0.26, 0.4);
      addBox(batches, 'stone', item, [-sx / 2 - 0.3, bottom + 4.6, along], [0.26, 0.3, width + 0.36], '#84604e');
      for (const off of [-r - 0.2, r + 0.2]) {
        batches.towers.push(worldPart(item, [-sx / 2 - 0.3, bottom + 5.7, along + off], [0.11, 2.7, 0.11], '#8a6a55'));
        addBox(batches, 'stone', item, [-sx / 2 - 0.3, bottom + 7.02, along + off], [0.3, 0.26, 0.3], '#84654c');
      }
    } else {
      addBox(batches, 'glass', item, [along, bottom + 5.9, sz / 2 + 0.24], [width - 0.24, 2.2, 0.1], GLASS);
      addBox(batches, 'iron', item, [along, bottom + 5.9, sz / 2 + 0.28], [0.07, 2.2, 0.05], SASH);
      addBox(batches, 'iron', item, [along, bottom + 6.55, sz / 2 + 0.28], [width - 0.24, 0.07, 0.05], SASH);
      batches.towers.push(worldPart(item, [along, bottom + 5.9, sz / 2 + 0.31], [0.09, 2.2, 0.09], '#a58a70'));
      batches.towers.push(worldPart(item, [along, bottom + 7.0, sz / 2 + 0.26], [r, 0.16, r], GLASS, [Math.PI / 2, 0, 0]));
      addBox(batches, 'iron', item, [along, bottom + 7.0 + r * 0.42, sz / 2 + 0.31], [0.07, r * 0.9, 0.05], SASH);
      for (const spoke of [-1, 1]) {
        addBox(batches, 'iron', item, [along + spoke * r * 0.3, bottom + 7.0 + r * 0.3, sz / 2 + 0.31], [0.07, r * 0.85, 0.05], SASH, [0, 0, spoke * Math.PI / 4]);
      }
      voussoirs('+z', along, bottom + 7.0, r + 0.26, 0.4);
      addBox(batches, 'stone', item, [along, bottom + 4.6, sz / 2 + 0.3], [width + 0.36, 0.3, 0.26], '#84604e');
      for (const off of [-r - 0.2, r + 0.2]) {
        batches.towers.push(worldPart(item, [along + off, bottom + 5.7, sz / 2 + 0.3], [0.11, 2.7, 0.11], '#8a6a55'));
        addBox(batches, 'stone', item, [along + off, bottom + 7.02, sz / 2 + 0.3], [0.3, 0.26, 0.3], '#84654c');
      }
    }
  };
  for (const z of [-5.9, -2.95, 2.95, 5.9]) arcade('-x', z, 2.0);
  for (const x of [-6.6, -3.3, 3.3, 6.6]) arcade('+z', x, 1.9);
  // 59th Street secondary entrance with its own arch head.
  addDoor(batches, item, '+z', 0.4, bottom + 2.4, 2.2, 3.6, false);
  batches.towers.push(worldPart(item, [0.4, bottom + 4.2, sz / 2 + 0.24], [1.1, 0.16, 1.1], '#20262a', [Math.PI / 2, 0, 0]));
  voussoirs('+z', 0.4, bottom + 4.2, 1.42, 0.5);
  // Alternating quoins on the three visible corners.
  const quoin = (xSign, zSign) => {
    for (let level = 0; level < 7; level += 1) {
      const y = bottom + 0.75 + level * 1.1;
      const big = level % 2 === 0;
      addBox(batches, 'stone', item, [xSign * (sx / 2 + 0.16), y, zSign * (sz / 2 - (big ? 0.35 : 0.6))], [0.34, 0.95, big ? 1.15 : 0.7], '#85644f');
      addBox(batches, 'stone', item, [xSign * (sx / 2 - (big ? 0.6 : 0.35)), y, zSign * (sz / 2 + 0.16)], [big ? 0.7 : 1.15, 0.95, 0.34], '#85644f');
    }
  };
  quoin(-1, 1);
  quoin(-1, -1);
  quoin(1, 1);
  // Dentilled string course closes the base.
  addCourse(batches, item, baseTop, '#c9b8a0', 0.7, 0.42);
  for (let i = 0; i < 14; i += 1) {
    const z = -sz * 0.45 + i * sz * 0.9 / 13;
    addBox(batches, 'stone', item, [-sx / 2 - 0.32, baseTop - 0.35, z], [0.26, 0.3, 0.3], '#84604e');
  }
  for (let i = 0; i < 16; i += 1) {
    const x = -sx * 0.45 + i * sx * 0.9 / 15;
    addBox(batches, 'stone', item, [x, baseTop - 0.35, sz / 2 + 0.32], [0.3, 0.3, 0.26], '#84604e');
  }
  addCourse(batches, item, bottom + 18.2, PALE_STONE, 0.5, 0.26);
  addCourse(batches, item, bottom + 27.2, PALE_STONE, 0.5, 0.26);
  const westZs = [-sz * 0.36, -sz * 0.13, sz * 0.1, sz * 0.32];
  const floors = Array.from({ length: 8 }, (_, index) => bottom + 9.9 + index * 3.0);
  addWindowGrid(batches, item, ['-x'], () => westZs, floors, { width: 1.16, height: 1.8 });
  addWindowGrid(batches, item, ['+z', '-z'], (face) => (face === '+z'
    ? [-sx * 0.28, -sx * 0.06, sx * 0.17, sx * 0.37]
    : [-sx * 0.32, -sx * 0.1, sx * 0.12, sx * 0.34]), floors, { width: 1.06, height: 1.75 });
  for (const z of westZs) {
    addBox(batches, 'iron', item, [-sx / 2 - 0.35, floors[1] - 1.0, z], [0.55, 0.09, 1.7], IRON);
    addBox(batches, 'iron', item, [-sx / 2 - 0.55, floors[1] - 0.62, z], [0.07, 0.7, 1.7], IRON);
  }
  // Two shallow oriel stacks between window columns.
  const bayBottom = baseTop + 0.5;
  const bayTop = bottom + 30.6;
  const bayMid = (bayBottom + bayTop) / 2;
  for (const bay of [{ face: '-x', along: -sz * 0.245 }, { face: '+z', along: sx * 0.055 }]) {
    if (bay.face === '-x') {
      addBox(batches, 'stone', item, [-sx / 2 - 0.22, bayMid, bay.along], [0.52, bayTop - bayBottom, 2.0], '#96685a');
    } else {
      addBox(batches, 'stone', item, [bay.along, bayMid, sz / 2 + 0.22], [2.0, bayTop - bayBottom, 0.52], '#96685a');
    }
    floors.slice(0, 7).forEach((y, index) => {
      const pane = index % 3 === 1 ? GLASS_LIGHT : GLASS;
      if (bay.face === '-x') {
        addBox(batches, 'glass', item, [-sx / 2 - 0.5, y, bay.along], [0.06, 1.55, 1.35], pane);
        addBox(batches, 'iron', item, [-sx / 2 - 0.52, y, bay.along], [0.05, 1.55, 0.08], SASH);
        addBox(batches, 'stone', item, [-sx / 2 - 0.44, y - 1.5, bay.along], [0.36, 0.3, 2.0], '#7d5348');
      } else {
        addBox(batches, 'glass', item, [bay.along, y, sz / 2 + 0.5], [1.35, 1.55, 0.06], pane);
        addBox(batches, 'iron', item, [bay.along, y, sz / 2 + 0.52], [0.08, 1.55, 0.05], SASH);
        addBox(batches, 'stone', item, [bay.along, y - 1.5, sz / 2 + 0.44], [2.0, 0.3, 0.36], '#7d5348');
      }
    });
  }

  // Corbelled crown cornice with bracket runs on both street fronts.
  addCourse(batches, item, top - 1.9, LIGHT_STONE, 0.9, 0.4);
  addCourse(batches, item, top - 0.5, LIGHT_STONE, 1.3, 0.6);
  for (let i = 0; i < 11; i += 1) {
    const z = -sz * 0.42 + i * sz * 0.84 / 10;
    addBox(batches, 'stone', item, [-sx / 2 - 0.5, top - 1.2, z], [0.5, 0.55, 0.34], PALE_STONE);
  }
  for (let i = 0; i < 12; i += 1) {
    const x = -sx * 0.42 + i * sx * 0.84 / 11;
    addBox(batches, 'stone', item, [x, top - 1.2, sz / 2 + 0.5], [0.34, 0.55, 0.5], PALE_STONE);
  }

  // Crown after the photograph: a tall hip over the plaza corner, a lower hip
  // behind it, wall gables on both street fronts, and a slender corbelled
  // corner turret. Nothing here is symmetrical.
  batches.roofPyramids.push(worldPart(item, [-sx * 0.08, top + 3.2, sz * 0.08], [sx * 0.58, 6.4, sz * 0.58], SLATE, [0, Math.PI / 4, 0]));
  batches.roofPyramids.push(worldPart(item, [sx * 0.22, top + 2.0, -sz * 0.22], [sx * 0.42, 4.0, sz * 0.42], SLATE_LIGHT, [0, Math.PI / 4, 0]));
  batches.roofGables.push(worldPart(item, [-sx * 0.31, top + 2.5, -sz * 0.18], [4.9, 5.0, sx * 0.38], SLATE, [0, Math.PI / 2, 0]));
  batches.roofGables.push(worldPart(item, [sx * 0.06, top + 2.4, sz * 0.315], [5.0, 4.8, sz * 0.38], SLATE_LIGHT));
  const towerX = -sx * 0.44;
  const towerZ = sz * 0.44;
  const turretBase = bottom + 20.0;
  const turretTop = top + 2.6;
  batches.towers.push(worldPart(item, [towerX, (turretBase + turretTop) / 2, towerZ], [1.35, turretTop - turretBase, 1.35], '#8a6252'));
  batches.towers.push(worldPart(item, [towerX, turretBase - 0.5, towerZ], [1.0, 1.0, 1.0], '#7a5a4a'));
  batches.towers.push(worldPart(item, [towerX, turretBase - 1.3, towerZ], [0.62, 0.8, 0.62], '#6b4d3f'));
  for (const y of [bottom + 27.2, top - 1.9]) {
    batches.towers.push(worldPart(item, [towerX, y, towerZ], [1.5, 0.3, 1.5], PALE_STONE));
  }
  for (const y of [bottom + 23.5, bottom + 29.5, top - 3.4]) {
    addBox(batches, 'glass', item, [towerX - 1.32, y, towerZ], [0.1, 1.3, 0.7], GLASS);
  }
  batches.roofCones.push(worldPart(item, [towerX, turretTop + 1.9, towerZ], [1.62, 3.8, 1.62], SLATE));
  addBox(batches, 'iron', item, [towerX, turretTop + 4.2, towerZ], [0.08, 1.0, 0.08], IRON);
  // Chimneys and gable finials complete the silhouette.
  for (const [cx, cz] of [[sx * 0.3, -sz * 0.05], [sx * 0.05, -sz * 0.3]]) {
    addBox(batches, 'stone', item, [cx, top + 2.3, cz], [0.9, 4.6, 0.9], BRICK);
    addBox(batches, 'stone', item, [cx, top + 4.75, cz], [1.1, 0.3, 1.1], PALE_STONE);
  }
  addBox(batches, 'iron', item, [-sx * 0.31, top + 5.4, -sz * 0.18], [0.07, 1.0, 0.07], IRON);
  addBox(batches, 'iron', item, [sx * 0.06, top + 5.2, sz * 0.315], [0.07, 1.0, 0.07], IRON);
}

function buildSavoy(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  // Limestone, not brick: the Savoy was a pale Italian-Renaissance foil to
  // the dark Netherland across 59th Street.
  addShell(batches, item, [0, -0.65, 0], [sx, sy - 1.3, sz], 2, '#e8dcc6');
  // Two-storey rusticated limestone base with a columned entrance portico
  // on Fifth; the textured shell supplies the coursing.
  addShell(batches, item, [0, bottom + 2.6, 0], [sx + 0.3, 5.2, sz + 0.3], 2, '#e3d6be');
  const porticoZ = -sz * 0.24;
  addDoor(batches, item, '-x', porticoZ, bottom + 2.3, 2.2, 3.6, false);
  addBox(batches, 'stone', item, [-sx / 2 - 1.3, bottom + 0.14, porticoZ], [2.6, 0.28, 5.2], '#cfc2a8');
  addBox(batches, 'stone', item, [-sx / 2 - 2.75, bottom + 0.07, porticoZ], [0.5, 0.14, 4.6], '#c4b599');
  for (const dz of [-1.85, -1.15, 1.15, 1.85]) {
    batches.towers.push(worldPart(item, [-sx / 2 - 2.3, bottom + 2.15, porticoZ + dz], [0.21, 3.8, 0.21], '#efe6d2'));
    addBox(batches, 'stone', item, [-sx / 2 - 2.3, bottom + 4.15, porticoZ + dz], [0.5, 0.3, 0.5], '#e8dfc9');
    addBox(batches, 'stone', item, [-sx / 2 - 2.3, bottom + 0.4, porticoZ + dz], [0.52, 0.28, 0.52], '#cfc2a8');
  }
  addBox(batches, 'stone', item, [-sx / 2 - 1.35, bottom + 4.6, porticoZ], [2.7, 0.55, 5.4], '#e8dfc9');
  addBox(batches, 'stone', item, [-sx / 2 - 1.35, bottom + 5.0, porticoZ], [3.0, 0.25, 5.7], '#efe6d2');
  for (let i = 0; i < 9; i += 1) {
    addBox(batches, 'stone', item, [-sx / 2 - 2.5, bottom + 5.45, porticoZ - 2.5 + i * 0.625], [0.09, 0.55, 0.09], '#e8dfc9');
  }
  addBox(batches, 'stone', item, [-sx / 2 - 2.5, bottom + 5.8, porticoZ], [0.14, 0.14, 5.2], '#efe6d2');
  // Ground windows with bracketed stone heads on both street fronts.
  const savoyGround = (face, along) => {
    if (face === '-x') {
      addBox(batches, 'glass', item, [-sx / 2 - 0.22, bottom + 2.4, along], [0.1, 2.1, 1.25], GLASS);
      addBox(batches, 'iron', item, [-sx / 2 - 0.26, bottom + 2.4, along], [0.05, 2.1, 0.07], SASH);
      addBox(batches, 'stone', item, [-sx / 2 - 0.3, bottom + 3.65, along], [0.26, 0.36, 1.65], '#efe6d2');
      addBox(batches, 'stone', item, [-sx / 2 - 0.26, bottom + 1.2, along], [0.22, 0.24, 1.55], '#c4b599');
    } else {
      addBox(batches, 'glass', item, [along, bottom + 2.4, -sz / 2 - 0.22], [1.25, 2.1, 0.1], GLASS);
      addBox(batches, 'iron', item, [along, bottom + 2.4, -sz / 2 - 0.26], [0.07, 2.1, 0.05], SASH);
      addBox(batches, 'stone', item, [along, bottom + 3.65, -sz / 2 - 0.3], [1.65, 0.36, 0.26], '#efe6d2');
      addBox(batches, 'stone', item, [along, bottom + 1.2, -sz / 2 - 0.26], [1.55, 0.24, 0.22], '#c4b599');
    }
  };
  for (const z of [0.7, 3.0, 5.3]) savoyGround('-x', z);
  for (const x of [-sx * 0.32, -sx * 0.1, sx * 0.12, sx * 0.34]) savoyGround('-z', x);
  addCourse(batches, item, bottom + 5.2, '#efe6d2', 0.6, 0.35);
  addCourse(batches, item, bottom + 12.0, SHADOW_STONE, 0.55, 0.24);
  addCourse(batches, item, sy / 2 - 2.6, LIGHT_STONE, 1.0, 0.55);
  const floors = Array.from({ length: 7 }, (_, index) => bottom + 6.8 + index * 3.0);
  addWindowGrid(batches, item, ['-x'], () => [-sz * 0.32, -sz * 0.1, sz * 0.12, sz * 0.34], floors, { width: 1.12, height: 1.82, hood: true });
  addWindowGrid(batches, item, ['-z', '+z'], () => [-sx * 0.32, -sx * 0.1, sx * 0.12, sx * 0.34], floors.slice(0, 6), { width: 1.08, height: 1.78 });
  // Piano nobile balconettes above the base cornice.
  for (const z of [-sz * 0.32, -sz * 0.1, sz * 0.12, sz * 0.34]) {
    addBox(batches, 'iron', item, [-sx / 2 - 0.3, floors[0] - 1.05, z], [0.45, 0.08, 1.5], IRON);
    addBox(batches, 'iron', item, [-sx / 2 - 0.48, floors[0] - 0.7, z], [0.06, 0.62, 1.5], IRON);
  }
  // Dentil run under the crowning cornice.
  for (let i = 0; i < 10; i += 1) {
    const z = -sz * 0.42 + i * sz * 0.84 / 9;
    addBox(batches, 'stone', item, [-sx / 2 - 0.3, sy / 2 - 3.05, z], [0.24, 0.28, 0.28], '#d8cbb0');
  }
  for (let i = 0; i < 12; i += 1) {
    const x = -sx * 0.42 + i * sx * 0.84 / 11;
    addBox(batches, 'stone', item, [x, sy / 2 - 3.05, -sz / 2 - 0.3], [0.28, 0.28, 0.24], '#d8cbb0');
  }
  batches.roofPyramids.push(worldPart(item, [0, sy / 2 + 2.2, 0], [sx * 0.66, 4.2, sz * 0.7], SLATE, [0, Math.PI / 4, 0]));
  batches.towers.push(worldPart(item, [-sx * 0.39, sy / 2 - 0.8, -sz * 0.38], [1.7, 4.0, 1.7], PALE_STONE));
  batches.roofCones.push(worldPart(item, [-sx * 0.39, sy / 2 + 2.65, -sz * 0.38], [2.0, 2.8, 2.0], COPPER));
}

function buildBolkenhayn(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  addShell(batches, item, [0, -0.4, 0], [sx, sy - 0.8, sz], 1, '#ab8266');
  addBox(batches, 'stone', item, [0, bottom + 1.75, 0], [sx + 0.25, 3.5, sz + 0.25], SHADOW_STONE);
  [bottom + 3.7, sy / 2 - 1.8].forEach((y, index) => addCourse(batches, item, y, index ? LIGHT_STONE : PALE_STONE, index ? 0.9 : 0.5, index ? 0.48 : 0.22));
  const floors = Array.from({ length: 5 }, (_, index) => bottom + 5.0 + index * 2.85);
  addWindowGrid(batches, item, ['-x'], () => [-sz * 0.3, -sz * 0.1, sz * 0.11, sz * 0.31], floors, { width: 1.06, height: 1.68 });
  addWindowGrid(batches, item, ['+z'], () => [-sx * 0.3, -sx * 0.08, sx * 0.15, sx * 0.35], floors.slice(0, 4), { width: 1.02, height: 1.65 });
  addDoor(batches, item, '-x', sz * 0.22, bottom + 1.85, 1.75, 3.0, true);
  // Full-footprint hip so the dormers sit against roof instead of floating
  // as detached boxes on the skyline.
  batches.roofPyramids.push(worldPart(item, [0, sy / 2 + 1.95, 0], [sx * 0.71, 3.9, sz * 0.74], SLATE_LIGHT, [0, Math.PI / 4, 0]));
  for (const z of [-sz * 0.25, 0, sz * 0.25]) addDormer(batches, item, '-x', z, sy / 2 + 0.55, 1.0, 1.15);
}

function buildMarbleRow(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  const houses = item.rowCount ?? 4;
  const run = sz / houses;
  for (let index = 0; index < houses; index += 1) {
    const z = -sz / 2 + run * (index + 0.5);
    const height = sy - 0.25 * (index % 2);
    addShell(batches, item, [0, bottom + height / 2, z], [sx, height, run - 0.12], 4, index % 2 ? '#f3ecdc' : '#e6ddcc');
    addBox(batches, 'stone', item, [0, bottom + 2.0, z], [sx + 0.22, 4.0, run - 0.02], index % 2 ? PALE_STONE : LIGHT_STONE);
    for (const y of [bottom + 5.3, bottom + 8.4, bottom + 11.45]) {
      addWindow(batches, item, '-x', z, y, 1.2, 1.9, { hood: y > bottom + 10, stone: PALE_STONE });
    }
    addDoor(batches, item, '-x', z - run * 0.23, bottom + 2.1, 1.35, 3.25, false);
    for (let step = 0; step < 4; step += 1) {
      addBox(batches, 'stone', item, [-sx / 2 - 0.65 - step * 0.28, bottom + 0.18 + step * 0.23, z - run * 0.23], [0.62, 0.22, 1.7], SHADOW_STONE);
    }
    batches.roofGables.push(worldPart(item, [0, sy / 2 + 1.9, z], [sx + 0.3, 3.8, run - 0.18], index % 2 ? SLATE : SLATE_LIGHT, [0, Math.PI / 2, 0]));
    addDormer(batches, item, '-x', z + run * 0.18, sy / 2 + 0.8, 0.9, 1.1);
  }
  addCourse(batches, item, sy / 2 - 0.35, LIGHT_STONE, 0.75, 0.42);
}

function buildHuntington(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  addShell(batches, item, [0, -0.45, 0], [sx, sy - 0.9, sz], 0, '#b17b68');
  addBox(batches, 'stone', item, [0, bottom + 2.3, 0], [sx + 0.3, 4.6, sz + 0.3], PALE_STONE);
  addCourse(batches, item, bottom + 4.8, LIGHT_STONE, 0.55, 0.3);
  addCourse(batches, item, sy / 2 - 1.1, LIGHT_STONE, 1.0, 0.5);
  const floors = [bottom + 6.3, bottom + 9.65, bottom + 13.0];
  addWindowGrid(batches, item, ['-x'], () => [-sz * 0.29, -sz * 0.05, sz * 0.21], floors, { width: 1.3, height: 2.05, hood: true });
  addWindowGrid(batches, item, ['+z'], () => [-sx * 0.32, -sx * 0.12, sx * 0.1, sx * 0.31], floors, { width: 1.2, height: 1.95 });
  addDoor(batches, item, '+z', -sx * 0.22, bottom + 2.35, 2.15, 3.7, true);
  batches.roofGables.push(worldPart(item, [0, sy / 2 + 2.65, 0], [sz, 5.2, sx], SLATE, [0, Math.PI / 2, 0]));
  batches.towers.push(worldPart(item, [-sx * 0.41, sy / 2 - 0.8, sz * 0.35], [2.0, 4.0, 2.0], PALE_STONE));
  batches.roofCones.push(worldPart(item, [-sx * 0.41, sy / 2 + 2.8, sz * 0.35], [2.35, 3.2, 2.35], COPPER));
}

function buildGerry(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  addShell(batches, item, [0, -0.5, 0], [sx, sy - 1.0, sz], 2, '#d7cdbc');
  addBox(batches, 'stone', item, [0, bottom + 2.15, 0], [sx + 0.35, 4.3, sz + 0.35], DARK_STONE);
  addCourse(batches, item, bottom + 4.55, PALE_STONE, 0.6, 0.3);
  addCourse(batches, item, sy / 2 - 1.25, LIGHT_STONE, 1.1, 0.55);
  const floors = [bottom + 5.8, bottom + 9.2, bottom + 12.55];
  addWindowGrid(batches, item, ['-x'], () => [-sz * 0.3, -sz * 0.06, sz * 0.2], floors, { width: 1.28, height: 2.0, hood: true });
  addWindowGrid(batches, item, ['-z'], () => [-sx * 0.33, -sx * 0.12, sx * 0.1, sx * 0.32], floors, { width: 1.18, height: 1.92 });
  addDoor(batches, item, '-z', -sx * 0.2, bottom + 2.25, 2.0, 3.5, true);
  // One continuous main roof replaces the two full-size wedges that used to
  // intersect and produce a jagged, partly transparent silhouette.
  batches.roofGables.push(worldPart(item, [0, sy / 2 + 2.45, 0], [sx + 0.45, 4.9, sz + 0.5], SLATE_LIGHT));
  // A smaller cross-gable marks the Fifth Avenue pavilion without cutting
  // through the complete depth of the main roof.
  batches.roofGables.push(worldPart(
    item,
    [-sx * 0.3, sy / 2 + 2.9, -sz * 0.16],
    [sz * 0.48, 5.55, sx * 0.36],
    SLATE,
    [0, Math.PI / 2, 0],
  ));
  for (const x of [-sx * 0.25, sx * 0.18]) addBox(batches, 'stone', item, [x, sy / 2 + 3.1, -sz * 0.15], [0.75, 5.4, 0.75], BRICK);
  // One very low-cost iron run gives the Fifth Avenue areaway its period edge.
  for (let index = 0; index < 12; index += 1) {
    addBox(batches, 'iron', item, [-sx / 2 - 0.35, bottom + 0.8, -sz * 0.42 + index * sz * 0.84 / 11], [0.055, 1.5, 0.055], IRON);
  }
}

const BUILDERS = {
  'vanderbilt-mansion': buildVanderbilt,
  'new-netherland-hotel': buildNewNetherland,
  'savoy-hotel': buildSavoy,
  'bolkenhayn-apartments': buildBolkenhayn,
  'marble-row': buildMarbleRow,
  'huntington-mansion': buildHuntington,
  'gerry-mansion': buildGerry,
};

function buildDistrict(items) {
  const batches = {
    shells: new Map(),
    stone: [],
    glass: [],
    iron: [],
    copper: [],
    roofBoxes: [],
    roofPyramids: [],
    roofCones: [],
    roofGables: [],
    towers: [],
  };
  items.filter(isGildedAgeLandmark).forEach((item) => BUILDERS[item.landmarkModel](item, batches));
  return batches;
}

export default function GildedAgeLandmarks({ items, facadeTextures }) {
  const batches = useMemo(() => buildDistrict(items), [items]);
  const geometry = useSharedGeometry();
  const materials = useSharedMaterials();
  return (
    <group name="1896 Gilded Age landmark district">
      {[...batches.shells.entries()].map(([style, entries]) => (
        <ShellBatch key={style} entries={entries} facadeTextures={facadeTextures} style={style} />
      ))}
      <InstancedParts name="landmark-stone-and-trim" parts={batches.stone} geometry={geometry.box} material={materials.stone} />
      <InstancedParts name="landmark-window-depth" parts={batches.glass} geometry={geometry.box} material={materials.glass} />
      <InstancedParts name="landmark-sash-and-ironwork" parts={batches.iron} geometry={geometry.box} material={materials.iron} />
      <InstancedParts name="landmark-aged-copper" parts={batches.copper} geometry={geometry.box} material={materials.copper} />
      <InstancedParts name="landmark-roof-boxes" parts={batches.roofBoxes} geometry={geometry.box} material={materials.roof} />
      <InstancedParts name="landmark-round-towers" parts={batches.towers} geometry={geometry.cylinder} material={materials.stone} />
      <InstancedParts name="landmark-hipped-roofs" parts={batches.roofPyramids} geometry={geometry.pyramid} material={materials.roof} shadows />
      <InstancedParts name="landmark-conical-roofs" parts={batches.roofCones} geometry={geometry.cone} material={materials.roof} shadows />
      <InstancedParts name="landmark-gabled-roofs" parts={batches.roofGables} geometry={geometry.gable} material={materials.roof} shadows />
    </group>
  );
}

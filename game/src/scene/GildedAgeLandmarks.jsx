import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { freezeStaticTransforms, splitMixedInstancedMaterials } from './lib/staticScene.js';
import { createFacadeMaterial } from './facadeMaterials.js';
import NewNetherlandHotel from './NewNetherlandHotel.jsx';
import { identifyLandmark } from '../world/landmarkInformation.js';

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
// These are deliberately pale tints: the authored slate albedo supplies the
// charcoal value and the instance colour only grades one roof against another.
const SLATE = '#d2d7d9';
const SLATE_LIGHT = '#eef1f2';
const COPPER = '#4d766d';
const GLASS = '#35464d';
const GLASS_LIGHT = '#687675';
const SASH = '#292c2a';
const IRON = '#252a29';
const DOOR = '#3a2b24';

const NO_RAYCAST = () => {};
const STONE_TEXTURE_URLS = [
  '/textures/architecture/buff-limestone_col.webp',
  '/textures/architecture/buff-limestone_nrm.webp',
  '/textures/architecture/buff-limestone_rough.webp',
];
const ROOF_TEXTURE_URL = '/textures/new-netherland/slate-shingles.webp';
const STONE_METRES_PER_REPEAT = 2.25;
const ROOF_METRES_PER_REPEAT = 3.2;

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

// A round-headed opening reads clearly from a very small silhouette. The fan
// and its stone crown are shared by every Gerry opening; scaling instances is
// much cheaper than cutting curved holes into the building shell.
function createArchFanGeometry(segments = 12) {
  const positions = [0, 0, 0];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI;
    positions.push(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0);
  }
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    indices.push(0, index + 1, index + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createArchCrownGeometry(segments = 12) {
  const positions = [];
  const outerRadius = 0.5;
  const innerRadius = 0.37;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI;
    positions.push(
      Math.cos(angle) * outerRadius,
      Math.sin(angle) * outerRadius,
      0,
      Math.cos(angle) * innerRadius,
      Math.sin(angle) * innerRadius,
      0,
    );
  }
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const outer = index * 2;
    const inner = outer + 1;
    const nextOuter = outer + 2;
    const nextInner = outer + 3;
    indices.push(outer, nextOuter, nextInner, outer, nextInner, inner);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createHipRoofGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5,
    0.5, -0.5, 0.5,
    -0.5, -0.5, 0.5,
    0, 0.5, 0,
  ], 3));
  geometry.setIndex([
    0, 4, 1,
    1, 4, 2,
    2, 4, 3,
    3, 4, 0,
    0, 1, 2, 0, 2, 3,
  ]);
  const flatGeometry = geometry.toNonIndexed();
  geometry.dispose();
  flatGeometry.computeVertexNormals();
  flatGeometry.computeBoundingSphere();
  return flatGeometry;
}

// Gerry's pavilion needs the tall four-plane silhouette of a French chateau
// roof, but a pointed pyramid reads too much like a church steeple. This
// twelve-triangle frustum leaves a small crown platform for the finial while
// remaining cheaper than a tiled or subdivided roof mesh.
function createTruncatedHipRoofGeometry(topScale = 0.22) {
  const halfTop = topScale / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5,
    0.5, -0.5, 0.5,
    -0.5, -0.5, 0.5,
    -halfTop, 0.5, -halfTop,
    halfTop, 0.5, -halfTop,
    halfTop, 0.5, halfTop,
    -halfTop, 0.5, halfTop,
  ], 3));
  geometry.setIndex([
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
    4, 7, 6, 4, 6, 5,
    0, 1, 2, 0, 2, 3,
  ]);
  const flatGeometry = geometry.toNonIndexed();
  geometry.dispose();
  flatGeometry.computeVertexNormals();
  flatGeometry.computeBoundingSphere();
  return flatGeometry;
}

function createCornerNotchedHipRoofGeometry() {
  const geometry = new THREE.BufferGeometry();
  // The missing -x/-z corner seats the roof against the Savoy's round turret
  // instead of drawing a roof plane through the middle of it.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.27, -0.5, -0.5,
    0.5, -0.5, -0.5,
    0.5, -0.5, 0.5,
    -0.5, -0.5, 0.5,
    -0.5, -0.5, -0.21,
    -0.27, -0.5, -0.21,
    0, 0.5, 0,
  ], 3));
  geometry.setIndex([
    0, 6, 1,
    1, 6, 2,
    2, 6, 3,
    3, 6, 4,
    4, 6, 5,
    5, 6, 0,
    0, 1, 2,
    0, 2, 5,
    5, 2, 3,
    5, 3, 4,
  ]);
  const flatGeometry = geometry.toNonIndexed();
  geometry.dispose();
  flatGeometry.computeVertexNormals();
  flatGeometry.computeBoundingSphere();
  return flatGeometry;
}

function useSharedGeometry() {
  const geometry = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    pyramid: new THREE.ConeGeometry(1, 1, 4),
    hipRoof: createHipRoofGeometry(),
    truncatedHipRoof: createTruncatedHipRoofGeometry(),
    cornerNotchedHipRoof: createCornerNotchedHipRoofGeometry(),
    cone: new THREE.ConeGeometry(1, 1, 14),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    gable: createGableGeometry(),
    archFan: createArchFanGeometry(),
    archCrown: createArchCrownGeometry(),
  }), []);
  useEffect(() => () => Object.values(geometry).forEach((entry) => entry.dispose()), [geometry]);
  return geometry;
}

function prepareStoneTexture(source, color = false) {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

// Instanced box UVs otherwise stretch one 0..1 sample over every object,
// which made the old 128px procedural texture visibly pixelated on a large
// podium wall. Project in instance/world metres instead, keeping one shared
// PBR set while maintaining about 228 source texels per metre.
function applyMetreScaledStoneUvs(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vec3 stonePosition = position;
      vec3 stoneNormal = normal;
      #ifdef USE_INSTANCING
        stonePosition = (instanceMatrix * vec4(position, 1.0)).xyz;
        stoneNormal = normalize(mat3(instanceMatrix) * normal);
      #endif
      vec3 stoneAbsNormal = abs(stoneNormal);
      vec2 stoneSurfaceUv;
      if (stoneAbsNormal.y >= max(stoneAbsNormal.x, stoneAbsNormal.z)) {
        stoneSurfaceUv = vec2(stonePosition.x, -stonePosition.z);
      } else if (stoneAbsNormal.x >= stoneAbsNormal.z) {
        stoneSurfaceUv = vec2(-stonePosition.z * sign(stoneNormal.x), stonePosition.y);
      } else {
        stoneSurfaceUv = vec2(stonePosition.x * sign(stoneNormal.z), stonePosition.y);
      }
      stoneSurfaceUv /= ${STONE_METRES_PER_REPEAT.toFixed(2)};
      #ifdef USE_MAP
        vMapUv = stoneSurfaceUv;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = stoneSurfaceUv;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = stoneSurfaceUv;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'landmark-stone-metre-uv-v1';
  return material;
}

// The custom hip, mansard, cone, and gable geometries do not share useful UVs.
// Project the slate in instance-scaled metres so one real tile field keeps a
// consistent size across roofs instead of stretching once over an entire wing.
function applyMetreScaledRoofUvs(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vec3 roofPosition = position;
      vec3 roofNormal = normal;
      #ifdef USE_INSTANCING
        roofPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
        roofNormal = normalize(mat3(instanceMatrix) * normal);
      #endif
      vec3 roofAbsNormal = abs(roofNormal);
      vec2 roofSurfaceUv;
      if (roofAbsNormal.y >= max(roofAbsNormal.x, roofAbsNormal.z)) {
        roofSurfaceUv = vec2(roofPosition.x, -roofPosition.z);
      } else if (roofAbsNormal.x >= roofAbsNormal.z) {
        roofSurfaceUv = vec2(-roofPosition.z * sign(roofNormal.x), roofPosition.y);
      } else {
        roofSurfaceUv = vec2(roofPosition.x * sign(roofNormal.z), roofPosition.y);
      }
      roofSurfaceUv /= ${ROOF_METRES_PER_REPEAT.toFixed(2)};
      #ifdef USE_MAP
        vMapUv = roofSurfaceUv;
      #endif`,
    );
  };
  material.customProgramCacheKey = () => 'landmark-roof-metre-uv-v1';
  return material;
}

function useSharedMaterials() {
  const [stoneColorSource, stoneNormalSource, stoneRoughnessSource, roofColorSource] = useLoader(
    THREE.TextureLoader,
    [...STONE_TEXTURE_URLS, ROOF_TEXTURE_URL],
  );
  // No vertexColors flag: the shared geometries carry no color attribute, so
  // enabling it multiplied every instance by black. Per-instance color comes
  // from setColorAt alone.
  const materials = useMemo(() => {
    const stoneMap = prepareStoneTexture(stoneColorSource, true);
    const stoneNormalMap = prepareStoneTexture(stoneNormalSource);
    const stoneRoughnessMap = prepareStoneTexture(stoneRoughnessSource);
    const roofMap = prepareStoneTexture(roofColorSource, true);
    const conservatoryGlass = new THREE.MeshPhysicalMaterial({
      color: '#9ab6be',
      roughness: 0.14,
      metalness: 0,
      clearcoat: 0.72,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.35,
      reflectivity: 0.72,
      ior: 1.46,
      specularIntensity: 0.72,
      specularColor: '#d9f2f7',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    return {
      stoneMap,
      stoneNormalMap,
      stoneRoughnessMap,
      roofMap,
      stone: applyMetreScaledStoneUvs(new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: stoneMap,
        normalMap: stoneNormalMap,
        normalScale: new THREE.Vector2(0.34, 0.34),
        roughnessMap: stoneRoughnessMap,
        roughness: 1,
        metalness: 0,
      })),
      roof: applyMetreScaledRoofUvs(new THREE.MeshStandardMaterial({
        color: '#ffffff',
        map: roofMap,
        roughness: 0.76,
        metalness: 0.015,
        envMapIntensity: 0.82,
      })),
      glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.02 }),
      conservatoryGlass,
      iron: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.54, metalness: 0.68 }),
      copper: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.58, metalness: 0.48 }),
    };
  }, [roofColorSource, stoneColorSource, stoneNormalSource, stoneRoughnessSource]);
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
    const item = entries[event.instanceId]?.item;
    identifyLandmark(item, event);
  };
  if (!entries.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={`landmark-shell-style-${style}`}
      args={[undefined, undefined, entries.length]}
      material={material}
      castShadow
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

function addDormer(batches, item, face, along, y, width = 1.2, height = 1.5, options = {}) {
  const housingDepth = options.housingDepth ?? 0;
  if (housingDepth > 0) {
    const housing = facePlacement(
      item,
      face,
      along,
      y,
      0.12 - housingDepth / 2,
      width + 0.38,
      height + 0.28,
      housingDepth,
    );
    housing.color = options.housingColor ?? PALE_STONE;
    batches.stone.push(housing);
  }
  addWindow(batches, item, face, along, y, width, height, { stone: LIGHT_STONE });
  if (housingDepth > 0) {
    const [sx, , sz] = item.size;
    const roofY = y + height / 2 + 0.35;
    const roofDepth = housingDepth + 0.35;
    if (face === '-x' || face === '+x') {
      const sign = face === '-x' ? -1 : 1;
      batches.roofGables.push(worldPart(
        item,
        [sign * (sx / 2 - housingDepth / 2 + 0.12), roofY, along],
        [width + 0.5, 0.85, roofDepth],
        SLATE,
        [0, Math.PI / 2, 0],
      ));
    } else {
      const sign = face === '-z' ? -1 : 1;
      batches.roofGables.push(worldPart(
        item,
        [along, roofY, sign * (sz / 2 - housingDepth / 2 + 0.12)],
        [width + 0.5, 0.85, roofDepth],
        SLATE,
      ));
    }
    return;
  }
  const roof = facePlacement(item, face, along, y + height / 2 + 0.48, 0.28, width * 0.86, 0.72, 0.7);
  roof.color = SLATE;
  batches.roofBoxes.push(roof);
}

function faceOrientedPart(item, face, along, y, out, width, height, color) {
  const [sx, , sz] = item.size;
  if (face === '+x') {
    return worldPart(item, [sx / 2 + out, y, along], [width, height, 1], color, [0, Math.PI / 2, 0]);
  }
  if (face === '-x') {
    return worldPart(item, [-sx / 2 - out, y, along], [width, height, 1], color, [0, -Math.PI / 2, 0]);
  }
  if (face === '+z') return worldPart(item, [along, y, sz / 2 + out], [width, height, 1], color);
  return worldPart(item, [along, y, -sz / 2 - out], [width, height, 1], color, [0, Math.PI, 0]);
}

// Gerry's round-headed ground-floor openings use two tiny shared meshes: a
// glass semicircle and a flat stone archivolt. This gives the facade its most
// recognisable motif without boolean-cut walls or one mesh per arch.
function addArchedOpening(batches, item, face, along, bottomY, width, totalHeight, options = {}) {
  const radius = width / 2;
  const straightHeight = totalHeight - radius;
  const springY = bottomY + straightHeight;
  const crownWidth = width / 0.74;
  const jambWidth = (crownWidth - width) / 2;
  const stone = options.stone ?? LIGHT_STONE;
  const openingColor = options.door ? DOOR : (options.lit ? GLASS_LIGHT : GLASS);

  for (const offset of [-1, 1]) {
    const jamb = facePlacement(
      item,
      face,
      along + offset * (width / 2 + jambWidth / 2),
      bottomY + straightHeight / 2,
      0.2,
      jambWidth,
      straightHeight,
      0.2,
    );
    jamb.color = stone;
    batches.stone.push(jamb);
  }
  const sill = facePlacement(item, face, along, bottomY - 0.08, 0.2, crownWidth, 0.2, 0.22);
  sill.color = options.sill ?? SHADOW_STONE;
  batches.stone.push(sill);

  const lower = facePlacement(item, face, along, bottomY + straightHeight / 2, 0.22, width, straightHeight, 0.08);
  lower.color = openingColor;
  batches[options.door ? 'iron' : 'glass'].push(lower);
  batches.archGlass.push(faceOrientedPart(item, face, along, springY, 0.265, width, width, openingColor));
  batches.archStone.push(faceOrientedPart(item, face, along, springY, 0.29, crownWidth, crownWidth, stone));
  const keystone = facePlacement(item, face, along, springY + radius * 0.9, 0.34, 0.2, 0.3, 0.16);
  keystone.color = options.keystone ?? '#d5c6aa';
  batches.stone.push(keystone);

  const vertical = facePlacement(item, face, along, bottomY + totalHeight * 0.52, 0.32, 0.065, totalHeight * 0.88, 0.045);
  vertical.color = SASH;
  batches.iron.push(vertical);
  const springRail = facePlacement(item, face, along, springY, 0.325, width, 0.065, 0.045);
  springRail.color = SASH;
  batches.iron.push(springRail);
}

// Four narrow pieces read as a dressed opening without the thick, solid slab
// used by the district's generic windows. Gerry's tall lights need more brick
// visible between them or the pavilion collapses into a grid of white boxes.
function addGerryWindow(batches, item, face, along, y, width, height, options = {}) {
  const stone = options.stone ?? '#dfd3bd';
  const jambWidth = 0.14;
  for (const offset of [-1, 1]) {
    const jamb = facePlacement(item, face, along + offset * (width / 2 + jambWidth / 2), y, 0.08, jambWidth, height + 0.18, 0.13);
    jamb.color = stone;
    batches.stone.push(jamb);
  }
  const lintel = facePlacement(item, face, along, y + height / 2 + 0.07, 0.09, width + 0.42, 0.18, 0.16);
  lintel.color = stone;
  batches.stone.push(lintel);
  const sill = facePlacement(item, face, along, y - height / 2 - 0.07, 0.09, width + 0.32, 0.14, 0.15);
  sill.color = options.sill ?? '#c9bba3';
  batches.stone.push(sill);

  // Keep glazing behind the stone reveal. The old pane and sash sat a few
  // millimetres in front of the jamb outer face, producing close-range seams
  // and depth-order artifacts along the frame.
  const pane = facePlacement(item, face, along, y, 0.035, width + 0.025, height + 0.025, 0.055);
  pane.color = options.lit ? GLASS_LIGHT : GLASS;
  batches.glass.push(pane);
  const vertical = facePlacement(item, face, along, y, 0.074, 0.055, height + 0.02, 0.038);
  vertical.color = SASH;
  batches.iron.push(vertical);
  const horizontal = facePlacement(item, face, along, y - height * 0.08, 0.076, width + 0.02, 0.055, 0.038);
  horizontal.color = SASH;
  batches.iron.push(horizontal);

  if (options.hood) {
    const hood = facePlacement(item, face, along, y + height / 2 + 0.24, 0.18, width + 0.58, 0.14, 0.28);
    hood.color = options.hoodStone ?? LIGHT_STONE;
    batches.stone.push(hood);
    const hoodKey = facePlacement(item, face, along, y + height / 2 + 0.34, 0.2, 0.16, 0.28, 0.24);
    hoodKey.color = options.hoodStone ?? '#d6c7ab';
    batches.stone.push(hoodKey);
  }
}

function addGerryDormer(batches, item, face, along, y, width = 0.95, height = 1.35, depth = 2.35) {
  const housing = facePlacement(item, face, along, y, 0.12 - depth / 2, width + 0.28, height + 0.18, depth);
  housing.color = '#bfaf94';
  batches.stone.push(housing);
  addGerryWindow(batches, item, face, along, y, width, height, { stone: '#e3d8c3' });

  const [sx, , sz] = item.size;
  const roofY = y + height / 2 + 0.42;
  const roofDepth = depth + 0.32;
  if (face === '-x' || face === '+x') {
    const sign = face === '-x' ? -1 : 1;
    batches.roofGables.push(worldPart(
      item,
      [sign * (sx / 2 - depth / 2 + 0.12), roofY, along],
      [width + 0.42, 0.95, roofDepth],
      SLATE,
      [0, Math.PI / 2, 0],
    ));
  } else {
    const sign = face === '-z' ? -1 : 1;
    batches.roofGables.push(worldPart(
      item,
      [along, roofY, sign * (sz / 2 - depth / 2 + 0.12)],
      [width + 0.42, 0.95, roofDepth],
      SLATE,
    ));
  }

  // A shared triangular limestone face changes the read from a generic box
  // dormer to the large stone-gabled form in the reference. One extra
  // instanced batch serves all of these gables.
  const gableHeight = Math.max(1.0, width * 0.92);
  if (face === '-x' || face === '+x') {
    const sign = face === '-x' ? -1 : 1;
    batches.stoneGables.push(worldPart(
      item,
      [sign * (sx / 2 + 0.28), y + height / 2 + gableHeight / 2 - 0.02, along],
      [width + 0.74, gableHeight, 0.2],
      '#d1c1a6',
      [0, Math.PI / 2, 0],
    ));
  } else {
    const sign = face === '-z' ? -1 : 1;
    batches.stoneGables.push(worldPart(
      item,
      [along, y + height / 2 + gableHeight / 2 - 0.02, sign * (sz / 2 + 0.28)],
      [width + 0.74, gableHeight, 0.2],
      '#d1c1a6',
    ));
  }

  // Two thin sloped bars complete the visible stone pediment. They use the
  // existing box instance batch; the triangular backing alone was mostly
  // hidden by the dark dormer housing at street angles and read as two forks.
  const pedimentHalf = width / 2 + 0.32;
  const pedimentRise = gableHeight * 0.86;
  const pedimentLength = Math.hypot(pedimentHalf, pedimentRise);
  const pedimentAngle = Math.atan2(pedimentRise, pedimentHalf);
  const pedimentBaseY = y + height / 2 + 0.02;
  if (face === '-x' || face === '+x') {
    const sign = face === '-x' ? -1 : 1;
    for (const direction of [-1, 1]) {
      addBox(
        batches,
        'stone',
        item,
        [sign * (sx / 2 + 0.4), pedimentBaseY + pedimentRise / 2, along + direction * pedimentHalf / 2],
        [0.16, 0.14, pedimentLength],
        '#d8c9ad',
        [direction * pedimentAngle, 0, 0],
      );
    }
  } else {
    const sign = face === '-z' ? -1 : 1;
    for (const direction of [-1, 1]) {
      addBox(
        batches,
        'stone',
        item,
        [along + direction * pedimentHalf / 2, pedimentBaseY + pedimentRise / 2, sign * (sz / 2 + 0.4)],
        [pedimentLength, 0.14, 0.16],
        '#d8c9ad',
        [0, 0, -direction * pedimentAngle],
      );
    }
  }

  // Tiny crocketed posts are silhouette cues, not literal carved replicas.
  // They share the stone box batch and give each dormer a château character.
  for (const offset of [-1, 1]) {
    const post = facePlacement(item, face, along + offset * (width / 2 + 0.21), y + height / 2 + 0.34, 0.31, 0.11, 0.86, 0.11);
    post.color = '#d1c1a6';
    batches.stone.push(post);
    const cap = facePlacement(item, face, along + offset * (width / 2 + 0.21), y + height / 2 + 0.8, 0.32, 0.21, 0.12, 0.15);
    cap.color = '#d8c9ad';
    batches.stone.push(cap);
  }
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
  // Its eaves meet the top of the shell; the notched corner butts cleanly into
  // the turret rather than intersecting it.
  batches.roofNotchedHips.push(worldPart(item, [0, sy / 2 + 0.8, 0], [sx + 1.2, 4.2, sz + 1.2], SLATE));
  batches.towers.push(worldPart(item, [-sx * 0.39, sy / 2 - 0.8, -sz * 0.38], [1.7, 4.0, 1.7], PALE_STONE));
  batches.roofCopperCones.push(worldPart(item, [-sx * 0.39, sy / 2 + 2.65, -sz * 0.38], [2.0, 2.8, 2.0], COPPER));
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
  // The shell ends at sy / 2 - 0.8, so a 3.9-unit roof centered here places
  // its eaves directly on the masonry instead of leaving a strip of sky.
  batches.roofHips.push(worldPart(item, [0, sy / 2 + 1.15, 0], [sx + 1.0, 3.9, sz + 1.0], SLATE_LIGHT));
  for (const z of [-sz * 0.25, 0, sz * 0.25]) {
    // These deep housings disappear into the receding hip plane; a shallow
    // box ends in mid-air when seen obliquely from Fifth Avenue.
    addDormer(batches, item, '-x', z, sy / 2 + 0.55, 1.0, 1.15, { housingDepth: 4.9 });
  }
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
  batches.roofCopperCones.push(worldPart(item, [-sx * 0.41, sy / 2 + 2.8, sz * 0.35], [2.35, 3.2, 2.35], COPPER));
}

function buildGerry(item, batches) {
  const [sx, sy, sz] = item.size;
  const bottom = -sy / 2;
  const overlap = 0.28;
  const cornerWidth = sx * 0.46;
  const cornerDepth = sz * 0.76;
  const cornerX = -sx / 2 + cornerWidth / 2;
  const cornerZ = -sz / 2 + cornerDepth / 2;
  const cornerHeight = 14.4;
  const cornerTop = bottom + cornerHeight;

  const frontWidth = sx - cornerWidth + overlap;
  const frontDepth = sz * 0.7;
  const frontX = -sx / 2 + cornerWidth - overlap + frontWidth / 2;
  const frontZ = -sz / 2 + frontDepth / 2;
  const frontHeight = 11.1;
  const frontTop = bottom + frontHeight;

  const sideWidth = cornerWidth;
  const sideDepth = sz - cornerDepth + overlap;
  const sideX = cornerX;
  const sideZ = -sz / 2 + cornerDepth - overlap + sideDepth / 2;
  const sideHeight = 10.75;
  const sideTop = bottom + sideHeight;

  // The pavilion now owns the composition. Its warm brick is shared with the
  // lower wings, but their much lower cornices prevent the previous single-
  // apartment-block read.
  addShell(batches, item, [cornerX, bottom + cornerHeight / 2, cornerZ], [cornerWidth, cornerHeight, cornerDepth], 1, '#d9a58b');
  addShell(batches, item, [frontX, bottom + frontHeight / 2, frontZ], [frontWidth, frontHeight, frontDepth], 1, '#d19b81');
  addShell(batches, item, [sideX, bottom + sideHeight / 2, sideZ], [sideWidth, sideHeight, sideDepth], 1, '#d19b81');

  const baseHeight = 3.95;
  addShell(batches, item, [cornerX, bottom + baseHeight / 2, cornerZ], [cornerWidth + 0.18, baseHeight, cornerDepth + 0.18], 2, '#b8aa96');
  addShell(batches, item, [frontX, bottom + baseHeight / 2, frontZ], [frontWidth + 0.18, baseHeight, frontDepth + 0.18], 2, '#ad9e8b');
  addShell(batches, item, [sideX, bottom + baseHeight / 2, sideZ], [sideWidth + 0.18, baseHeight, sideDepth + 0.18], 2, '#ad9e8b');

  const massCourse = (x, z, width, depth, y, thickness, extension, color) => {
    addBox(batches, 'stone', item, [x, y, z], [width + extension, thickness, depth + extension], color);
  };
  for (const mass of [
    [cornerX, cornerZ, cornerWidth, cornerDepth],
    [frontX, frontZ, frontWidth, frontDepth],
    [sideX, sideZ, sideWidth, sideDepth],
  ]) {
    massCourse(...mass, bottom + baseHeight + 0.06, 0.28, 0.28, '#d9cbb1');
    massCourse(...mass, bottom + 7.72, 0.16, 0.18, '#c6b69e');
  }
  massCourse(cornerX, cornerZ, cornerWidth, cornerDepth, cornerTop - 0.08, 0.38, 0.78, '#d8c9ad');
  massCourse(cornerX, cornerZ, cornerWidth, cornerDepth, cornerTop - 0.43, 0.18, 0.48, '#bfae92');
  massCourse(cornerX, cornerZ, cornerWidth, cornerDepth, cornerTop - 0.68, 0.14, 0.3, '#d9cbb1');
  massCourse(frontX, frontZ, frontWidth, frontDepth, frontTop - 0.08, 0.32, 0.55, '#d5c5a9');
  massCourse(sideX, sideZ, sideWidth, sideDepth, sideTop - 0.08, 0.3, 0.52, '#d5c5a9');

  // Tall arched openings form a calm rusticated base on both streets.
  [-4.75, -2.0, 0.75, 4.85].forEach((z, index) => {
    addArchedOpening(batches, item, '-x', z, bottom + 0.52, 1.2, 3.12, { lit: index === 1 });
  });
  [-10.1, -7.25, -4.4, -0.15, 3.1, 6.35, 9.65].forEach((x, index) => {
    addArchedOpening(batches, item, '-z', x, bottom + 0.52, 1.18, 3.12, { lit: index === 4 });
  });

  // The large upper loggia is a layered dark opening, not a pasted ground-
  // floor doorway. A projecting sill and short baluster row make its depth
  // legible without a boolean cut or unique material.
  const loggiaX = -2.8;
  const loggiaBottom = bottom + 7.95;
  addArchedOpening(batches, item, '-z', loggiaX, loggiaBottom, 2.2, 4.05, { stone: '#d5c5aa' });
  addBox(batches, 'stone', item, [loggiaX, loggiaBottom - 0.2, -sz / 2 - 0.58], [3.25, 0.3, 1.02], '#d8cab1');
  for (let index = 0; index < 7; index += 1) {
    addBox(batches, 'stone', item, [loggiaX - 1.25 + index * 0.416, loggiaBottom + 0.32, -sz / 2 - 1.0], [0.1, 0.9, 0.1], '#d9cbb1');
  }
  addBox(batches, 'stone', item, [loggiaX, loggiaBottom + 0.76, -sz / 2 - 1.0], [2.85, 0.12, 0.12], '#d9cbb1');

  const pavilionFloors = [bottom + 6.5, bottom + 10.32];
  [-4.5, -1.25, 1.95].forEach((z, column) => {
    pavilionFloors.forEach((y, floor) => addGerryWindow(batches, item, '-x', z, y, 0.92, 2.14, {
      hood: floor === 1,
      lit: column === 1 && floor === 0,
      stone: '#ded0b8',
    }));
  });
  [-9.45, -6.2].forEach((x, column) => {
    pavilionFloors.forEach((y, floor) => addGerryWindow(batches, item, '-z', x, y, 0.94, 2.12, {
      hood: floor === 1,
      lit: column === 0 && floor === 1,
      stone: '#ded0b8',
    }));
  });
  const wingFloors = [bottom + 6.42, bottom + 9.55];
  [0.4, 3.7, 7.0, 10.25].forEach((x, column) => {
    wingFloors.forEach((y, floor) => addGerryWindow(batches, item, '-z', x, y, 0.9, floor ? 1.82 : 2.02, {
      hood: floor === 1,
      lit: column === 2 && floor === 0,
      stone: '#d8cab1',
    }));
  });
  [4.6].forEach((z) => wingFloors.forEach((y, floor) => addGerryWindow(
    batches, item, '-x', z, y, 0.88, floor ? 1.78 : 1.98, { hood: floor === 1, stone: '#d8cab1' },
  )));

  // Alternating quoins stay shallow enough to read as masonry, not teeth.
  const cornerEast = -sx / 2 + cornerWidth;
  const cornerSouth = -sz / 2 + cornerDepth;
  for (let level = 0; level < 9; level += 1) {
    const y = bottom + 4.72 + level * 1.02;
    const long = level % 2 === 0;
    const length = long ? 0.68 : 0.52;
    addBox(batches, 'stone', item, [-sx / 2 - 0.07, y, -sz / 2 + length / 2], [0.14, 0.46, length], '#ded0b8');
    addBox(batches, 'stone', item, [-sx / 2 + length / 2, y, -sz / 2 - 0.07], [length, 0.46, 0.14], '#ded0b8');
    const returnLength = long ? 0.58 : 0.44;
    const northReturn = facePlacement(item, '-z', cornerEast, y, 0.075, returnLength, 0.44, 0.14);
    northReturn.color = '#d3c3a9';
    batches.stone.push(northReturn);
    const westReturn = facePlacement(item, '-x', cornerSouth, y, 0.075, returnLength, 0.44, 0.14);
    westReturn.color = '#d3c3a9';
    batches.stone.push(westReturn);
  }

  // A shallow iron-and-glass conservatory attaches to the side wing and stays
  // within the sidewalk budget. Its panes use one shared, single-pass physical
  // material so the close view gets reflections and transparency without a
  // transmission/refraction pass per panel.
  const conservatoryZ = Math.min(sz / 2 - 1.72, cornerSouth + 1.65);
  const conservatoryX = -sx / 2 - 0.78;
  const conservatoryWidth = 4.12;
  const conservatoryHalf = conservatoryWidth / 2;
  const conservatoryFrontX = -sx / 2 - 1.68;
  const glazingBottom = bottom + 1.12;
  const glazingTop = bottom + 3.82;
  const glazingHeight = glazingTop - glazingBottom;
  const glazingY = (glazingBottom + glazingTop) / 2;
  addBox(batches, 'stone', item, [conservatoryX, bottom + 0.58, conservatoryZ], [1.76, 1.16, conservatoryWidth], '#918675');
  addBox(batches, 'stone', item, [conservatoryX, bottom + 1.16, conservatoryZ], [1.92, 0.14, conservatoryWidth + 0.18], '#b6a78f');

  // Four front bays and two return bays overlap their iron rebates. Every
  // panel now reaches the base and eave, eliminating the daylight slits and
  // tan wall fragments visible in the earlier close view.
  const frontBays = 4;
  const frontPitch = conservatoryWidth / frontBays;
  for (let index = 0; index < frontBays; index += 1) {
    const z = conservatoryZ - conservatoryHalf + frontPitch * (index + 0.5);
    addBox(batches, 'conservatoryGlass', item, [conservatoryFrontX, glazingY, z], [0.065, glazingHeight + 0.06, frontPitch - 0.045], '#d9e4e6');
  }
  for (const direction of [-1, 1]) {
    const z = conservatoryZ + direction * conservatoryHalf;
    for (const xOffset of [0.43, 1.28]) {
      addBox(batches, 'conservatoryGlass', item, [-sx / 2 - xOffset, glazingY, z], [0.82, glazingHeight + 0.06, 0.065], '#d4e1e4');
    }
    for (const xOffset of [0.04, 0.86, 1.7]) {
      addBox(batches, 'iron', item, [-sx / 2 - xOffset, glazingY, z + direction * 0.045], [0.07, glazingHeight + 0.14, 0.07], IRON);
    }
    for (const railY of [glazingBottom + 0.04, bottom + 2.52, glazingTop - 0.04]) {
      addBox(batches, 'iron', item, [conservatoryX, railY, z + direction * 0.05], [1.76, 0.07, 0.07], IRON);
    }
  }
  for (let index = 0; index <= frontBays; index += 1) {
    const z = conservatoryZ - conservatoryHalf + frontPitch * index;
    addBox(batches, 'iron', item, [conservatoryFrontX - 0.045, glazingY, z], [0.07, glazingHeight + 0.14, 0.07], IRON);
  }
  for (const railY of [glazingBottom + 0.04, bottom + 2.52, glazingTop - 0.04]) {
    addBox(batches, 'iron', item, [conservatoryFrontX - 0.05, railY, conservatoryZ], [0.07, 0.07, conservatoryWidth + 0.08], IRON);
  }
  addBox(batches, 'iron', item, [conservatoryFrontX - 0.08, bottom + 2.48, conservatoryZ + 0.28], [0.08, 0.08, 0.08], '#b89a62');
  batches.roofHips.push(worldPart(item, [conservatoryX, bottom + 4.2, conservatoryZ], [2.16, 0.82, conservatoryWidth + 0.45], '#cbd2d4'));
  addBox(batches, 'iron', item, [conservatoryFrontX - 0.05, bottom + 3.84, conservatoryZ], [0.09, 0.16, conservatoryWidth + 0.22], IRON);

  // The twelve-triangle truncated hip supplies the target's tower-like roof
  // without dense slate geometry. Lower gables overlap the pavilion so no sky
  // cracks appear between the three masses.
  const mainRoofHeight = 8.65;
  batches.roofTruncatedHips.push(worldPart(
    item,
    [cornerX, cornerTop + mainRoofHeight / 2 - 0.04, cornerZ],
    [cornerWidth + 1.0, mainRoofHeight, cornerDepth + 1.0],
    '#d7dcde',
  ));
  batches.roofGables.push(worldPart(
    item,
    [frontX, frontTop + 1.85, frontZ],
    [frontDepth + 0.45, 3.72, frontWidth + 0.48],
    '#e2e6e7',
    [0, Math.PI / 2, 0],
  ));
  batches.roofGables.push(worldPart(
    item,
    [sideX, sideTop + 1.68, sideZ],
    [sideWidth + 0.46, 3.4, sideDepth + 0.42],
    '#e2e6e7',
  ));

  [-3.65, 0.0].forEach((z) => addGerryDormer(batches, item, '-x', z, cornerTop + 2.0, 1.15, 1.68, 2.35));
  [-9.15, -5.35].forEach((x) => addGerryDormer(batches, item, '-z', x, cornerTop + 2.0, 1.15, 1.68, 2.35));
  [1.55, 5.35, 9.15].forEach((x) => addGerryDormer(batches, item, '-z', x, frontTop + 0.48, 0.84, 1.12, 1.75));
  [4.55].forEach((z) => addGerryDormer(batches, item, '-x', z, sideTop + 0.5, 0.82, 1.1, 1.65));

  for (const [x, z, roofTop] of [
    [cornerX + 4.05, cornerZ + 2.55, cornerTop + 0.65],
    [frontX + 4.5, frontZ + 1.2, frontTop + 0.35],
    [frontX - 3.5, frontZ + 1.25, frontTop + 0.35],
    [sideX - 3.7, sideZ, sideTop + 0.25],
    [sideX + 3.6, sideZ, sideTop + 0.25],
  ]) {
    addBox(batches, 'stone', item, [x, roofTop + 3.0, z], [0.72, 4.4, 0.72], '#bd765d');
    addBox(batches, 'stone', item, [x, roofTop + 5.26, z], [0.98, 0.22, 0.98], '#d0c0a5');
    addBox(batches, 'stone', item, [x, roofTop + 4.97, z], [0.82, 0.18, 0.82], '#b9a78b');
  }

  const mainApex = cornerTop + mainRoofHeight - 0.04;
  addBox(batches, 'stone', item, [cornerX, mainApex + 0.04, cornerZ], [2.35, 0.22, 1.98], '#cbbb9f');
  for (const [dx, dz] of [[-0.82, -0.66], [0.82, -0.66], [-0.82, 0.66], [0.82, 0.66]]) {
    addBox(batches, 'stone', item, [cornerX + dx, mainApex + 0.5, cornerZ + dz], [0.12, 0.86, 0.12], '#d9cbb1');
    addBox(batches, 'stone', item, [cornerX + dx, mainApex + 0.96, cornerZ + dz], [0.23, 0.12, 0.23], '#e1d4bd');
  }
  addBox(batches, 'iron', item, [cornerX, mainApex + 1.3, cornerZ], [0.075, 2.15, 0.075], IRON);
  addBox(batches, 'iron', item, [cornerX, mainApex + 1.66, cornerZ], [0.7, 0.065, 0.065], IRON);
  addBox(batches, 'iron', item, [cornerX, mainApex + 1.66, cornerZ], [0.065, 0.065, 0.7], IRON);

  // The areaway stops cleanly at the conservatory instead of passing through
  // its glazing. Two rails, a low crossed lattice, heavier interval posts,
  // and shared pyramid finials create a period wrought-iron read while every
  // straight member remains part of the existing iron box instance batch.
  const fenceStart = -sz * 0.43;
  const fenceEnd = conservatoryZ - conservatoryHalf - 0.18;
  const fenceBays = 9;
  const fencePitch = (fenceEnd - fenceStart) / fenceBays;
  const fenceX = -sx / 2 - 0.38;
  const lowerRailY = bottom + 0.48;
  const upperRailY = bottom + 1.38;
  for (let index = 0; index <= fenceBays; index += 1) {
    const z = fenceStart + fencePitch * index;
    const principal = index % 3 === 0;
    const height = principal ? 1.78 : 1.55;
    addBox(batches, 'iron', item, [fenceX, bottom + height / 2 + 0.04, z], [principal ? 0.09 : 0.06, height, principal ? 0.09 : 0.06], IRON);
    batches.ironFinials.push(worldPart(item, [fenceX, bottom + height + 0.17, z], [principal ? 0.13 : 0.1, 0.27, principal ? 0.13 : 0.1], IRON, [0, Math.PI / 4, 0]));
  }
  const fenceCenterZ = (fenceStart + fenceEnd) / 2;
  const fenceLength = fenceEnd - fenceStart;
  for (const y of [lowerRailY, upperRailY]) {
    addBox(batches, 'iron', item, [fenceX, y, fenceCenterZ], [0.07, 0.07, fenceLength + 0.08], IRON);
  }
  const latticeHeight = upperRailY - lowerRailY;
  const latticeLength = Math.hypot(fencePitch, latticeHeight);
  const latticeAngle = Math.atan2(latticeHeight, fencePitch);
  for (let index = 0; index < fenceBays; index += 1) {
    const z = fenceStart + fencePitch * (index + 0.5);
    const y = (lowerRailY + upperRailY) / 2;
    for (const direction of [-1, 1]) {
      addBox(batches, 'iron', item, [fenceX, y, z], [0.045, 0.045, latticeLength], IRON, [direction * latticeAngle, 0, 0]);
    }
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
    conservatoryGlass: [],
    archStone: [],
    archGlass: [],
    iron: [],
    ironFinials: [],
    copper: [],
    roofBoxes: [],
    roofHips: [],
    roofTruncatedHips: [],
    roofNotchedHips: [],
    roofPyramids: [],
    roofCones: [],
    roofCopperCones: [],
    roofGables: [],
    stoneGables: [],
    towers: [],
  };
  items
    .filter((item) => isGildedAgeLandmark(item) && item.landmarkModel !== 'new-netherland-hotel')
    .forEach((item) => BUILDERS[item.landmarkModel](item, batches));
  return batches;
}

export default function GildedAgeLandmarks({ items, facadeTextures, runtime }) {
  const batches = useMemo(() => buildDistrict(items), [items]);
  const newNetherlandItems = useMemo(
    () => items.filter((item) => item.landmarkModel === 'new-netherland-hotel'),
    [items],
  );
  const geometry = useSharedGeometry();
  const materials = useSharedMaterials();
  // The district never moves, and its shared materials must not straddle
  // instanced and plain meshes (see staticScene.js for both costs).
  const rootRef = useRef(null);
  useEffect(() => {
    const twins = splitMixedInstancedMaterials(rootRef.current);
    freezeStaticTransforms(rootRef.current);
    return () => twins.forEach((twin) => twin.dispose());
  }, [batches, newNetherlandItems]);
  return (
    <group ref={rootRef} name="1896 Gilded Age landmark district">
      {newNetherlandItems.map((item) => (
        <NewNetherlandHotel key={item.id} item={item} facadeTextures={facadeTextures} runtime={runtime} />
      ))}
      {[...batches.shells.entries()].map(([style, entries]) => (
        <ShellBatch key={style} entries={entries} facadeTextures={facadeTextures} style={style} />
      ))}
      {/* Main stone bases, cylindrical towers, and box roofs contribute to
          several landmark silhouettes. They share one draw apiece, so casting
          them is inexpensive and prevents a roof-only shadow. */}
      <InstancedParts name="landmark-stone-and-trim" parts={batches.stone} geometry={geometry.box} material={materials.stone} shadows />
      <InstancedParts name="landmark-window-depth" parts={batches.glass} geometry={geometry.box} material={materials.glass} />
      <InstancedParts name="gerry-conservatory-glass" parts={batches.conservatoryGlass} geometry={geometry.box} material={materials.conservatoryGlass} />
      <InstancedParts name="landmark-arched-stone-crowns" parts={batches.archStone} geometry={geometry.archCrown} material={materials.stone} />
      <InstancedParts name="landmark-round-headed-glass" parts={batches.archGlass} geometry={geometry.archFan} material={materials.glass} />
      <InstancedParts name="landmark-sash-and-ironwork" parts={batches.iron} geometry={geometry.box} material={materials.iron} />
      <InstancedParts name="landmark-wrought-iron-finials" parts={batches.ironFinials} geometry={geometry.pyramid} material={materials.iron} />
      <InstancedParts name="landmark-aged-copper" parts={batches.copper} geometry={geometry.box} material={materials.copper} />
      <InstancedParts name="landmark-roof-boxes" parts={batches.roofBoxes} geometry={geometry.box} material={materials.roof} shadows />
      <InstancedParts name="landmark-rectangular-hip-roofs" parts={batches.roofHips} geometry={geometry.hipRoof} material={materials.roof} shadows />
      <InstancedParts name="landmark-truncated-hip-roofs" parts={batches.roofTruncatedHips} geometry={geometry.truncatedHipRoof} material={materials.roof} shadows />
      <InstancedParts name="landmark-notched-hip-roofs" parts={batches.roofNotchedHips} geometry={geometry.cornerNotchedHipRoof} material={materials.roof} shadows />
      <InstancedParts name="landmark-round-towers" parts={batches.towers} geometry={geometry.cylinder} material={materials.stone} shadows />
      <InstancedParts name="landmark-hipped-roofs" parts={batches.roofPyramids} geometry={geometry.pyramid} material={materials.roof} shadows />
      <InstancedParts name="landmark-conical-roofs" parts={batches.roofCones} geometry={geometry.cone} material={materials.roof} shadows />
      <InstancedParts name="landmark-copper-conical-roofs" parts={batches.roofCopperCones} geometry={geometry.cone} material={materials.copper} shadows />
      <InstancedParts name="landmark-gabled-roofs" parts={batches.roofGables} geometry={geometry.gable} material={materials.roof} shadows />
      <InstancedParts name="landmark-stone-gable-faces" parts={batches.stoneGables} geometry={geometry.gable} material={materials.stone} />
    </group>
  );
}

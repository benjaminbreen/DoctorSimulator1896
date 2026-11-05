import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from './modelLoader.js';
import { terrainHeight } from '../world/terrain.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { PARK_LANDMARKS } from '../world/parkLandmarks.js';
import { instanced } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';

// The Menagerie north of the Arsenal: plank animal houses with ventilator
// cupolas, barred bear cages, an elk paddock, and a raised sea lion pool.
// The buildings follow the Dennis stereoviews; the 1890 report lists elk and
// a sea lion among the stock. The layout is a guess. The sheds' body
// colliders are the 'menagerie-shed' items in centralPark.js.

export const SHEDS = [
  { id: 'menagerie-shed-1', x: 90.5, z: -75, width: 6, length: 9, eave: 2.6, cages: true },
  { id: 'menagerie-shed-2', x: 93, z: -58.6, width: 3.5, length: 3.2, eave: 2.2, cages: false },
];
export const POOL = { x: 85.4, z: -66.8, radius: 2.6, rim: 0.45 };
// The elk paddock, with the small shed at its east end for shelter.
export const PADDOCK = { x0: 86.6, x1: 95.3, z0: -62.5, z1: -55.4 };
const CAGE_DEPTH = 2.3;
const CAGE_HALF = 1.5;
const CAGE_Z = [-2.2, 2.2];
const WATER_Y = 1.78; // above the highest grade inside the basin
const RIM_Y = 2.08;
const SEA_LIONS = 3;

function shedPieces(shed) {
  const base = terrainHeight(shed.x, shed.z);
  const { width, length, eave } = shed;
  const rise = width * 0.35;
  const walls = [new THREE.BoxGeometry(width, eave + 1, length).translate(0, (eave + 1) / 2 - 1, 0)];
  // Gable ends: a triangle prism over each short wall, cut from a box.
  const gable = new THREE.BufferGeometry();
  const h = eave;
  const tri = (zz, flip) => {
    const p = [[-width / 2, h, zz], [width / 2, h, zz], [0, h + rise, zz]];
    return flip ? [p[1], p[0], p[2]] : p;
  };
  gable.setAttribute('position', new THREE.Float32BufferAttribute([...tri(length / 2, false), ...tri(-length / 2, true)].flat(), 3));
  gable.computeVertexNormals();
  // Planks run up the wall: u across, v up, in metres over a 2 m tile.
  const uvFor = (geometry) => {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = [];
    for (let i = 0; i < position.count; i += 1) {
      const across = Math.abs(normal.getX(i)) > 0.5 ? position.getZ(i) : position.getX(i);
      uv.push(across / 2, position.getY(i) / 2);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geometry;
  };
  const planked = mergeGeometries([uvFor(walls[0].toNonIndexed()), uvFor(gable)]);

  // The roof: two slabs meeting at the ridge, with a small overhang.
  const slope = Math.hypot(width / 2 + 0.35, rise + 0.12);
  const angle = Math.atan2(rise + 0.12, width / 2 + 0.35);
  const roof = [];
  for (const side of [-1, 1]) {
    roof.push(new THREE.BoxGeometry(slope, 0.08, length + 0.6)
      .rotateZ(side * -angle)
      .translate((side * (width / 2 + 0.35)) / 2, h + rise / 2 + 0.02, 0)
      .toNonIndexed());
  }
  // The ventilator cupola on the ridge: a louvred box under its own little roof.
  const cupola = [new THREE.BoxGeometry(0.9, 0.7, 0.9).translate(0, h + rise + 0.3, 0).toNonIndexed()];
  roof.push(new THREE.CylinderGeometry(0.05, 0.85, 0.45, 4).rotateY(Math.PI / 4).translate(0, h + rise + 0.88, 0).toNonIndexed());
  if (length > 6) {
    for (const z of [-length / 3, length / 3]) {
      cupola.push(new THREE.BoxGeometry(0.9, 0.7, 0.9).translate(0, h + rise + 0.3, z).toNonIndexed());
      roof.push(new THREE.CylinderGeometry(0.05, 0.85, 0.45, 4).rotateY(Math.PI / 4).translate(0, h + rise + 0.88, z).toNonIndexed());
    }
  }
  for (const geometry of roof) geometry.deleteAttribute('uv');

  const dark = [];
  const trim = [];
  // Wide stable doors on the north and south ends, small windows along the east.
  for (const side of [-1, 1]) {
    dark.push({ p: [0, 1.0, side * (length / 2 + 0.02)], s: [1.5, 2.0, 0.04] });
    trim.push({ p: [0, 2.05, side * (length / 2 + 0.04)], s: [1.7, 0.1, 0.06] });
    trim.push({ p: [-0.78, 1.0, side * (length / 2 + 0.04)], s: [0.1, 2.0, 0.06] });
    trim.push({ p: [0.78, 1.0, side * (length / 2 + 0.04)], s: [0.1, 2.0, 0.06] });
    // The X brace of a stable door.
    for (const tilt of [-1, 1]) trim.push({ p: [0, 1.0, side * (length / 2 + 0.05)], r: [0, 0, tilt * 0.93], s: [2.4, 0.08, 0.04] });
  }
  for (let z = -length / 2 + 1.2; z < length / 2 - 0.6; z += 2) {
    dark.push({ p: [width / 2 + 0.02, 1.7, z], s: [0.04, 0.55, 0.7] });
    trim.push({ p: [width / 2 + 0.04, 1.42, z], s: [0.06, 0.08, 0.85] });
  }
  for (let i = 0; i < cupola.length; i += 1) {
    const z = i === 0 ? 0 : (i === 1 ? -length / 3 : length / 3);
    for (const [x, zz, sx, sz] of [[0.46, 0, 0.02, 0.7], [-0.46, 0, 0.02, 0.7], [0, 0.46, 0.7, 0.02], [0, -0.46, 0.7, 0.02]]) {
      for (let k = 0; k < 4; k += 1) dark.push({ p: [x, h + rise + 0.1 + k * 0.13, z + zz], s: [sx, 0.04, sz] });
    }
  }
  return { base, planked, cupola: mergeGeometries(cupola), roof: mergeGeometries(roof), dark, trim };
}

// Barred outdoor cages along the west wall of the big house: iron rods on a
// stone curb, a plank roof, and straw on the floor.
function cagePieces(shed) {
  const rods = [];
  const stone = [];
  const straw = [];
  const roof = [];
  const depth = CAGE_DEPTH;
  const x0 = -shed.width / 2;
  for (const zc of CAGE_Z) {
    const half = CAGE_HALF;
    stone.push({ p: [x0 - depth / 2, 0.1, zc], s: [depth, 0.4, half * 2] });
    straw.push({ p: [x0 - depth / 2 + 0.05, 0.31, zc], s: [depth - 0.2, 0.02, half * 2 - 0.2] });
    roof.push({ p: [x0 - depth / 2, 2.35, zc], s: [depth + 0.2, 0.08, half * 2 + 0.1] });
    for (let z = -half; z <= half + 0.01; z += 0.16) rods.push({ p: [x0 - depth, 1.32, zc + z], s: [0.03, 2.0, 0.03] });
    for (let x = 0.16; x < depth; x += 0.16) {
      for (const side of [-1, 1]) rods.push({ p: [x0 - x, 1.32, zc + side * half], s: [0.03, 2.0, 0.03] });
    }
    for (const y of [0.45, 2.25]) {
      rods.push({ p: [x0 - depth, y, zc], s: [0.05, 0.05, half * 2] });
      for (const side of [-1, 1]) rods.push({ p: [x0 - depth / 2, y, zc + side * half], s: [depth, 0.05, 0.05] });
    }
  }
  return { rods, stone, straw, roof };
}

// A sea lion: a smooth tapering body, head, snout, and flippers, about 1.8 m.
function seaLionGeometry() {
  const profile = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = i / 16;
    // Thick at the chest, tapering to the tail.
    const r = 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) * (1 - t * 0.55) + 0.02;
    profile.push(new THREE.Vector2(r, t * 1.5));
  }
  const body = new THREE.LatheGeometry(profile, 14).rotateX(Math.PI / 2).translate(0, 0, -0.75);
  body.scale(1, 0.85, 1);
  const head = new THREE.SphereGeometry(0.17, 14, 10).translate(0, 0.12, 0.85);
  const snout = new THREE.SphereGeometry(0.09, 10, 8).scale(1, 0.8, 1.6).translate(0, 0.08, 1.02);
  const flipper = (side) => new THREE.SphereGeometry(0.2, 8, 6).scale(0.9, 0.12, 1.4).rotateY(side * 0.7).translate(side * 0.3, -0.15, 0.3);
  const tail = (side) => new THREE.SphereGeometry(0.16, 8, 6).scale(0.6, 0.1, 1.4).rotateY(side * 0.35).translate(side * 0.12, -0.04, -0.85);
  const parts = [body, head, snout, flipper(-1), flipper(1), tail(-1), tail(1)].map((g) => {
    const plain = g.index ? g.toNonIndexed() : g;
    plain.deleteAttribute('uv');
    return plain;
  });
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

function SeaLions() {
  const refs = useRef([]);
  const built = useMemo(() => ({
    geometry: seaLionGeometry(),
    // Wet pelt: dark, with a sheen.
    material: new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.28, metalness: 0.05 }),
  }), []);
  useEffect(() => () => {
    built.geometry.dispose();
    built.material.dispose();
  }, [built]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((body, index) => {
      if (!body) return;
      if (index === SEA_LIONS) {
        // The one hauled out on the rock lifts its head and looks about.
        body.position.set(POOL.x + 0.15, WATER_Y + 0.42, POOL.z - 0.05);
        body.rotation.set(-0.45 + Math.sin(t * 0.4) * 0.05, 1.2 + Math.sin(t * 0.23) * 0.5, 0);
        return;
      }
      // Laps around the rock at different speeds, rolling on the turns and
      // now and then diving out of sight and surfacing again.
      const speed = 0.55 + index * 0.17;
      const a = t * speed + index * 2.1;
      const r = 1.55 + Math.sin(t * 0.37 + index) * 0.25;
      const dive = Math.sin(t * 0.21 + index * 1.7);
      body.position.set(POOL.x + Math.cos(a) * r, WATER_Y - 0.12 - Math.max(0, dive - 0.4) * 0.9 + Math.sin(t * 2 + index) * 0.03, POOL.z + Math.sin(a) * r);
      body.rotation.set(Math.max(0, dive - 0.4) * 0.5 - 0.05, Math.atan2(-Math.sin(a), Math.cos(a)), Math.sin(a * 3) * 0.25);
    });
  });

  return Array.from({ length: SEA_LIONS + 1 }, (_, index) => (
    <mesh
      key={index}
      ref={(node) => { refs.current[index] = node; }}
      geometry={built.geometry}
      material={built.material}
      castShadow
    />
  ));
}

function buildMenagerie(planksCol, planksNrm) {
  const resources = [];
  const keep = (item) => {
    resources.push(item);
    return item;
  };
  const planks = keep(new THREE.MeshStandardMaterial({ map: planksCol, normalMap: planksNrm, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.9 }));
  // Whitewashed boards, as the stereoviews show them.
  planks.color.setRGB(1.9, 1.85, 1.7);
  const roofing = keep(new THREE.MeshStandardMaterial({ color: '#4a4440', roughness: 0.85 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: '#1f1a16', roughness: 0.9 }));
  const trim = keep(new THREE.MeshStandardMaterial({ color: '#d8d0bc', roughness: 0.8 }));
  const iron = keep(new THREE.MeshStandardMaterial({ color: '#23262a', roughness: 0.5, metalness: 0.5 }));
  const stone = keep(new THREE.MeshStandardMaterial({ color: '#77736a', roughness: 0.95 }));
  const straw = keep(new THREE.MeshStandardMaterial({ color: '#b59a5a', roughness: 1 }));
  const water = keep(new THREE.MeshStandardMaterial({ color: '#2e4a4c', roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.88 }));
  const unit = keep(new THREE.BoxGeometry(1, 1, 1));
  const groups = [];

  for (const shed of SHEDS) {
    const pieces = shedPieces(shed);
    const group = new THREE.Group();
    group.position.set(shed.x, pieces.base, shed.z);
    group.add(
      new THREE.Mesh(keep(pieces.planked), planks),
      new THREE.Mesh(keep(pieces.cupola), planks),
      new THREE.Mesh(keep(pieces.roof), roofing),
      instanced(unit, dark, pieces.dark),
      instanced(unit, trim, pieces.trim),
    );
    if (shed.cages) {
      const cage = cagePieces(shed);
      group.add(instanced(unit, iron, cage.rods), instanced(unit, stone, cage.stone), instanced(unit, straw, cage.straw), instanced(unit, planks, cage.roof));
    }
    group.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    groups.push(group);
  }

  // The pool: a raised stone basin with a coping, a rock to haul out on, and
  // an iron railing set back from the rim to keep visitors' hands out.
  const pool = new THREE.Group();
  pool.position.set(POOL.x, 0, POOL.z);
  const wall = keep(new THREE.CylinderGeometry(POOL.radius + POOL.rim, POOL.radius + POOL.rim, RIM_Y, 32, 1, true).translate(0, RIM_Y / 2, 0));
  const inner = keep(new THREE.CylinderGeometry(POOL.radius, POOL.radius, RIM_Y, 32, 1, true).translate(0, RIM_Y / 2, 0));
  const coping = keep(new THREE.RingGeometry(POOL.radius - 0.05, POOL.radius + POOL.rim + 0.08, 40).rotateX(-Math.PI / 2).translate(0, RIM_Y, 0));
  const surface = keep(new THREE.CircleGeometry(POOL.radius, 40).rotateX(-Math.PI / 2).translate(0, WATER_Y, 0));
  const rock = keep(new THREE.DodecahedronGeometry(0.75, 1).scale(1.3, 0.5, 1.0).translate(0.1, WATER_Y, 0));
  const innerMaterial = keep(new THREE.MeshStandardMaterial({ color: '#5d5a52', roughness: 0.95, side: THREE.BackSide }));
  pool.add(
    new THREE.Mesh(wall, stone),
    new THREE.Mesh(inner, innerMaterial),
    new THREE.Mesh(coping, stone),
    new THREE.Mesh(surface, water),
    new THREE.Mesh(rock, keep(new THREE.MeshStandardMaterial({ color: '#57534c', roughness: 0.9, flatShading: true }))),
  );
  const railing = [];
  const railR = POOL.radius + POOL.rim + 0.8;
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const x = Math.cos(a) * railR;
    const z = Math.sin(a) * railR;
    const ground = terrainHeight(POOL.x + x, POOL.z + z);
    railing.push({ p: [x, ground + 0.5, z], s: [0.05, 1.0, 0.05] });
    const b = ((i + 1) / 28) * Math.PI * 2;
    const length = 2 * railR * Math.sin(Math.PI / 28);
    for (const y of [0.55, 0.95]) {
      railing.push({ p: [(x + Math.cos(b) * railR) / 2, ground + y, (z + Math.sin(b) * railR) / 2], r: [0, -(a + b) / 2, 0], s: [0.04, 0.04, length] });
    }
  }
  pool.add(instanced(unit, iron, railing));
  pool.traverse((node) => {
    if (node.isMesh && node.material !== water) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  groups.push(pool);

  // Paddock fence: cedar posts and plain wire, as in the stereoview.
  const posts = [];
  const wires = [];
  const { x0, x1, z0, z1 } = PADDOCK;
  const run = (ax, az, bx, bz) => {
    const length = Math.hypot(bx - ax, bz - az);
    const count = Math.ceil(length / 2.2);
    for (let i = 0; i <= count; i += 1) {
      const x = ax + ((bx - ax) * i) / count;
      const z = az + ((bz - az) * i) / count;
      posts.push({ p: [x, terrainHeight(x, z) + 0.7, z], s: [0.11, 1.8, 0.11] });
    }
    const y = terrainHeight((ax + bx) / 2, (az + bz) / 2);
    for (const h of [0.35, 0.75, 1.15, 1.5]) {
      wires.push({ p: [(ax + bx) / 2, y + h, (az + bz) / 2], r: [0, Math.atan2(bx - ax, bz - az), 0], s: [0.012, 0.012, length] });
    }
  };
  run(x0, z0, x0, z1);
  run(x0, z0, x1, z0);
  run(x0, z1, x1, z1);
  const cedar = keep(new THREE.MeshStandardMaterial({ color: '#5b4a3a', roughness: 0.95 }));
  const fence = new THREE.Group();
  fence.add(instanced(unit, cedar, posts), instanced(unit, iron, wires, { cast: false }));
  groups.push(fence);
  return { groups, resources };
}

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function useClones(url, count, scale) {
  const gltf = useLoader(GLTFLoader, url, withMeshopt);
  const bodies = useMemo(() => Array.from({ length: count }, () => {
    const object = cloneSkeleton(gltf.scene);
    object.scale.setScalar(scale);
    object.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
        // Skinned bounds come from the bind pose; never cull a pacing animal.
        node.frustumCulled = false;
      }
    });
    const mixer = new THREE.AnimationMixer(object);
    return { object, mixer };
  }), [gltf, count, scale]);
  useEffect(() => () => bodies.forEach(({ mixer }) => mixer.stopAllAction()), [bodies]);
  return { gltf, bodies };
}

// Two bears pace their cages, turning at each end: the stereotyped walk of
// a caged bear, painfully familiar from old zoo accounts.
const BEAR_SCALE = 0.0105; // the source is in centimetres
const BEAR_FORWARD = Math.PI / 2; // the model walks along +x
function Bears() {
  const { gltf, bodies } = useClones('/models/bear.glb', CAGE_Z.length, BEAR_SCALE);
  const state = useMemo(() => bodies.map((body, index) => {
    body.mixer.clipAction(gltf.animations[0]).play();
    body.mixer.setTime(index * 3.1);
    return { along: index ? 0.5 : -0.4, direction: index ? -1 : 1, turn: 0 };
  }), [bodies, gltf]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const shed = SHEDS[0];
    const base = terrainHeight(shed.x, shed.z) + 0.3;
    bodies.forEach((body, index) => {
      const s = state[index];
      const reach = CAGE_HALF - 0.85;
      if (s.turn > 0) {
        s.turn = Math.max(0, s.turn - delta);
      } else {
        s.along += s.direction * 0.55 * delta;
        if (Math.abs(s.along) > reach) {
          s.along = Math.sign(s.along) * reach;
          s.direction *= -1;
          s.turn = 1.3;
        }
      }
      // Swing round through the cage's depth while turning.
      const facing = s.direction > 0 ? 0 : Math.PI;
      const swing = s.turn > 0 ? (s.turn / 1.3) * Math.PI : 0;
      const yaw = facing + (s.direction > 0 ? swing : -swing);
      body.object.position.set(shed.x - shed.width / 2 - CAGE_DEPTH / 2, base, shed.z + CAGE_Z[index] + s.along);
      body.object.rotation.y = yaw + BEAR_FORWARD - Math.PI / 2;
      body.mixer.update(delta);
    });
  });

  return bodies.map((body, index) => <primitive key={index} object={body.object} />);
}

// A pair of elk graze the paddock and now and then walk to fresh grass.
const ELK_SCALE = 0.82;
function Elk() {
  const { gltf, bodies } = useClones('/models/elk.glb', 2, ELK_SCALE);
  const clips = useMemo(() => Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip])), [gltf]);
  const state = useMemo(() => bodies.map((body, index) => {
    const s = { x: PADDOCK.x0 + 1.8 + index * 4, z: -60.5 + index * 3, yaw: index * 2, target: null, wait: 4 + index * 6, action: null, seed: index * 17 };
    const play = (name) => {
      const next = body.mixer.clipAction(clips[name]);
      if (s.action === next) return;
      next.reset().fadeIn(0.5).play();
      s.action?.fadeOut(0.5);
      s.action = next;
    };
    s.play = play;
    play(index ? 'Stand_Breathing_01' : 'Stand_Eating_01');
    return s;
  }), [bodies, clips]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    bodies.forEach((body, index) => {
      const s = state[index];
      if (s.target) {
        const dx = s.target[0] - s.x;
        const dz = s.target[1] - s.z;
        const distance = Math.hypot(dx, dz);
        const heading = Math.atan2(dx, dz);
        const turn = Math.atan2(Math.sin(heading - s.yaw), Math.cos(heading - s.yaw));
        s.yaw += Math.max(-1.2 * delta, Math.min(1.2 * delta, turn));
        if (Math.abs(turn) < 0.6) {
          s.x += Math.sin(s.yaw) * 0.75 * delta;
          s.z += Math.cos(s.yaw) * 0.75 * delta;
        }
        if (distance < 0.3) {
          s.target = null;
          s.wait = 8 + ((Math.sin(clock.elapsedTime * 3.1 + s.seed) + 1) / 2) * 16;
          s.play(Math.sin(clock.elapsedTime + s.seed) > -0.3 ? 'Stand_Eating_01' : 'Stand_Breathing_01');
        }
      } else {
        s.wait -= delta;
        if (s.wait <= 0) {
          // A new spot clear of the shelter shed and the fence.
          const r1 = (Math.sin(clock.elapsedTime * 7.3 + s.seed) + 1) / 2;
          const r2 = (Math.sin(clock.elapsedTime * 3.7 + s.seed * 2) + 1) / 2;
          const target = [PADDOCK.x0 + 1.2 + r1 * (SHEDS[1].x - SHEDS[1].width / 2 - PADDOCK.x0 - 2.4), PADDOCK.z0 + 1.4 + r2 * (PADDOCK.z1 - PADDOCK.z0 - 2.8)];
          // Never onto the other elk's spot; try again shortly instead.
          const other = state[1 - index];
          const [ox, oz] = other.target ?? [other.x, other.z];
          if (Math.hypot(target[0] - ox, target[1] - oz) < 2.6) {
            s.wait = 2;
          } else {
            s.target = target;
            s.play('WalkSlow');
          }
        }
      }
      body.object.position.set(s.x, terrainHeight(s.x, s.z), s.z);
      body.object.rotation.y = s.yaw;
      body.mixer.update(delta);
    });
  });

  return bodies.map((body, index) => <primitive key={index} object={body.object} />);
}

export default function Menagerie() {
  const [planksCol, planksNrm] = useLoader(THREE.TextureLoader, ['/textures/planks_col.jpg', '/textures/planks_nrm.jpg']);
  const built = useMemo(() => {
    const col = planksCol.clone();
    const nrm = planksNrm.clone();
    for (const texture of [col, nrm]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
    col.colorSpace = THREE.SRGBColorSpace;
    const result = buildMenagerie(col, nrm);
    result.resources.push(col, nrm);
    return result;
  }, [planksCol, planksNrm]);
  useEffect(() => () => built.resources.forEach((resource) => resource.dispose()), [built]);

  // The basin and its railing; the shed bodies collide as park items.
  const colliders = useMemo(() => [
    { type: 'cylinder', p: [POOL.x, RIM_Y / 2, POOL.z], radius: POOL.radius + POOL.rim, height: RIM_Y + 1 },
    ...cageColliders(),
  ], []);

  return (
    <>
      <group onClick={(event) => identifyLandmark(PARK_LANDMARKS.menagerie, event)}>
        {built.groups.map((group, index) => <primitive key={index} object={group} />)}
        <SeaLions />
        <Bears />
        <Elk />
      </group>
      <StaticColliders entries={colliders} />
    </>
  );
}

function cageColliders() {
  const shed = SHEDS[0];
  const base = terrainHeight(shed.x, shed.z);
  const fence = [];
  const { x0, x1, z0, z1 } = PADDOCK;
  const y = terrainHeight((x0 + x1) / 2, (z0 + z1) / 2) + 0.8;
  fence.push({ type: 'box', p: [x0, y, (z0 + z1) / 2], size: [0.2, 2.4, z1 - z0] });
  for (const z of [z0, z1]) fence.push({ type: 'box', p: [(x0 + x1) / 2, y, z], size: [x1 - x0, 2.4, 0.2] });
  return [
    { type: 'box', p: [shed.x - shed.width / 2 - CAGE_DEPTH / 2, base + 1.2, shed.z], size: [CAGE_DEPTH, 2.4, 4.4 + CAGE_HALF * 2] },
    ...fence,
  ];
}

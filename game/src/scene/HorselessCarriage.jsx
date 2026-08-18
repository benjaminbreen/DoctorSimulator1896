import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RigidBody, CuboidCollider, useRapier } from '@react-three/rapier';
import { handlesAlive } from '../physics/useCharacterController.js';
import {
  applyCarriageProjectileHit,
  carriageDriverKind,
  createCarriageState,
  HORSELESS_TRAFFIC_ROSTER,
  stepCarriage,
  RIDE_HEIGHT,
  driverCallout,
} from '../world/horselessCarriage.js';
import { raiseDriverWarning } from '../world/outcry.js';
import {
  PEDESTRIAN_ARCHETYPES,
  PEDESTRIAN_STRAWHAT_MOTION_FILE,
} from '../world/pedestrianCatalog.js';
import { takeCarriageProjectileHit } from '../world/carriageImpacts.js';
import { queueActorImpact } from '../world/actorImpacts.js';
import { getPlayer, harm } from '../world/player.js';
import { listAgents, reportAgent, removeAgent } from '../world/agents.js';
import { crossTrafficObstacles, streetTrafficAdvice, trafficAgentDetails } from '../world/streetTraffic.js';
import {
  applyTrafficImpacts,
  beginTrafficFrame,
  removeTrafficBody,
  reportTrafficBody,
  takeTrafficImpacts,
  trafficCircleChain,
} from '../world/trafficContacts.js';
import { gameDebug } from '../debug.js';
import { reportMajorStreetEvent } from '../world/majorStreetEvents.js';
import { figureHeight } from '../world/figureHeights.js';

// Looks only for the 1895 electric road wagons (after the Morris & Salom
// Electrobat). Each spawn draws its own livery, pace, and driver model.
// The deterministic route and steering sim is world/horselessCarriage.js.

const MAX_DT = 1 / 30;
// Vehicle local frame: +z forward, y up from the roadbed.
const FRONT_R = 0.5;
const REAR_R = 0.4;
const FRONT_Z = 0.85;
const REAR_Z = -0.85;
// Rider animation is paid for only near the camera. Shadow distance follows
// the outdoor tuning control shared with the sun's shadow camera.
const ANIMATE_DISTANCE = 45;
// She sounds the horn first; the words come when it has plainly not worked.
const DRIVER_PATIENCE = 2.5;
const DRIVER_SHOUT_GAP = 12;
const POSE_PADDING = 1.7;

// Coach-painter's card, not a color picker: Brewster green with carmine
// gear, black with yellow gear, claret with black gear, blue-black with
// natural wood — the four schemes every 1890s carriage maker offered.
const LIVERIES = [
  { body: '#1e2a22', gear: '#6f2a1c', stripe: '#b5893c', leather: '#2b2019' },
  { body: '#17181a', gear: '#8f7524', stripe: '#8f7524', leather: '#241d18' },
  { body: '#38201f', gear: '#26221e', stripe: '#a3722e', leather: '#1f1a16' },
  { body: '#1d2430', gear: '#5b4630', stripe: '#9a9a8a', leather: '#2b2019' },
];

// Session-seeded PRNG: the fleet varies between sessions but not between
// frames. The sim itself takes no randomness.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function merged(parts) {
  const geometries = parts.map(([geometry, x, y, z, rx = 0, ry = 0, rz = 0]) => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    );
    return geometry.applyMatrix4(matrix);
  });
  const out = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return out;
}

// Artillery wheel woodwork with the axle along local x: felloe ring, twelve
// tapered spokes running hub to rim, hub barrel and flange. Rotating about x
// rolls it. The spoke axis must match its position angle or the wheel reads
// as a cog.
function wheelWoodGeometry(radius) {
  const parts = [
    [new THREE.TorusGeometry(radius - 0.072, 0.02, 6, 26), 0, 0, 0, 0, Math.PI / 2, 0],
    [new THREE.CylinderGeometry(0.05, 0.05, 0.15, 12), 0, 0, 0, 0, 0, Math.PI / 2],
    [new THREE.TorusGeometry(0.062, 0.014, 6, 14), 0, 0, 0, 0, Math.PI / 2, 0],
  ];
  const spokeLen = radius - 0.115;
  for (let k = 0; k < 12; k += 1) {
    const angle = (k / 12) * Math.PI * 2;
    const mid = spokeLen / 2 + 0.05;
    parts.push([
      new THREE.CylinderGeometry(0.011, 0.016, spokeLen, 6),
      0, Math.cos(angle) * mid, Math.sin(angle) * mid,
      angle, 0, 0,
    ]);
  }
  return merged(parts);
}

function wheelTireGeometry(radius) {
  return merged([[new THREE.TorusGeometry(radius - 0.03, 0.03, 8, 30), 0, 0, 0, 0, Math.PI / 2, 0]]);
}

// Brass acorn nuts on both hub ends.
function hubcapGeometry() {
  return merged([
    [new THREE.CylinderGeometry(0.028, 0.042, 0.05, 10), 0, 0, 0, 0, 0, Math.PI / 2],
    [new THREE.SphereGeometry(0.026, 8, 6), 0.105, 0, 0],
    [new THREE.SphereGeometry(0.026, 8, 6), -0.105, 0, 0],
  ]);
}

function buildChassis() {
  const box = (...args) => new THREE.BoxGeometry(...args);
  const cyl = (rTop, rBottom, len, seg = 10) => new THREE.CylinderGeometry(rTop, rBottom, len, seg);
  const X90 = Math.PI / 2;

  // Dark varnished body: floor, low side and rear panels, the dash curling
  // back over the front in two facets, toe board, seat box under the bench.
  const paint = merged([
    [box(1.3, 0.06, 1.7), 0, 0.58, 0.05],
    [box(0.05, 0.26, 1.55), 0.66, 0.74, -0.02],
    [box(0.05, 0.26, 1.55), -0.66, 0.74, -0.02],
    [box(1.35, 0.26, 0.05), 0, 0.74, -0.8],
    [box(1.35, 0.34, 0.045), 0, 0.77, 0.8, -0.12, 0, 0],
    [box(1.35, 0.34, 0.045), 0, 1.05, 0.7, -0.62, 0, 0],
    [cyl(0.05, 0.05, 1.35), 0, 1.19, 0.6, 0, 0, X90],
    [box(1.25, 0.04, 0.5), 0, 0.66, 0.55, -0.35, 0, 0],
    [box(1.3, 0.34, 0.6), 0, 0.78, -0.48],
    // Lamp bodies at the dash corners.
    [box(0.13, 0.2, 0.13), 0.7, 1.1, 0.62],
    [box(0.13, 0.2, 0.13), -0.7, 1.1, 0.62],
  ]);

  // Buttoned leather: cushion, raked backrest, rolled top, arm rolls.
  const leather = merged([
    [box(1.28, 0.14, 0.55), 0, 1.02, -0.46],
    [box(1.28, 0.5, 0.09), 0, 1.32, -0.76, 0.15, 0, 0],
    [cyl(0.06, 0.06, 1.28), 0, 1.56, -0.8, 0, 0, X90],
    [cyl(0.05, 0.05, 0.55), 0.62, 1.16, -0.48, X90, 0, 0],
    [cyl(0.05, 0.05, 0.55), -0.62, 1.16, -0.48, X90, 0, 0],
  ]);

  // Running gear: perch rails, axles, transverse leaf-spring stacks, the
  // battery tray, the motor drum on the front (drive) axle, step plate, and
  // the tiller column rising to the driver's hand.
  const ironParts = [
    [box(0.06, 0.06, 2.1), 0.5, 0.5, 0],
    [box(0.06, 0.06, 2.1), -0.5, 0.5, 0],
    [cyl(0.035, 0.035, 1.5), 0, 0.5, FRONT_Z, 0, 0, X90],
    [cyl(0.035, 0.035, 1.42), 0, 0.4, REAR_Z, 0, 0, X90],
    [box(1.1, 0.3, 0.85), 0, 0.4, 0.05],
    [cyl(0.09, 0.09, 0.55, 12), 0, 0.5, FRONT_Z - 0.17, 0, 0, X90],
    [box(0.05, 0.12, 0.2), 0.2, 0.5, FRONT_Z - 0.09],
    [box(0.05, 0.12, 0.2), -0.2, 0.5, FRONT_Z - 0.09],
    [box(0.3, 0.03, 0.22), 0.74, 0.34, -0.15],
    [box(0.04, 0.24, 0.04), 0.7, 0.46, -0.15],
    [cyl(0.022, 0.026, 0.55, 8), 0.32, 1.0, 0.28, -0.55, 0, 0],
  ];
  // Three graded leaves per axle.
  [1.2, 0.92, 0.64].forEach((len, i) => {
    ironParts.push([box(len, 0.026, 0.09), 0, 0.548 + i * 0.028, FRONT_Z - 0.02]);
    ironParts.push([box(len, 0.026, 0.09), 0, 0.448 + i * 0.028, REAR_Z + 0.02]);
  });
  const iron = merged(ironParts);

  // Brass: dash rail, lamp caps and finials, lamp base rings.
  const brass = merged([
    [cyl(0.018, 0.018, 1.3), 0, 1.27, 0.56, 0, 0, X90],
    [new THREE.ConeGeometry(0.08, 0.09, 10), 0.7, 1.24, 0.62],
    [new THREE.ConeGeometry(0.08, 0.09, 10), -0.7, 1.24, 0.62],
    [new THREE.SphereGeometry(0.02, 8, 6), 0.7, 1.3, 0.62],
    [new THREE.SphereGeometry(0.02, 8, 6), -0.7, 1.3, 0.62],
    [cyl(0.075, 0.075, 0.03, 10), 0.7, 0.99, 0.62],
    [cyl(0.075, 0.075, 0.03, 10), -0.7, 0.99, 0.62],
  ]);

  // Coach pinstriping along the panels and seat box.
  const trim = merged([
    [box(0.012, 0.014, 1.5), 0.688, 0.8, -0.02],
    [box(0.012, 0.014, 1.5), -0.688, 0.8, -0.02],
    [box(1.36, 0.014, 0.012), 0, 0.8, -0.828],
    [box(0.012, 0.014, 0.56), 0.658, 0.9, -0.48],
    [box(0.012, 0.014, 0.56), -0.658, 0.9, -0.48],
  ]);

  // Furled umbrellas leaning in a holder at the front left, as in the
  // photograph. Not every carriage carries them.
  const umbrellaParts = [[cyl(0.07, 0.06, 0.14, 10), -0.5, 0.92, 0.6]];
  for (const [dx, tilt] of [[-0.03, -0.3], [0.02, -0.22], [0.0, -0.38]]) {
    umbrellaParts.push([cyl(0.014, 0.03, 0.8, 7), -0.5 + dx, 1.25, 0.68, tilt, 0, dx * 4]);
    umbrellaParts.push([new THREE.ConeGeometry(0.012, 0.1, 6), -0.5 + dx * 2.4, 1.66, 0.8 - tilt * 0.3, tilt, 0, dx * 4]);
  }
  const umbrellas = merged(umbrellaParts);

  return { paint, leather, iron, brass, trim, umbrellas };
}

// Which coated-driver clip fits which situation. Escalation while blocked:
// gesturing first, anger if whoever it is still will not move.
const COATED_DRIVER_MOODS = [
  { key: 'angry', match: /angry/i, when: (state, blockedTime) => blockedTime > 7 },
  { key: 'gesture', match: /gestur/i, when: (state, blockedTime) => blockedTime > 2.5 },
  {
    key: 'wheel',
    match: /wheel/i,
    when: (state) => state.avoiding || Math.abs(state.steer) > 0.06 || state.bend > 0.12,
  },
  { key: 'idle', match: /pose/i, when: () => true },
];

// The Strawhat rig has purpose-made seated driving and horn gestures. She
// keeps driving through ordinary steering and honks only after being held by
// traffic long enough for the gesture to read as a response, not a tic.
const STRAWHAT_DRIVER_MOODS = [
  { key: 'honk', match: /^HonkingHorn$/, when: (state, blockedTime) => state.blocked && blockedTime > 1.25 },
  { key: 'drive', match: /^Driving$/, when: () => true },
];
const MOOD_FADE = 0.35;
const MOOD_HOLD = 1.4;

const DRIVER_SCALE = figureHeight('cab-driver');

// A skeleton-safe driver clone with one action per state-driven mood.
function makeDriver(source, animations, phase, spheres, {
  kind = 'coated-man',
  moods = COATED_DRIVER_MOODS,
  rotationX = -Math.PI / 2,
} = {}) {
  const figure = cloneSkeleton(source);
  figure.scale.setScalar(DRIVER_SCALE);
  // The export loses Blender's Y-up conversion for the applied armature:
  // the file's figure lies on its face. Stand it up here.
  figure.rotation.x = rotationX;
  const skinned = [];
  figure.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    node.castShadow = true;
    if (node.isSkinnedMesh) skinned.push(node);
  });
  // Same trick as Pedestrians: a padded bind-pose sphere keeps frustum
  // culling honest without per-frame sphere updates. It has to come after
  // the clone's matrices resolve, or every vertex lands on the origin.
  figure.updateMatrixWorld(true);
  for (const node of skinned) {
    let sphere = spheres.get(node.geometry.uuid);
    if (!sphere) {
      node.computeBoundingSphere();
      sphere = node.boundingSphere.clone();
      sphere.radius *= POSE_PADDING;
      spheres.set(node.geometry.uuid, sphere);
    }
    node.boundingSphere = sphere;
  }
  const mixer = new THREE.AnimationMixer(figure);
  const actions = {};
  for (const mood of moods) {
    const clip = animations.find((entry) => mood.match.test(entry.name)) ?? animations[0];
    if (clip) actions[mood.key] = mixer.clipAction(clip);
  }
  const initialMood = moods.at(-1)?.key;
  const initial = actions[initialMood];
  if (initial) {
    initial.play();
    mixer.setTime(phase * initial.getClip().duration);
  }
  return { figure, mixer, actions, kind, moods, mood: initialMood, hold: 0, blockedTime: 0 };
}

// Pick the driver's action from what the sim reports, with a short hold so
// the pantomime does not flicker at decision boundaries.
function updateDriverMood(driver, state, dt) {
  driver.blockedTime = state.blocked ? driver.blockedTime + dt : Math.max(0, driver.blockedTime - dt * 2);
  driver.hold -= dt;
  const next = driver.moods.find((mood) => mood.when(state, driver.blockedTime))?.key ?? driver.mood;
  if (next === driver.mood || driver.hold > 0) return;
  const from = driver.actions[driver.mood];
  const to = driver.actions[next];
  if (to && to !== from) {
    from?.fadeOut(MOOD_FADE);
    to.reset().fadeIn(MOOD_FADE).play();
  }
  driver.mood = next;
  driver.hold = MOOD_HOLD;
}

export default function HorselessCarriage({ runtime }) {
  const driverGltf = useLoader(GLTFLoader, '/models/carriage-driver.glb', (loader) =>
    loader.setMeshoptDecoder(MeshoptDecoder),
  );
  const strawhatDriverGltf = useLoader(
    GLTFLoader,
    PEDESTRIAN_ARCHETYPES.h.modelPath,
    (loader) => loader.setMeshoptDecoder(MeshoptDecoder),
  );
  const strawhatMotionGltf = useLoader(
    GLTFLoader,
    PEDESTRIAN_STRAWHAT_MOTION_FILE,
    (loader) => loader.setMeshoptDecoder(MeshoptDecoder),
  );
  const { world, rapier } = useRapier();

  const obstaclesRef = useRef([]);
  const quat = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const frightRef = useRef({ near: false, lastAt: -Infinity });

  const shared = useMemo(
    () => ({
      chassis: buildChassis(),
      frontWood: wheelWoodGeometry(FRONT_R),
      rearWood: wheelWoodGeometry(REAR_R),
      frontTire: wheelTireGeometry(FRONT_R),
      rearTire: wheelTireGeometry(REAR_R),
      hubcap: hubcapGeometry(),
      iron: new THREE.MeshStandardMaterial({ color: '#26292c', roughness: 0.5, metalness: 0.6 }),
      brass: new THREE.MeshStandardMaterial({ color: '#a5843c', roughness: 0.35, metalness: 0.8 }),
      cloth: new THREE.MeshStandardMaterial({ color: '#43474e', roughness: 0.9 }),
      tire: new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.85 }),
    }),
    [],
  );

  // The fleet roster: livery, route, pace, drawn once per session.
  const fleet = useMemo(() => {
    const rand = mulberry32(Date.now() & 0xffffffff);
    const spheres = new Map();

    return HORSELESS_TRAFFIC_ROSTER.map((roster) => {
      const index = roster.id;
      const livery = LIVERIES[Math.floor(rand() * LIVERIES.length)];
      const lane = roster.route === 4 ? 0.18 : 1.35 + rand() * 0.4;
      const driverKind = carriageDriverKind(rand());
      const strawhat = driverKind === 'strawhat-woman';
      return {
        id: index,
        params: {
          id: `carriage-${index}`,
          cruise: 3.6 + rand() * 1.1,
          lane,
          minGap: 2.8,
          length: 2.4,
          priority: 10 + index,
        },
        state: createCarriageState(roster.route, roster.start, lane),
        driver: makeDriver(
          strawhat ? strawhatDriverGltf.scene : driverGltf.scene,
          strawhat ? strawhatMotionGltf.animations : driverGltf.animations,
          rand(),
          spheres,
          strawhat
            ? { kind: driverKind, moods: STRAWHAT_DRIVER_MOODS, rotationX: 0 }
            : { kind: driverKind },
        ),
        umbrellas: rand() < 0.5,
        materials: {
          paint: new THREE.MeshStandardMaterial({ color: livery.body, roughness: 0.35, metalness: 0.1 }),
          leather: new THREE.MeshStandardMaterial({ color: livery.leather, roughness: 0.75 }),
          wood: new THREE.MeshStandardMaterial({ color: livery.gear, roughness: 0.7 }),
          trim: new THREE.MeshStandardMaterial({ color: livery.stripe, roughness: 0.6 }),
        },
        // Mutable scene handles, filled by ref callbacks below.
        refs: { root: null, bodyGroup: null, wheels: [], steers: [], tiller: null, body: null, collider: null },
        shadowMeshes: [],
        shadowNear: true,
        lastActorImpacts: new Map(),
      };
    });
  }, [driverGltf, shared, strawhatDriverGltf, strawhatMotionGltf]);

  // Flat mesh lists for the distance-gated shadow toggle.
  useEffect(() => {
    for (const unit of fleet) {
      const list = [];
      unit.refs.root?.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) list.push(node);
      });
      unit.shadowMeshes = list;
    }
  }, [fleet]);

  useEffect(
    () => () => {
      for (const unit of fleet) {
        removeAgent(`carriage-${unit.id}`);
        removeTrafficBody(`carriage-${unit.id}`);
        Object.values(unit.materials).forEach((material) => material.dispose());
      }
    },
    [fleet],
  );

  useFrame((frame, delta) => {
    const dt = Math.min(delta, MAX_DT);
    const trafficFrame = frame.clock.elapsedTime;
    beginTrafficFrame(trafficFrame);
    const player = gameDebug.player.position;
    const eye = frame.camera.position;
    let nearestCarriageSq = Infinity;
    const agents = [...listAgents()];

    for (const unit of fleet) {
      // Pedestrians and the player remain local obstacles. Vehicles negotiate
      // through the lane coordinator, so reciprocal avoidance cannot deadlock.
      const obstacles = obstaclesRef.current;
      obstacles.length = 0;
      obstacles.push({ x: player[0], z: player[2], r: 0.6 });
      for (const agent of agents) {
        if (agent.trafficId) continue;
        obstacles.push(agent);
      }
      obstacles.push(...crossTrafficObstacles(unit.state, agents, unit.params.id));

      const trafficImpacts = takeTrafficImpacts(`carriage-${unit.id}`);
      const impactedState = applyTrafficImpacts(unit.state, trafficImpacts);
      const projectileHit = takeCarriageProjectileHit(unit.id);
      const beforeStep = projectileHit
        ? applyCarriageProjectileHit(impactedState, projectileHit.velocity, projectileHit.power)
        : impactedState;
      const advice = streetTrafficAdvice(beforeStep, agents, unit.params, dt);
      const state = {
        ...stepCarriage(beforeStep, dt, obstacles, {
          ...unit.params,
          cruise: Math.min(unit.params.cruise, advice.cruise),
          lane: advice.lane,
          swerveLambda: advice.laneLambda,
        }),
        traffic: advice.traffic,
        intersection: advice.intersection,
      };
      unit.state = state;
      nearestCarriageSq = Math.min(nearestCarriageSq, (state.x - player[0]) ** 2 + (state.z - player[2]) ** 2);
      reportAgent(
        `carriage-${unit.id}`,
        state.x,
        state.z,
        1.7,
        trafficAgentDetails(state, unit.params),
      );
      const carriageVx = Math.sin(state.yaw) * state.speed;
      const carriageVz = Math.cos(state.yaw) * state.speed;
      reportTrafficBody({
        id: `carriage-${unit.id}`,
        circles: trafficCircleChain(state.x, state.z, state.yaw, [-0.82, 0.82], 0.9),
        vx: carriageVx,
        vz: carriageVz,
        mass: 680,
        priority: unit.params.priority,
      }, trafficFrame);

      const { root, bodyGroup, wheels, steers, tiller, body, collider } = unit.refs;
      if (root) {
        root.position.set(state.x, RIDE_HEIGHT, state.z);
        root.rotation.y = state.yaw;
      }
      // Body sway: a light jounce with road speed, a lean into the steer.
      if (bodyGroup) {
        const ride = Math.min(1, state.speed / 2);
        bodyGroup.position.y = Math.sin(state.wheelSpin * 2.6) * 0.008 * ride;
        bodyGroup.rotation.z = -state.steer * 0.05 + state.knockRoll;
        bodyGroup.rotation.x = Math.sin(state.wheelSpin * 1.7) * 0.004 * ride + state.knockPitch;
      }
      for (const [index, wheel] of wheels.entries()) {
        if (wheel) wheel.rotation.x = state.wheelSpin / (index < 2 ? FRONT_R : REAR_R);
      }
      // The Electrobat steered by its rear wheels: they swing against the turn.
      for (const pivot of steers) {
        if (pivot) pivot.rotation.y = -state.steer * 1.2;
      }
      if (tiller) tiller.rotation.y = state.steer * 1.6;

      // Shadows and rider animation only near the camera.
      const distSq = (state.x - eye.x) ** 2 + (state.z - eye.z) ** 2;
      const shadowDistance = runtime.values.outdoorShadowDistance;
      const near = distSq < shadowDistance * shadowDistance;
      if (near !== unit.shadowNear) {
        unit.shadowNear = near;
        for (const mesh of unit.shadowMeshes) mesh.castShadow = near;
      }
      if (distSq < ANIMATE_DISTANCE * ANIMATE_DISTANCE) {
        updateDriverMood(unit.driver, state, dt);
        unit.driver.mixer.update(dt);
        // She honks first and speaks once the horn has plainly not worked.
        const callout = driverCallout(state, gameDebug.player.position);
        const clock = getPlayer().clock;
        if (callout && unit.driver.blockedTime >= (callout === 'blocked' ? DRIVER_PATIENCE : 0)
          && clock >= (unit.nextShoutAt ?? 0)) {
          unit.nextShoutAt = clock + DRIVER_SHOUT_GAP;
          raiseDriverWarning({
            x: state.x,
            // Above the driver's hat: the road surface plus her seat.
            y: 1.18 + 2.1,
            z: state.z,
            unitId: unit.id,
            kind: callout === 'blocked' ? 'blocked' : 'motor',
            seed: Math.round(clock),
          });
        }
      }

      // Keep the kinematic collider under the visual so the player cannot
      // walk through the carriage.
      if (body && handlesAlive(world, body, collider)) {
        body.setNextKinematicTranslation({ x: state.x, y: RIDE_HEIGHT, z: state.z });
        quat.current.setFromEuler(euler.current.set(0, state.yaw, 0));
        body.setNextKinematicRotation(quat.current);
      }
    }
    // Hysteresis makes one approach one event even while the carriage remains
    // beside the player. The cooldown keeps a queue of vehicles from spamming
    // the same change as each wheelbase crosses the threshold.
    const fright = frightRef.current;
    if (!fright.near && nearestCarriageSq <= 4 ** 2) {
      fright.near = true;
      const now = getPlayer().clock;
      if (now - fright.lastAt >= 45) {
        fright.lastAt = now;
        harm({
          neurasthenia: 10,
          source: 'horseless-carriage',
          label: 'Approached too near a horseless carriage',
        });
      }
    } else if (fright.near && nearestCarriageSq >= 6 ** 2) {
      fright.near = false;
    }
    // Same-length fast path: the states are live references, so once the
    // array exists there is nothing to rebuild per frame.
    if (gameDebug.carriages.length !== fleet.length) {
      gameDebug.carriages = fleet.map((unit) => unit.state);
    }
    gameDebug.carriage = gameDebug.carriages[0];
    gameDebug.carriageMoods = fleet.map((unit) => unit.driver.mood);
    gameDebug.carriageDriverKinds = fleet.map((unit) => unit.driver.kind);
  });

  const wheelPositions = [
    [0.75, FRONT_R, FRONT_Z],
    [-0.75, FRONT_R, FRONT_Z],
    [0.71, REAR_R, REAR_Z],
    [-0.71, REAR_R, REAR_Z],
  ];

  return fleet.map((unit) => {
    const onActorImpact = ({ other }) => {
      const otherData = other.rigidBodyObject?.userData;
      const actorId = otherData?.actorId;
      if (!actorId) return;
      const state = unit.state;
      const carriageVx = Math.sin(state.yaw) * state.speed;
      const carriageVz = Math.cos(state.yaw) * state.speed;
      const now = getPlayer().clock;
      if (now - (unit.lastActorImpacts.get(actorId) ?? -Infinity) < 4) return;
      unit.lastActorImpacts.set(actorId, now);
      queueActorImpact(actorId, {
        cause: 'horseless-carriage',
        sourceId: `carriage-${unit.id}`,
        sourceVelocity: [carriageVx, 0, carriageVz],
        direction: [carriageVx, carriageVz],
      });
      if (otherData.gameKind === 'player' || otherData.gameKind === 'pedestrian') {
        reportMajorStreetEvent({
          sourceId: `carriage-${unit.id}`,
          targetId: actorId,
          targetKind: otherData.gameKind,
          x: state.x,
          z: state.z,
        });
      }
    };
    const wheel = (index) => (
      <group key={index} ref={(node) => (unit.refs.wheels[index] = node)}>
        <mesh geometry={index < 2 ? shared.frontWood : shared.rearWood} material={unit.materials.wood} castShadow />
        <mesh geometry={index < 2 ? shared.frontTire : shared.rearTire} material={shared.tire} castShadow />
        <mesh geometry={shared.hubcap} material={shared.brass} />
      </group>
    );
    return (
      <group key={unit.id}>
        <group ref={(node) => (unit.refs.root = node)}>
          <group ref={(node) => (unit.refs.bodyGroup = node)}>
            <mesh geometry={shared.chassis.paint} material={unit.materials.paint} castShadow />
            <mesh geometry={shared.chassis.leather} material={unit.materials.leather} castShadow />
            <mesh geometry={shared.chassis.iron} material={shared.iron} castShadow />
            <mesh geometry={shared.chassis.brass} material={shared.brass} />
            <mesh geometry={shared.chassis.trim} material={unit.materials.trim} />
            {unit.umbrellas ? <mesh geometry={shared.chassis.umbrellas} material={shared.cloth} castShadow /> : null}
            <group ref={(node) => (unit.refs.tiller = node)} position={[0.32, 1.24, 0.13]}>
              <mesh material={shared.brass} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.016, 0.016, 0.42, 8]} />
              </mesh>
            </group>
            <group position={[0.31, 0.6, -0.36]}>
              <primitive object={unit.driver.figure} />
            </group>
          </group>
          {wheelPositions.map(([x, y, z], index) =>
            index < 2 ? (
              <group key={index} position={[x, y, z]}>
                {wheel(index)}
              </group>
            ) : (
              <group
                key={index}
                ref={(node) => (unit.refs.steers[index - 2] = node)}
                position={[x, y, z]}
              >
                {wheel(index)}
              </group>
            ),
          )}
        </group>
        <RigidBody
          ref={(node) => (unit.refs.body = node)}
          type="kinematicPosition"
          colliders={false}
          position={[0, -20 - unit.id * 5, 0]}
          onCollisionEnter={onActorImpact}
          userData={{ gameKind: 'horseless-carriage', carriageId: unit.id }}
        >
          <CuboidCollider
            ref={(node) => (unit.refs.collider = node)}
            args={[0.85, 0.85, 1.75]}
            position={[0, 0.95, 0]}
            activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
          />
        </RigidBody>
      </group>
    );
  });
}

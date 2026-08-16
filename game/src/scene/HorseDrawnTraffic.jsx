import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CuboidCollider, RigidBody, useRapier } from '@react-three/rapier';
import PropMaterial from './PropMaterial.jsx';
import { handlesAlive } from '../physics/useCharacterController.js';
import { listAgents, removeAgent, reportAgent } from '../world/agents.js';
import {
  HORSE_RIG_CONFIG,
  HORSE_DRAWN_FIXED_DT,
  createHorseDrawnRoster,
  horseDrawnBoardingProfile,
  horseDrawnCollider,
  horseDrawnTrafficConfig,
  horseTeamOffsets,
  horseTeamPoses,
  interpolateHorseDrawnState,
  stepHorseDrawnState,
} from '../world/horseDrawnTraffic.js';
import { removeBoardable, reportBoardable } from '../world/carriageBoarding.js';
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
import { queueActorImpact } from '../world/actorImpacts.js';
import { reportMajorStreetEvent } from '../world/majorStreetEvents.js';
import { getPlayer } from '../world/player.js';

const MAX_FRAME_DT = 0.1;
const MAX_FIXED_STEPS = 6;
const ROAD_Y = 1.18;
const ANIMATION_DISTANCE = 62;
const UP = new THREE.Vector3(0, 1, 0);
const jointStart = new THREE.Vector3();
const jointEnd = new THREE.Vector3();
const jointDirection = new THREE.Vector3();
const strapMidpoint = new THREE.Vector3();

function isAuthoredDrawGear(part) {
  return /^(single-shaft|pair-pole|pair-splinter-bar|pair-singletree)/.test(part.sculptPart);
}

function wheelId(part) {
  return part.sculptPart.match(/^(front-wheel--?1|rear-wheel--?1)/)?.[1] ?? null;
}

function geometryFor(part) {
  const [sx, sy, sz] = part.size;
  if (part.shape === 'roundedBox') {
    const radius = Math.min(part.bevelRadius ?? 0.008, Math.min(sx, sy, sz) * 0.24);
    return new RoundedBoxGeometry(sx, sy, sz, part.bevelSegments ?? 2, radius);
  }
  if (part.shape === 'lathe') {
    return new THREE.LatheGeometry(
      (part.profile ?? []).map(([radius, height]) => new THREE.Vector2(radius, height)),
      part.radialSegments ?? 24,
    );
  }
  if (part.shape === 'cylinder') return new THREE.CylinderGeometry(sx / 2, sx / 2, sy, part.radialSegments ?? 12);
  if (part.shape === 'sphere') return new THREE.SphereGeometry(sx / 2, part.radialSegments ?? 12, 8);
  if (part.shape === 'cone') return new THREE.ConeGeometry(sx / 2, sy, part.radialSegments ?? 12);
  if (part.shape === 'torus') return new THREE.TorusGeometry((sx - sy) / 2, sy / 2, 6, part.radialSegments ?? 20);
  return new THREE.BoxGeometry(sx, sy, sz);
}

function materialKey(part) {
  return JSON.stringify([
    part.finish ?? null, part.color ?? null, Boolean(part.glass),
    part.roughness ?? null, part.metalness ?? null, part.emissive ?? null,
    part.label ?? null, part.castShadow ?? true, part.receiveShadow ?? true,
  ]);
}

function batchCoachwork(parts) {
  const groups = new Map();
  for (const part of parts) {
    const wheel = wheelId(part);
    const key = wheel ? `wheel:${wheel}:${materialKey(part)}` : materialKey(part);
    if (!groups.has(key)) {
      groups.set(key, {
        part,
        geometries: [],
        wheel,
        pivot: wheel ? [...part.position] : [0, 0, 0],
      });
    }
    const group = groups.get(key);
    const geometry = geometryFor(part);
    const mergeable = geometry.index ? geometry.toNonIndexed() : geometry;
    if (mergeable !== geometry) geometry.dispose();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(
        part.position[0] - group.pivot[0],
        part.position[1] - group.pivot[1],
        part.position[2] - group.pivot[2],
      ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1),
    );
    mergeable.applyMatrix4(matrix);
    group.geometries.push(mergeable);
  }
  return [...groups.values()].map(({ part, geometries, wheel, pivot }) => {
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (geometries.length > 1) geometries.forEach((source) => source.dispose());
    return { part, geometry, wheel, pivot };
  });
}

function Coachwork({ batches, refs }) {
  return batches.map(({ part, geometry, wheel, pivot }, index) => {
    const surface = (
      <mesh
        geometry={geometry}
        renderOrder={part.renderOrder ?? 0}
        castShadow={part.castShadow ?? true}
        receiveShadow={part.receiveShadow ?? true}
      >
        <PropMaterial item={part} />
      </mesh>
    );
    if (!wheel) return <group key={index} position={pivot}>{surface}</group>;
    return (
      <group
        key={index}
        position={pivot}
        ref={(node) => {
          const current = refs.wheels[index] ?? { id: wheel };
          current.steer = node;
          refs.wheels[index] = current;
        }}
      >
        <group
          ref={(node) => {
            const current = refs.wheels[index] ?? { id: wheel };
            current.node = node;
            refs.wheels[index] = current;
          }}
        >
          {surface}
        </group>
      </group>
    );
  });
}

function addHarness(horse, dark) {
  const box = (name, position, size, rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), dark);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    horse.add(mesh);
  };
  box('breast-collar', [0, 1.25, 0.53], [0.58, 0.075, 0.08], [0.08, 0, 0]);
  box('back-band', [0, 1.36, -0.05], [0.48, 0.055, 0.09]);
  box('belly-band', [0, 0.98, -0.02], [0.5, 0.055, 0.08]);
  box('bridle-cheek-left', [-0.18, 1.65, 0.88], [0.035, 0.48, 0.035], [0.36, 0, 0.08]);
  box('bridle-cheek-right', [0.18, 1.65, 0.88], [0.035, 0.48, 0.035], [0.36, 0, -0.08]);
}

function makeHorse(source, clip, phase, harnessMaterial) {
  const horse = cloneSkeleton(source);
  horse.name = 'animated-harness-horse';
  horse.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  addHarness(horse, harnessMaterial);
  const mixer = new THREE.AnimationMixer(horse);
  const action = clip ? mixer.clipAction(clip) : null;
  if (action) {
    action.play();
    mixer.setTime(phase * action.getClip().duration);
  }
  return { object: horse, mixer, action };
}

function makeDriver(source, animations, phase) {
  const figure = cloneSkeleton(source);
  figure.name = 'horse-drawn-driver';
  figure.scale.setScalar(1.6);
  figure.rotation.x = -Math.PI / 2;
  figure.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    node.castShadow = true;
    node.frustumCulled = false;
  });
  const clip = animations.find((entry) => /wheel grab/i.test(entry.name))
    ?? animations.find((entry) => /sitting pose/i.test(entry.name))
    ?? animations[0];
  const mixer = new THREE.AnimationMixer(figure);
  const action = clip ? mixer.clipAction(clip) : null;
  if (action) {
    action.play();
    mixer.setTime(phase * action.getClip().duration);
  }
  return { figure, mixer, action };
}

function roadPoint(x, z, yaw, forward, side, y) {
  return [
    x + Math.sin(yaw) * forward - Math.cos(yaw) * side,
    y,
    z + Math.cos(yaw) * forward + Math.sin(yaw) * side,
  ];
}

function setPoint(target, point) {
  if (Array.isArray(point)) target.set(...point);
  else target.copy(point);
}

function placeJoint(mesh, start, end) {
  if (!mesh) return;
  setPoint(jointStart, start);
  setPoint(jointEnd, end);
  jointDirection.subVectors(jointEnd, jointStart);
  const length = jointDirection.length();
  mesh.position.copy(jointStart).add(jointEnd).multiplyScalar(0.5);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(UP, jointDirection.normalize());
}

function placeFlexibleJoint(meshes, start, end, sag) {
  if (!meshes?.[0] || !meshes?.[1]) return;
  setPoint(jointStart, start);
  setPoint(jointEnd, end);
  strapMidpoint.copy(jointStart).add(jointEnd).multiplyScalar(0.5);
  strapMidpoint.y -= sag;
  placeJoint(meshes[0], start, strapMidpoint);
  placeJoint(meshes[1], strapMidpoint, end);
}

function jointNames(team) {
  return team === 'pair'
    ? [
      'pole', 'doubletree', 'neck-yoke',
      'trace-left-outer', 'trace-left-inner', 'trace-right-inner', 'trace-right-outer',
      'rein-left', 'rein-right',
    ]
    : ['shaft-left', 'shaft-right', 'trace-left', 'trace-right', 'rein-left', 'rein-right'];
}

function updateDrawGear(unit, state) {
  const rig = HORSE_RIG_CONFIG[unit.type];
  const coach = (forward, side, y) => roadPoint(
    state.coachX, state.coachZ, state.coachYaw, forward, side, ROAD_Y + y,
  );
  const socket = (forward, side, y) => roadPoint(
    state.socketX, state.socketZ, state.drawYaw, forward, side, ROAD_Y + y,
  );
  const poses = horseTeamPoses(state, unit.team);
  const horse = (index, forward, side, y) => {
    const pose = poses[index];
    return roadPoint(pose.x, pose.z, pose.yaw, forward, side, ROAD_Y + y);
  };
  const hands = (side) => coach(
    unit.driverSeat.x + 0.28,
    side * 0.17,
    unit.driverSeat.y + 0.63,
  );
  const joint = unit.refs.joints;
  if (unit.team === 'pair') {
    placeJoint(joint.pole, socket(0, 0, 0.78), roadPoint(
      state.horseX, state.horseZ, state.horseYaw, -0.05, 0, ROAD_Y + 1.03,
    ));
    placeJoint(joint.doubletree, socket(0.08, -0.94, 0.82), socket(0.08, 0.94, 0.82));
    placeJoint(joint['neck-yoke'], horse(0, -0.04, 0, 1.12), horse(1, -0.04, 0, 1.12));
    placeFlexibleJoint(joint['trace-left-outer'], socket(0.1, -0.94, 0.84), horse(0, 0.45, -0.23, 1.22), 0.1);
    placeFlexibleJoint(joint['trace-left-inner'], socket(0.1, -0.36, 0.84), horse(0, 0.45, 0.2, 1.22), 0.1);
    placeFlexibleJoint(joint['trace-right-inner'], socket(0.1, 0.36, 0.84), horse(1, 0.45, -0.2, 1.22), 0.1);
    placeFlexibleJoint(joint['trace-right-outer'], socket(0.1, 0.94, 0.84), horse(1, 0.45, 0.23, 1.22), 0.1);
    placeFlexibleJoint(joint['rein-left'], hands(-1), horse(0, 1.02, -0.15, 1.67), 0.2);
    placeFlexibleJoint(joint['rein-right'], hands(1), horse(1, 1.02, 0.15, 1.67), 0.2);
  } else {
    placeJoint(joint['shaft-left'], socket(0, -rig.shaftSpread, 0.8), horse(0, -0.05, -rig.shaftSpread, 1.02));
    placeJoint(joint['shaft-right'], socket(0, rig.shaftSpread, 0.8), horse(0, -0.05, rig.shaftSpread, 1.02));
    placeFlexibleJoint(joint['trace-left'], socket(0.06, -0.22, 0.84), horse(0, 0.46, -0.22, 1.22), 0.1);
    placeFlexibleJoint(joint['trace-right'], socket(0.06, 0.22, 0.84), horse(0, 0.46, 0.22, 1.22), 0.1);
    placeFlexibleJoint(joint['rein-left'], hands(-1), horse(0, 1.02, -0.18, 1.67), 0.2);
    placeFlexibleJoint(joint['rein-right'], hands(1), horse(0, 1.02, 0.18, 1.67), 0.2);
  }
}

export default function HorseDrawnTraffic({ runtime }) {
  const horseGltf = useLoader(GLTFLoader, '/models/horse.glb');
  const driverGltf = useLoader(GLTFLoader, '/models/carriage-driver.glb', (loader) =>
    loader.setMeshoptDecoder(MeshoptDecoder));
  const { world, rapier } = useRapier();
  const obstaclesRef = useRef([]);
  const quat = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());

  const materials = useMemo(() => ({
    harness: new THREE.MeshStandardMaterial({ color: '#241b16', roughness: 0.76 }),
    wood: new THREE.MeshStandardMaterial({ color: '#57402b', roughness: 0.72 }),
    trace: new THREE.MeshStandardMaterial({ color: '#44311e', roughness: 0.9 }),
    rein: new THREE.MeshStandardMaterial({ color: '#211916', roughness: 0.86 }),
  }), []);

  const fleet = useMemo(() => {
    const clip = horseGltf.animations.find((entry) => /walk/i.test(entry.name)) ?? horseGltf.animations[0];
    return createHorseDrawnRoster().map((entry, index) => {
      const offsets = horseTeamOffsets(entry.team);
      const horses = offsets.map((_, horseIndex) =>
        makeHorse(horseGltf.scene, clip, (index * 0.27 + horseIndex * 0.43) % 1, materials.harness));
      const driver = makeDriver(driverGltf.scene, driverGltf.animations, index * 0.23);
      const coachParts = entry.coach.parts.filter((part) => !isAuthoredDrawGear(part));
      const seat = coachParts.find((part) => part.sculptPart === 'driver-seat');
      const driverSeat = { x: seat?.position[0] ?? 0.8, y: seat?.position[1] ?? 1.25 };
      return {
        ...entry,
        offsets,
        horses,
        driver,
        driverSeat,
        boarding: horseDrawnBoardingProfile(entry.type),
        coachBatches: batchCoachwork(coachParts),
        previousState: entry.state,
        accumulator: 0,
        refs: {
          root: null,
          coach: null,
          horses: [],
          body: null,
          horseBody: null,
          coachCollider: null,
          horseCollider: null,
          wheels: [],
          joints: {},
        },
        shadowMeshes: [],
        shadowNear: true,
        lastActorImpacts: new Map(),
      };
    });
  }, [driverGltf, horseGltf, materials]);

  useEffect(() => {
    for (const unit of fleet) {
      const list = [];
      unit.refs.root?.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh) list.push(node);
      });
      unit.shadowMeshes = list;
    }
  }, [fleet]);

  useEffect(() => () => {
    for (const unit of fleet) {
      removeAgent(`horse-drawn-${unit.id}`);
      removeTrafficBody(`horse-drawn-${unit.id}`);
      removeBoardable(`horse-drawn-${unit.id}`);
      unit.horses.forEach((horse) => horse.mixer.stopAllAction());
      unit.driver.mixer.stopAllAction();
      unit.coachBatches.forEach((batch) => batch.geometry.dispose());
    }
    Object.values(materials).forEach((material) => material.dispose());
  }, [fleet, materials]);

  useFrame((frame, delta) => {
    const frameDt = Math.min(delta, MAX_FRAME_DT);
    const trafficFrame = frame.clock.elapsedTime;
    beginTrafficFrame(trafficFrame);
    const player = gameDebug.player.position;
    const eye = frame.camera.position;
    const agents = [...listAgents()];
    for (const unit of fleet) {
      const trafficImpacts = takeTrafficImpacts(`horse-drawn-${unit.id}`);
      if (trafficImpacts.length) {
        unit.state = applyTrafficImpacts(unit.state, trafficImpacts);
        unit.previousState = unit.state;
      }
      const obstacles = obstaclesRef.current;
      obstacles.length = 0;
      obstacles.push({ x: player[0], z: player[2], r: 0.6 });
      for (const agent of agents) {
        if (agent.id === `horse-drawn-${unit.id}`) continue;
        if (agent.trafficId) continue;
        obstacles.push(agent);
      }
      const trafficConfig = horseDrawnTrafficConfig(unit);
      obstacles.push(...crossTrafficObstacles(unit.state, agents, trafficConfig.id));
      unit.accumulator = Math.min(
        unit.accumulator + frameDt,
        HORSE_DRAWN_FIXED_DT * MAX_FIXED_STEPS,
      );
      let steps = 0;
      while (unit.accumulator >= HORSE_DRAWN_FIXED_DT && steps < MAX_FIXED_STEPS) {
        const advice = streetTrafficAdvice(
          unit.state,
          agents,
          trafficConfig,
          HORSE_DRAWN_FIXED_DT,
        );
        unit.previousState = unit.state;
        unit.state = stepHorseDrawnState(unit.state, HORSE_DRAWN_FIXED_DT, obstacles, {
          type: unit.type,
          cruise: unit.cruise,
          lane: unit.lane,
        }, advice);
        unit.accumulator -= HORSE_DRAWN_FIXED_DT;
        steps += 1;
      }
      const state = interpolateHorseDrawnState(
        unit.previousState,
        unit.state,
        unit.accumulator / HORSE_DRAWN_FIXED_DT,
      );
      const radius = unit.type === 'omnibus' ? 2.5 : 2.0;
      const agentDetails = trafficAgentDetails(unit.state, trafficConfig);
      reportAgent(`horse-drawn-${unit.id}`, unit.state.horseX, unit.state.horseZ, radius, agentDetails);
      if (unit.boarding) {
        reportBoardable({
          id: `horse-drawn-${unit.id}`,
          x: state.coachX,
          y: ROAD_Y,
          z: state.coachZ,
          yaw: state.coachYaw,
          speed: state.speed,
          profile: unit.boarding,
        });
      }

      if (unit.refs.coach) {
        unit.refs.coach.position.set(state.coachX, ROAD_Y, state.coachZ);
        unit.refs.coach.rotation.set(
          state.knockPitch ?? 0,
          state.coachYaw - Math.PI / 2,
          state.knockRoll ?? 0,
        );
      }
      horseTeamPoses(state, unit.team).forEach((pose, index) => {
        const horse = unit.refs.horses[index];
        if (!horse) return;
        horse.position.set(pose.x, ROAD_Y, pose.z);
        horse.rotation.set(0, pose.yaw, 0);
      });
      updateDrawGear(unit, state);
      unit.refs.wheels.forEach((wheelEntry) => {
        if (!wheelEntry?.node) return;
        wheelEntry.node.rotation.z = -state.wheelSpin * 1.35;
        if (wheelEntry.id.startsWith('front-wheel') && wheelEntry.steer) {
          wheelEntry.steer.rotation.y = -(state.articulation ?? 0);
        }
      });
      const distSq = (state.coachX - eye.x) ** 2 + (state.coachZ - eye.z) ** 2;
      const shadowDistance = runtime.values.outdoorShadowDistance;
      const shadowNear = distSq < shadowDistance ** 2;
      if (shadowNear !== unit.shadowNear) {
        unit.shadowNear = shadowNear;
        unit.shadowMeshes.forEach((mesh) => { mesh.castShadow = shadowNear; });
      }
      if (distSq < ANIMATION_DISTANCE ** 2 && state.speed > 0.05) {
        const pace = THREE.MathUtils.clamp(state.speed / 1.45, 0.45, 1.65);
        unit.horses.forEach((horse) => {
          if (horse.action) horse.action.timeScale = pace;
          horse.mixer.update(frameDt);
        });
        unit.driver.mixer.update(frameDt);
      }

      const collider = horseDrawnCollider(unit.type);
      const horseRadius = collider.horseHalf[2];
      const coachRadius = collider.coachHalf[2];
      const coachReach = Math.max(0.25, collider.coachHalf[0] - coachRadius);
      const gearRadius = unit.team === 'pair' ? 0.7 : 0.5;
      const gearCircles = [0.34, 0.68].map((mix) => ({
        x: state.horseX + (state.socketX - state.horseX) * mix,
        z: state.horseZ + (state.socketZ - state.horseZ) * mix,
        r: gearRadius,
      }));
      const circles = [
        ...trafficCircleChain(state.horseX, state.horseZ, state.horseYaw, [-0.48, 0.48], horseRadius),
        ...gearCircles,
        ...trafficCircleChain(state.coachX, state.coachZ, state.coachYaw, [-coachReach, coachReach], coachRadius),
      ];
      reportTrafficBody({
        id: `horse-drawn-${unit.id}`,
        circles,
        vx: Math.sin(state.horseYaw) * state.speed,
        vz: Math.cos(state.horseYaw) * state.speed,
        mass: unit.type === 'omnibus' ? 1550 : ['brougham', 'utility'].includes(unit.type) ? 900 : 620,
        priority: trafficConfig.priority,
      }, trafficFrame);
      if (handlesAlive(world, unit.refs.body, unit.refs.coachCollider)) {
        unit.refs.body.setNextKinematicTranslation({
          x: state.coachX,
          y: ROAD_Y,
          z: state.coachZ,
        });
        quat.current.setFromEuler(euler.current.set(0, state.coachYaw - Math.PI / 2, 0));
        unit.refs.body.setNextKinematicRotation(quat.current);
      }
      if (handlesAlive(world, unit.refs.horseBody, unit.refs.horseCollider)) {
        unit.refs.horseBody.setNextKinematicTranslation({
          x: state.horseX,
          y: ROAD_Y,
          z: state.horseZ,
        });
        quat.current.setFromEuler(euler.current.set(0, state.horseYaw - Math.PI / 2, 0));
        unit.refs.horseBody.setNextKinematicRotation(quat.current);
      }
    }
    gameDebug.horseDrawnTraffic = fleet.map((unit) => ({
      id: unit.id, type: unit.type, team: unit.team, ...unit.state,
    }));
  });

  return fleet.map((unit) => {
    const collider = horseDrawnCollider(unit.type);
    const onActorImpact = ({ other }) => {
      const otherData = other.rigidBodyObject?.userData;
      const actorId = otherData?.actorId;
      if (!actorId) return;
      const now = getPlayer().clock;
      if (now - (unit.lastActorImpacts.get(actorId) ?? -Infinity) < 4) return;
      unit.lastActorImpacts.set(actorId, now);
      const state = unit.state;
      const vx = Math.sin(state.horseYaw) * state.speed;
      const vz = Math.cos(state.horseYaw) * state.speed;
      queueActorImpact(actorId, {
        cause: 'horse-drawn-vehicle',
        sourceId: `horse-drawn-${unit.id}`,
        sourceVelocity: [vx, 0, vz],
        direction: [vx, vz],
      });
      if (otherData.gameKind === 'player' || otherData.gameKind === 'pedestrian') {
        reportMajorStreetEvent({
          sourceId: `horse-drawn-${unit.id}`,
          targetId: actorId,
          targetKind: otherData.gameKind,
          x: state.horseX,
          z: state.horseZ,
        });
      }
    };
    return (
      <group key={unit.id} ref={(node) => (unit.refs.root = node)}>
        <group ref={(node) => (unit.refs.coach = node)}>
          <Coachwork batches={unit.coachBatches} refs={unit.refs} />
          <group
            position={[unit.driverSeat.x, unit.driverSeat.y - 0.42, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <primitive object={unit.driver.figure} />
          </group>
        </group>
        {unit.offsets.map((side, index) => (
          <group
            key={`horse-${side}`}
            ref={(node) => { unit.refs.horses[index] = node; }}
            scale={0.94}
          >
            <primitive object={unit.horses[index].object} />
          </group>
        ))}
        {jointNames(unit.team).map((name) => {
          const rein = name.startsWith('rein');
          const trace = name.startsWith('trace');
          const flexible = rein || trace;
          const radius = rein ? 0.01 : trace ? 0.014 : 0.035;
          const material = rein ? materials.rein : trace ? materials.trace : materials.wood;
          if (!flexible) return (
            <mesh
              key={name}
              ref={(node) => { unit.refs.joints[name] = node; }}
              material={material}
              castShadow
            >
              <cylinderGeometry args={[radius, radius, 1, 8]} />
            </mesh>
          );
          return [0, 1].map((segment) => (
            <mesh
              key={`${name}-${segment}`}
              ref={(node) => {
                const segments = unit.refs.joints[name] ?? [];
                segments[segment] = node;
                unit.refs.joints[name] = segments;
              }}
              material={material}
              castShadow={trace}
            >
              <cylinderGeometry args={[radius, radius, 1, 6]} />
            </mesh>
          ));
        })}
        <RigidBody
          ref={(node) => (unit.refs.body = node)}
          type="kinematicPosition"
          colliders={false}
          position={[0, -35, 0]}
          userData={{ gameKind: 'horse-drawn-vehicle', vehicleId: unit.id }}
          onCollisionEnter={onActorImpact}
        >
          <CuboidCollider
            ref={(node) => (unit.refs.coachCollider = node)}
            args={collider.coachHalf}
            position={[0, collider.coachY, 0]}
            activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
          />
          {unit.boarding ? (
            <CuboidCollider
              args={[unit.boarding.roof.half[0], 0.055, unit.boarding.roof.half[1]]}
              position={[
                unit.boarding.roof.center[0],
                unit.boarding.roof.top - 0.055,
                unit.boarding.roof.center[1],
              ]}
              activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
            />
          ) : null}
        </RigidBody>
        <RigidBody
          ref={(node) => (unit.refs.horseBody = node)}
          type="kinematicPosition"
          colliders={false}
          position={[0, -42, 0]}
          userData={{ gameKind: 'horse-team', vehicleId: unit.id }}
          onCollisionEnter={onActorImpact}
        >
          <CuboidCollider
            ref={(node) => (unit.refs.horseCollider = node)}
            args={collider.horseHalf}
            position={[0, collider.horseY, 0]}
            activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
          />
        </RigidBody>
      </group>
    );
  });
}

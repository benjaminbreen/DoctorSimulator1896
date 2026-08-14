import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { gameDebug } from '../debug.js';
import { handlesAlive } from '../physics/useCharacterController.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import {
  DANDY_MODEL_FILE,
  DANDY_MOTION_FILE,
  dandiesForZone,
  dandyConversationActive,
  dandyGroundY,
  dandyRouteLength,
  dandyRoutePoint,
} from '../world/dandies.js';
import {
  PING_PONG_PHASE,
  createPingPongRouteState,
  interpolateRouteTurnYaw,
  routeTurnProgress,
  stepPingPongRoute,
} from '../world/pingPongRoute.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';
import { buildWalkingStick, findMixamoBone } from './walkingStick.js';

const NPC_SCALE = 1.62;
const BUMP_DISTANCE = 0.86;
const BUMP_RELEASE_DISTANCE = 1.18;
const BUMP_COOLDOWN = 4;
const WALK_SPEED = 1.2;

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function seeded01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function beginGesture(actor, name, now) {
  if (actor.active) return false;
  const action = actor.actions[name];
  if (!action) return false;
  actor.base.fadeOut(0.14);
  action.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
  action.clampWhenFinished = true;
  actor.active = action;
  actor.activeName = name;
  actor.gestureUntil = now + action.getClip().duration + 0.08;
  return true;
}

function finishGesture(actor) {
  restoreLoopingIdle(actor.mixer, actor.base, actor.active);
  actor.active = null;
  actor.activeName = null;
}

function setBaseAnimation(actor, name) {
  if (actor.baseName === name && actor.base?.isRunning()) return;
  const previous = actor.base;
  actor.base = actor.actions[name] ?? actor.actions.DandyIdle;
  actor.baseName = name;
  previous?.fadeOut(0.24);
  actor.base.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.24).play();
  actor.mixer.update(0);
}

export default function Dandies({ runtime }) {
  const modelGltf = useLoader(GLTFLoader, DANDY_MODEL_FILE, withMeshopt);
  const motionGltf = useLoader(GLTFLoader, DANDY_MOTION_FILE, withMeshopt);
  const { world, rapier } = useRapier();
  const zone = runtime.values.zone;

  const actors = useMemo(() => dandiesForZone(zone).map((placement, index) => {
    const wrapper = new THREE.Group();
    const figure = cloneSkeleton(modelGltf.scene);
    figure.name = placement.id;
    figure.scale.setScalar(NPC_SCALE);
    const meshes = [];
    figure.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      const source = Array.isArray(node.material) ? node.material : [node.material];
      node.material = Array.isArray(node.material)
        ? source.map((material) => material?.clone?.() ?? material)
        : node.material?.clone?.() ?? node.material;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        normalizeNonmetallicCharacterMaterial(material);
        if (!material) continue;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
      meshes.push(node);
    });
    wrapper.rotation.y = placement.yaw;
    wrapper.add(figure);

    const walkingStick = buildWalkingStick();
    wrapper.add(walkingStick.group);
    const hand = findMixamoBone(figure, 'RightHand');
    const clips = [...modelGltf.animations, ...motionGltf.animations];
    const mixer = new THREE.AnimationMixer(figure);
    const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const conversing = dandyConversationActive(placement, runtime.values.timeOfDay);
    const baseName = placement.route && !conversing ? 'WalkingStickWalk' : 'WalkingStickIdle';
    const base = actions[baseName]
      ?? actions.DandyIdle
      ?? mixer.clipAction(clips[0]);
    base.setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.setTime((0.19 + index * 0.31) * base.getClip().duration);
    const routeLength = placement.route ? dandyRouteLength(placement.route.points) : 0;
    return {
      placement,
      wrapper,
      figure,
      meshes,
      walkingStick,
      hand,
      mixer,
      actions,
      base,
      baseName,
      active: null,
      activeName: null,
      gestureUntil: 0,
      nextAmbientAt: 17 + seeded01(index + 1) * 13,
      bumpCooldownUntil: 0,
      playerNear: false,
      collisionQueued: false,
      body: null,
      collider: null,
      routeLength,
      routeMotion: placement.route ? createPingPongRouteState({
        distance: placement.route.startFraction * routeLength,
        seed: index + 70,
      }) : null,
      turnFromYaw: placement.yaw,
      turnToYaw: placement.yaw,
      worldX: placement.position[0],
      worldZ: placement.position[2],
      velocity: [0, 0],
    };
  }), [modelGltf, motionGltf, runtime, zone]);

  const elapsed = useRef(0);
  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1);
    elapsed.current += step;
    const now = elapsed.current;
    const player = gameDebug.player.position;
    for (const actor of actors) {
      const conversing = dandyConversationActive(actor.placement, runtime.values.timeOfDay);
      actor.mixer.update(step);
      actor.figure.rotation.x = 0;
      actor.figure.rotation.z = 0;
      if (actor.active && now >= actor.gestureUntil) finishGesture(actor);

      if (!actor.active) {
        const routeWalking = actor.placement.route
          && !conversing
          && actor.routeMotion.phase === PING_PONG_PHASE.WALKING;
        setBaseAnimation(actor, routeWalking ? 'WalkingStickWalk' : 'WalkingStickIdle');
      }

      if (actor.placement.route && !conversing && !actor.active) {
        const stepped = stepPingPongRoute(actor.routeMotion, {
          delta: step,
          now,
          length: actor.routeLength,
          speed: WALK_SPEED * actor.placement.route.speed,
        });
        const [x, z, dx, dz] = dandyRoutePoint(
          actor.placement.route.points,
          actor.routeMotion.distance,
        );
        actor.worldX = x;
        actor.worldZ = z;
        const targetYaw = Math.atan2(
          dx * actor.routeMotion.direction,
          dz * actor.routeMotion.direction,
        );
        if (stepped.phaseChanged) {
          if (stepped.phase === PING_PONG_PHASE.WALKING) {
            setBaseAnimation(actor, 'WalkingStickWalk');
            actor.wrapper.rotation.y = targetYaw;
          } else {
            setBaseAnimation(actor, 'WalkingStickIdle');
            if (stepped.phase === PING_PONG_PHASE.TURNING) {
              actor.turnFromYaw = actor.wrapper.rotation.y;
              actor.turnToYaw = targetYaw;
            }
          }
        }
        if (stepped.phase === PING_PONG_PHASE.TURNING) {
          actor.wrapper.rotation.y = interpolateRouteTurnYaw(
            actor.turnFromYaw,
            actor.turnToYaw,
            routeTurnProgress(actor.routeMotion, now),
          );
        } else if (stepped.phase === PING_PONG_PHASE.WALKING) {
          actor.wrapper.rotation.y = targetYaw;
        }
        if (stepped.moving) {
          const tangentLength = Math.hypot(dx, dz) || 1;
          actor.velocity[0] = (dx / tangentLength) * WALK_SPEED
            * actor.placement.route.speed * actor.routeMotion.direction;
          actor.velocity[1] = (dz / tangentLength) * WALK_SPEED
            * actor.placement.route.speed * actor.routeMotion.direction;
        } else {
          actor.velocity[0] = 0;
          actor.velocity[1] = 0;
        }
      } else if (actor.active || conversing) {
        actor.velocity[0] = 0;
        actor.velocity[1] = 0;
      }

      const [placementX, y, placementZ] = actor.placement.position;
      if (!actor.placement.route || conversing) {
        actor.worldX = placementX;
        actor.worldZ = placementZ;
        actor.wrapper.rotation.y = actor.placement.yaw;
      }
      if (handlesAlive(world, actor.body, actor.collider)) {
        const groundY = actor.placement.route && !conversing
          ? dandyGroundY(actor.worldX, actor.worldZ)
          : y;
        actor.body.setNextKinematicTranslation({ x: actor.worldX, y: groundY, z: actor.worldZ });
      }
      reportAgent(actor.placement.id, actor.worldX, actor.worldZ, 0.45, {
        kind: 'pedestrian',
        gender: 'male',
        velocity: [...actor.velocity],
      });

      const playerDistance = Math.hypot(actor.worldX - player[0], actor.worldZ - player[2]);
      const bumping = playerDistance < BUMP_DISTANCE;
      if (
        (actor.collisionQueued || (!actor.playerNear && bumping))
        && now >= actor.bumpCooldownUntil
      ) {
        if (beginGesture(actor, 'StandingAcknowledging', now)) {
          actor.bumpCooldownUntil = now + BUMP_COOLDOWN;
          actor.velocity[0] = 0;
          actor.velocity[1] = 0;
        }
      }
      actor.collisionQueued = false;
      if (bumping) actor.playerNear = true;
      else if (playerDistance > BUMP_RELEASE_DISTANCE) actor.playerNear = false;

      if ((!actor.placement.route || conversing) && !actor.active && now >= actor.nextAmbientAt) {
        beginGesture(actor, 'CockyHeadTurn', now);
        actor.nextAmbientAt = now + 22 + seeded01(actor.nextAmbientAt) * 16;
      }

      actor.wrapper.updateMatrixWorld(true);
      actor.walkingStick.update(actor.hand, actor.wrapper);
      for (const mesh of actor.walkingStick.meshes) mesh.castShadow = true;
    }
  });

  useEffect(() => () => {
    for (const actor of actors) {
      removeAgent(actor.placement.id);
      actor.mixer.stopAllAction();
      actor.walkingStick.dispose();
      actor.figure.traverse((node) => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material?.dispose?.());
      });
    }
  }, [actors]);

  return actors.map((actor) => (
    <RigidBody
      key={actor.placement.id}
      ref={(node) => { actor.body = node; }}
      type="kinematicPosition"
      colliders={false}
      position={actor.placement.position}
      userData={{ gameKind: 'pedestrian', actorId: actor.placement.id }}
      onCollisionEnter={({ other }) => {
        if (other.rigidBodyObject?.userData?.gameKind === 'player') actor.collisionQueued = true;
      }}
    >
      <primitive object={actor.wrapper} />
      <CapsuleCollider
        ref={(node) => { actor.collider = node; }}
        args={[0.55, 0.28]}
        position={[0, 0.88, 0]}
        activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
      />
    </RigidBody>
  ));
}

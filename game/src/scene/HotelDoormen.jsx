import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { gameDebug } from '../debug.js';
import { listAgents, removeAgent, reportAgent } from '../world/agents.js';
import {
  HOTEL_DOORMAN_MODEL_FILE,
  HOTEL_DOORMAN_MOTION_FILE,
  doormanBumpMotion,
  hotelDoormenForZone,
  isPassingPedestrian,
} from '../world/hotelDoormen.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';

const NPC_SCALE = 1.62;
const PLAYER_GREETING_DISTANCE = 2.8;
const PLAYER_GREETING_RELEASE = 3.7;
const BUMP_DISTANCE = 0.86;
const BUMP_RELEASE_DISTANCE = 1.18;
const BUMP_COOLDOWN = 1.1;
const PASSERBY_COOLDOWN = 12;
const NOD_COOLDOWN = 2.7;
const AMBIENT_MOTIONS = Object.freeze(['CockyHeadTurn', 'ThoughtfulHeadShake']);

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function playGesture(actor, name, now, priority) {
  if (actor.active && actor.priority > priority) return false;
  const next = actor.actions[name];
  if (!next) return false;
  if (actor.active && actor.active !== next) actor.active.fadeOut(0.12);
  actor.idle.fadeOut(0.12);
  next.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
  next.clampWhenFinished = true;
  actor.active = next;
  actor.activeName = name;
  actor.priority = priority;
  actor.gestureUntil = now + next.getClip().duration + 0.08;
  return true;
}

function returnToIdle(actor) {
  restoreLoopingIdle(actor.mixer, actor.idle, actor.active);
  actor.active = null;
  actor.activeName = null;
  actor.priority = -1;
}

export default function HotelDoormen({ runtime }) {
  const modelGltf = useLoader(GLTFLoader, HOTEL_DOORMAN_MODEL_FILE, withMeshopt);
  const motionGltf = useLoader(GLTFLoader, HOTEL_DOORMAN_MOTION_FILE, withMeshopt);
  const { rapier } = useRapier();
  const zone = runtime.values.zone;

  const actors = useMemo(() => hotelDoormenForZone(zone).map((placement, index) => {
    const figure = cloneSkeleton(modelGltf.scene);
    figure.name = placement.id;
    figure.scale.setScalar(NPC_SCALE);
    figure.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      node.material = Array.isArray(node.material)
        ? materials.map((material) => material?.clone?.() ?? material)
        : node.material?.clone?.() ?? node.material;
      const cloned = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of cloned) {
        normalizeNonmetallicCharacterMaterial(material);
        if (!material) continue;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    });

    const clips = [...modelGltf.animations, ...motionGltf.animations];
    const mixer = new THREE.AnimationMixer(figure);
    const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const idle = actions.DoormanIdle ?? mixer.clipAction(clips[0]);
    idle.play();
    mixer.setTime((index * 0.37 + 0.16) * idle.getClip().duration);
    return {
      placement,
      figure,
      mixer,
      actions,
      idle,
      active: null,
      activeName: null,
      priority: -1,
      gestureUntil: 0,
      playerGreetingNear: false,
      playerBumpNear: false,
      collisionQueued: false,
      bumpCount: 0,
      bumpCooldownUntil: 0,
      nextNodAt: 0,
      greetedAgents: new Map(),
      ambientIndex: index,
      nextAmbientAt: 14 + index * 5,
    };
  }), [modelGltf, motionGltf, zone]);

  useFrame((_, delta) => {
    const now = performance.now() / 1000;
    const player = gameDebug.player.position;
    for (const actor of actors) {
      actor.mixer.update(Math.min(delta, 0.1));
      actor.figure.rotation.x = 0;
      actor.figure.rotation.z = 0;
      if (actor.active && now >= actor.gestureUntil) returnToIdle(actor);

      const [x, y, z] = actor.placement.position;
      reportAgent(actor.placement.id, x, z, 0.42, {
        kind: 'doorman',
        velocity: [0, 0],
      });

      const playerDistance = Math.hypot(x - player[0], z - player[2]);
      const bumping = playerDistance < BUMP_DISTANCE;
      const enteredBump = !actor.playerBumpNear && bumping;
      if ((actor.collisionQueued || enteredBump) && now >= actor.bumpCooldownUntil) {
        playGesture(actor, doormanBumpMotion(actor.bumpCount), now, 2);
        actor.bumpCount += 1;
        actor.bumpCooldownUntil = now + BUMP_COOLDOWN;
      }
      actor.collisionQueued = false;
      if (bumping) actor.playerBumpNear = true;
      else if (playerDistance > BUMP_RELEASE_DISTANCE) actor.playerBumpNear = false;

      const greetingNear = playerDistance < PLAYER_GREETING_DISTANCE;
      if (!actor.playerGreetingNear && greetingNear && !bumping && now >= actor.nextNodAt) {
        if (playGesture(actor, 'HeadNod', now, 1)) actor.nextNodAt = now + NOD_COOLDOWN;
        actor.playerGreetingNear = true;
      } else if (playerDistance > PLAYER_GREETING_RELEASE) {
        actor.playerGreetingNear = false;
      }

      if (actor.placement.greetsPedestrians && !actor.active && now >= actor.nextNodAt) {
        let passerby = null;
        let distance = Infinity;
        for (const agent of listAgents()) {
          if (!isPassingPedestrian(agent, actor.placement.position)) continue;
          if (now - (actor.greetedAgents.get(agent.id) ?? -Infinity) < PASSERBY_COOLDOWN) continue;
          const candidateDistance = Math.hypot(agent.x - x, agent.z - z);
          if (candidateDistance < distance) {
            passerby = agent;
            distance = candidateDistance;
          }
        }
        if (passerby && playGesture(actor, 'HeadNod', now, 1)) {
          actor.greetedAgents.set(passerby.id, now);
          actor.nextNodAt = now + NOD_COOLDOWN;
        }
      }

      // The quieter head-turn and head-shake clips keep a long hotel shift
      // alive without competing with greetings or collision reactions.
      if (!actor.active && now >= actor.nextAmbientAt) {
        const name = AMBIENT_MOTIONS[actor.ambientIndex % AMBIENT_MOTIONS.length];
        if (playGesture(actor, name, now, 0)) actor.ambientIndex += 1;
        actor.nextAmbientAt = now + 18 + (actor.ambientIndex % 3) * 4;
      }

      // Keep the model at its authored floor even if this component survives
      // a tuning update that mutates the placement arrays in development.
      actor.figure.position.y = 0;
      void y;
    }
  });

  useEffect(() => () => {
    for (const actor of actors) {
      removeAgent(actor.placement.id);
      actor.mixer.stopAllAction();
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
      type="fixed"
      colliders={false}
      position={actor.placement.position}
      rotation={[0, actor.placement.yaw, 0]}
      userData={{ gameKind: 'doorman', actorId: actor.placement.id }}
      onCollisionEnter={({ other }) => {
        if (other.rigidBodyObject?.userData?.gameKind === 'player') actor.collisionQueued = true;
      }}
    >
      <primitive object={actor.figure} />
      <CapsuleCollider
        args={[0.55, 0.28]}
        position={[0, 0.88, 0]}
        activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
      />
    </RigidBody>
  ));
}

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { gameDebug } from '../debug.js';
import { listAgents, removeAgent, reportAgent } from '../world/agents.js';
import { clearActorImpacts, takeActorImpacts } from '../world/actorImpacts.js';
import {
  confrontationFor,
  provokeConfrontation,
  releaseConfrontation,
  stepConfrontation,
} from '../world/confrontation.js';
import { hashString } from '../world/npcIdentity.js';
import {
  HOTEL_DOORMAN_MODEL_FILE,
  HOTEL_DOORMAN_MOTION_FILE,
  doormanBumpMotion,
  hotelDoormenForZone,
  isPassingPedestrian,
} from '../world/hotelDoormen.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';
import { figureHeight } from '../world/figureHeights.js';

const NPC_SCALE = figureHeight('hotel-doorman');
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

// A confrontation outranks every gesture and loops until it is over, so it
// bypasses playGesture's priority and one-shot handling entirely.
function playConfrontLoop(actor, name) {
  if (actor.confrontPose === name) return;
  actor.confrontPose = name;
  const next = actor.actions[name];
  if (!next) return;
  if (actor.active && actor.active !== next) actor.active.fadeOut(0.15);
  actor.idle.fadeOut(0.15);
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play();
  actor.active = next;
  actor.activeName = name;
  actor.priority = 9;
  actor.gestureUntil = Infinity;
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
      body: null,
      confrontPose: null,
      worldX: placement.position[0],
      worldZ: placement.position[2],
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

      const [postX, y, postZ] = actor.placement.position;

      for (const impact of takeActorImpacts(actor.placement.id)) {
        if (impact.cause !== 'projectile') continue;
        provokeConfrontation(actor.placement.id, {
          itemLabel: impact.itemLabel,
          kind: 'doorman',
          name: 'A hotel doorman',
          dialogueId: actor.placement.id,
          now,
        });
      }
      const march = confrontationFor(actor.placement.id)
        ? stepConfrontation(actor.placement.id, {
          x: actor.worldX,
          z: actor.worldZ,
          playerX: player[0],
          playerZ: player[2],
          delta,
          now,
        })
        : null;
      if (march) {
        actor.worldX = march.x;
        actor.worldZ = march.z;
        // The body carries the placement yaw, so the figure turns in local
        // terms to end up facing the player in world terms.
        actor.figure.rotation.y = march.yaw - actor.placement.yaw;
        playConfrontLoop(actor, march.walking ? 'Walk' : 'StandingArguing');
      } else if (actor.confrontPose) {
        actor.confrontPose = null;
        actor.gestureUntil = 0;
        actor.worldX = postX;
        actor.worldZ = postZ;
        actor.figure.rotation.y = 0;
        releaseConfrontation(actor.placement.id);
        returnToIdle(actor);
      }
      actor.body?.setNextKinematicTranslation({ x: actor.worldX, y, z: actor.worldZ });

      const x = actor.worldX;
      const z = actor.worldZ;
      reportAgent(actor.placement.id, x, z, 0.42, {
        kind: 'doorman',
        velocity: [0, 0],
        dialogueId: actor.placement.id,
        dialogueName: 'A hotel doorman',
        dialogueContext: {
          archetype: 'dm',
          role: 'doorman',
          activity: 'standing',
          hour: runtime.values.timeOfDay,
          place: actor.placement.zone,
          seed: hashString(actor.placement.id),
        },
      });

      // Mid-confrontation nothing else gets a say: no bump gesture, no nods.
      if (march) continue;

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
      clearActorImpacts(actor.placement.id);
      releaseConfrontation(actor.placement.id);
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
      // Kinematic rather than fixed: a doorman hit by a thrown object leaves
      // the door to complain, and his collider has to go with him.
      ref={(body) => { actor.body = body; }}
      type="kinematicPosition"
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

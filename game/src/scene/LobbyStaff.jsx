import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { gameDebug } from '../debug.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import { hashString } from '../world/npcIdentity.js';
import {
  LOBBY_STAFF_MODELS,
  PLAYER_IS_CLUB_MEMBER,
  lobbyStaffForZone,
} from '../world/lobbyStaff.js';
import { raiseLobbyGreeting } from '../world/outcry.js';
import { PEDESTRIAN_ARCHETYPES, PEDESTRIAN_STRAWHAT_MOTION_FILE } from '../world/pedestrianCatalog.js';
import { figureHeight } from '../world/figureHeights.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';

const AMBIENT_GAP = 13;
// He speaks when you have come properly inside, and forgets you once you are
// across the room again.
const GREET_RANGE = 6;
const GREET_RESET = 12;

// Stable arrays: useLoader re-suspends forever when handed a fresh one, and
// the Suspense fallback here is null.
const MODEL_FILES = Object.freeze([LOBBY_STAFF_MODELS.bellhop, LOBBY_STAFF_MODELS.maid]);

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function buildActor(spec, modelGltf, motionGltf) {
  const wrapper = new THREE.Group();
  const figure = cloneSkeleton(modelGltf.scene);
  figure.name = spec.id;
  figure.scale.setScalar(figureHeight(PEDESTRIAN_ARCHETYPES[spec.archetype].id));
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
  });
  wrapper.add(figure);
  // The rigid body carries the world position; the wrapper stays local.
  wrapper.rotation.y = spec.yaw;

  const mixer = new THREE.AnimationMixer(figure);
  const clips = [...modelGltf.animations, ...motionGltf.animations];
  const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  const idle = actions[spec.idleClip] ?? mixer.clipAction(clips[0]);
  idle.setLoop(THREE.LoopRepeat, Infinity).play();
  // Offset the loop so two staff in one room are not in lockstep.
  mixer.setTime((hashString(spec.id) % 100) / 100 * idle.getClip().duration);
  return {
    spec,
    wrapper,
    figure,
    mixer,
    actions,
    idle,
    active: null,
    gestureUntil: 0,
    nextAmbientAt: AMBIENT_GAP + (hashString(spec.id) % 700) / 100,
    ambientIndex: 0,
    greeted: false,
    body: null,
  };
}

export default function LobbyStaff({ runtime, zone }) {
  const [bellhopGltf, maidGltf] = useLoader(GLTFLoader, MODEL_FILES, withMeshopt);
  const motionGltf = useLoader(GLTFLoader, PEDESTRIAN_STRAWHAT_MOTION_FILE, withMeshopt);
  const zoneId = runtime.values.zone;

  const actors = useMemo(
    () => lobbyStaffForZone(zoneId, zone).map((spec) => buildActor(
      spec,
      spec.kind === 'maid' ? maidGltf : bellhopGltf,
      motionGltf,
    )),
    [zoneId, zone, bellhopGltf, maidGltf, motionGltf],
  );

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.1);
    const now = state.clock.elapsedTime;
    for (const actor of actors) {
      if (actor.active && now >= actor.gestureUntil) {
        restoreLoopingIdle(actor.mixer, actor.idle, actor.active);
        actor.active = null;
        actor.nextAmbientAt = now + AMBIENT_GAP;
      } else if (!actor.active && now >= actor.nextAmbientAt) {
        const name = actor.spec.ambientClips[actor.ambientIndex % actor.spec.ambientClips.length];
        const next = actor.actions[name];
        actor.ambientIndex += 1;
        if (next) {
          actor.idle.fadeOut(0.16);
          next.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.14).play();
          next.clampWhenFinished = true;
          actor.active = next;
          actor.gestureUntil = now + next.getClip().duration + 0.08;
        } else {
          actor.nextAmbientAt = now + AMBIENT_GAP;
        }
      }
      // Somebody walking in gets a word. Once per arrival: he does not greet
      // you again for crossing the lobby twice.
      const player = gameDebug.player.position;
      const range = Math.hypot(
        player[0] - actor.spec.position[0],
        player[2] - actor.spec.position[1],
      );
      if (range > GREET_RESET) actor.greeted = false;
      else if (!actor.greeted && range <= GREET_RANGE && actor.spec.kind === 'bellhop') {
        actor.greeted = true;
        raiseLobbyGreeting({
          speaker: actor.spec.dialogueName,
          anchorId: actor.spec.id,
          // The club is members and their guests; the hotel is open to anyone
          // who can pay for a room.
          challenge: zoneId === 'metropolitan-club-lobby' && !PLAYER_IS_CLUB_MEMBER,
          seed: hashString(actor.spec.id) + Math.round(now),
        });
      }

      actor.mixer.update(step);
      actor.figure.rotation.x = 0;
      actor.figure.rotation.z = 0;
      reportAgent(actor.spec.id, actor.spec.position[0], actor.spec.position[1], 0.4, {
        kind: 'pedestrian',
        velocity: [0, 0],
        dialogueId: actor.spec.id,
        dialogueName: actor.spec.dialogueName,
        dialogueContext: {
          archetype: actor.spec.archetype,
          role: actor.spec.role,
          activity: 'working',
          hour: runtime.values.timeOfDay,
          place: zoneId,
          seed: hashString(actor.spec.id),
        },
      });
    }
  });

  useEffect(() => () => {
    for (const actor of actors) {
      removeAgent(actor.spec.id);
      actor.mixer.stopAllAction();
      actor.figure.traverse((node) => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material?.dispose?.());
      });
    }
  }, [actors]);

  const floorY = zone?.blueprint?.dimensions?.floorY ?? 0;
  return actors.map((actor) => (
    <RigidBody
      key={actor.spec.id}
      ref={(node) => { actor.body = node; }}
      type="fixed"
      colliders={false}
      position={[actor.spec.position[0], floorY, actor.spec.position[1]]}
      userData={{ gameKind: 'pedestrian', actorId: actor.spec.id }}
    >
      <primitive object={actor.wrapper} />
      <CapsuleCollider args={[0.5, 0.26]} position={[0, 0.82, 0]} />
    </RigidBody>
  ));
}

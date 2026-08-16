import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { gameDebug } from '../debug.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import { clearActorImpacts, takeActorImpacts } from '../world/actorImpacts.js';
import {
  confrontationFor,
  provokeConfrontation,
  releaseConfrontation,
  stepConfrontation,
} from '../world/confrontation.js';
import { grievanceAgainst } from '../world/grievances.js';
import { getInteraction } from '../world/interaction.js';
import { dampAngle } from '../movement/mathUtils.js';
import { hashString } from '../world/npcIdentity.js';
import {
  POSTED_NPCS,
  POSTED_NPC_MODEL_FILES,
  POSTED_NPC_MOTION_FILES,
  postedNpcsForZone,
} from '../world/postedNpcs.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';

const AMBIENT_GAP = 11;

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function buildActor(spec, modelGltf, motionGltf) {
  const wrapper = new THREE.Group();
  const figure = cloneSkeleton(modelGltf.scene);
  figure.name = spec.id;
  figure.scale.setScalar(spec.scale);
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
  // The rigid body carries the world position; the wrapper stays at its local
  // origin or the figure is placed twice over.
  wrapper.rotation.y = spec.yaw;

  const mixer = new THREE.AnimationMixer(figure);
  const clips = [...modelGltf.animations, ...motionGltf.animations];
  const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  const idle = actions[spec.idleClip] ?? mixer.clipAction(clips[0]);
  idle.setLoop(THREE.LoopRepeat, Infinity).play();
  return {
    spec,
    wrapper,
    figure,
    mixer,
    actions,
    idle,
    active: null,
    gestureUntil: 0,
    nextAmbientAt: AMBIENT_GAP + (hashString(spec.id) % 900) / 100,
    ambientIndex: 0,
    scoldedCount: 0,
    body: null,
    confrontPose: null,
    worldX: spec.position[0],
    worldZ: spec.position[2],
  };
}

export default function PostedNpcs({ runtime }) {
  const modelGltfs = useLoader(GLTFLoader, POSTED_NPC_MODEL_FILES, withMeshopt);
  const motionGltfs = useLoader(GLTFLoader, POSTED_NPC_MOTION_FILES, withMeshopt);

  const actors = useMemo(
    () => POSTED_NPCS.map((spec, index) => buildActor(spec, modelGltfs[index], motionGltfs[index])),
    [modelGltfs, motionGltfs],
  );

  // Rebuilt only when the zone changes; a fresh Set every frame is exactly
  // the per-frame garbage the crowd loop is careful to avoid.
  const activeIds = useMemo(
    () => new Set(postedNpcsForZone(runtime.values.zone).map((npc) => npc.id)),
    [runtime.values.zone],
  );

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.1);
    const now = state.clock.elapsedTime;
    const conversation = getInteraction().using;
    const speakingId = conversation?.kind === 'conversation' ? conversation.agentId : null;
    for (const actor of actors) {
      const visible = activeIds.has(actor.spec.id);
      actor.wrapper.visible = visible;
      if (!visible) {
        removeAgent(actor.spec.id);
        releaseConfrontation(actor.spec.id);
        continue;
      }
      // A robbed vendor argues at the thief instead of idling pleasantly.
      // Checked by serial so one theft triggers one outburst, not a loop.
      const grievance = grievanceAgainst(actor.spec.id);
      if (grievance && grievance.count !== actor.scoldedCount) {
        actor.scoldedCount = grievance.count;
        const scold = actor.actions.StandingArguing;
        if (scold) {
          actor.idle.fadeOut(0.12);
          scold.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
          scold.clampWhenFinished = true;
          actor.active = scold;
          actor.gestureUntil = now + scold.getClip().duration + 0.08;
        }
      } else if (!grievance) {
        actor.scoldedCount = 0;
      }
      // An idle habit now and then, so a posted figure is not a statue. The
      // newsboy's rig carries none, and simply keeps his idle.
      if (actor.active && now >= actor.gestureUntil) {
        restoreLoopingIdle(actor.mixer, actor.idle, actor.active);
        actor.active = null;
        actor.nextAmbientAt = now + AMBIENT_GAP;
      } else if (!actor.active && actor.spec.ambientClips.length > 0 && now >= actor.nextAmbientAt) {
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
      // Hit by a thrown object, he leaves the cart to have it out. The cart
      // stays where it is; he goes back to it when he has finished.
      for (const impact of takeActorImpacts(actor.spec.id)) {
        if (impact.cause !== 'projectile') continue;
        provokeConfrontation(actor.spec.id, {
          itemLabel: impact.itemLabel,
          archetype: actor.spec.archetype,
          name: actor.spec.dialogueName,
          dialogueId: actor.spec.id,
          now,
        });
      }
      const march = confrontationFor(actor.spec.id)
        ? stepConfrontation(actor.spec.id, {
          x: actor.worldX,
          z: actor.worldZ,
          playerX: gameDebug.player.position[0],
          playerZ: gameDebug.player.position[2],
          delta,
          now,
        })
        : null;
      if (march) {
        actor.worldX = march.x;
        actor.worldZ = march.z;
        actor.wrapper.rotation.y = march.yaw;
        const name = march.walking ? 'Walk' : 'StandingArguing';
        if (actor.confrontPose !== name) {
          actor.confrontPose = name;
          const next = actor.actions[name];
          if (next) {
            actor.active?.fadeOut(0.15);
            actor.idle.fadeOut(0.15);
            next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play();
            actor.active = next;
            actor.gestureUntil = Infinity;
          }
        }
      } else if (actor.confrontPose) {
        actor.confrontPose = null;
        actor.gestureUntil = 0;
        actor.worldX = actor.spec.position[0];
        actor.worldZ = actor.spec.position[2];
        actor.wrapper.rotation.y = actor.spec.yaw ?? 0;
        releaseConfrontation(actor.spec.id);
        restoreLoopingIdle(actor.mixer, actor.idle, actor.active);
        actor.active = null;
      }
      // Spoken to, he turns from the cart to the customer, and turns back
      // when the talk ends. A confrontation owns the facing while it runs.
      if (!march && !actor.confrontPose) {
        const facing = speakingId === actor.spec.id
          ? Math.atan2(
            gameDebug.player.position[0] - actor.worldX,
            gameDebug.player.position[2] - actor.worldZ,
          )
          : actor.spec.yaw ?? 0;
        actor.wrapper.rotation.y = dampAngle(actor.wrapper.rotation.y, facing, 7, step);
      }
      actor.body?.setNextKinematicTranslation({
        x: actor.worldX, y: actor.spec.position[1], z: actor.worldZ,
      });

      actor.mixer.update(step);
      actor.figure.rotation.x = 0;
      actor.figure.rotation.z = 0;
      reportAgent(
        actor.spec.id,
        actor.worldX,
        actor.worldZ,
        0.42,
        {
          kind: 'pedestrian',
          gender: 'male',
          velocity: [0, 0],
          // Witness memory reads this to tell an owner from a bystander.
          ...(actor.spec.ownsId ? { ownsId: actor.spec.ownsId } : {}),
          ...(actor.spec.sells ? { sells: actor.spec.sells } : {}),
          dialogueId: actor.spec.id,
          dialogueName: actor.spec.dialogueName,
          dialogueContext: {
            archetype: actor.spec.archetype,
            role: actor.spec.role,
            activity: actor.spec.activity,
            hour: runtime.values.timeOfDay,
            seed: hashString(actor.spec.id),
          },
        },
      );
    }
  });

  useEffect(() => () => {
    for (const actor of actors) {
      removeAgent(actor.spec.id);
      clearActorImpacts(actor.spec.id);
      releaseConfrontation(actor.spec.id);
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
      key={actor.spec.id}
      ref={(node) => { actor.body = node; }}
      // Kinematic rather than fixed: a pelted vendor leaves his cart to
      // complain, and his collider has to go with him.
      type="kinematicPosition"
      colliders={false}
      position={[actor.spec.position[0], actor.spec.position[1], actor.spec.position[2]]}
      userData={{ gameKind: 'pedestrian', actorId: actor.spec.id }}
    >
      <primitive object={actor.wrapper} />
      <CapsuleCollider args={[0.5, 0.26]} position={[0, 0.82, 0]} />
    </RigidBody>
  ));
}

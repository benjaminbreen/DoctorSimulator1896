import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { gameDebug } from '../debug.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import { clearActorImpacts, takeActorImpacts } from '../world/actorImpacts.js';
import {
  confrontationFor,
  provokeConfrontation,
  releaseConfrontation,
  stepConfrontation,
} from '../world/confrontation.js';
import { hashString } from '../world/npcIdentity.js';
import {
  SAILOR_BOY_CAROUSEL_LOOK_AT,
  SAILOR_BOY_MODEL_FILE,
  SAILOR_BOY_MOTION_FILE,
  SAILOR_BOY_POND_LOOK_AT,
  SAILOR_BOY_RUN_SPEED,
  sailorBoyBehaviorState,
  sailorBoyGroundY,
  sailorBoyRoutePoint,
} from '../world/sailorBoy.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { fadeInAction } from './characterGestures.js';

const ACTOR_ID = 'gapstow-sailor-boy';
const BOY_SCALE = 1.22;
const ACTION_BLEND = 0.2;
const LOOPING_ACTIONS = new Set(['SailorBoyIdle', 'Running']);

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function playState(actor, key, state) {
  if (actor.animationKey === key) return;
  actor.animationKey = key;
  if (state.holdPose) return;
  const previous = actor.action;
  const action = actor.actions[state.animation] ?? actor.actions.SailorBoyIdle;
  action.reset();
  action.clampWhenFinished = !LOOPING_ACTIONS.has(state.animation);
  if (state.reverse) {
    action.setLoop(THREE.LoopOnce, 1);
    action.time = action.getClip().duration;
    action.setEffectiveTimeScale(-1);
  } else {
    const looping = LOOPING_ACTIONS.has(state.animation);
    action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
    action.setEffectiveTimeScale(1);
  }
  previous?.fadeOut(ACTION_BLEND);
  // Through fadeInAction: a clip returned to after its fade-out completed is
  // disabled, and would otherwise stay at zero weight in the bind pose.
  fadeInAction(action, ACTION_BLEND);
  actor.action = action;
  actor.mixer.update(0);
}

export default function SailorBoy() {
  const modelGltf = useLoader(GLTFLoader, SAILOR_BOY_MODEL_FILE, withMeshopt);
  const motionGltf = useLoader(GLTFLoader, SAILOR_BOY_MOTION_FILE, withMeshopt);
  const actor = useMemo(() => {
    const wrapper = new THREE.Group();
    const figure = cloneSkeleton(modelGltf.scene);
    figure.name = ACTOR_ID;
    figure.scale.setScalar(BOY_SCALE);
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
    const clips = [...modelGltf.animations, ...motionGltf.animations];
    const mixer = new THREE.AnimationMixer(figure);
    const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const action = actions.SailorBoyIdle ?? mixer.clipAction(clips[0]);
    action.setLoop(THREE.LoopRepeat, Infinity).play();
    const initialBehavior = sailorBoyBehaviorState(0);
    const [x, z, dx, dz] = sailorBoyRoutePoint(initialBehavior.distance);
    wrapper.rotation.y = Math.atan2(dx, dz);
    return {
      wrapper,
      figure,
      mixer,
      actions,
      action,
      animationKey: null,
      worldX: x,
      worldZ: z,
      velocity: [0, 0],
      body: null,
    };
  }, [modelGltf, motionGltf]);

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.1);
    const now = state.clock.elapsedTime;
    const behavior = sailorBoyBehaviorState(now);
    const [x, z, dx, dz] = sailorBoyRoutePoint(behavior.distance);
    actor.worldX = x;
    actor.worldZ = z;

    if (behavior.moving) {
      actor.wrapper.rotation.y = Math.atan2(
        dx * behavior.direction,
        dz * behavior.direction,
      );
      const length = Math.hypot(dx, dz) || 1;
      actor.velocity[0] = (dx / length) * SAILOR_BOY_RUN_SPEED * behavior.direction;
      actor.velocity[1] = (dz / length) * SAILOR_BOY_RUN_SPEED * behavior.direction;
    } else {
      actor.velocity[0] = 0;
      actor.velocity[1] = 0;
      if (behavior.facePond) {
        actor.wrapper.rotation.y = Math.atan2(
          SAILOR_BOY_POND_LOOK_AT[0] - actor.worldX,
          SAILOR_BOY_POND_LOOK_AT[1] - actor.worldZ,
        );
      } else if (behavior.faceCarousel) {
        actor.wrapper.rotation.y = Math.atan2(
          SAILOR_BOY_CAROUSEL_LOOK_AT[0] - actor.worldX,
          SAILOR_BOY_CAROUSEL_LOOK_AT[1] - actor.worldZ,
        );
      }
    }

    // Hit by a thrown object, he stops playing and comes to say so.
    for (const impact of takeActorImpacts(ACTOR_ID)) {
      if (impact.cause !== 'projectile') continue;
      provokeConfrontation(ACTOR_ID, {
        itemLabel: impact.itemLabel,
        archetype: 'b',
        name: 'A boy in a sailor suit',
        dialogueId: ACTOR_ID,
        now,
      });
    }
    const player = gameDebug.player.position;
    const march = confrontationFor(ACTOR_ID)
      ? stepConfrontation(ACTOR_ID, {
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
      actor.wrapper.rotation.y = march.yaw;
      actor.velocity[0] = 0;
      actor.velocity[1] = 0;
      playState(actor, `confront:${march.phase}`, {
        animation: march.walking ? 'Running' : 'SailorBoyIdle',
      });
    } else {
      if (actor.confronted) releaseConfrontation(ACTOR_ID);
      playState(actor, behavior.phase, behavior);
    }
    actor.confronted = Boolean(march);
    actor.mixer.update(step);
    actor.figure.rotation.x = 0;
    actor.figure.rotation.z = 0;
    const ground = sailorBoyGroundY(actor.worldX, actor.worldZ);
    actor.body?.setNextKinematicTranslation({ x: actor.worldX, y: ground, z: actor.worldZ });
    reportAgent(ACTOR_ID, actor.worldX, actor.worldZ, 0.34, {
      kind: 'pedestrian',
      gender: 'male',
      velocity: [...actor.velocity],
      dialogueId: ACTOR_ID,
      dialogueName: 'A boy in a sailor suit',
      dialogueContext: {
        archetype: 'b',
        role: 'play',
        activity: 'walking',
        seed: hashString(ACTOR_ID),
      },
    });
  });

  useEffect(() => () => {
    removeAgent(ACTOR_ID);
    clearActorImpacts(ACTOR_ID);
    releaseConfrontation(ACTOR_ID);
    actor.mixer.stopAllAction();
    actor.figure.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }, [actor]);

  const ground = sailorBoyGroundY(actor.worldX, actor.worldZ);
  return (
    <RigidBody
      ref={(node) => { actor.body = node; }}
      type="kinematicPosition"
      colliders={false}
      position={[actor.worldX, ground, actor.worldZ]}
      userData={{ gameKind: 'pedestrian', actorId: ACTOR_ID }}
    >
      <primitive object={actor.wrapper} />
      <CapsuleCollider args={[0.35, 0.22]} position={[0, 0.58, 0]} />
    </RigidBody>
  );
}

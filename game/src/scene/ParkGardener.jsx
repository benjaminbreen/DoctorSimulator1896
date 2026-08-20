import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { gameDebug } from '../debug.js';
import { inPlantedBed } from '../world/groundCover.js';
import { raiseBedReprimand } from '../world/outcry.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import { clearActorImpacts, takeActorImpacts } from '../world/actorImpacts.js';
import {
  confrontationFor,
  provokeConfrontation,
  releaseConfrontation,
  stepConfrontation,
} from '../world/confrontation.js';
import {
  PARK_GARDENER_MODEL_FILE,
  PARK_GARDENER_MOTION_FILE,
  parkGardenerScheduleState,
} from '../world/parkGardener.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { fadeInAction } from './characterGestures.js';
import { updateNpcAnimation } from './npcAnimationThrottle.js';
import { findMixamoBone } from './walkingStick.js';
import { buildWateringCan } from './wateringCan.js';
import { figureHeight } from '../world/figureHeights.js';

const NPC_SCALE = figureHeight('park-gardener');
const ACTOR_ID = 'scheduled-central-park-gardener';
const LOOPING_ACTIONS = new Set([
  'GardenerIdle', 'Walking', 'WalkingCarry', 'Watering', 'DigAndPlantSeeds', 'BenchRest',
]);
const ACTION_BLEND_SECONDS = 0.28;
// Close enough that he can see whose feet are in the bed.
const BED_EARSHOT = 16;
const BED_GAP = 45;

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function setAnimation(actor, state) {
  if (actor.phase === state.phase) return;
  actor.phase = state.phase;
  const previous = actor.action;
  const action = actor.actions[state.animation] ?? actor.actions.GardenerIdle;
  action.reset();
  action.clampWhenFinished = !LOOPING_ACTIONS.has(state.animation);
  if (state.reverse) {
    action.setLoop(THREE.LoopOnce, 1);
    action.time = action.getClip().duration;
    action.setEffectiveTimeScale(-1);
  } else {
    action.setEffectiveTimeScale(1);
    action.setLoop(
      LOOPING_ACTIONS.has(state.animation) ? THREE.LoopRepeat : THREE.LoopOnce,
      LOOPING_ACTIONS.has(state.animation) ? Infinity : 1,
    );
  }
  previous?.fadeOut(ACTION_BLEND_SECONDS);
  // Through fadeInAction: a clip returned to after its fade-out completed is
  // disabled, and would otherwise stay at zero weight in the bind pose.
  fadeInAction(action, ACTION_BLEND_SECONDS);
  actor.action = action;
  actor.mixer.update(0);
}

export default function ParkGardener({ runtime }) {
  const modelGltf = useLoader(GLTFLoader, PARK_GARDENER_MODEL_FILE, withMeshopt);
  const motionGltf = useLoader(GLTFLoader, PARK_GARDENER_MOTION_FILE, withMeshopt);
  const actor = useMemo(() => {
    const wrapper = new THREE.Group();
    const figure = cloneSkeleton(modelGltf.scene);
    figure.name = ACTOR_ID;
    figure.scale.setScalar(NPC_SCALE);
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
    const wateringCan = buildWateringCan();
    wrapper.add(wateringCan.group);
    const hand = findMixamoBone(figure, 'RightHand');
    const clips = [...modelGltf.animations, ...motionGltf.animations];
    const mixer = new THREE.AnimationMixer(figure);
    const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const action = actions.GardenerIdle ?? mixer.clipAction(clips[0]);
    action.setLoop(THREE.LoopRepeat, Infinity).play();
    return {
      wrapper,
      figure,
      wateringCan,
      hand,
      mixer,
      actions,
      action,
      phase: null,
      body: null,
      marchX: null,
      marchZ: null,
      nextBedWordAt: 0,
    };
  }, [modelGltf, motionGltf]);

  const animationFrame = useRef(0);
  useFrame((_, delta) => {
    animationFrame.current += 1;
    const step = Math.min(delta, 0.1);
    const state = parkGardenerScheduleState(runtime.values.timeOfDay);

    // Being pelted takes him off the beds: he walks over and objects, then
    // the schedule picks him back up wherever it had reached.
    for (const impact of takeActorImpacts(ACTOR_ID)) {
      if (impact.cause !== 'projectile') continue;
      provokeConfrontation(ACTOR_ID, {
        itemLabel: impact.itemLabel,
        kind: 'gardener',
        name: 'The park keeper',
        dialogueId: 'park-keeper',
        now: performance.now() / 1000,
      });
    }
    const player = gameDebug.player.position;
    const march = state.active && confrontationFor(ACTOR_ID)
      ? stepConfrontation(ACTOR_ID, {
        x: actor.marchX ?? state.position[0],
        z: actor.marchZ ?? state.position[2],
        playerX: player[0],
        playerZ: player[2],
        delta,
        now: performance.now() / 1000,
      })
      : null;
    if (march) {
      actor.marchX = march.x;
      actor.marchZ = march.z;
      setAnimation(actor, {
        phase: `confront:${march.phase}`,
        animation: march.walking ? 'Walking' : 'StandingArguing',
      });
    } else {
      if (actor.marchX !== null) releaseConfrontation(ACTOR_ID);
      actor.marchX = null;
      actor.marchZ = null;
      setAnimation(actor, state);
    }
    const actorX = march ? march.x : state.position[0];
    const actorZ = march ? march.z : state.position[2];
    updateNpcAnimation(
      actor,
      step,
      (actorX - player[0]) ** 2 + (actorZ - player[2]) ** 2,
      animationFrame.current,
      0,
      state.active,
    );
    actor.wrapper.visible = state.active;
    actor.wrapper.rotation.y = march ? march.yaw : state.yaw;
    actor.figure.rotation.x = 0;
    actor.figure.rotation.z = 0;
    actor.wateringCan.group.visible = state.active && state.carryingCan && !march;
    actor.body?.setNextKinematicTranslation({
      x: march ? march.x : state.position[0],
      y: state.position[1],
      z: march ? march.z : state.position[2],
    });
    // Standing in his planting where he can see you is the one rule he keeps.
    if (state.active && !march) {
      const clock = performance.now() / 1000;
      const x = state.position[0];
      const z = state.position[2];
      if (clock >= actor.nextBedWordAt
        && Math.hypot(player[0] - x, player[2] - z) <= BED_EARSHOT
        && inPlantedBed(player[0], player[2])) {
        actor.nextBedWordAt = clock + BED_GAP;
        raiseBedReprimand({ anchorId: ACTOR_ID, seed: Math.round(clock) });
      }
    }
    if (state.active) {
      const moving = state.moving === true;
      reportAgent(ACTOR_ID, march ? march.x : state.position[0], march ? march.z : state.position[2], 0.44, {
        kind: 'gardener',
        gender: 'male',
        dialogueId: 'park-keeper',
        dialogueName: 'The park keeper',
        // Procedural identity: same seed all playthrough, rerolled next one.
        dialogueContext: {
          archetype: 'g',
          role: 'keeper',
          activity: state.animation === 'BenchRest' ? 'resting' : 'working',
          hour: runtime.values.timeOfDay,
          place: runtime.values.zone,
          seed: 7,
        },
        velocity: moving
          ? [Math.sin(state.yaw) * 1.3, Math.cos(state.yaw) * 1.3]
          : [0, 0],
      });
    } else {
      removeAgent(ACTOR_ID);
    }
    actor.wrapper.updateMatrixWorld(true);
    actor.wateringCan.update(actor.hand, actor.wrapper);
  });

  useEffect(() => () => {
    removeAgent(ACTOR_ID);
    clearActorImpacts(ACTOR_ID);
    releaseConfrontation(ACTOR_ID);
    actor.mixer.stopAllAction();
    actor.wateringCan.dispose();
    actor.figure.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }, [actor]);

  const initial = parkGardenerScheduleState(runtime.values.timeOfDay);
  return (
    <RigidBody
      ref={(node) => { actor.body = node; }}
      type="kinematicPosition"
      colliders={false}
      position={initial.position}
      userData={{ gameKind: 'pedestrian', actorId: ACTOR_ID }}
    >
      <primitive object={actor.wrapper} />
      <CapsuleCollider args={[0.55, 0.28]} position={[0, 0.88, 0]} />
    </RigidBody>
  );
}

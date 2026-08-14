import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import {
  PARK_GARDENER_MODEL_FILE,
  PARK_GARDENER_MOTION_FILE,
  parkGardenerScheduleState,
} from '../world/parkGardener.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { findMixamoBone } from './walkingStick.js';
import { buildWateringCan } from './wateringCan.js';

const NPC_SCALE = 1.62;
const ACTOR_ID = 'scheduled-central-park-gardener';
const LOOPING_ACTIONS = new Set([
  'GardenerIdle', 'Walking', 'WalkingCarry', 'Watering', 'DigAndPlantSeeds', 'BenchRest',
]);
const ACTION_BLEND_SECONDS = 0.28;

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
  action.fadeIn(ACTION_BLEND_SECONDS).play();
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
    };
  }, [modelGltf, motionGltf]);

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1);
    const state = parkGardenerScheduleState(runtime.values.timeOfDay);
    setAnimation(actor, state);
    actor.mixer.update(step);
    actor.wrapper.visible = state.active;
    actor.wrapper.rotation.y = state.yaw;
    actor.figure.rotation.x = 0;
    actor.figure.rotation.z = 0;
    actor.wateringCan.group.visible = state.active && state.carryingCan;
    actor.body?.setNextKinematicTranslation({
      x: state.position[0], y: state.position[1], z: state.position[2],
    });
    if (state.active) {
      const moving = state.moving === true;
      reportAgent(ACTOR_ID, state.position[0], state.position[2], 0.44, {
        kind: 'gardener',
        gender: 'male',
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

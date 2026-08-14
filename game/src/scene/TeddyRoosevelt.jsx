import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { removeAgent, reportAgent } from '../world/agents.js';
import {
  TEDDY_ROOSEVELT_MODEL_FILE,
  TEDDY_ROOSEVELT_MOTION_FILE,
  rooseveltScheduleState,
  rooseveltSpeechMotion,
  rooseveltSpeechPause,
} from '../world/teddyRoosevelt.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';

const NPC_SCALE = 1.62;
const SOAPBOX_HEIGHT = 0.26;
const ACTOR_ID = 'scheduled-theodore-roosevelt';

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function soapbox() {
  const group = new THREE.Group();
  const timber = new THREE.MeshStandardMaterial({ color: '#705039', roughness: 0.88 });
  const darkTimber = new THREE.MeshStandardMaterial({ color: '#493326', roughness: 0.92 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 0.84), timber);
  top.position.y = 0.2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.16, 0.72), darkTimber);
  base.position.y = 0.08;
  const slatGeometry = new THREE.BoxGeometry(1.22, 0.035, 0.055);
  const slats = [-0.27, 0, 0.27].map((z) => {
    const slat = new THREE.Mesh(slatGeometry, timber);
    slat.position.set(0, 0.272, z);
    group.add(slat);
    return slat;
  });
  group.add(base, top);
  for (const mesh of [base, top, ...slats]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  return {
    group,
    dispose() {
      base.geometry.dispose();
      top.geometry.dispose();
      slatGeometry.dispose();
      timber.dispose();
      darkTimber.dispose();
    },
  };
}

function setBaseAnimation(actor, name) {
  if (actor.baseName === name && actor.base?.isRunning()) return;
  actor.active?.stop();
  actor.active = null;
  actor.activeName = null;
  actor.base?.stop();
  actor.base = actor.actions[name] ?? actor.actions.RooseveltIdle;
  actor.baseName = name;
  actor.base.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  actor.mixer.update(0);
}

function beginSpeech(actor, phase, now) {
  const name = rooseveltSpeechMotion(actor.speechIndex);
  const action = actor.actions[name];
  if (!action) return false;
  actor.base.fadeOut(0.16);
  action.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.12).play();
  action.clampWhenFinished = true;
  actor.active = action;
  actor.activeName = name;
  actor.speechUntil = now + action.getClip().duration + 0.08;
  actor.speechIndex += 1;
  actor.nextSpeechPause = rooseveltSpeechPause(phase, actor.speechIndex);
  return true;
}

export default function TeddyRoosevelt({ runtime }) {
  const modelGltf = useLoader(GLTFLoader, TEDDY_ROOSEVELT_MODEL_FILE, withMeshopt);
  const motionGltf = useLoader(GLTFLoader, TEDDY_ROOSEVELT_MOTION_FILE, withMeshopt);
  const zone = runtime.values.zone;
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
    const box = soapbox();
    wrapper.add(box.group, figure);
    const clips = [...modelGltf.animations, ...motionGltf.animations];
    const mixer = new THREE.AnimationMixer(figure);
    const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const base = actions.RooseveltIdle ?? mixer.clipAction(clips[0]);
    base.setLoop(THREE.LoopRepeat, Infinity).play();
    return {
      wrapper,
      figure,
      box,
      mixer,
      actions,
      base,
      baseName: 'RooseveltIdle',
      active: null,
      activeName: null,
      phase: null,
      speechIndex: 0,
      speechUntil: 0,
      nextSpeechAt: 0,
      nextSpeechPause: 8,
      body: null,
    };
  }, [modelGltf, motionGltf]);

  const elapsed = useRef(0);
  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1);
    elapsed.current += step;
    const now = elapsed.current;
    const state = rooseveltScheduleState(runtime.values.timeOfDay, zone);
    actor.mixer.update(step);
    actor.wrapper.visible = state.active;
    actor.box.group.visible = state.active && state.hasSoapbox;
    actor.figure.position.y = state.hasSoapbox ? SOAPBOX_HEIGHT : 0;
    actor.figure.rotation.x = 0;
    actor.figure.rotation.z = 0;

    if (actor.phase !== state.phase) {
      actor.phase = state.phase;
      actor.nextSpeechAt = now + (state.phase === 'cop-cot-speech' ? 0.4 : 5.5);
      setBaseAnimation(actor, state.baseAnimation);
    }

    if (actor.active && now >= actor.speechUntil) {
      restoreLoopingIdle(actor.mixer, actor.base, actor.active);
      actor.active = null;
      actor.activeName = null;
      actor.nextSpeechAt = now + actor.nextSpeechPause;
    }
    const conversational = state.phase === 'talking-with-dandy'
      || state.phase === 'metropolitan-club';
    if (
      state.active
      && state.baseAnimation !== 'Walking'
      && !actor.active
      && now >= actor.nextSpeechAt
      && (state.phase === 'cop-cot-speech' || conversational)
    ) beginSpeech(actor, state.phase, now);

    actor.wrapper.rotation.y = state.yaw;
    actor.body?.setNextKinematicTranslation({
      x: state.position[0],
      y: state.position[1],
      z: state.position[2],
    });
    if (state.active) {
      reportAgent(ACTOR_ID, state.position[0], state.position[2], 0.48, {
        kind: 'pedestrian', gender: 'male', velocity: state.baseAnimation === 'Walking'
          ? [Math.sin(state.yaw) * 1.3, Math.cos(state.yaw) * 1.3]
          : [0, 0],
      });
    } else {
      removeAgent(ACTOR_ID);
    }
  });

  useEffect(() => () => {
    removeAgent(ACTOR_ID);
    actor.mixer.stopAllAction();
    actor.box.dispose();
    actor.figure.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose?.());
    });
  }, [actor]);

  const initial = rooseveltScheduleState(runtime.values.timeOfDay, zone);
  return (
    <RigidBody
      ref={(node) => { actor.body = node; }}
      type="kinematicPosition"
      colliders={false}
      position={initial.position}
      userData={{ gameKind: 'pedestrian', actorId: ACTOR_ID }}
    >
      <primitive object={actor.wrapper} />
      <CapsuleCollider args={[0.61, 0.3]} position={[0, 1.02, 0]} />
    </RigidBody>
  );
}

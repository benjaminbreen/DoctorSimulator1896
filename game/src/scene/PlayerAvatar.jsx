import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { gameDebug } from '../debug.js';
import { getPlayer } from '../world/player.js';
import { REACTION_MOTION, REACTION_PHASE } from '../world/actorReactions.js';
import { getInteraction } from '../world/interaction.js';
import {
  getThrowablePlay,
  subscribeThrowablePlay,
  THROWABLE_PICKUP_SECONDS,
  THROWABLE_PICKUP_TRANSFER,
  THROWABLE_RELEASE_DELAY,
} from '../world/throwablePlay.js';
import { throwableDefinition } from '../world/throwables.js';
import ThrowableVisual from './ThrowableVisual.jsx';
import { normalizeNonmetallicCharacterMaterials } from './characterMaterials.js';
import { BOARDING_CLIMB_SECONDS } from '../world/carriageBoarding.js';
import { playerAvatarUrl } from './playerModel.js';

// The rigged player: a Tripo-authored figure with Mixamo idle and walk clips,
// assembled by scripts/characters/export_tripo_player.py.
// Mounted OUTSIDE the RigidBody — suspending a loader inside the physics
// subtree crashed React's dev logging on the model's circular scene graph — so
// it follows the capsule from the debug handle instead of being parented to it.
const MODEL = playerAvatarUrl();

// Ground the Mixamo walk covers per second at timeScale 1. Playback scales
// with real speed so the feet roughly keep up, but the game's walk is far
// faster than a person's, so the ratio is capped low: an ambling stride that
// slides a little reads better than legs pumping at double speed.
const CLIP_SPEED = 1.4;
const MAX_PLAYBACK = 1.3;
const RUN_CLIP_SPEED = 3.2;
const MAX_RUN_PLAYBACK = 1.3;
// CarryWalk is a deliberately careful 2.9s cycle; speed it up enough to keep
// its feet near the game pace without losing the weighted, two-handed read.
const CARRY_WALK_CLIP_SPEED = 1.8;
const MAX_CARRY_WALK_PLAYBACK = 2.4;
// Below this the figure stands still rather than shuffling in place.
const MOVING = 0.25;
// Mixamo's FBX importer leaves this Tripo mesh lying along +Z. Stand it up
// before measuring it; otherwise its body thickness is mistaken for height.
const MODEL_UP = -Math.PI / 2;
// The Mixamo rig faces +Z; the game's yaw 0 faces -Z (see camera/cameraMath.js).
const FACING = Math.PI;
const THROW_PLAYBACK = 2.5;
const PICKUP_PLAYBACK = 1.6;
const handPosition = new THREE.Vector3();
const leftHandPosition = new THREE.Vector3();
const rightFingerPosition = new THREE.Vector3();
const leftFingerPosition = new THREE.Vector3();
const gripPosition = new THREE.Vector3();
const rightGripPosition = new THREE.Vector3();
const rightThrowGripPosition = new THREE.Vector3();
const leftGripPosition = new THREE.Vector3();
const gripDirection = new THREE.Vector3();
const handRotation = new THREE.Quaternion();
const heldOffset = new THREE.Vector3();

function findMixamoBone(root, boneName) {
  const normalizedTarget = `mixamorig${boneName}`.toLowerCase();
  let match = null;
  root.traverse((object) => {
    if (match || !object.isBone) return;
    const normalized = object.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (normalized === normalizedTarget) match = object;
  });
  return match;
}

export default function PlayerAvatar({ runtime, onReady }) {
  const groupRef = useRef();
  const heldObjectRef = useRef();
  const [heldType, setHeldType] = useState(() => getThrowablePlay().heldType);
  const gltf = useLoader(GLTFLoader, MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));

  // The master figure is 1.80m; the capsule it stands in is shorter. Match the
  // collider, so what you walk into is what you see.
  const capsuleHeight = 2 * (runtime.values.capsuleHalfHeight + runtime.values.capsuleRadius);

  const {
    scene, mixer, idle, walk, run, carryIdle, carryWalk, carryRun, throwReady,
    jump, standingJump, smoking, throwAction, pickUpAction,
    climbCarriage,
    edgeSlip, fallShoulder, fallGeneric, fallenIdle, riseFromFall,
    rightHand, leftHand, rightMiddle, leftMiddle, fit,
  } = useMemo(() => {
    // Used as loaded, not cloned: Object3D.clone leaves a SkinnedMesh bound to
    // the original bones, so the copy renders in bind pose while the clip
    // plays on bones nothing is skinned to. There is only ever one player.
    const root = gltf.scene;
    root.rotation.x = MODEL_UP;
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      object.userData = {};
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // A skinned figure's bounds are its bind pose, which the walk leaves.
      object.frustumCulled = false;
    });
    normalizeNonmetallicCharacterMaterials(root);
    const animations = new THREE.AnimationMixer(root);
    const clip = (name) => {
      const found = gltf.animations.find((entry) => entry.name === name);
      return found ? animations.clipAction(found) : null;
    };
    const bounds = new THREE.Box3().setFromObject(root);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    return {
      scene: root,
      mixer: animations,
      idle: clip('StandingIdle'),
      walk: clip('Walk'),
      run: clip('Run'),
      carryIdle: clip('CarryIdle'),
      carryWalk: clip('CarryWalk'),
      carryRun: clip('CarryRun'),
      throwReady: clip('ThrowReady'),
      jump: clip('Jump'),
      standingJump: clip('StandingJump'),
      smoking: clip('Smoking'),
      throwAction: clip('Throw'),
      pickUpAction: clip('PickUp'),
      climbCarriage: clip('ClimbCarriage'),
      edgeSlip: clip('EdgeSlip'),
      fallShoulder: clip('FallShoulder'),
      fallGeneric: clip('FallGeneric'),
      fallenIdle: clip('FallenIdle'),
      riseFromFall: clip('RiseFromFall'),
      // GLTFLoader removes punctuation from node names, while Blender and the
      // source FBX preserve the colon. Match the semantic bone either way.
      rightHand: findMixamoBone(root, 'RightHand'),
      leftHand: findMixamoBone(root, 'LeftHand'),
      rightMiddle: findMixamoBone(root, 'RightHandMiddle1'),
      leftMiddle: findMixamoBone(root, 'LeftHandMiddle1'),
      fit: capsuleHeight / height,
    };
  }, [gltf, capsuleHeight]);

  // The opium ritual needs the rig from outside: OpiumRitual hangs the pipe
  // from the hand bone and paces its smoke to the clip's own time.
  useEffect(() => {
    gameDebug.avatarRoot = scene;
    gameDebug.smokingAction = smoking;
    return () => {
      if (gameDebug.avatarRoot === scene) gameDebug.avatarRoot = null;
      if (gameDebug.smokingAction === smoking) gameDebug.smokingAction = null;
    };
  }, [scene, smoking]);

  useEffect(() => {
    idle?.play();
    walk?.play().setEffectiveWeight(0);
    run?.play().setEffectiveWeight(0);
    carryIdle?.play().setEffectiveWeight(0);
    carryWalk?.play().setEffectiveWeight(0);
    carryRun?.play().setEffectiveWeight(0);
    throwReady?.play().setEffectiveWeight(0);
    for (const action of [
      jump, standingJump, throwAction, pickUpAction, climbCarriage,
      edgeSlip, fallShoulder, fallGeneric, riseFromFall,
    ]) {
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    }
    fallenIdle?.setLoop(THREE.LoopRepeat, Infinity);
    return () => mixer.stopAllAction();
  }, [
    mixer, idle, walk, run, carryIdle, carryWalk, carryRun, throwReady,
    jump, standingJump, throwAction, pickUpAction, climbCarriage,
    edgeSlip, fallShoulder, fallGeneric, fallenIdle, riseFromFall,
  ]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  // Object type changes only on pickup and release. Charge updates still
  // publish for the HUD, but React bails out on this unchanged string.
  useEffect(() => subscribeThrowablePlay((next) => setHeldType(next.heldType)), []);

  const wasGrounded = useRef(false);
  const activeJump = useRef(null);
  const wasSmoking = useRef(false);
  const activeThrow = useRef(false);
  const lastThrowSerial = useRef(0);
  const wasPreparingThrow = useRef(false);
  const activePickup = useRef(false);
  const lastPickupSerial = useRef(0);
  const activeReaction = useRef(null);
  const activeReactionKey = useRef('normal');
  const activeClimb = useRef(false);
  const lastClimbSerial = useRef(0);
  const wasShotPose = useRef(false);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const [x, y, z] = gameDebug.player.position;
    // Visibility is independent of animation state. Architecture and
    // shot-only-subject compositions deliberately hide the player without
    // entering the player's still-pose branch.
    group.visible = gameDebug.player.visible !== false;

    // Composition search teleports the real player for every candidate. Lock
    // it to one reproducible, quiet standing pose instead of letting the
    // locomotion state machine interpret those teleports as jumps or falls.
    const shotPose = gameDebug.shotPose === 'still';
    if (shotPose) {
      if (!wasShotPose.current) {
        for (const action of [
          walk, run, carryIdle, carryWalk, carryRun, throwReady,
          jump, standingJump, smoking, throwAction, pickUpAction,
          climbCarriage, edgeSlip, fallShoulder, fallGeneric, fallenIdle,
          riseFromFall,
        ]) action?.stop();
        activeJump.current = null;
        activeReaction.current = null;
        activeThrow.current = false;
        activePickup.current = false;
        activeClimb.current = false;
        idle?.reset().setEffectiveWeight(1).play();
        if (idle) {
          idle.time = Math.min(0.65, idle.getClip().duration * 0.35);
          idle.paused = true;
        }
        mixer.update(0);
      }
      wasShotPose.current = true;
      wasGrounded.current = true;
      group.position.set(x, y, z);
      group.rotation.y = gameDebug.player.yaw + FACING;
      if (heldObjectRef.current) heldObjectRef.current.visible = false;
      group.updateMatrixWorld(true);
      return;
    }
    if (wasShotPose.current) {
      wasShotPose.current = false;
      if (idle) idle.paused = false;
      idle?.play().setEffectiveWeight(1);
      walk?.play().setEffectiveWeight(0);
      run?.play().setEffectiveWeight(0);
      carryIdle?.play().setEffectiveWeight(0);
      carryWalk?.play().setEffectiveWeight(0);
      carryRun?.play().setEffectiveWeight(0);
      throwReady?.play().setEffectiveWeight(0);
    }

    const reaction = getPlayer().reaction;
    const reactionBusy = reaction.phase !== REACTION_PHASE.NORMAL;
    const reactionKey = `${reaction.phase}:${reaction.variant ?? ''}`;
    if (reactionKey !== activeReactionKey.current) {
      activeReactionKey.current = reactionKey;
      activeReaction.current?.fadeOut(0.1);
      activeReaction.current = null;
      if (reactionBusy) {
        const actions = {
          edgeSlip,
          fallShoulder,
          fallGeneric,
          prone: fallenIdle,
          rise: riseFromFall,
        };
        const action = actions[reaction.variant];
        if (action) {
          const timeScale = REACTION_MOTION[reaction.variant]?.timeScale ?? 1;
          action.reset().setEffectiveTimeScale(timeScale).fadeIn(0.08).play();
          activeReaction.current = action;
        }
      }
      if (reactionBusy) {
        activeJump.current?.fadeOut(0.08);
        activeJump.current = null;
        throwAction?.fadeOut(0.08);
        pickUpAction?.fadeOut(0.08);
        activeThrow.current = false;
        activePickup.current = false;
      }
    }

    // The smoking ritual owns the body while it runs: locomotion weights go
    // to zero and the loop crossfades in and out on the transitions.
    const ritual = getInteraction().using?.id === 'smoke-pipe';
    if (smoking && ritual !== wasSmoking.current) {
      wasSmoking.current = ritual;
      if (ritual) smoking.reset().fadeIn(0.45).play();
      else smoking.fadeOut(0.6);
    }

    const throwPlay = getThrowablePlay();
    const preparingThrow = throwPlay.phase === 'charging';
    if (throwReady && preparingThrow !== wasPreparingThrow.current) {
      wasPreparingThrow.current = preparingThrow;
      if (preparingThrow) throwReady.reset().setEffectiveWeight(0).play();
    }
    if (pickUpAction && throwPlay.pickupSerial !== lastPickupSerial.current) {
      lastPickupSerial.current = throwPlay.pickupSerial;
      activePickup.current = true;
      activeJump.current?.fadeOut(0.08);
      activeJump.current = null;
      pickUpAction.reset().setEffectiveTimeScale(PICKUP_PLAYBACK).fadeIn(0.1).play();
    }
    if (climbCarriage && gameDebug.player.climbSerial !== lastClimbSerial.current) {
      lastClimbSerial.current = gameDebug.player.climbSerial;
      activeClimb.current = true;
      activeJump.current?.fadeOut(0.08);
      activeJump.current = null;
      climbCarriage.reset()
        .setEffectiveTimeScale(climbCarriage.getClip().duration / BOARDING_CLIMB_SECONDS)
        .fadeIn(0.1)
        .play();
    }
    if (activeClimb.current && !gameDebug.player.climbing) {
      climbCarriage?.fadeOut(0.12);
      activeClimb.current = false;
    }
    if (throwAction && throwPlay.throwSerial !== lastThrowSerial.current) {
      lastThrowSerial.current = throwPlay.throwSerial;
      activeThrow.current = true;
      activeJump.current?.fadeOut(0.08);
      activeJump.current = null;
      throwAction.reset().setEffectiveTimeScale(THROW_PLAYBACK).fadeIn(0.08).play();
    }

    // Speed from the rig's published velocity, not finite-differenced
    // position: physics can step zero times on a >60Hz frame, and a repeated
    // position reads as speed 0, flapping the blend weights every other frame.
    const velocity = gameDebug.player.velocity;
    const speed = Math.hypot(velocity[0], velocity[2]);

    const grounded = gameDebug.player.grounded;
    const moving = speed > MOVING;
    const running = grounded && moving && gameDebug.player.running;
    if (!reactionBusy && !grounded && wasGrounded.current) {
      const selected = moving ? jump : standingJump;
      activeJump.current?.stop();
      activeJump.current = selected;
      selected?.reset().fadeIn(0.08).play();
    } else if (grounded && !wasGrounded.current && activeJump.current) {
      activeJump.current.fadeOut(0.12);
      activeJump.current = null;
    }
    wasGrounded.current = grounded;

    if (walk && idle && run && carryIdle && carryWalk && carryRun && throwReady) {
      // Crossfade by hand because the weights follow continuously changing
      // movement speed rather than a single state transition.
      const carrying = throwPlay.phase === 'held';
      const busy = reactionBusy || ritual || activeThrow.current || activePickup.current || activeClimb.current;
      const occupied = carrying || preparingThrow;
      const idleTarget = grounded && !moving && !occupied && !busy ? 1 : 0;
      const walkTarget = grounded && moving && !running && !occupied && !busy ? 1 : 0;
      const runTarget = running && !occupied && !busy ? 1 : 0;
      const carryIdleTarget = grounded && !moving && carrying && !busy ? 1 : 0;
      const carryWalkTarget = grounded && moving && !running && carrying && !busy ? 1 : 0;
      const carryRunTarget = running && carrying && !busy ? 1 : 0;
      const throwReadyTarget = grounded && preparingThrow && !busy ? 1 : 0;
      idle.setEffectiveWeight(
        THREE.MathUtils.damp(idle.getEffectiveWeight(), idleTarget, 12, delta),
      );
      walk.setEffectiveWeight(
        THREE.MathUtils.damp(walk.getEffectiveWeight(), walkTarget, 12, delta),
      );
      run.setEffectiveWeight(
        THREE.MathUtils.damp(run.getEffectiveWeight(), runTarget, 12, delta),
      );
      carryIdle.setEffectiveWeight(
        THREE.MathUtils.damp(carryIdle.getEffectiveWeight(), carryIdleTarget, 12, delta),
      );
      carryWalk.setEffectiveWeight(
        THREE.MathUtils.damp(carryWalk.getEffectiveWeight(), carryWalkTarget, 12, delta),
      );
      carryRun.setEffectiveWeight(
        THREE.MathUtils.damp(carryRun.getEffectiveWeight(), carryRunTarget, 12, delta),
      );
      throwReady.setEffectiveWeight(
        THREE.MathUtils.damp(throwReady.getEffectiveWeight(), throwReadyTarget, 12, delta),
      );
      walk.setEffectiveTimeScale(Math.min(MAX_PLAYBACK, Math.max(0.6, speed / CLIP_SPEED)));
      run.setEffectiveTimeScale(
        Math.min(MAX_RUN_PLAYBACK, Math.max(0.75, speed / RUN_CLIP_SPEED)),
      );
      carryWalk.setEffectiveTimeScale(
        Math.min(MAX_CARRY_WALK_PLAYBACK, Math.max(0.7, speed / CARRY_WALK_CLIP_SPEED)),
      );
      carryRun.setEffectiveTimeScale(
        Math.min(MAX_RUN_PLAYBACK, Math.max(0.75, speed / RUN_CLIP_SPEED)),
      );
    }

    group.position.set(x, y, z);
    group.rotation.y = gameDebug.player.yaw + FACING;
    group.visible = gameDebug.player.visible !== false;
    // Match the physics controller's hitch protection. Advancing a one-shot
    // by an entire stalled frame can skip its contact pose and make the body
    // appear to snap between upright, prone, pickup, or climbing states.
    mixer.update(Math.min(delta, 0.1));
    group.updateMatrixWorld(true);

    if (activeThrow.current && throwAction && !throwAction.isRunning()) {
      throwAction.fadeOut(0.14);
      activeThrow.current = false;
    }
    if (
      activePickup.current
      && pickUpAction
      && (!pickUpAction.isRunning() || throwPlay.phase !== 'picking-up')
    ) {
      pickUpAction.fadeOut(0.14);
      activePickup.current = false;
    }

    const heldObject = heldObjectRef.current;
    const definition = throwableDefinition(throwPlay.heldType);
    const carrying = (throwPlay.phase === 'picking-up' && throwPlay.pickupTaken)
      || throwPlay.phase === 'held'
      || throwPlay.phase === 'charging'
      || throwPlay.phase === 'windup';
    if (rightHand) rightHand.getWorldPosition(handPosition);
    else handPosition.set(x, y + 1.2, z);
    if (heldObject) {
      heldObject.visible = carrying && group.visible && Boolean(definition);
      if (heldObject.visible) {
        if (rightHand) rightHand.getWorldQuaternion(handRotation);
        else handRotation.identity();
        rightGripPosition.copy(handPosition);
        if (rightMiddle) {
          rightMiddle.getWorldPosition(rightFingerPosition);
          gripDirection.copy(rightFingerPosition).sub(handPosition).normalize();
          rightGripPosition.copy(rightFingerPosition).addScaledVector(
            gripDirection,
            definition.grip?.clearance ?? 0,
          );
        }
        gripPosition.copy(rightGripPosition);
        if (
          definition.grip?.mode === 'two-hand'
          && rightHand && rightMiddle && leftHand && leftMiddle
        ) {
          rightThrowGripPosition.copy(rightFingerPosition).addScaledVector(
            gripDirection,
            definition.grip.throwClearance ?? 0,
          );
          rightGripPosition.copy(handPosition).lerp(rightFingerPosition, 0.82);
          leftHand.getWorldPosition(leftHandPosition);
          leftMiddle.getWorldPosition(leftFingerPosition);
          // The first finger joints mark the inside of each open hand. Their
          // midpoint stays convincing through carry idle, walk, and run.
          leftGripPosition.copy(leftHandPosition).lerp(leftFingerPosition, 0.82);
          gripPosition.copy(rightGripPosition).lerp(leftGripPosition, 0.5);
          if (throwPlay.phase === 'picking-up') {
            const blend = THREE.MathUtils.smoothstep(
              throwPlay.pickupElapsed,
              THROWABLE_PICKUP_TRANSFER,
              THROWABLE_PICKUP_SECONDS,
            );
            gripPosition.lerp(rightGripPosition, 1 - blend);
          } else if (throwPlay.phase === 'charging') {
            const blend = THREE.MathUtils.smoothstep(throwPlay.charge, 0, 0.16);
            gripPosition.lerp(rightThrowGripPosition, blend);
          } else if (throwPlay.phase === 'windup') {
            const blend = THREE.MathUtils.smoothstep(
              THROWABLE_RELEASE_DELAY - throwPlay.windup,
              0,
              0.18,
            );
            gripPosition.lerp(rightThrowGripPosition, blend);
          }
        }
        heldOffset.set(...(definition.grip?.offset ?? [0, 0, 0])).applyQuaternion(handRotation);
        heldObject.position.copy(gripPosition).add(heldOffset);
        // These current throwables are round, with a stem or crown that
        // should remain upright while the hands move around them.
        heldObject.quaternion.identity();
      }
    }
    const launchPoint = heldObject?.visible ? heldObject.position : handPosition;
    gameDebug.throwableHandPosition[0] = launchPoint.x;
    gameDebug.throwableHandPosition[1] = launchPoint.y;
    gameDebug.throwableHandPosition[2] = launchPoint.z;
  });

  return (
    <>
      <group ref={groupRef} scale={fit}>
        <primitive object={scene} />
      </group>
      <group ref={heldObjectRef} visible={false}>
        <ThrowableVisual type={heldType} />
      </group>
    </>
  );
}

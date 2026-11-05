import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from './modelLoader.js';
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
import { getKTX2Loader } from './ktx2.js';
import { BOARDING_CLIMB_SECONDS } from '../world/carriageBoarding.js';
import { playerAvatarUrl } from './playerModel.js';
import { airborneClipTime, JUMP_CONTACTS, locomotionBlend } from '../movement/playerLocomotion.js';
import { createLadderGrip } from './ladderGrip.js';

// The rigged player: a Tripo-authored figure with Mixamo idle and walk clips,
// assembled by scripts/characters/export_tripo_player.py.
// Mounted OUTSIDE the RigidBody — suspending a loader inside the physics
// subtree crashed React's dev logging on the model's circular scene graph — so
// it follows the capsule from the debug handle instead of being parented to it.
const MODEL = playerAvatarUrl();

// Keep foot speed matched to the tuned walk and run. The old 1.3x ceiling
// made the character slide at even the ordinary walking speed.
const CLIP_SPEED = 1.4;
const RUN_CLIP_SPEED = 3.2;
const MAX_RUN_PLAYBACK = 2.0;
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

function physicsJumpClip(source) {
  const contacts = JUMP_CONTACTS[source.name];
  const result = source.clone();
  const hips = result.tracks.find((track) => /Hips\.position$/.test(track.name));
  if (!hips || !contacts) return result;
  const sample = hips.createInterpolant();
  const takeoff = sample.evaluate(contacts.takeoff)[1];
  const apex = sample.evaluate(contacts.apex)[1];
  const contact = sample.evaluate(contacts.contact)[1];
  const apexFraction = (contacts.apex - contacts.takeoff) / (contacts.contact - contacts.takeoff);
  const height = apex - THREE.MathUtils.lerp(takeoff, contact, apexFraction);
  // Remove the filmed body's airborne arc so it cannot lift the mesh a
  // second time above the capsule. Keep its crouch and landing compression.
  for (let index = 0; index < hips.times.length; index += 1) {
    const time = hips.times[index];
    const phase = time < contacts.apex
      ? (time - contacts.takeoff) / (contacts.apex - contacts.takeoff)
      : (contacts.contact - time) / (contacts.contact - contacts.apex);
    hips.values[index * 3 + 1] -= height * Math.sin(THREE.MathUtils.clamp(phase, 0, 1) * Math.PI / 2);
  }
  return result;
}

function stagedMotion(source, name = source.name) {
  if (name === 'Startle') {
    const clip = THREE.AnimationUtils.subclip(source, name, 22, 51, 30);
    clip.tracks = clip.tracks.filter(({ name }) => /(?:Spine|Shoulder|Arm|Hand|Head|Neck).*\.quaternion$/.test(name));
    return THREE.AnimationUtils.makeClipAdditive(clip);
  }
  const clip = source.clone();
  clip.name = name;
  const hips = clip.tracks.find((track) => /Hips\.position$/.test(track.name));
  if (!hips) return clip;
  const [x, y] = hips.values;
  // Mixamo's new exports carry a taller source pelvis and forward travel.
  // Align the pelvis to the existing body and let the capsule own travel.
  for (let i = 0; i < hips.values.length; i += 3) {
    hips.values[i] = name === 'Ladder' ? x - hips.values[i] + 2.9 : hips.values[i] - x;
    hips.values[i + 1] = (hips.values[i + 1] - y) * (name === 'Vault' ? 0.22 : 1)
      + (name === 'Ladder' ? 56 : 53);
    hips.values[i + 2] = 0.8;
  }
  if (name === 'Ladder') {
    const rotation = clip.tracks.find((track) => /Hips\.quaternion$/.test(track.name));
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const pose = new THREE.Quaternion();
    if (rotation) for (let i = 0; i < rotation.values.length; i += 4) {
      pose.fromArray(rotation.values, i).premultiply(turn).toArray(rotation.values, i);
    }
  }
  return clip;
}

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
  const gl = useThree((state) => state.gl);
  const configure = useCallback((loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(getKTX2Loader(gl));
  }, [gl]);
  const gltf = useLoader(GLTFLoader, MODEL, configure);

  // The master figure is 1.80m; the capsule it stands in is shorter. Match the
  // collider, so what you walk into is what you see.
  const capsuleHeight = 2 * (runtime.values.capsuleHalfHeight + runtime.values.capsuleRadius);

  const {
    scene, mixer, idle, walk, run, carryIdle, carryWalk, carryRun, throwReady,
    jump, standingJump, smoking, throwAction, pickUpAction,
    climbCarriage, ladder, vault, runStop, startle, stumble,
    edgeSlip, fallShoulder, fallGeneric, fallenIdle, riseFromFall,
    rightHand, leftHand, rightMiddle, leftMiddle, fit, ladderGrip,
  } = useMemo(() => {
    // Used as loaded, not cloned: Object3D.clone leaves a SkinnedMesh bound to
    // the original bones, so the copy renders in bind pose while the clip
    // plays on bones nothing is skinned to. There is only ever one player.
    const root = gltf.scene;
    // On zone travel this runs while the shared scene is still attached to
    // the outgoing mount's fit-scaled group, and measuring through that
    // parent bakes the old fit into the new one — the 3-foot-doctor bug.
    root.parent?.remove(root);
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
    root.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.userData.fabricLift) continue;
        material.userData.fabricLift = true;
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
            #include <map_fragment>
            float clothLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float darkCloth = 1.0 - smoothstep(0.015, 0.07, clothLuma);
            diffuseColor.rgb += vec3(0.009, 0.010, 0.012) * darkCloth;
          `);
        };
        material.customProgramCacheKey = () => 'player-dark-fabric-v1';
      }
    });
    const animations = new THREE.AnimationMixer(root);
    const clip = (name) => {
      const found = gltf.animations.find((entry) => entry.name === name);
      return found ? animations.clipAction(JUMP_CONTACTS[name] ? physicsJumpClip(found) : found) : null;
    };
    const stage = (name, source = name) => {
      const found = gltf.animations.find((entry) => entry.name === source);
      return found ? animations.clipAction(stagedMotion(found, name)) : null;
    };
    const bounds = new THREE.Box3().setFromObject(root);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    const rightHand = findMixamoBone(root, 'RightHand');
    const leftHand = findMixamoBone(root, 'LeftHand');
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
      ladder: stage('Ladder', 'ClimbCarriage'),
      vault: stage('Vault'),
      runStop: stage('RunStop'),
      startle: stage('Startle'),
      stumble: stage('Stumble'),
      edgeSlip: clip('EdgeSlip'),
      fallShoulder: clip('FallShoulder'),
      fallGeneric: clip('FallGeneric'),
      fallenIdle: clip('FallenIdle'),
      riseFromFall: clip('RiseFromFall'),
      // GLTFLoader removes punctuation from node names, while Blender and the
      // source FBX preserve the colon. Match the semantic bone either way.
      rightHand,
      leftHand,
      ladderGrip: createLadderGrip(leftHand, rightHand),
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
      jump, standingJump, throwAction, pickUpAction, climbCarriage, ladder, vault, runStop, startle, stumble,
      edgeSlip, fallShoulder, fallGeneric, riseFromFall,
    ]) {
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    }
    fallenIdle?.setLoop(THREE.LoopRepeat, Infinity);
    return () => mixer.stopAllAction();
  }, [
    mixer, idle, walk, run, carryIdle, carryWalk, carryRun, throwReady,
    jump, standingJump, throwAction, pickUpAction, climbCarriage, ladder, vault, runStop, startle, stumble,
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
  const gaitPhase = useRef(0);
  const previousSpeed = useRef(0);
  const previousYaw = useRef(0);
  const landingTime = useRef(null);
  const movingLastFrame = useRef(false);
  const activeStop = useRef(false);
  const traversalAction = useRef(null);
  const lastAction = useRef(null);
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
      group.rotation.x = 0;
      group.rotation.z = 0;
      if (!wasShotPose.current) {
        for (const action of [
          walk, run, carryIdle, carryWalk, carryRun, throwReady,
          jump, standingJump, smoking, throwAction, pickUpAction,
          climbCarriage, ladder, vault, runStop, startle, stumble, edgeSlip, fallShoulder, fallGeneric, fallenIdle,
          riseFromFall,
        ]) action?.stop();
        activeJump.current = null;
        activeReaction.current = null;
        activeThrow.current = false;
        activePickup.current = false;
        activeClimb.current = false;
        activeStop.current = false;
        traversalAction.current = null;
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
    const reactionBusy = reaction.phase !== REACTION_PHASE.NORMAL && reaction.variant !== 'startle';
    const reactionKey = `${reaction.phase}:${reaction.variant ?? ''}`;
    if (reactionKey !== activeReactionKey.current) {
      activeReactionKey.current = reactionKey;
      activeReaction.current?.fadeOut(0.1);
      activeReaction.current = null;
      if (reaction.phase !== REACTION_PHASE.NORMAL) {
        const actions = {
          startle,
          stumble,
          edgeSlip,
          fallShoulder,
          fallGeneric,
          prone: fallenIdle,
          rise: riseFromFall,
        };
        const action = actions[reaction.variant];
        if (action) {
          const timeScale = REACTION_MOTION[reaction.variant]?.timeScale ?? 1;
          action.reset().setEffectiveWeight(1).setEffectiveTimeScale(timeScale).fadeIn(0.08).play();
          if (action === stumble) action.time = 0.24;
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
    const traversal = gameDebug.player.traversal;
    const requestedMove = gameDebug.player.moveRequested;
    const actionBusy = reactionBusy || ritual || activeThrow.current || activePickup.current || activeClimb.current || Boolean(traversal);
    const carrying = throwPlay.phase === 'held';
    if (runStop && grounded && !actionBusy && !carrying && !preparingThrow
      && movingLastFrame.current && !requestedMove && previousSpeed.current > runtime.values.walkSpeed + 0.65) {
      activeStop.current = true;
      runStop.reset().setEffectiveWeight(1).setEffectiveTimeScale(1.9).fadeIn(0.08).play();
    }
    if (activeStop.current && (!grounded || actionBusy || requestedMove || runStop.time > 0.66)) {
      runStop.fadeOut(0.12);
      activeStop.current = false;
    }
    movingLastFrame.current = requestedMove;

    const traversalClip = traversal?.motion.item.type === 'ladder' ? ladder : traversal ? vault : null;
    if (traversalClip !== traversalAction.current) {
      traversalAction.current?.fadeOut(0.1);
      traversalAction.current = traversalClip;
      traversalClip?.reset().setEffectiveTimeScale(0).play();
      if (traversalClip) {
        activeJump.current?.fadeOut(0.08);
        activeJump.current = null;
      }
    }
    if (traversalClip) {
      traversalClip.setEffectiveWeight(traversal.weight);
      traversalClip.time = traversalClip === ladder
        ? ((traversal.position[1] - traversal.motion.item.low[1]) / (2 * traversal.motion.item.rungSpacing) % 1 + 1) % 1 * ladder.getClip().duration
        : 0.2 + traversal.progress * 1.4;
    }

    if (!actionBusy && !grounded && (wasGrounded.current || (!activeJump.current && velocity[1] < -0.8))) {
      const selected = moving ? jump : standingJump;
      activeJump.current?.stop();
      activeJump.current = selected;
      landingTime.current = null;
      selected?.reset().setEffectiveTimeScale(0).setEffectiveWeight(1).fadeIn(0.08).play();
    } else if (grounded && !wasGrounded.current && activeJump.current) {
      landingTime.current = 0;
      activeJump.current.fadeOut(0.22);
    }
    if (activeJump.current) {
      const action = activeJump.current;
      const contacts = JUMP_CONTACTS[action.getClip().name];
      if (landingTime.current !== null) {
        landingTime.current += Math.min(delta, 0.05);
        action.time = Math.min(contacts.end, contacts.contact + landingTime.current * 2.2);
        if (landingTime.current > 0.24) {
          action.stop();
          activeJump.current = null;
          landingTime.current = null;
        }
      } else {
        action.time = airborneClipTime(contacts, velocity[1], runtime.values.jumpVelocity);
      }
    }
    wasGrounded.current = grounded;

    if (walk && idle && run) {
      // Crossfade by hand because the weights follow continuously changing
      // movement speed rather than a single state transition.
      const busy = actionBusy || activeStop.current;
      const occupied = carrying || preparingThrow;
      const blend = locomotionBlend(speed, runtime.values.walkSpeed, runtime.values.runSpeed);
      const idleTarget = traversal && !occupied ? 1 - traversal.weight
        : grounded && !occupied && !busy ? blend.idle : 0;
      const walkTarget = grounded && !occupied && !busy ? blend.walk : 0;
      const runTarget = grounded && !occupied && !busy ? blend.run : 0;
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
      carryIdle?.setEffectiveWeight(
        THREE.MathUtils.damp(carryIdle?.getEffectiveWeight() ?? 0, carryIdleTarget, 12, delta),
      );
      carryWalk?.setEffectiveWeight(
        THREE.MathUtils.damp(carryWalk?.getEffectiveWeight() ?? 0, carryWalkTarget, 12, delta),
      );
      carryRun?.setEffectiveWeight(
        THREE.MathUtils.damp(carryRun?.getEffectiveWeight() ?? 0, carryRunTarget, 12, delta),
      );
      throwReady?.setEffectiveWeight(
        THREE.MathUtils.damp(throwReady?.getEffectiveWeight() ?? 0, throwReadyTarget, 12, delta),
      );
      // One distance-driven phase keeps the same supporting foot through
      // walk/run blends. Independent clocks crossed opposite leg poses.
      const stride = THREE.MathUtils.lerp(
        CLIP_SPEED * walk.getClip().duration,
        RUN_CLIP_SPEED * run.getClip().duration,
        blend.run,
      );
      if (grounded && !busy) gaitPhase.current = (gaitPhase.current + speed * Math.min(delta, 0.05) / stride) % 1;
      walk.setEffectiveTimeScale(0);
      run.setEffectiveTimeScale(0);
      walk.time = gaitPhase.current * walk.getClip().duration;
      run.time = gaitPhase.current * run.getClip().duration;
      carryWalk?.setEffectiveTimeScale(
        Math.min(MAX_CARRY_WALK_PLAYBACK, Math.max(0.7, speed / CARRY_WALK_CLIP_SPEED)),
      );
      carryRun?.setEffectiveTimeScale(
        Math.min(MAX_RUN_PLAYBACK, Math.max(0.75, speed / RUN_CLIP_SPEED)),
      );
    }

    group.position.set(x, y, z);
    group.rotation.y = gameDebug.player.yaw + FACING;
    const bodyBusy = actionBusy || activeStop.current;
    const dt = Math.min(delta, 0.05);
    const acceleration = THREE.MathUtils.clamp((speed - previousSpeed.current) / Math.max(0.001, dt), -12, 12);
    const turn = THREE.MathUtils.euclideanModulo(gameDebug.player.yaw - previousYaw.current + Math.PI, Math.PI * 2) - Math.PI;
    group.rotation.x = THREE.MathUtils.damp(group.rotation.x, bodyBusy || !grounded ? 0 : acceleration * 0.006, 14, dt);
    group.rotation.z = THREE.MathUtils.damp(group.rotation.z, bodyBusy || !grounded ? 0 : THREE.MathUtils.clamp(turn / Math.max(0.001, dt) * speed * 0.008, -0.1, 0.1), 10, dt);
    group.rotation.order = 'YXZ';
    previousSpeed.current = speed;
    previousYaw.current = gameDebug.player.yaw;
    const accent = traversal?.motion.item.type ?? reaction.variant ?? (activeStop.current ? 'braking' : null);
    if (accent) lastAction.current = accent;
    const phase = accent ?? (bodyBusy ? 'action' : activeJump.current
      ? grounded ? 'landing' : velocity[1] > 0 ? 'rising' : 'falling'
      : running ? 'run' : moving ? 'walk' : 'idle');
    gameDebug.player.animation = {
      speed, phase, lastAction: lastAction.current,
      weights: { idle: idle?.getEffectiveWeight(), walk: walk?.getEffectiveWeight(), run: run?.getEffectiveWeight() },
      jumpTime: activeJump.current?.time ?? null,
    };
    group.visible = gameDebug.player.visible !== false;
    // Match the physics controller's hitch protection. Advancing a one-shot
    // by an entire stalled frame can skip its contact pose and make the body
    // appear to snap between upright, prone, pickup, or climbing states.
    mixer.update(Math.min(delta, 0.1));
    group.updateMatrixWorld(true);
    ladderGrip(traversal);

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
    const objectInHand = (throwPlay.phase === 'picking-up' && throwPlay.pickupTaken)
      || throwPlay.phase === 'held'
      || throwPlay.phase === 'charging'
      || throwPlay.phase === 'windup';
    if (rightHand) rightHand.getWorldPosition(handPosition);
    else handPosition.set(x, y + 1.2, z);
    if (heldObject) {
      heldObject.visible = objectInHand && group.visible && Boolean(definition);
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

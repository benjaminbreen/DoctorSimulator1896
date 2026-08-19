import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { movementStep, applySlide } from '../movement/movementStep.js';
import { useCharacterController, handlesAlive } from '../physics/useCharacterController.js';
import { requestTravel } from '../world/travel.js';
import { gameDebug } from '../debug.js';
import { inspectAgent } from '../world/acquaintance.js';
import {
  findReachable,
  setReach,
  useInstrument,
  stopUsing,
  getInteraction,
} from '../world/interaction.js';
import {
  advancePlayerReaction,
  beginPlayerReaction,
  carriageImpactEffect,
  getPlayer,
  harm,
  recoverFromSeat,
  fallEffect,
  applyPlayerEvent,
  waterWalkingEffect,
  waterWalkingStep,
  SEAT_REST_SECONDS,
} from '../world/player.js';
import { takeActorImpacts } from '../world/actorImpacts.js';
import {
  REACTION_PHASE,
  reactionLocksMovement,
  reactionUsesProneCollider,
} from '../world/actorReactions.js';
import { ledgeCandidate } from '../world/motionAffordances.js';
import { feetAreInWater } from '../world/waterContact.js';
import { seatFraming } from '../world/seating.js';
import { readEdition } from '../world/reading.js';
import { examineFraming } from '../examine/framing.js';
import {
  advanceCarriageClimb,
  beginCarriageClimb,
  carriageSupportDelta,
  findBoardable,
  getBoardable,
  supportFor,
  updateSupportPose,
} from '../world/carriageBoarding.js';
import {
  advanceThrowablePickup,
  beginThrowableCharge,
  chargeThrowable,
  estimateThrowableRange,
  findReachableThrowable,
  getThrowablePlay,
  pickUpThrowable,
  queueThrowableThrow,
  interruptThrowablePlay,
} from '../world/throwablePlay.js';
import { throwableDefinition } from '../world/throwables.js';
import { goodOfThrowable, handVerb } from '../world/goods.js';
import { runHeldVerb } from '../world/pocket.js';
import { findReachableDialogueAgent } from '../world/agents.js';
import { npcDialogueDefinition } from '../world/npcDialogue.js';
import { isOutdoorZone } from '../tuning/zoneCategory.js';

const MAX_DT = 1 / 30;
const stillInput = { x: 0, z: 0, run: false, jump: false };
const throwAim = new THREE.Vector3();
const PLAYER_ACTOR_ID = 'player';
const PRONE_COLLIDER = Object.freeze({ halfHeight: 0.12, radius: 0.34, y: 0.36 });
const IDENTITY_ROTATION = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export default function PlayerRig({
  room, runtime, keyboard, look, spawn, spawnYaw, water = null,
  motionAffordances = [], forcePlaceholder = false,
}) {
  // Only the items that offer something. Filtered once per room, so the
  // per-frame scan is over a handful rather than every board in the place.
  const reachable = useMemo(
    () => room.furnitureBoxes.filter((item) => item.affordance),
    [room],
  );
  const bodyRef = useRef(null);
  const colliderRef = useRef(null);
  const meshRef = useRef(null);
  const stateRef = useRef({
    velocity: [0, 0, 0],
    yaw: spawnYaw,
    grounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    jumpHeldLast: false,
  });
  // Prevent an E held through a door from firing again on arrival.
  const interactLatch = useRef(true);
  const waterExposure = useRef(0);
  const colliderPosture = useRef('standing');
  const edgeRef = useRef({ candidateId: null, since: 0, armed: true, active: null, cooldownUntil: 0 });
  const climbRef = useRef(null);
  const lastDialogueAgent = useRef(null);
  const carriageSupportRef = useRef(null);
  // So `__game.use('colour-wheel')` can open an instrument view without the
  // walk-and-aim, which is the slow part of checking one.
  useEffect(() => {
    gameDebug.enterInstrument = useInstrument;
    gameDebug.talk = (npcId = 'park-keeper') => {
      const npc = npcDialogueDefinition(npcId);
      if (!npc) return false;
      useInstrument({
        id: `conversation:debug:${npcId}`,
        kind: 'conversation',
        npcId,
        dialogueName: npc.name,
      });
      return true;
    };
    return () => {
      gameDebug.enterInstrument = null;
      gameDebug.talk = null;
    };
  }, []);
  const controllerRef = useCharacterController(runtime);
  const { world, rapier } = useRapier();

  const radius = runtime.values.capsuleRadius;
  const halfHeight = runtime.values.capsuleHalfHeight;
  const centerY = halfHeight + radius;
  const standingShape = useMemo(() => new rapier.Capsule(halfHeight, radius), [rapier, halfHeight, radius]);
  const proneShape = useMemo(
    () => new rapier.Capsule(PRONE_COLLIDER.halfHeight, PRONE_COLLIDER.radius),
    [rapier],
  );
  const showAvatar = runtime.values.showAvatarGlb && !forcePlaceholder;

  useEffect(() => {
    look.set(spawnYaw, look.look.pitch);
  }, [look, spawnYaw]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!controller || !handlesAlive(world, body, collider)) return;

    const dt = Math.min(delta, MAX_DT);
    const state = stateRef.current;

    for (const impact of takeActorImpacts(PLAYER_ACTOR_ID)) {
      if (impact.cause !== 'horseless-carriage') continue;
      const sourceVelocity = impact.sourceVelocity ?? [0, 0, 0];
      const relativeSpeed = Math.hypot(
        sourceVelocity[0] - state.velocity[0],
        sourceVelocity[2] - state.velocity[2],
      );
      const effect = carriageImpactEffect(relativeSpeed);
      if (!effect) continue;
      harm(effect);
      stopUsing();
      interruptThrowablePlay();
      beginPlayerReaction({
        response: 'knockdown',
        cause: impact.cause,
        direction: impact.direction,
        proneUntil: getPlayer().downUntil,
      });
    }

    const beforeReaction = getPlayer().reaction;
    const bodyPosition = body.translation();
    const canStand = beforeReaction.phase !== REACTION_PHASE.PRONE
      || getPlayer().clock < beforeReaction.proneUntil
      || !world.intersectionWithShape(
        { x: bodyPosition.x, y: bodyPosition.y + centerY, z: bodyPosition.z },
        IDENTITY_ROTATION,
        standingShape,
        undefined,
        undefined,
        collider,
        body,
      );
    const reaction = advancePlayerReaction({ canStand });
    const pronePosture = reactionUsesProneCollider(reaction);
    const nextPosture = pronePosture ? 'prone' : 'standing';
    if (nextPosture !== colliderPosture.current) {
      colliderPosture.current = nextPosture;
      collider.setShape(pronePosture ? proneShape : standingShape);
      collider.setTranslationWrtParent({
        x: 0,
        y: pronePosture ? PRONE_COLLIDER.y : centerY,
        z: 0,
      });
    }

    gameDebug.player.posture = reaction.phase;
    gameDebug.player.cameraHeight = reaction.phase === REACTION_PHASE.PRONE
      ? 0.48
      : reaction.phase === REACTION_PHASE.FALLING || reaction.phase === REACTION_PHASE.RISING
        ? 0.9
        : 1.45;

    if (
      beforeReaction.phase === REACTION_PHASE.EDGE_SLIP
      && reaction.phase === REACTION_PHASE.NORMAL
      && edgeRef.current.active
    ) {
      const edge = edgeRef.current.active;
      const length = Math.hypot(edge.outward[0], edge.outward[1]) || 1;
      const safe = {
        x: bodyPosition.x - (edge.outward[0] / length) * (edge.safeRetreat ?? 0.48),
        y: bodyPosition.y,
        z: bodyPosition.z - (edge.outward[1] / length) * (edge.safeRetreat ?? 0.48),
      };
      body.setNextKinematicTranslation(safe);
      state.velocity = [0, 0, 0];
      edgeRef.current.active = null;
      edgeRef.current.armed = false;
      edgeRef.current.cooldownUntil = getPlayer().clock + 3;
      gameDebug.player.position[0] = safe.x;
      gameDebug.player.position[1] = safe.y;
      gameDebug.player.position[2] = safe.z;
      return;
    }

    if (reactionLocksMovement(reaction)) {
      state.velocity = [0, 0, 0];
      gameDebug.player.velocity[0] = 0;
      gameDebug.player.velocity[1] = 0;
      gameDebug.player.velocity[2] = 0;
      gameDebug.player.running = false;
      gameDebug.prompt = null;
      setReach(null);
      return;
    }

    const using = getInteraction().using;
    if (using?.kind === 'seat') {
      setReach(null);
      gameDebug.prompt = 'Stand up';
      if (!using.rewarded && getPlayer().clock - using.startedAt >= SEAT_REST_SECONDS) {
        recoverFromSeat({
          seatId: using.id,
          seconds: getPlayer().clock - using.startedAt,
          label: `Rested on ${using.item.affordance.name}`,
        });
        using.rewarded = true;
      }
      if (!keyboard.state.interact) interactLatch.current = false;
      else if (!interactLatch.current) {
        interactLatch.current = true;
        stopUsing();
      }
      return;
    }
    // Using an instrument takes the controls; the body stays put. Clear the
    // prompt on the way in, or the "E use the…" line hangs over the console.
    if (using) {
      if (gameDebug.prompt) {
        gameDebug.prompt = null;
        setReach(null);
      }
      return;
    }
    if (gameDebug.pendingYaw !== null) {
      state.yaw = gameDebug.pendingYaw;
      gameDebug.pendingYaw = null;
    }
    if (gameDebug.pendingTeleport) {
      const [x, y, z] = gameDebug.pendingTeleport;
      gameDebug.pendingTeleport = null;
      state.velocity = [0, 0, 0];
      state.grounded = true;
      climbRef.current = null;
      carriageSupportRef.current = null;
      gameDebug.player.climbing = false;
      // Keep the public state in sync on the teleport frame. PlayerAvatar
      // otherwise sees the previous airborne state and starts a jump clip
      // before physics gets a chance to report the new grounded position.
      gameDebug.player.position[0] = x;
      gameDebug.player.position[1] = y;
      gameDebug.player.position[2] = z;
      gameDebug.player.velocity[0] = 0;
      gameDebug.player.velocity[1] = 0;
      gameDebug.player.velocity[2] = 0;
      gameDebug.player.grounded = true;
      gameDebug.player.running = false;
      gameDebug.player.posture = 'normal';
      body.setNextKinematicTranslation({ x, y, z });
      return;
    }

    if (climbRef.current) {
      const entry = getBoardable(climbRef.current.id);
      setReach(null);
      gameDebug.prompt = null;
      if (!entry) {
        climbRef.current = null;
        gameDebug.player.climbing = false;
        state.grounded = false;
        state.velocity = [0, -0.5, 0];
        return;
      }
      const nextClimb = advanceCarriageClimb(climbRef.current, entry, dt);
      climbRef.current = nextClimb.climb;
      state.velocity = [0, 0, 0];
      state.yaw = nextClimb.yaw;
      state.grounded = true;
      body.setNextKinematicTranslation({
        x: nextClimb.position[0],
        y: nextClimb.position[1],
        z: nextClimb.position[2],
      });
      if (meshRef.current) meshRef.current.rotation.y = state.yaw;
      gameDebug.player.position[0] = nextClimb.position[0];
      gameDebug.player.position[1] = nextClimb.position[1];
      gameDebug.player.position[2] = nextClimb.position[2];
      gameDebug.player.velocity[0] = 0;
      gameDebug.player.velocity[1] = 0;
      gameDebug.player.velocity[2] = 0;
      gameDebug.player.grounded = true;
      gameDebug.player.yaw = state.yaw;
      gameDebug.player.running = false;
      if (nextClimb.done) {
        climbRef.current = null;
        carriageSupportRef.current = supportFor(entry);
        gameDebug.player.climbing = false;
      }
      return;
    }

    let carriageCarry = [0, 0, 0];
    if (carriageSupportRef.current) {
      const entry = getBoardable(carriageSupportRef.current.id);
      if (!entry) carriageSupportRef.current = null;
      else {
        const support = carriageSupportDelta(
          carriageSupportRef.current,
          entry,
          [bodyPosition.x, bodyPosition.y, bodyPosition.z],
        );
        if (!support.supported) carriageSupportRef.current = null;
        else {
          carriageCarry = support.delta;
          state.yaw += support.yawDelta;
          updateSupportPose(carriageSupportRef.current, entry);
        }
      }
    }

    let throwPlay = getThrowablePlay();
    const pickingUp = throwPlay.phase === 'picking-up';
    const throwing = throwPlay.phase === 'charging' || throwPlay.phase === 'windup';
    if (pickingUp) {
      const [targetX, , targetZ] = throwPlay.pickupPosition;
      const dx = targetX - gameDebug.player.position[0];
      const dz = targetZ - gameDebug.player.position[2];
      if (dx * dx + dz * dz > 0.0001) state.yaw = Math.atan2(dx, -dz);
      advanceThrowablePickup(dt);
      throwPlay = getThrowablePlay();
    }
    if (throwPlay.phase === 'charging' && keyboard.state.interact) {
      chargeThrowable(dt);
      throwPlay = getThrowablePlay();
    }
    if (throwing && gameDebug.stats.cameraYaw !== null) {
      state.yaw = gameDebug.stats.cameraYaw;
    }

    // Running is an outdoor gait. Clearing it here rather than in movementStep
    // keeps the run animation and the camera's speed boost in step with it.
    const rawInput = pickingUp || throwing ? stillInput : keyboard.moveInput();
    const movementInput = rawInput.run && !isOutdoorZone(runtime.values.zone)
      ? { ...rawInput, run: false }
      : rawInput;
    const result = movementStep({
      input: movementInput,
      // Movement is relative to the active camera's yaw (hero mode follows
      // the player's facing, not the mouse).
      lookYaw: gameDebug.stats.cameraYaw ?? look.look.yaw,
      state,
      dt,
      tunables: runtime.values,
    });
    const wasGrounded = state.grounded;
    const impactSpeed = Math.max(0, -result.state.velocity[1]);
    Object.assign(state, result.state);
    if (state.velocity[1] > 0) carriageSupportRef.current = null;

    // Ground snap fights the first frames of a jump; disable it while rising.
    if (state.velocity[1] > 0) controller.disableSnapToGround();
    else controller.enableSnapToGround(runtime.values.snapToGround);

    controller.computeColliderMovement(collider, {
      x: result.desiredDelta[0] + carriageCarry[0],
      y: result.desiredDelta[1] + carriageCarry[1],
      z: result.desiredDelta[2] + carriageCarry[2],
    });
    const corrected = controller.computedMovement();
    const position = body.translation();
    const next = {
      x: position.x + corrected.x,
      y: position.y + corrected.y,
      z: position.z + corrected.z,
    };
    body.setNextKinematicTranslation(next);
    state.grounded = controller.computedGrounded();
    if (!wasGrounded && state.grounded) {
      const effect = fallEffect(impactSpeed);
      if (effect) harm(effect);
    }
    if (state.grounded && state.velocity[1] < 0) state.velocity[1] = -0.5;

    const walkingInWater = state.grounded
      && Math.hypot(corrected.x, corrected.z) > 0.0005
      && feetAreInWater(water, next.x, next.y, next.z);
    const waterStep = waterWalkingStep(waterExposure.current, dt, walkingInWater);
    waterExposure.current = waterStep.exposure;
    if (waterStep.damage > 0) applyPlayerEvent(waterWalkingEffect(waterStep.damage));

    for (let index = 0; index < controller.numComputedCollisions(); index += 1) {
      const normal = controller.computedCollision(index)?.normal1;
      if (!normal) continue;
      const horizontal = Math.hypot(normal.x, normal.z);
      if (horizontal > 0.5) {
        state.velocity = applySlide(state.velocity, [normal.x / horizontal, 0, normal.z / horizontal]);
      }
    }

    if (meshRef.current) {
      meshRef.current.rotation.y = state.yaw;
      meshRef.current.visible = gameDebug.player.visible !== false;
    }
    gameDebug.player.position[0] = next.x;
    gameDebug.player.position[1] = next.y;
    gameDebug.player.position[2] = next.z;
    gameDebug.player.velocity[0] = state.velocity[0];
    gameDebug.player.velocity[1] = state.velocity[1];
    gameDebug.player.velocity[2] = state.velocity[2];
    gameDebug.player.grounded = state.grounded;
    gameDebug.player.yaw = state.yaw;
    gameDebug.player.running = Boolean(movementInput.run)
      && Math.hypot(state.velocity[0], state.velocity[2]) >= 5.25;

    const edge = edgeRef.current;
    const candidate = ledgeCandidate(motionAffordances, {
      position: [next.x, next.y, next.z],
      yaw: state.yaw,
      speed: Math.hypot(state.velocity[0], state.velocity[2]),
    });
    if (!candidate) {
      edge.candidateId = null;
      if (!edge.active && getPlayer().clock >= edge.cooldownUntil) edge.armed = true;
    } else if (edge.candidateId !== candidate.id) {
      edge.candidateId = candidate.id;
      edge.since = getPlayer().clock;
    } else if (
      edge.armed
      && getPlayer().clock >= edge.cooldownUntil
      && getPlayer().clock - edge.since >= (candidate.dwellSeconds ?? 0.35)
    ) {
      edge.active = candidate;
      edge.armed = false;
      state.velocity = [0, 0, 0];
      state.yaw = Math.atan2(-candidate.outward[0], -candidate.outward[1]);
      gameDebug.player.yaw = state.yaw;
      beginPlayerReaction({
        response: 'edge-slip',
        cause: 'ledge',
        direction: candidate.outward,
      });
      gameDebug.player.running = false;
      gameDebug.prompt = null;
      setReach(null);
      return;
    }

    // Zone transitions: prompt when inside a trigger, travel on a fresh E.
    let active = null;
    for (const transition of room.transitions) {
      const dx = next.x - transition.position[0];
      const dz = next.z - transition.position[1];
      if (dx * dx + dz * dz <= transition.radius * transition.radius) {
        active = transition;
        break;
      }
    }

    // A door beats a prop: standing in a doorway with a chair beside it
    // should still offer the door.
    throwPlay = getThrowablePlay();
    if (throwPlay.phase !== 'empty') {
      const definition = throwableDefinition(throwPlay.heldType);
      const label = definition?.label.toLowerCase() ?? 'object';
      setReach(null);
      if (throwPlay.phase === 'picking-up') {
        gameDebug.prompt = `Picking up ${label}`;
        if (!keyboard.state.interact) interactLatch.current = false;
      } else if (throwPlay.phase === 'held') {
        // The good's first verb decides what E does. Only 'throw' charges;
        // anything else runs once on the press.
        const held = goodOfThrowable(throwPlay.heldType);
        const verb = held && handVerb(held.id);
        const throwing = verb?.id === 'throw';
        gameDebug.prompt = throwing ? `Hold E to throw ${label}` : verb?.label ?? 'Use it';
        if (!keyboard.state.interact) interactLatch.current = false;
        else if (!interactLatch.current) {
          interactLatch.current = true;
          if (!throwing) runHeldVerb();
          else {
            if (gameDebug.stats.cameraYaw !== null) state.yaw = gameDebug.stats.cameraYaw;
            beginThrowableCharge();
          }
        }
      } else if (throwPlay.phase === 'charging') {
        gameDebug.prompt = `Release E · ${Math.round(estimateThrowableRange(throwPlay.charge, throwPlay.heldType))} m`;
        if (!keyboard.state.interact) {
          if (gameDebug.camera) gameDebug.camera.getWorldDirection(throwAim);
          else throwAim.set(Math.sin(state.yaw), 0.1, -Math.cos(state.yaw));
          queueThrowableThrow(throwAim);
          interactLatch.current = false;
        }
      } else {
        gameDebug.prompt = `Throwing ${label}`;
        if (!keyboard.state.interact) interactLatch.current = false;
      }
      return;
    }

    const boardable = active ? null : findBoardable(gameDebug.player.position, state.yaw);
    const dialogueAgent = active || boardable
      ? null
      : findReachableDialogueAgent(gameDebug.player.position, state.yaw);
    const item = active || boardable || dialogueAgent
      ? null
      : findReachable(reachable, gameDebug.player.position, state.yaw);
    const throwable = active || boardable || dialogueAgent || item
      ? null
      : findReachableThrowable(gameDebug.player.position, state.yaw);
    const throwableLabel = throwableDefinition(throwable?.type)?.label.toLowerCase();
    setReach(item ? { id: item.id, item, affordance: item.affordance } : null);
    // Close enough to speak to somebody: show who they are without waiting for
    // a click. Only on the change, or it re-announces every frame.
    if (dialogueAgent?.id !== lastDialogueAgent.current) {
      lastDialogueAgent.current = dialogueAgent?.id ?? null;
      if (dialogueAgent) inspectAgent(dialogueAgent, gameDebug.player.position[1]);
    }
    gameDebug.prompt = active
      ? active.label
      : boardable
        ? boardable.profile.label
      : dialogueAgent
        ? `Speak with ${dialogueAgent.dialogueName}`
      : item
        ? `${item.affordance.verb} ${item.affordance.name ?? ''}`.trim()
        : throwable
          ? `Pick up ${throwableLabel ?? 'object'}`
          : null;

    if (!keyboard.state.interact) interactLatch.current = false;
    else if (!interactLatch.current && (active || boardable || dialogueAgent || item || throwable)) {
      interactLatch.current = true;
      if (active) requestTravel(runtime, active);
      else if (boardable) {
        carriageSupportRef.current = null;
        climbRef.current = beginCarriageClimb(boardable, gameDebug.player.position);
        state.velocity = [0, 0, 0];
        gameDebug.player.climbing = true;
        gameDebug.player.climbSerial += 1;
        setReach(null);
        gameDebug.prompt = null;
      }
      else if (dialogueAgent) {
        useInstrument({
          id: `conversation:${dialogueAgent.id}`,
          kind: 'conversation',
          npcId: dialogueAgent.dialogueId,
          agentId: dialogueAgent.id,
          dialogueName: dialogueAgent.dialogueName,
        });
        setReach(null);
        gameDebug.prompt = null;
      }
      else if (throwable) pickUpThrowable(throwable.id);
      else if (item.affordance.kind === 'instrument') {
        useInstrument({ id: item.id, item, instrument: item.affordance.instrument });
      } else if (item.affordance.kind === 'read') {
        readEdition(item.affordance.edition);
        setReach(null);
        gameDebug.prompt = null;
      } else if (item.affordance.kind === 'examine') {
        useInstrument({
          id: item.id,
          kind: 'examine',
          item,
          subject: item.affordance.subject,
          framing: examineFraming(item, gameDebug.player.position),
        });
        setReach(null);
        gameDebug.prompt = null;
      } else if (item.affordance.kind === 'seat') {
        useInstrument({
          id: item.id,
          kind: 'seat',
          item,
          framing: seatFraming(item),
          startedAt: getPlayer().clock,
          rewarded: false,
        });
      }
    }
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={spawn}
      userData={{ gameKind: 'player', actorId: PLAYER_ACTOR_ID }}
    >
      <CapsuleCollider ref={colliderRef} args={[halfHeight, radius]} position={[0, centerY, 0]} />
      <group ref={meshRef} rotation={[0, spawnYaw, 0]}>
        <mesh position={[0, centerY, 0]} castShadow visible={!showAvatar}>
          <capsuleGeometry args={[radius, halfHeight * 2, 4, 16]} />
          <meshStandardMaterial color="#7a8ba0" roughness={0.6} />
        </mesh>
        <mesh position={[0, centerY + halfHeight * 0.6, -radius - 0.1]} rotation={[-Math.PI / 2, 0, 0]} visible={!showAvatar}>
          <coneGeometry args={[0.1, 0.28, 12]} />
          <meshStandardMaterial color="#c9a227" roughness={0.5} />
        </mesh>
      </group>
    </RigidBody>
  );
}

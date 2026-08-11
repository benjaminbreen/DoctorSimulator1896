import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { movementStep, applySlide } from '../movement/movementStep.js';
import { useCharacterController, handlesAlive } from '../physics/useCharacterController.js';
import { requestTravel } from '../world/travel.js';
import { gameDebug } from '../debug.js';
import { findReachable, setReach, useInstrument, getInteraction } from '../world/interaction.js';

const MAX_DT = 1 / 30;

export default function PlayerRig({ room, runtime, keyboard, look, spawn, spawnYaw, forcePlaceholder = false }) {
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
  // So `__game.use('colour-wheel')` can open an instrument view without the
  // walk-and-aim, which is the slow part of checking one.
  useEffect(() => {
    gameDebug.enterInstrument = useInstrument;
    return () => {
      gameDebug.enterInstrument = null;
    };
  }, []);
  const controllerRef = useCharacterController(runtime);
  const { world } = useRapier();

  const radius = runtime.values.capsuleRadius;
  const halfHeight = runtime.values.capsuleHalfHeight;
  const centerY = halfHeight + radius;
  const showAvatar = runtime.values.showAvatarGlb && !forcePlaceholder;

  useEffect(() => {
    look.set(spawnYaw, look.look.pitch);
  }, [look, spawnYaw]);

  useFrame((_, delta) => {
    // Using an instrument takes the controls; the body stays put. Clear the
    // prompt on the way in, or the "E use the…" line hangs over the console.
    if (getInteraction().using) {
      if (gameDebug.prompt) {
        gameDebug.prompt = null;
        setReach(null);
      }
      return;
    }
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!controller || !handlesAlive(world, body, collider)) return;

    const dt = Math.min(delta, MAX_DT);
    const state = stateRef.current;
    if (gameDebug.pendingYaw !== null) {
      state.yaw = gameDebug.pendingYaw;
      gameDebug.pendingYaw = null;
    }
    if (gameDebug.pendingTeleport) {
      const [x, y, z] = gameDebug.pendingTeleport;
      gameDebug.pendingTeleport = null;
      state.velocity = [0, 0, 0];
      body.setNextKinematicTranslation({ x, y, z });
      return;
    }

    const result = movementStep({
      input: keyboard.moveInput(),
      // Movement is relative to the active camera's yaw (hero mode follows
      // the player's facing, not the mouse).
      lookYaw: gameDebug.stats.cameraYaw ?? look.look.yaw,
      state,
      dt,
      tunables: runtime.values,
    });
    Object.assign(state, result.state);

    // Ground snap fights the first frames of a jump; disable it while rising.
    if (state.velocity[1] > 0) controller.disableSnapToGround();
    else controller.enableSnapToGround(runtime.values.snapToGround);

    controller.computeColliderMovement(collider, {
      x: result.desiredDelta[0],
      y: result.desiredDelta[1],
      z: result.desiredDelta[2],
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
    if (state.grounded && state.velocity[1] < 0) state.velocity[1] = -0.5;

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
    const item = active ? null : findReachable(reachable, gameDebug.player.position, state.yaw);
    setReach(item ? { id: item.id, item, affordance: item.affordance } : null);
    gameDebug.prompt = active
      ? active.label
      : item
        ? `${item.affordance.verb} ${item.affordance.name ?? ''}`.trim()
        : null;

    if (!keyboard.state.interact) interactLatch.current = false;
    else if (!interactLatch.current && (active || item)) {
      interactLatch.current = true;
      if (active) requestTravel(runtime, active);
      else if (item.affordance.kind === 'instrument') {
        useInstrument({ id: item.id, item, instrument: item.affordance.instrument });
      }
    }
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} position={spawn}>
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

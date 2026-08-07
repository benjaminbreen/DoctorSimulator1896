import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, useRapier } from '@react-three/rapier';
import { movementStep, applySlide } from '../movement/movementStep.js';
import { useCharacterController, handlesAlive } from '../physics/useCharacterController.js';
import { requestTravel } from '../world/travel.js';
import { gameDebug } from '../debug.js';

const MAX_DT = 1 / 30;

export default function PlayerRig({ room, runtime, keyboard, look, spawn, spawnYaw }) {
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
  const controllerRef = useCharacterController(runtime);
  const { world } = useRapier();

  const radius = runtime.values.capsuleRadius;
  const halfHeight = runtime.values.capsuleHalfHeight;
  const centerY = halfHeight + radius;
  const showAvatar = runtime.values.showAvatarGlb;

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
    if (gameDebug.pendingTeleport) {
      const [x, y, z] = gameDebug.pendingTeleport;
      gameDebug.pendingTeleport = null;
      state.velocity = [0, 0, 0];
      body.setNextKinematicTranslation({ x, y, z });
      return;
    }

    const result = movementStep({
      input: keyboard.moveInput(),
      lookYaw: look.look.yaw,
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

    if (meshRef.current) meshRef.current.rotation.y = state.yaw;
    gameDebug.player.position[0] = next.x;
    gameDebug.player.position[1] = next.y;
    gameDebug.player.position[2] = next.z;
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
    gameDebug.prompt = active ? active.label : null;
    if (!keyboard.state.interact) interactLatch.current = false;
    else if (!interactLatch.current && active) {
      interactLatch.current = true;
      requestTravel(runtime, active);
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

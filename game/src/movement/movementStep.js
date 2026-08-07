// Pure movement step: input + state + tunables -> next state and the delta to
// hand to the character controller. No three.js, unit-tested.

import { damp, dampAngle } from './mathUtils.js';

const MAX_FALL_SPEED = 20;
const GROUNDED_SINK = -0.5;

// input: {x: -1..1 strafe, z: -1..1 forward (positive = forward), run, jump}
// state: {velocity, yaw, grounded, coyoteTimer, jumpBufferTimer, jumpHeldLast}
export function movementStep({ input, lookYaw, state, dt, tunables }) {
  const moving = input.x !== 0 || input.z !== 0;
  const speed = input.run ? tunables.runSpeed : tunables.walkSpeed;

  // Input is camera-relative; yaw=0 faces -Z (three.js convention).
  let targetX = 0;
  let targetZ = 0;
  if (moving) {
    const length = Math.hypot(input.x, input.z);
    const sin = Math.sin(lookYaw);
    const cos = Math.cos(lookYaw);
    targetX = ((-sin * input.z + cos * input.x) / length) * speed;
    targetZ = ((-cos * input.z - sin * input.x) / length) * speed;
  }

  const lambda = moving ? tunables.groundAcceleration : tunables.groundDeceleration;
  const [vx, vy, vz] = state.velocity;

  // Jump with coyote time and input buffering (Darwin's feel constants).
  // A grounded press always jumps; the timers are assists, not gates.
  const jumpPressed = Boolean(input.jump) && !state.jumpHeldLast;
  let coyoteTimer = state.grounded ? tunables.coyoteTime : Math.max(0, state.coyoteTimer - dt);
  let jumpBufferTimer = jumpPressed ? tunables.jumpBufferTime : Math.max(0, state.jumpBufferTimer - dt);
  let grounded = state.grounded;
  let nextVy;
  const wantsJump = jumpPressed || jumpBufferTimer > 0;
  const canJump = state.grounded || coyoteTimer > 0;
  if (wantsJump && canJump) {
    nextVy = tunables.jumpVelocity;
    jumpBufferTimer = 0;
    coyoteTimer = 0;
    grounded = false;
  } else if (grounded) {
    nextVy = GROUNDED_SINK;
  } else {
    // Heavier on the way down; heavier still if jump was released early.
    let gravity = tunables.gravity;
    if (vy < 0) gravity *= tunables.fallGravityMultiplier;
    else if (!input.jump) gravity *= tunables.jumpReleaseGravityMultiplier;
    nextVy = Math.max(vy - gravity * dt, -MAX_FALL_SPEED);
  }

  const velocity = [damp(vx, targetX, lambda, dt), nextVy, damp(vz, targetZ, lambda, dt)];

  // Face the direction of travel, not the camera.
  let yaw = state.yaw;
  if (moving) {
    yaw = dampAngle(yaw, Math.atan2(-targetX, -targetZ), tunables.turnDamping, dt);
  }

  return {
    desiredDelta: [velocity[0] * dt, velocity[1] * dt, velocity[2] * dt],
    state: {
      velocity,
      yaw,
      grounded,
      coyoteTimer,
      jumpBufferTimer,
      jumpHeldLast: Boolean(input.jump),
    },
  };
}

// After the controller corrects position, kill the velocity component still
// pointing into the contact. Darwin's lesson: solver fixes position, we fix
// velocity, or the next frame re-collides.
export function applySlide(velocity, normal) {
  const into = velocity[0] * normal[0] + velocity[2] * normal[2];
  if (into >= 0) return velocity;
  const keep = into < -0.74 ? 0.9 : 0.99;
  return [
    (velocity[0] - normal[0] * into) * keep,
    velocity[1],
    (velocity[2] - normal[2] * into) * keep,
  ];
}

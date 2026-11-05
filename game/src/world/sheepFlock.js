// How the flock on the Green behaves, framework-free so it can be stepped
// headless. SheepFlock.jsx poses and draws the result.
//
// Each sheep grazes by creeping a step at a time with its head down, keeps a
// little space from the others and stays near them. A person within sight
// makes it look up and turn to watch; closer, it walks off, and its
// neighbours catch the alarm and go with it. A person coming fast makes the
// flock trot. Everyone stays inside the Green's ring walk.

export const GREEN = { x: -30, z: -51, rx: 14.5, rz: 10.5 };

const WATCH_DISTANCE = 8;
const MOVE_OFF_DISTANCE = 4.2;
const FAST_THREAT = 3.2; // m/s: above the player's 2.5 m/s walk, so running
const ALARM_FADE = 0.12; // per second
const SPACING = 1.4;
const WALK = 0.45;
const MOVE_OFF = 0.95;
const TROT = 2.8;
const STEP_SPEED = 0.35; // one grazing step, about half a metre
const TURN_RATE = 1.8; // rad/s
const ACCELERATION = 2.4;

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// 0 at the centre of the Green, 1 on its edge.
function greenRadius(x, z) {
  return Math.hypot((x - GREEN.x) / GREEN.rx, (z - GREEN.z) / GREEN.rz);
}

export function createFlock(count, seed = 1) {
  return Array.from({ length: count }, (_, index) => {
    const r = Math.sqrt(hash01(seed + index * 3.3)) * 0.45;
    const a = hash01(seed + index * 5.1) * Math.PI * 2;
    return {
      x: GREEN.x + Math.cos(a) * r * GREEN.rx,
      z: GREEN.z + Math.sin(a) * r * GREEN.rz,
      yaw: hash01(seed + index * 9.7) * Math.PI * 2,
      speed: 0,
      headDown: 1,
      alarm: 0,
      fast: false,
      // Grazing: seconds until the next step, and how long the step lasts.
      nextStep: hash01(seed + index * 7.7) * 6,
      stepLeft: 0,
      lookLeft: 0,
      seed: seed + index * 13.1,
    };
  });
}

function turnToward(sheep, heading, dt) {
  const turn = Math.atan2(Math.sin(heading - sheep.yaw), Math.cos(heading - sheep.yaw));
  sheep.yaw += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn));
  return Math.abs(turn);
}

// `threats` are people: { x, z, vx, vz }.
export function stepFlock(flock, dt, t, threats) {
  let cx = 0;
  let cz = 0;
  for (const sheep of flock) {
    cx += sheep.x / flock.length;
    cz += sheep.z / flock.length;
  }
  // The grazing flock works slowly toward a point that wanders the Green.
  const goalX = GREEN.x + Math.sin(t / 97) * GREEN.rx * 0.5;
  const goalZ = GREEN.z + Math.sin(t / 61 + 1.3) * GREEN.rz * 0.5;
  const drift = Math.atan2(goalX - cx, goalZ - cz);

  for (const sheep of flock) {
    // The nearest person, and whether they are coming on fast.
    let threat = null;
    let threatDistance = Infinity;
    for (const person of threats) {
      const distance = Math.hypot(person.x - sheep.x, person.z - sheep.z);
      if (distance < threatDistance) [threat, threatDistance] = [person, distance];
    }
    let own = 0;
    if (threat) {
      // Running anywhere near counts, not only running straight at this one.
      const fast = Math.hypot(threat.vx, threat.vz) > FAST_THREAT;
      const reach = fast ? 1.6 : 1;
      if (threatDistance < MOVE_OFF_DISTANCE * reach) own = 1;
      else if (threatDistance < WATCH_DISTANCE * reach) own = 0.5;
      if (own === 1) sheep.fast = fast || threatDistance < 2;
    }
    // Alarm spreads to near neighbours a little weaker, and fades.
    let caught = 0;
    for (const other of flock) {
      if (other !== sheep && Math.hypot(other.x - sheep.x, other.z - sheep.z) < 4) caught = Math.max(caught, other.alarm * 0.85);
    }
    sheep.alarm = Math.max(own, caught, sheep.alarm - ALARM_FADE * dt);
    if (sheep.alarm < 0.5) sheep.fast = false;

    // Separation and the edge of the Green apply in every state.
    let pushX = 0;
    let pushZ = 0;
    let nearest = Infinity;
    for (const other of flock) {
      if (other === sheep) continue;
      const dx = sheep.x - other.x;
      const dz = sheep.z - other.z;
      const distance = Math.hypot(dx, dz) || 0.01;
      nearest = Math.min(nearest, distance);
      if (distance < SPACING) {
        pushX += (dx / distance) * (SPACING - distance);
        pushZ += (dz / distance) * (SPACING - distance);
      }
    }
    const edge = greenRadius(sheep.x, sheep.z);
    if (edge > 0.8) {
      pushX += (GREEN.x - sheep.x) / GREEN.rx * (edge - 0.8) * 6;
      pushZ += (GREEN.z - sheep.z) / GREEN.rz * (edge - 0.8) * 6;
    }

    let wantSpeed = 0;
    let heading = sheep.yaw;
    let headDown = 0;
    let moving = false;
    if (sheep.alarm >= 0.7 && threat) {
      // Move off: away from the person and along the edge, a little quicker
      // than they are walking so the flock opens a lane in front of them.
      const ax = (sheep.x - threat.x) / Math.max(threatDistance, 0.1) + pushX;
      const az = (sheep.z - threat.z) / Math.max(threatDistance, 0.1) + pushZ;
      heading = Math.atan2(ax, az);
      // Capped below a trot: a walker passing by gets a brisk walk, not a run.
      wantSpeed = sheep.fast ? TROT : Math.min(1.8, Math.max(MOVE_OFF, Math.hypot(threat.vx, threat.vz) + 0.3));
      sheep.stepLeft = 0;
      moving = true;
    } else if (sheep.alarm >= 0.4 && threat) {
      // Watch: stand with the head up and turn to face the person.
      heading = Math.atan2(threat.x - sheep.x, threat.z - sheep.z);
    } else if (Math.hypot(cx - sheep.x, cz - sheep.z) > 7 || nearest > 5) {
      // Left behind: walk back to the others with the head up.
      heading = Math.atan2(cx - sheep.x + pushX, cz - sheep.z + pushZ);
      wantSpeed = WALK;
    } else {
      // Graze: head down, and every few seconds one step on to fresh grass,
      // mostly the way the flock is working, never straight into a neighbour.
      headDown = 1;
      sheep.nextStep -= dt;
      if (sheep.nextStep <= 0 && sheep.stepLeft <= 0) {
        sheep.stepLeft = 0.8 + hash01(sheep.seed + t) * 1.4;
        sheep.nextStep = 3 + hash01(sheep.seed + t * 1.7) * 7;
        sheep.stepHeading = drift + (hash01(sheep.seed + t * 2.3) - 0.5) * 2.2;
      }
      if (sheep.stepLeft > 0) {
        sheep.stepLeft -= dt;
        heading = Math.atan2(Math.sin(sheep.stepHeading) + pushX * 2, Math.cos(sheep.stepHeading) + pushZ * 2);
        wantSpeed = STEP_SPEED;
      }
      // Now and then the head comes up to look about while it chews.
      sheep.lookLeft -= dt;
      if (sheep.lookLeft < -12 - hash01(sheep.seed) * 25) sheep.lookLeft = 2 + hash01(sheep.seed + t) * 3;
      if (sheep.lookLeft > 0) headDown = 0;
    }

    // Sheep walk where they face: turn first, and slow down for a sharp turn.
    const turnLeft = turnToward(sheep, heading, dt * (moving ? 2 : 1));
    if (turnLeft > 1.2) wantSpeed *= moving ? 0.6 : 0.3;
    const change = wantSpeed - sheep.speed;
    sheep.speed += Math.max(-ACCELERATION * 1.5 * dt, Math.min(ACCELERATION * dt, change));
    sheep.x += Math.sin(sheep.yaw) * sheep.speed * dt + pushX * 0.6 * dt;
    sheep.z += Math.cos(sheep.yaw) * sheep.speed * dt + pushZ * 0.6 * dt;
    // The edge push is soft; this keeps a cornered sheep off the walk.
    const after = greenRadius(sheep.x, sheep.z);
    if (after > 1) {
      sheep.x = GREEN.x + (sheep.x - GREEN.x) / after;
      sheep.z = GREEN.z + (sheep.z - GREEN.z) / after;
    }
    sheep.headDown += (headDown - sheep.headDown) * Math.min(1, dt * (headDown ? 1.4 : 4));
  }
}

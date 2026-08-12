import { clamp, shortestArc } from '../movement/mathUtils.js';

export const BOARDING_CLIMB_SECONDS = 2.35;
const BOARDING_REACH = 1.8;
const BOARDING_FACING = -0.15;

const boardables = new Map();

export function localToWorld(vehicle, local) {
  const [x, y, z] = local;
  return [
    vehicle.x + Math.sin(vehicle.yaw) * x - Math.cos(vehicle.yaw) * z,
    vehicle.y + y,
    vehicle.z + Math.cos(vehicle.yaw) * x + Math.sin(vehicle.yaw) * z,
  ];
}

export function worldToLocal(vehicle, world) {
  const dx = world[0] - vehicle.x;
  const dz = world[2] - vehicle.z;
  return [
    dx * Math.sin(vehicle.yaw) + dz * Math.cos(vehicle.yaw),
    world[1] - vehicle.y,
    -dx * Math.cos(vehicle.yaw) + dz * Math.sin(vehicle.yaw),
  ];
}

export function reportBoardable(entry) {
  boardables.set(entry.id, entry);
}

export function removeBoardable(id) {
  boardables.delete(id);
}

export function getBoardable(id) {
  return boardables.get(id) ?? null;
}

export function findBoardable(position, playerYaw) {
  const facingX = -Math.sin(playerYaw);
  const facingZ = -Math.cos(playerYaw);
  let nearest = null;
  let nearestDistance = BOARDING_REACH * BOARDING_REACH;
  for (const entry of boardables.values()) {
    const access = localToWorld(entry, entry.profile.access);
    const dx = access[0] - position[0];
    const dz = access[2] - position[2];
    const distance = dx * dx + dz * dz;
    if (distance > nearestDistance || Math.abs(access[1] - position[1]) > 1.1) continue;
    const length = Math.sqrt(distance) || 1e-6;
    if ((dx * facingX + dz * facingZ) / length < BOARDING_FACING) continue;
    nearest = entry;
    nearestDistance = distance;
  }
  return nearest;
}

export function beginCarriageClimb(entry, playerPosition) {
  return {
    id: entry.id,
    elapsed: 0,
    startLocal: worldToLocal(entry, playerPosition),
  };
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function advanceCarriageClimb(climb, entry, dt) {
  const elapsed = Math.min(BOARDING_CLIMB_SECONDS, climb.elapsed + dt);
  const progress = elapsed / BOARDING_CLIMB_SECONDS;
  const travel = smoothstep(progress);
  const target = entry.profile.target;
  const local = [
    climb.startLocal[0] + (target[0] - climb.startLocal[0]) * travel,
    climb.startLocal[1] + (target[1] - climb.startLocal[1]) * travel,
    climb.startLocal[2] + (target[2] - climb.startLocal[2]) * travel,
  ];
  return {
    climb: { ...climb, elapsed },
    position: localToWorld(entry, local),
    // The ladder clip's authored front is opposite the locomotion clips.
    yaw: entry.yaw,
    progress,
    done: elapsed >= BOARDING_CLIMB_SECONDS,
  };
}

export function carriageSupportDelta(support, entry, worldPosition) {
  const local = worldToLocal(support.pose, worldPosition);
  const roof = entry.profile.roof;
  const onRoof = Math.abs(local[0] - roof.center[0]) <= roof.half[0] + 0.18
    && Math.abs(local[2] - roof.center[1]) <= roof.half[1] + 0.18
    && Math.abs(local[1] - roof.top) <= 0.55;
  if (!onRoof) return { supported: false, delta: [0, 0, 0], yawDelta: 0 };
  const carried = localToWorld(entry, local);
  return {
    supported: true,
    delta: [
      carried[0] - worldPosition[0],
      carried[1] - worldPosition[1],
      carried[2] - worldPosition[2],
    ],
    yawDelta: shortestArc(support.pose.yaw, entry.yaw),
    local,
  };
}

export function supportFor(entry) {
  return {
    id: entry.id,
    pose: { x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw },
  };
}

export function updateSupportPose(support, entry) {
  support.pose = { x: entry.x, y: entry.y, z: entry.z, yaw: entry.yaw };
  return support;
}

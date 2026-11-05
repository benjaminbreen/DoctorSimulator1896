import { clamp, shortestArc } from './mathUtils.js';

const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);

export function findTraversal(affordances, position, yaw) {
  const facing = [-Math.sin(yaw), -Math.cos(yaw)];
  for (const item of affordances) {
    if (item.type !== 'ladder' && item.type !== 'vault') continue;
    const down = item.type === 'ladder' && Math.abs(position[1] - item.top[1]) < 0.25;
    const anchor = item.type === 'ladder' ? (down ? item.top : item.low) : item.position;
    const [dx, dy, dz] = position.map((value, index) => value - anchor[index]);
    const forward = [-Math.sin(item.yaw), -Math.cos(item.yaw)];
    const out = -(dx * forward[0] + dz * forward[1]);
    const across = dx * -forward[1] + dz * forward[0];
    if (Math.abs(dy) > 0.24 || Math.abs(across) > 0.55) continue;
    if ((facing[0] * forward[0] + facing[1] * forward[1]) * (down ? -1 : 1) < 0.65) continue;
    if (item.type === 'vault' ? out < 1.04 || out > 1.48 : out < -0.12 || out > 1.15) continue;
    return { item, down };
  }
  return null;
}

export function beginTraversal(candidate, position, yaw) {
  return { ...candidate, start: [...position], startYaw: yaw, time: 0 };
}

export function advanceTraversal(motion, dt) {
  const { item, down, start, startYaw } = motion;
  const time = motion.time + dt;
  const yaw = startYaw + shortestArc(startYaw, item.yaw) * smooth(time / 0.25);
  if (item.type === 'vault') {
    const progress = clamp(time / 0.82, 0, 1);
    const [x, y, z] = item.position;
    const end = [x - Math.sin(item.yaw) * 1.07, y + 0.05, z - Math.cos(item.yaw) * 1.07];
    const position = mix(start, end, progress);
    const lift = Math.min(smooth(progress / 0.19), smooth((1 - progress) / 0.19));
    position[1] += (item.height + 0.29) * lift * (0.89 + 0.11 * Math.sin(Math.PI * progress));
    return { motion: { ...motion, time }, position, yaw, progress, weight: 1, done: progress >= 1 };
  }

  const mountTime = down ? 0.52 : 0.24;
  const dismountTime = down ? 0.24 : 0.52;
  const travel = (item.high[1] - item.low[1]) / (item.climbSpeed ?? 0.66);
  const entry = down ? item.high : item.low;
  const exit = down ? item.low : item.high;
  const exitTime = time - mountTime - travel;
  let position;
  if (time < mountTime) position = mix(start, entry, smooth(time / mountTime));
  else if (exitTime < 0) position = mix(entry, exit, clamp((time - mountTime) / travel, 0, 1));
  else position = mix(exit, down ? item.low : item.top, smooth(exitTime / dismountTime));
  return {
    motion: { ...motion, time }, position, yaw,
    progress: clamp((position[1] - item.low[1]) / (item.high[1] - item.low[1]), 0, 1),
    weight: Math.min(smooth(time / mountTime), 1 - smooth(exitTime / dismountTime)),
    done: exitTime >= dismountTime,
  };
}

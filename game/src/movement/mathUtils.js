// Small math helpers with no three.js import, so node --test needs no deps.

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Frame-rate-independent exponential approach (same as THREE.MathUtils.damp).
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// Shortest signed angle from a to b, in (-PI, PI].
export function shortestArc(a, b) {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function dampAngle(current, target, lambda, dt) {
  return current + shortestArc(current, target) * (1 - Math.exp(-lambda * dt));
}

export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

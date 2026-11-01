// Small contact responses use bounded springs so a paused tab cannot launch
// a shade or leave cloth oscillating forever.
export function stepMaterialSpring(state, target, delta, stiffness = 70, damping = 10, limit = 0.5) {
  const duration = Math.min(Math.max(delta, 0), 0.1);
  const steps = Math.ceil(duration * 120);
  if (!steps) return state.value;
  const dt = duration / steps;
  for (let i = 0; i < steps; i += 1) {
    state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * dt;
    state.value += state.velocity * dt;
    if (Math.abs(state.value) > limit) {
      state.value = Math.sign(state.value) * limit;
      state.velocity *= 0.2;
    }
  }
  if (Math.abs(state.value - target) < 0.00005 && Math.abs(state.velocity) < 0.0001) {
    state.value = target;
    state.velocity = 0;
  }
  return state.value;
}

export function capsuleRadiusAtHeight(y, feet, height, radius) {
  if (y < feet || y > feet + height) return 0;
  const axisY = Math.max(feet + radius, Math.min(feet + height - radius, y));
  return Math.sqrt(Math.max(0, radius * radius - (y - axisY) ** 2));
}

export function capsuleTouchesPoint(point, feet, height, radius, padding = 0) {
  const axisY = Math.max(feet[1] + radius, Math.min(feet[1] + height - radius, point[1]));
  return Math.hypot(point[0] - feet[0], point[1] - axisY, point[2] - feet[2]) < radius + padding;
}

export function curtainContactOffset(x, y, z, player, height, radius, direction, tie, panelHeight) {
  const t = (y + panelHeight / 2) / panelHeight;
  const anchored = Math.min(1, (1 - t) * 8) * Math.min(1, Math.abs(t - tie) * 12);
  const reach = capsuleRadiusAtHeight(y, player[1], height, radius);
  const dx = x - player[0];
  if (!reach || Math.abs(dx) >= reach || Math.abs(z - player[2]) > reach + 0.08) return 0;
  const surface = player[2] + direction * Math.sqrt(reach * reach - dx * dx);
  const offset = surface - z;
  const edge = Math.min(1, (reach - Math.abs(dx)) / 0.07);
  const softened = edge * edge * (3 - 2 * edge);
  return Math.sign(offset) === direction ? offset * anchored * softened : 0;
}

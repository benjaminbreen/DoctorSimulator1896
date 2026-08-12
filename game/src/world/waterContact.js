// Water contact stays independent of the renderer. The outline and level
// come from zone data; the player supplies the current position of their feet.

function insideOutline(x, z, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function feetAreInWater(water, x, footY, z) {
  if (!water || !Array.isArray(water.outline) || water.outline.length < 3) return false;
  const level = Number(water.level);
  if (!Number.isFinite(level) || !Number.isFinite(x) || !Number.isFinite(footY) || !Number.isFinite(z)) {
    return false;
  }
  return footY < level + 0.06 && insideOutline(x, z, water.outline);
}

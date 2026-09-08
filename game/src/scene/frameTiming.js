// A fixed-size rolling window records stalls without allocating every frame.
export function createFrameTiming(capacity = 600) {
  const frames = new Float32Array(capacity);
  let count = 0, at = 0, elapsed = 0, longFrames = 0;
  let snapshot = { fps: 0, p95: 0, p99: 0, worst: 0, longFrames: 0 };
  return {
    reset() { count = 0; at = 0; elapsed = 0; longFrames = 0;
      snapshot = { fps: 0, p95: 0, p99: 0, worst: 0, longFrames: 0 }; },
    sample(delta) {
      if (!(delta > 0) || !Number.isFinite(delta)) return snapshot;
      frames[at] = delta * 1000;
      at = (at + 1) % capacity;
      count = Math.min(count + 1, capacity);
      if (delta > .05) longFrames++;
      elapsed += delta;
      if (elapsed < .5) return snapshot;
      elapsed = 0;
      const sorted = frames.slice(0, count).sort();
      const total = sorted.reduce((sum, value) => sum + value, 0);
      snapshot = {
        fps: count * 1000 / total,
        p95: sorted[Math.min(count - 1, Math.floor(count * .95))],
        p99: sorted[Math.min(count - 1, Math.floor(count * .99))],
        worst: sorted[count - 1], longFrames,
      };
      return snapshot;
    },
  };
}

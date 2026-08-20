const DPR_STEPS = [0.75, 1, 1.25, 1.5, 2];
const LOW_FPS = 30;
// A 60Hz display under real load holds ~55 fps, so a raise bar of 57 was
// unreachable and DPR never recovered after a dip.
const HIGH_FPS = 52;
const LOW_SECONDS = 3;
const HIGH_SECONDS = 10;
const SETTLE_SECONDS = 5;

function lowerStep(current, max) {
  const next = DPR_STEPS.filter((step) => step < current - 0.01 && step <= max).at(-1);
  return next ?? Math.min(0.75, max);
}

function higherStep(current, max) {
  return DPR_STEPS.find((step) => step > current + 0.01 && step <= max) ?? max;
}

// Auto changes only after sustained pressure or headroom. This keeps a short
// hitch or one expensive camera angle from making the image pulse in size.
export function createAdaptiveDprController(initialMax) {
  const controller = {
    dpr: Math.max(0.5, initialMax),
    lowFor: 0,
    highFor: 0,
    settleFor: SETTLE_SECONDS,
    reset(max = initialMax) {
      this.dpr = Math.max(0.5, max);
      this.lowFor = 0;
      this.highFor = 0;
      this.settleFor = SETTLE_SECONDS;
    },
    sample(fps, delta, max, active = true) {
      const cap = Math.max(0.5, max);
      if (this.dpr > cap) this.dpr = cap;
      if (!active || delta <= 0 || delta > 0.1 || !Number.isFinite(fps)) {
        this.lowFor = 0;
        this.highFor = 0;
        return false;
      }
      if (this.settleFor > 0) {
        this.settleFor = Math.max(0, this.settleFor - delta);
        return false;
      }
      if (fps < LOW_FPS) {
        this.lowFor += delta;
        this.highFor = 0;
      } else if (fps > HIGH_FPS) {
        this.highFor += delta;
        this.lowFor = 0;
      } else {
        this.lowFor = 0;
        this.highFor = 0;
      }
      let next = this.dpr;
      if (this.lowFor >= LOW_SECONDS) next = lowerStep(this.dpr, cap);
      if (this.highFor >= HIGH_SECONDS) next = higherStep(this.dpr, cap);
      if (Math.abs(next - this.dpr) < 0.01) return false;
      this.dpr = next;
      this.lowFor = 0;
      this.highFor = 0;
      this.settleFor = SETTLE_SECONDS;
      return true;
    },
  };
  return controller;
}

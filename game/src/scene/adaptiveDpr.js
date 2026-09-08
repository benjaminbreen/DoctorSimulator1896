const DPR_STEPS = [0.75, 1, 1.25, 1.5, 2];
const LOW_FPS = 48;
// A 60Hz display under real load holds ~55 fps, so a raise bar of 57 was
// unreachable and DPR never recovered after a dip.
const HIGH_FPS = 54;
const LOW_SECONDS = 2;
const HIGH_SECONDS = 15;
const SETTLE_SECONDS = 4;

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
    frameSeconds: 1 / 60,
    reductionProbe: null,
    cpuBoundFps: null,
    lowFor: 0,
    highFor: 0,
    settleFor: SETTLE_SECONDS,
    reset(max = initialMax) {
      this.dpr = Math.max(0.5, max);
      this.frameSeconds = 1 / 60;
      this.reductionProbe = null;
      this.cpuBoundFps = null;
      this.lowFor = 0;
      this.highFor = 0;
      this.settleFor = SETTLE_SECONDS;
    },
    sample(fps, delta, max, active = true) {
      const cap = Math.max(0.5, max);
      if (this.dpr > cap) this.dpr = cap;
      if (!active || delta <= 0 || !Number.isFinite(fps)) {
        this.lowFor = 0;
        this.highFor = 0;
        return false;
      }
      // A single shader or tab-resume stall must not erase detail. Repeated
      // slow frames still count, even when they exceed 100 ms.
      const measuredDelta = Math.min(delta, .1);
      this.frameSeconds += (measuredDelta - this.frameSeconds) * .1;
      const recentFps = 1 / this.frameSeconds;
      if (this.settleFor > 0) {
        this.settleFor = Math.max(0, this.settleFor - measuredDelta);
        if (this.settleFor === 0 && this.reductionProbe) {
          const probe = this.reductionProbe;
          this.reductionProbe = null;
          // CPU pressure and a capped display do not improve with fewer pixels.
          // Restore detail and wait before testing another reduction.
          if (recentFps <= probe.fps * 1.1) {
            this.dpr = Math.min(cap, probe.dpr);
            this.cpuBoundFps = recentFps;
            this.settleFor = 15;
            return true;
          }
        }
        return false;
      }
      if (this.cpuBoundFps !== null) {
        if (recentFps > this.cpuBoundFps * .8 && recentFps < this.cpuBoundFps * 1.2) return false;
        this.cpuBoundFps = null;
      }
      if (recentFps < LOW_FPS) {
        this.lowFor += measuredDelta;
        this.highFor = 0;
      } else if (recentFps > HIGH_FPS) {
        this.highFor += measuredDelta;
        this.lowFor = 0;
      } else {
        this.lowFor = 0;
        this.highFor = 0;
      }
      let next = this.dpr;
      if (this.lowFor >= LOW_SECONDS) next = lowerStep(this.dpr, cap);
      if (this.highFor >= HIGH_SECONDS) next = higherStep(this.dpr, cap);
      if (Math.abs(next - this.dpr) < 0.01) return false;
      if (next < this.dpr) this.reductionProbe = { dpr: this.dpr, fps: recentFps };
      this.dpr = next;
      this.lowFor = 0;
      this.highFor = 0;
      this.settleFor = SETTLE_SECONDS;
      return true;
    },
  };
  return controller;
}

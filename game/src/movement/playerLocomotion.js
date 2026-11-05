import { clamp } from './mathUtils.js';

export function locomotionBlend(speed, walkSpeed, runSpeed) {
  const travel = clamp(speed / 0.35, 0, 1);
  const run = runSpeed > walkSpeed ? clamp((speed - walkSpeed) / (runSpeed - walkSpeed), 0, 1) : 0;
  return { idle: 1 - travel, walk: travel * (1 - run), run: travel * run };
}

export function isRunningGait(speed, tunables) {
  return tunables.runSpeed > tunables.walkSpeed
    && speed > tunables.walkSpeed + (tunables.runSpeed - tunables.walkSpeed) * 0.4;
}

// These contact times refer to the existing Mixamo source clips. Physics owns
// the jump arc; the clip supplies takeoff, airborne posture and recovery.
export const JUMP_CONTACTS = {
  Jump: { takeoff: 0.06, apex: 0.4, contact: 0.73, end: 1.03 },
  StandingJump: { takeoff: 0.78, apex: 1.1, contact: 1.47, end: 2.1 },
};

export function airborneClipTime(contacts, verticalSpeed, launchSpeed) {
  const ascent = clamp(1 - verticalSpeed / Math.max(0.1, launchSpeed), 0, 1);
  if (verticalSpeed > 0) return contacts.takeoff + (contacts.apex - contacts.takeoff) * ascent;
  const descent = clamp(-verticalSpeed / Math.max(0.1, launchSpeed), 0, 0.92);
  return contacts.apex + (contacts.contact - contacts.apex) * descent;
}

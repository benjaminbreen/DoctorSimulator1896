// What everyone in the park knows right now: a short, time-gated list of
// simulation truths. The dialogue model may voice these; it may not invent
// news of its own. Reuses the Roosevelt schedule other systems already stage.
//
// DRAFT CONTENT: the period wording needs Ben's review before it is treated
// as settled (docs/decisions.md, historical content).

import {
  ROOSEVELT_SPEECH_SITE,
  ROOSEVELT_SPEECH_START_HOUR,
  ROOSEVELT_SPEECH_END_HOUR,
  ROOSEVELT_PARK_DEPARTURE_HOUR,
} from './teddyRoosevelt.js';

// Close enough to the shelter to be part of the gathering rather than someone
// who has merely heard about it.
const AUDIENCE_RADIUS = 24;

// What is happening in front of this person this second, if anything. The
// bulletin is what the park knows; this is what they are looking at.
export function attendingNow(hour, x, z) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  if (h < ROOSEVELT_SPEECH_START_HOUR || h >= ROOSEVELT_SPEECH_END_HOUR) return null;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const [sx, , sz] = ROOSEVELT_SPEECH_SITE.position;
  return Math.hypot(x - sx, z - sz) <= AUDIENCE_RADIUS ? 'roosevelt-speech' : null;
}

export function parkBulletin(hour = 12) {
  const h = ((Number(hour) || 0) % 24 + 24) % 24;
  const lines = [];

  if (h >= ROOSEVELT_SPEECH_START_HOUR && h < ROOSEVELT_SPEECH_END_HOUR) {
    lines.push('Mr. Roosevelt, the Police Commissioner, is speaking to a gathering at the Cop Cot shelter this very half hour.');
  } else if (h >= ROOSEVELT_SPEECH_END_HOUR && h < ROOSEVELT_PARK_DEPARTURE_HOUR) {
    lines.push('Mr. Roosevelt, the Police Commissioner, spoke to a gathering at the Cop Cot shelter this morning.');
  }

  if (h >= 8 && h < 19) {
    lines.push('The carousel by the Green runs through the day for the children.');
    lines.push('The Dairy in the park sells fresh milk across the counter.');
  }
  if (h >= 19 && h < 22) {
    lines.push('The lamps are being lit along the drives and the park is emptying.');
  }
  if (h >= 22 || h < 5) {
    lines.push('It is far past the respectable hour; nearly everyone has gone home.');
  }

  return lines;
}

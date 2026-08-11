// Shared input-gating flags, ported from Darwin's typingMode.js. Module
// state, no React: the keyboard poller reads these every event.
//
// Three flags because they mean three different things:
//   typing      — a text field has focus; gameplay keys must not move the
//                 player, but the world keeps running.
//   blockingUi  — a modal is open (letters, casebook); gameplay input is
//                 blocked, but the day clock deliberately keeps running.
//   paused      — only a surface actually labelled "paused" sets this; it is
//                 what a future game clock must check before ticking.

let typing = false;
let blockingUi = false;
let paused = false;
// Seated at the desk with a patient: gameplay keys rest, the clock runs.
let consultation = false;

export function setTypingMode(value) {
  typing = Boolean(value);
}

export function isTypingMode() {
  return typing;
}

export function setBlockingUiMode(value) {
  blockingUi = Boolean(value);
}

export function isBlockingUiMode() {
  return blockingUi;
}

export function setGamePaused(value) {
  paused = Boolean(value);
}

export function isGamePaused() {
  return paused;
}

export function setConsultationMode(value) {
  consultation = Boolean(value);
}

export function isConsultationMode() {
  return consultation;
}

export function isGameplayInputBlocked() {
  return typing || blockingUi || consultation;
}

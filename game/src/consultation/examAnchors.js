// World-space anchor points on the examined patient — head, torso, and hands
// — published by the actor each frame while the reading is up, and
// projected to the screen by the annotation layer. Module state, no React.

let anchors = null;

export function publishExamAnchors(next) {
  anchors = next;
}

export function clearExamAnchors() {
  anchors = null;
}

export function getExamAnchors() {
  return anchors;
}

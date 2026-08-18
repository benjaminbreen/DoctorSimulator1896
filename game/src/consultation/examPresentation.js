// Examination mode presentation: while the Examine verb is active the room
// falls to near-black, a key and rim light pick the patient out, and the
// camera pulls back for a static reading. CameraRig, LightingRig, and
// Effects read this. Module state, no React.

let active = false;
let focus = null;
const listeners = new Set();

// `focusPoint` is the world point the reading is about — the patient's
// chest — used to aim the exam lights and the depth-of-field pass.
export function setExaminationPresentation(value, focusPoint = null) {
  active = Boolean(value);
  focus = active ? (focusPoint ?? focus) : null;
  listeners.forEach((listener) => listener());
}

export function examinationPresentation() {
  return active;
}

export function examinationFocus() {
  return focus;
}

export function subscribeExamination(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

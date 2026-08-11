// Camera framing for the doctor's chair. While a consultation is running the
// camera eases into this seat; the eye then holds still while drag pans and
// the wheel zooms. CameraRig and pointerLook read this. Module state, no React.

// Matched to consulting-office.blueprint.json: desk-chair at (-0.45, -3.85),
// eye just clear of the chair back's mesh, at seated height.
const SEAT_EYE = [-0.45, 1.26, -3.4];
const PATIENT_HEAD_HEIGHT = 1.02;

// Zoom is a fraction of the fov range: 0 frames the patient close (the old
// default), 1 takes in most of the room from the chair.
const FOV_CLOSE = 44;
const FOV_WIDE = 86;
const DEFAULT_ZOOM = 0.38;

let framing = null;
let zoom = DEFAULT_ZOOM;

export function seatFramingForPatient(patientPosition) {
  const [x, , z] = patientPosition ?? [0.45, 0, -1.7];
  return {
    position: SEAT_EYE,
    target: [x, PATIENT_HEAD_HEIGHT, z],
  };
}

export function setConsultationSeat(value) {
  framing = value ?? null;
  if (framing) zoom = DEFAULT_ZOOM;
}

export function consultationSeatFraming() {
  return framing;
}

export function adjustSeatZoom(delta) {
  zoom = Math.min(1, Math.max(0, zoom + delta));
}

export function seatFov() {
  return FOV_CLOSE + (FOV_WIDE - FOV_CLOSE) * zoom;
}

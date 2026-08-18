// Camera framing for the doctor's chair. While a consultation is running the
// camera eases into this seat; the eye then holds still while drag pans and
// the wheel zooms. CameraRig and pointerLook read this. Module state, no React.

import { examinationPresentation } from './examPresentation.js';

// Matched to consulting-office.blueprint.json: desk-chair at (-0.45, -3.85),
// eye just clear of the chair back's mesh, at seated height.
const SEAT_EYE = [-0.45, 1.26, -3.4];
const PATIENT_HEAD_HEIGHT = 1.02;

// Zoom is a fraction of the fov range: 0 frames the patient close (the old
// default), 1 takes in most of the room from the chair.
const FOV_CLOSE = 44;
const FOV_WIDE = 86;
const DEFAULT_ZOOM = 0.38;

// Examination mode: the camera orbits the seated figure at a fixed field of
// view. Drag swings the eye within clamped bounds; the wheel walks in and
// out between EXAM_REACH_NEAR and EXAM_REACH_FAR.
const EXAM_FOV = 47;
const EXAM_EYE_HEIGHT = 1.32;
const EXAM_TARGET_HEIGHT = 1.01;
const EXAM_REACH_NEAR = 1.1;
const EXAM_REACH_FAR = 2.45;
const EXAM_DEFAULT_ZOOM = 0.48;

let framing = null;
let examFraming = null;
let zoom = DEFAULT_ZOOM;
let examZoom = EXAM_DEFAULT_ZOOM;

export function seatFramingForPatient(patientPosition) {
  const [x, , z] = patientPosition ?? [0.45, 0, -1.7];
  return {
    position: SEAT_EYE,
    target: [x, PATIENT_HEAD_HEIGHT, z],
  };
}

export function setConsultationSeat(value) {
  framing = value ?? null;
  if (framing) {
    zoom = DEFAULT_ZOOM;
    examZoom = EXAM_DEFAULT_ZOOM;
  }
  examFraming = framing
    ? {
      position: [framing.position[0], EXAM_EYE_HEIGHT, framing.position[2]],
      target: [framing.target[0], EXAM_TARGET_HEIGHT, framing.target[2]],
      key: 'exam',
      orbit: true,
    }
    : null;
}

export function consultationSeatFraming() {
  if (framing && examinationPresentation()) return examFraming;
  return framing;
}

export function adjustSeatZoom(delta) {
  if (examinationPresentation()) {
    examZoom = Math.min(1, Math.max(0, examZoom + delta));
    return;
  }
  zoom = Math.min(1, Math.max(0, zoom + delta));
}

// How far the examination orbit stands from the patient.
export function examReach() {
  return EXAM_REACH_NEAR + (EXAM_REACH_FAR - EXAM_REACH_NEAR) * examZoom;
}

export function seatFov() {
  if (examinationPresentation()) return EXAM_FOV;
  return FOV_CLOSE + (FOV_WIDE - FOV_CLOSE) * zoom;
}

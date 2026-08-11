// Camera input: drag the canvas to turn, wheel or trackpad to zoom. No pointer
// lock — the cursor stays where the user put it. Yaw/pitch are read by the
// camera rig; zoom lives in the tuning runtime so the panel slider and the
// wheel move the same number.

import { adjustSeatZoom, consultationSeatFraming } from '../consultation/seatFraming.js';

// Per wheel pixel. Trackpad pinch arrives as a ctrl-held wheel with much
// smaller deltas, so it gets its own rate.
const WHEEL_RATE = 0.0015;
const PINCH_RATE = 0.012;
// The seat zoom is a plain 0..1 fraction, so it takes additive rates.
const SEAT_WHEEL_RATE = 0.0011;
const SEAT_PINCH_RATE = 0.009;

export function createLook(runtime) {
  // revision changes only for direct pointer input. Camera modes use it to
  // distinguish a manual orbit from programmatic spawn and mode alignment.
  const look = { yaw: 0, pitch: 0.3, revision: 0 };
  let element = null;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target !== element || pointerId !== null) return;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    element.setPointerCapture(pointerId);
    element.style.cursor = 'grabbing';
  };

  const onPointerMove = (event) => {
    if (event.pointerId !== pointerId) return;
    const sensitivity = runtime.values.lookSensitivity;
    const sign = runtime.values.invertY ? -1 : 1;
    look.yaw -= (event.clientX - lastX) * sensitivity;
    look.pitch += (event.clientY - lastY) * sensitivity * sign;
    look.revision += 1;
    lastX = event.clientX;
    lastY = event.clientY;
  };

  const onPointerUp = (event) => {
    if (event.pointerId !== pointerId) return;
    element.releasePointerCapture(pointerId);
    pointerId = null;
    element.style.cursor = 'grab';
  };

  const onWheel = (event) => {
    // Without this the page scrolls under the canvas.
    event.preventDefault();
    // Seated at the desk, the wheel zooms the consultation view instead of
    // the boom, so the player's walking zoom is left as they set it.
    if (consultationSeatFraming()) {
      adjustSeatZoom(event.deltaY * (event.ctrlKey ? SEAT_PINCH_RATE : SEAT_WHEEL_RATE));
      return;
    }
    const rate = event.ctrlKey ? PINCH_RATE : WHEEL_RATE;
    // Multiplicative: a notch changes the boom by the same fraction at every
    // distance. The runtime clamps to the slider's range. Overhead has its
    // own, much larger range, so the boom cap does not limit the map view.
    const key = runtime.values.cameraMode === 'overhead'
      ? 'overheadZoom'
      : runtime.values.cameraMode === 'hero'
        ? 'heroZoom'
        : 'cameraZoom';
    runtime.set(key, runtime.values[key] * Math.exp(event.deltaY * rate));
  };

  return {
    look,
    set(yaw, pitch) {
      look.yaw = yaw;
      look.pitch = pitch;
    },
    attach(canvas) {
      element = canvas;
      element.style.cursor = 'grab';
      element.addEventListener('pointerdown', onPointerDown);
      element.addEventListener('pointermove', onPointerMove);
      element.addEventListener('pointerup', onPointerUp);
      element.addEventListener('pointercancel', onPointerUp);
      element.addEventListener('wheel', onWheel, { passive: false });
    },
    detach() {
      if (!element) return;
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
      element.removeEventListener('wheel', onWheel);
      element.style.cursor = '';
      pointerId = null;
      element = null;
    },
  };
}

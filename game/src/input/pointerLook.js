// Mouse look: pointer lock when granted, plain drag as fallback (the embedded
// browser pane can deny pointer lock). Yaw/pitch are read by the camera rig.

export function createLook(runtime) {
  const look = { yaw: 0, pitch: 0.3, locked: false };
  let element = null;
  let dragging = false;

  function applyDelta(dx, dy) {
    const sensitivity = runtime.values.lookSensitivity;
    const sign = runtime.values.invertY ? -1 : 1;
    look.yaw -= dx * sensitivity;
    look.pitch += dy * sensitivity * sign;
  }

  const onMouseMove = (event) => {
    if (look.locked) applyDelta(event.movementX, event.movementY);
    else if (dragging) applyDelta(event.movementX, event.movementY);
  };
  const onMouseDown = (event) => {
    if (event.target !== element) return;
    dragging = true;
    // Embedded panes can deny pointer lock; drag-look is the fallback.
    element.requestPointerLock?.()?.catch?.(() => {});
  };
  const onMouseUp = () => {
    dragging = false;
  };
  const onLockChange = () => {
    look.locked = document.pointerLockElement === element;
  };

  return {
    look,
    set(yaw, pitch) {
      look.yaw = yaw;
      look.pitch = pitch;
    },
    attach(canvas) {
      element = canvas;
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      document.addEventListener('pointerlockchange', onLockChange);
    },
    detach() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
      element = null;
    },
  };
}

import { useEffect, useRef } from 'react';
import { useRapier } from '@react-three/rapier';
import { degToRad } from '../movement/mathUtils.js';

// Thin wrapper around Rapier's KinematicCharacterController. Rebuild-mode
// params remount the whole canvas, so config is read once per mount.
export function useCharacterController(runtime) {
  const { world } = useRapier();
  const controllerRef = useRef(null);

  useEffect(() => {
    const values = runtime.values;
    const controller = world.createCharacterController(0.045);
    controller.enableAutostep(values.autostepHeight, 0.34, true);
    controller.enableSnapToGround(values.snapToGround);
    controller.setMaxSlopeClimbAngle(degToRad(values.maxSlopeClimbDeg));
    controller.setMinSlopeSlideAngle(degToRad(values.minSlopeSlideDeg));
    controller.setApplyImpulsesToDynamicBodies(false);
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(controller);
    };
  }, [world, runtime]);

  return controllerRef;
}

// Darwin's liveness guard: React can detach refs while Rapier still holds the
// frame, and a call on a dropped handle panics the wasm world for good.
export function handlesAlive(world, body, collider) {
  return Boolean(body && collider && world.getRigidBody(body.handle) && world.getCollider(collider.handle));
}

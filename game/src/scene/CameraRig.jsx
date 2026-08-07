import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { computeEyeTarget, clampPitch, occlusionLimit } from '../camera/cameraMath.js';
import { damp } from '../movement/mathUtils.js';
import { gameDebug } from '../debug.js';

const ANCHOR_HEIGHT = 1.45;
const MAX_DT = 1 / 30;

// Over-the-shoulder follow camera. Occlusion pulls in fast and returns slowly
// (Darwin's asymmetric damp), so a passing bookcase never snaps the frame.
export default function CameraRig({ room, runtime, look, heightAt = null }) {
  const camera = useThree((state) => state.camera);
  const smoothedRef = useRef(null);
  const occlusionBoxes = useMemo(
    () => [
      ...room.wallBoxes,
      ...(room.ceiling ? [room.ceiling] : []),
      ...room.furnitureBoxes.filter((item) => item.collider !== false),
    ],
    [room],
  );

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_DT);
    const values = runtime.values;
    look.look.pitch = clampPitch(look.look.pitch, values);

    const playerPos = gameDebug.player.position;
    const anchor = [playerPos[0], playerPos[1] + ANCHOR_HEIGHT, playerPos[2]];
    const eyeTarget = computeEyeTarget({
      playerPos,
      yaw: look.look.yaw,
      pitch: look.look.pitch,
      side: values.shoulderSide,
      up: values.shoulderUp,
      back: values.shoulderBack,
    });

    // Ground clamp before the occlusion ray, so steep upward pitches cannot
    // drag the eye beneath the floor or the terrain.
    const groundY = heightAt
      ? heightAt(eyeTarget[0], eyeTarget[2])
      : room.floor.position[1] + room.floor.size[1] / 2;
    const minEyeY = groundY + 0.22;
    if (eyeTarget[1] < minEyeY) eyeTarget[1] = minEyeY;

    const full = Math.hypot(eyeTarget[0] - anchor[0], eyeTarget[1] - anchor[1], eyeTarget[2] - anchor[2]);
    const allowed = occlusionLimit(anchor, eyeTarget, occlusionBoxes, {
      padding: values.collisionPadding,
      minDistance: values.minDistance,
    });

    let smoothed = smoothedRef.current;
    if (!smoothed) {
      smoothed = smoothedRef.current = { eye: [...eyeTarget], look: [...anchor], distance: allowed };
    }
    const pullLambda = allowed < smoothed.distance ? values.occlusionPullIn : values.occlusionReturn;
    smoothed.distance = damp(smoothed.distance, allowed, pullLambda, dt);

    const scale = full > 1e-6 ? smoothed.distance / full : 1;
    const target = [
      anchor[0] + (eyeTarget[0] - anchor[0]) * scale,
      anchor[1] + (eyeTarget[1] - anchor[1]) * scale,
      anchor[2] + (eyeTarget[2] - anchor[2]) * scale,
    ];

    // Vertical damped separately and softer, so ground bumps do not bounce the frame.
    smoothed.eye[0] = damp(smoothed.eye[0], target[0], values.positionDamping, dt);
    smoothed.eye[1] = damp(smoothed.eye[1], target[1], values.yDamping, dt);
    smoothed.eye[2] = damp(smoothed.eye[2], target[2], values.positionDamping, dt);
    smoothed.look[0] = damp(smoothed.look[0], anchor[0], values.positionDamping * 1.4, dt);
    smoothed.look[1] = damp(smoothed.look[1], anchor[1], values.yDamping * 1.5, dt);
    smoothed.look[2] = damp(smoothed.look[2], anchor[2], values.positionDamping * 1.4, dt);

    camera.position.set(smoothed.eye[0], smoothed.eye[1], smoothed.eye[2]);
    camera.lookAt(smoothed.look[0], smoothed.look[1], smoothed.look[2]);
    gameDebug.stats.cameraDistance = smoothed.distance;
  });

  return null;
}

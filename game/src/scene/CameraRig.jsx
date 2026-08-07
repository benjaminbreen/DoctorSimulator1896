import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { computeEyeTarget, clampPitch, occlusionLimit } from '../camera/cameraMath.js';
import { damp, dampAngle } from '../movement/mathUtils.js';
import { gameDebug } from '../debug.js';

const ANCHOR_HEIGHT = 1.45;
const EYE_HEIGHT = 1.62;
const MAX_DT = 1 / 30;
const MODES = ['shoulder', 'first', 'overhead', 'hero'];

// Four camera modes on the Darwin pattern, cycled with M: over-the-shoulder
// orbit (default), first person, overhead, and hero (follows the player's
// facing instead of the mouse).
export default function CameraRig({ room, runtime, look, keyboard, heightAt = null }) {
  const camera = useThree((state) => state.camera);
  const smoothedRef = useRef(null);
  const heroYawRef = useRef(0);
  const cycleLatch = useRef(true);
  const lastMode = useRef(null);
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

    if (keyboard?.state.cycleCamera) {
      if (!cycleLatch.current) {
        cycleLatch.current = true;
        const next = MODES[(MODES.indexOf(values.cameraMode) + 1) % MODES.length];
        runtime.set('cameraMode', next);
      }
    } else {
      cycleLatch.current = false;
    }

    const mode = MODES.includes(values.cameraMode) ? values.cameraMode : 'shoulder';
    if (mode !== lastMode.current) {
      smoothedRef.current = null;
      heroYawRef.current = gameDebug.player.yaw;
      lastMode.current = mode;
    }

    look.look.pitch = clampPitch(look.look.pitch, values);
    const playerPos = gameDebug.player.position;
    gameDebug.player.visible = mode !== 'first';

    if (mode === 'first') {
      // Mouse-down pitch looks down, matching the third-person feel.
      const pitch = -look.look.pitch;
      const yaw = look.look.yaw;
      const cos = Math.cos(pitch);
      camera.position.set(playerPos[0], playerPos[1] + EYE_HEIGHT, playerPos[2]);
      camera.lookAt(
        playerPos[0] - Math.sin(yaw) * cos,
        playerPos[1] + EYE_HEIGHT + Math.sin(pitch),
        playerPos[2] - Math.cos(yaw) * cos,
      );
      gameDebug.stats.cameraYaw = yaw;
      gameDebug.stats.cameraDistance = 0;
      return;
    }

    if (mode === 'overhead') {
      const target = [playerPos[0], playerPos[1] + values.overheadHeight, playerPos[2] + 0.01];
      let smoothed = smoothedRef.current;
      if (!smoothed) {
        smoothed = smoothedRef.current = { eye: [...target], look: [...playerPos], distance: values.overheadHeight };
      }
      smoothed.eye[0] = damp(smoothed.eye[0], target[0], values.positionDamping, dt);
      smoothed.eye[1] = damp(smoothed.eye[1], target[1], values.yDamping, dt);
      smoothed.eye[2] = damp(smoothed.eye[2], target[2], values.positionDamping, dt);
      smoothed.look[0] = damp(smoothed.look[0], playerPos[0], values.positionDamping, dt);
      smoothed.look[1] = damp(smoothed.look[1], playerPos[1], values.yDamping, dt);
      smoothed.look[2] = damp(smoothed.look[2], playerPos[2], values.positionDamping, dt);
      camera.position.set(smoothed.eye[0], smoothed.eye[1], smoothed.eye[2]);
      camera.lookAt(smoothed.look[0], smoothed.look[1], smoothed.look[2]);
      gameDebug.stats.cameraYaw = look.look.yaw;
      gameDebug.stats.cameraDistance = values.overheadHeight;
      return;
    }

    // Shoulder and hero share the boom; hero follows the player's facing.
    let yaw = look.look.yaw;
    let side = values.shoulderSide;
    if (mode === 'hero') {
      heroYawRef.current = dampAngle(heroYawRef.current, gameDebug.player.yaw, values.heroFollowRate, dt);
      yaw = heroYawRef.current;
      side = values.shoulderSide * 0.4;
    }

    const anchor = [playerPos[0], playerPos[1] + ANCHOR_HEIGHT, playerPos[2]];
    const eyeTarget = computeEyeTarget({
      playerPos,
      yaw,
      pitch: look.look.pitch,
      side,
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
    gameDebug.stats.cameraYaw = yaw;
    gameDebug.stats.cameraDistance = smoothed.distance;
  });

  return null;
}

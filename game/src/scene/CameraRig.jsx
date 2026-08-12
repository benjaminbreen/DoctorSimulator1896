import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  computeEyeTarget,
  clampPitch,
  occlusionLimit,
  heroFollowYaw,
  heroLookAhead,
  responsiveCameraBoom,
} from '../camera/cameraMath.js';
import { damp, clamp } from '../movement/mathUtils.js';
import { gameDebug } from '../debug.js';
import { getInteraction } from '../world/interaction.js';
import { consultationSeatFraming, seatFov } from '../consultation/seatFraming.js';
import { instrumentFov, resetInstrumentZoom } from '../instruments/viewFraming.js';

const ANCHOR_HEIGHT = 1.45;
const EYE_HEIGHT = 1.62;
const MAX_DT = 1 / 30;
// Scratch, so the focus ease allocates nothing per frame.
const scratchPosition = new THREE.Vector3();
const scratchTarget = new THREE.Vector3();
const MODES = ['shoulder', 'first', 'overhead', 'hero'];

// Four camera modes on the Darwin pattern, cycled with M: over-the-shoulder
// orbit (default), first person, overhead, and hero (follows the player's
// facing instead of the mouse).
export default function CameraRig({ room, runtime, look, keyboard, heightAt = null }) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const viewportSize = useThree((state) => state.size);
  const smoothedRef = useRef(null);
  // Where the camera has eased to while an instrument is in use.
  const focusRef = useRef({
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    armed: false,
  });
  const heroRef = useRef({
    yaw: 0,
    pitch: null,
    lastLookYaw: 0,
    lastLookRevision: 0,
    lastOrbitTime: -Infinity,
  });
  const cycleLatch = useRef(true);
  const lastMode = useRef(null);
  const occlusionBoxes = useMemo(
    () => [
      ...room.wallBoxes,
      ...(room.ceiling ? [room.ceiling] : []),
      // Dynamic pieces are left out: these boxes are read as fixed, and a
      // pushed chair would occlude from where it used to stand.
      ...room.furnitureBoxes.filter((item) => item.collider !== false && !item.dynamic),
    ],
    [room],
  );

  // Exposed for headless checks: with the camera you can project a known world
  // size to pixels and settle what the render is actually showing, and the
    // scene lets a check walk the real graph instead of guessing from a frame.
  useEffect(() => {
    gameDebug.camera = camera;
    gameDebug.scene = scene;
  }, [camera, scene]);

  useFrame((frame, delta) => {
    const dt = Math.min(delta, MAX_DT);
    const values = runtime.values;

    // Instrument mode takes the camera off the player and walks it to the
    // framing pose stored on the apparatus; a running consultation does the
    // same toward the doctor's chair. Eased rather than cut, so the player
    // keeps their bearings and can see which thing they stepped up to.
    const using = getInteraction().using;
    const seat = using?.framing ? null : consultationSeatFraming();
    const framing = using?.framing ?? seat;
    if (framing) {
      const focus = focusRef.current;
      const kind = seat || using?.kind === 'seat' ? 'seat' : 'instrument';
      const focusKey = kind === 'instrument' ? using?.id : kind;
      if (!focus.armed || focus.key !== focusKey) {
        // Start the ease from wherever the camera already is.
        focus.armed = true;
        focus.kind = kind;
        focus.key = focusKey;
        focus.settled = false;
        focus.position.copy(camera.position);
        focus.target.set(...framing.target);
        if (kind === 'instrument') resetInstrumentZoom();
      }
      const blend = 1 - Math.exp(-dt * 6);
      focus.position.lerp(scratchPosition.set(...framing.position), blend);
      camera.position.copy(focus.position);

      if (focus.settled) {
        // Seated and instrument views share a fixed eye: drag changes aim and
        // the wheel changes field of view, without moving the player.
        const pitchLimit = kind === 'seat' ? [-0.55, 0.8] : [-0.95, 0.95];
        look.look.pitch = clamp(look.look.pitch, pitchLimit[0], pitchLimit[1]);
        const pitch = -look.look.pitch;
        const yaw = look.look.yaw;
        const cos = Math.cos(pitch);
        camera.lookAt(
          focus.position.x - Math.sin(yaw) * cos,
          focus.position.y + Math.sin(pitch),
          focus.position.z - Math.cos(yaw) * cos,
        );
      } else {
        focus.target.lerp(scratchTarget.set(...framing.target), blend);
        camera.lookAt(focus.target);
        if (focus.position.distanceTo(scratchPosition) < 0.06) {
          // Arrived: hand the aim to the player exactly where the ease left
          // it, so control begins without a jump.
          const dx = focus.target.x - focus.position.x;
          const dy = focus.target.y - focus.position.y;
          const dz = focus.target.z - focus.position.z;
          look.set(Math.atan2(-dx, -dz), -Math.atan2(dy, Math.hypot(dx, dz)));
          focus.settled = true;
        }
      }

      const fovTarget = kind === 'seat'
        ? (using?.kind === 'seat' ? framing.fov ?? values.fov : seatFov())
        : instrumentFov(framing.fov ?? values.fov);
      const nextFov = damp(camera.fov, fovTarget, 9, dt);
      if (camera.fov !== nextFov) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
      smoothedRef.current = null;
      // Instrument framings are first-person and hide the figure; a framing
      // that stages the player (the smoking ritual) keeps them on screen.
      gameDebug.player.visible = framing.showPlayer === true;
      return;
    }
    if (focusRef.current.armed) {
      // Coming back out: seed the boom from where the camera actually is, so
      // it eases home instead of snapping.
      focusRef.current.armed = false;
      smoothedRef.current = null;
      if (camera.fov !== values.fov) {
        camera.fov = values.fov;
        camera.updateProjectionMatrix();
      }
    }

    // The shot harness drives the camera directly; damping and occlusion
    // would fight it, so nothing else runs on those frames.
    const free = gameDebug.freeCamera;
    if (free) {
      const cos = Math.cos(free.pitch);
      camera.position.set(free.position[0], free.position[1], free.position[2]);
      camera.lookAt(
        free.position[0] - Math.sin(free.yaw) * cos,
        free.position[1] + Math.sin(free.pitch),
        free.position[2] - Math.cos(free.yaw) * cos,
      );
      smoothedRef.current = null;
      gameDebug.stats.cameraYaw = free.yaw;
      gameDebug.stats.cameraDistance = 0;
      return;
    }

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
      const previous = lastMode.current;
      const hero = heroRef.current;
      if (previous === 'hero') {
        hero.pitch = look.look.pitch;
        // Shoulder mode should inherit the view the player was just using,
        // rather than snapping back to its pre-hero mouse yaw.
        look.set(hero.yaw, hero.pitch);
      }
      smoothedRef.current = null;
      if (mode === 'hero') {
        hero.yaw = gameDebug.player.yaw;
        if (hero.pitch === null) hero.pitch = values.heroDefaultPitch;
        look.set(look.look.yaw, hero.pitch);
        hero.lastLookYaw = look.look.yaw;
        hero.lastLookRevision = look.look.revision ?? 0;
        hero.lastOrbitTime = frame.clock.elapsedTime;
      }
      lastMode.current = mode;
    }

    look.look.pitch = clampPitch(look.look.pitch, values);
    const playerPos = gameDebug.player.position;
    const postureHeight = clamp(
      Number(gameDebug.player.cameraHeight) || ANCHOR_HEIGHT,
      0.4,
      ANCHOR_HEIGHT,
    );
    gameDebug.player.visible = mode !== 'first';

    if (mode === 'first') {
      // Mouse-down pitch looks down, matching the third-person feel.
      const pitch = -look.look.pitch;
      const yaw = look.look.yaw;
      const cos = Math.cos(pitch);
      const eyeHeight = postureHeight + (EYE_HEIGHT - ANCHOR_HEIGHT);
      camera.position.set(playerPos[0], playerPos[1] + eyeHeight, playerPos[2]);
      camera.lookAt(
        playerPos[0] - Math.sin(yaw) * cos,
        playerPos[1] + eyeHeight + Math.sin(pitch),
        playerPos[2] - Math.cos(yaw) * cos,
      );
      gameDebug.stats.cameraYaw = yaw;
      gameDebug.stats.cameraDistance = 0;
      return;
    }

    if (mode === 'overhead') {
      const height = values.overheadHeight * values.overheadZoom;
      const target = [playerPos[0], playerPos[1] + height, playerPos[2] + 0.01];
      let smoothed = smoothedRef.current;
      if (!smoothed) {
        smoothed = smoothedRef.current = { eye: [...target], look: [...playerPos], distance: height };
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
      gameDebug.stats.cameraDistance = height;
      return;
    }

    // Shoulder remains a direct mouse orbit. Hero holds a world-space yaw so
    // a manual orbit stays put, then recentres only after movement resumes.
    let yaw = look.look.yaw;
    let side = values.shoulderSide;
    let up = values.shoulderUp;
    let back = values.shoulderBack;
    let zoom = values.cameraZoom;
    let positionDamping = values.positionDamping;
    let yDamping = values.yDamping;
    let occlusionReturn = values.occlusionReturn;
    let collisionRadius = 0;
    let lookPoint = playerPos;
    if (mode === 'hero') {
      const hero = heroRef.current;
      const revision = look.look.revision ?? 0;
      let manualDelta = 0;
      if (revision !== hero.lastLookRevision) {
        manualDelta = look.look.yaw - hero.lastLookYaw;
        hero.lastOrbitTime = frame.clock.elapsedTime;
      }
      hero.lastLookYaw = look.look.yaw;
      hero.lastLookRevision = revision;

      const velocity = gameDebug.player.velocity ?? [0, 0, 0];
      const speed = Math.hypot(velocity[0], velocity[2]);
      hero.yaw = heroFollowYaw({
        cameraYaw: hero.yaw,
        playerYaw: gameDebug.player.yaw,
        manualDelta,
        idleSeconds: frame.clock.elapsedTime - hero.lastOrbitTime,
        moving: speed > 0.15,
        followRate: values.heroFollowRate,
        recenterDelay: values.heroRecenterDelay,
        dt,
      });
      hero.pitch = look.look.pitch;
      yaw = hero.yaw;
      side = values.heroSide;
      up = values.heroUp;
      back = values.heroBack;
      zoom = values.heroZoom;
      positionDamping = values.heroPositionDamping;
      yDamping = values.heroYDamping;
      occlusionReturn = values.heroOcclusionReturn;
      collisionRadius = values.heroCollisionRadius;
      lookPoint = heroLookAhead(playerPos, velocity, values.heroLookAhead, values.walkSpeed);

      const runBlend = clamp(
        (speed - values.walkSpeed) / Math.max(values.runSpeed - values.walkSpeed, 0.01),
        0,
        1,
      );
      const heroFov = values.heroFov + values.heroRunFovBoost * runBlend;
      if (camera.fov !== heroFov) {
        camera.fov = heroFov;
        camera.updateProjectionMatrix();
      }
    }

    const responsiveBoom = responsiveCameraBoom({
      width: viewportSize.width,
      height: viewportSize.height,
      side,
      back,
    });
    side = responsiveBoom.side;
    back = responsiveBoom.back;

    // Zoom scales the whole boom, so the framing angle holds as it dollies.
    const anchor = [lookPoint[0], playerPos[1] + postureHeight, lookPoint[2]];
    const cameraPlayerPos = [
      playerPos[0],
      playerPos[1] + postureHeight - ANCHOR_HEIGHT,
      playerPos[2],
    ];
    const eyeTarget = computeEyeTarget({
      playerPos: cameraPlayerPos,
      yaw,
      pitch: look.look.pitch,
      side: side * zoom,
      up: up * zoom,
      back: back * zoom,
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
      radius: collisionRadius,
    });

    let smoothed = smoothedRef.current;
    if (!smoothed) {
      smoothed = smoothedRef.current = { eye: [...eyeTarget], look: [...anchor], distance: allowed };
    }
    const pullLambda = allowed < smoothed.distance ? values.occlusionPullIn : occlusionReturn;
    smoothed.distance = damp(smoothed.distance, allowed, pullLambda, dt);

    const scale = full > 1e-6 ? smoothed.distance / full : 1;
    const target = [
      anchor[0] + (eyeTarget[0] - anchor[0]) * scale,
      anchor[1] + (eyeTarget[1] - anchor[1]) * scale,
      anchor[2] + (eyeTarget[2] - anchor[2]) * scale,
    ];

    // Vertical damped separately and softer, so ground bumps do not bounce the frame.
    smoothed.eye[0] = damp(smoothed.eye[0], target[0], positionDamping, dt);
    smoothed.eye[1] = damp(smoothed.eye[1], target[1], yDamping, dt);
    smoothed.eye[2] = damp(smoothed.eye[2], target[2], positionDamping, dt);
    smoothed.look[0] = damp(smoothed.look[0], anchor[0], positionDamping * 1.4, dt);
    smoothed.look[1] = damp(smoothed.look[1], anchor[1], yDamping * 1.5, dt);
    smoothed.look[2] = damp(smoothed.look[2], anchor[2], positionDamping * 1.4, dt);

    camera.position.set(smoothed.eye[0], smoothed.eye[1], smoothed.eye[2]);
    camera.lookAt(smoothed.look[0], smoothed.look[1], smoothed.look[2]);
    gameDebug.stats.cameraYaw = yaw;
    gameDebug.stats.cameraDistance = smoothed.distance;
  });

  return null;
}

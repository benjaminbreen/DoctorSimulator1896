import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { gameDebug } from '../debug.js';

// The rigged player: a Tripo-authored figure with Mixamo idle and walk clips,
// assembled by scripts/characters/export_tripo_player.py.
// Mounted OUTSIDE the RigidBody — suspending a loader inside the physics
// subtree crashed React's dev logging on the model's circular scene graph — so
// it follows the capsule from the debug handle instead of being parented to it.
const MODEL = '/models/tripo-victorian-player.glb?v=arm-retarget-all-clips';

// Ground the Mixamo walk covers per second at timeScale 1. Playback scales
// with real speed so the feet roughly keep up, but the game's walk is far
// faster than a person's, so the ratio is capped low: an ambling stride that
// slides a little reads better than legs pumping at double speed.
const CLIP_SPEED = 1.4;
const MAX_PLAYBACK = 1.3;
const RUN_CLIP_SPEED = 3.2;
const MAX_RUN_PLAYBACK = 1.3;
// Below this the figure stands still rather than shuffling in place.
const MOVING = 0.25;
// Mixamo's FBX importer leaves this Tripo mesh lying along +Z. Stand it up
// before measuring it; otherwise its body thickness is mistaken for height.
const MODEL_UP = -Math.PI / 2;
// The Mixamo rig faces +Z; the game's yaw 0 faces -Z (see camera/cameraMath.js).
const FACING = Math.PI;

export default function PlayerAvatar({ runtime, onReady }) {
  const groupRef = useRef();
  const gltf = useLoader(GLTFLoader, MODEL, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));

  // The master figure is 1.80m; the capsule it stands in is shorter. Match the
  // collider, so what you walk into is what you see.
  const capsuleHeight = 2 * (runtime.values.capsuleHalfHeight + runtime.values.capsuleRadius);

  const { scene, mixer, idle, walk, run, jump, standingJump, fit } = useMemo(() => {
    // Used as loaded, not cloned: Object3D.clone leaves a SkinnedMesh bound to
    // the original bones, so the copy renders in bind pose while the clip
    // plays on bones nothing is skinned to. There is only ever one player.
    const root = gltf.scene;
    root.rotation.x = MODEL_UP;
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      object.userData = {};
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // A skinned figure's bounds are its bind pose, which the walk leaves.
      object.frustumCulled = false;
    });
    const animations = new THREE.AnimationMixer(root);
    const clip = (name) => {
      const found = gltf.animations.find((entry) => entry.name === name);
      return found ? animations.clipAction(found) : null;
    };
    const bounds = new THREE.Box3().setFromObject(root);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    return {
      scene: root,
      mixer: animations,
      idle: clip('StandingIdle'),
      walk: clip('Walk'),
      run: clip('Run'),
      jump: clip('Jump'),
      standingJump: clip('StandingJump'),
      fit: capsuleHeight / height,
    };
  }, [gltf, capsuleHeight]);

  useEffect(() => {
    idle?.play();
    walk?.play().setEffectiveWeight(0);
    run?.play().setEffectiveWeight(0);
    for (const action of [jump, standingJump]) {
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    }
    return () => mixer.stopAllAction();
  }, [mixer, idle, walk, run, jump, standingJump]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const last = useRef(null);
  const wasGrounded = useRef(false);
  const activeJump = useRef(null);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const [x, y, z] = gameDebug.player.position;

    // Speed from the position it actually moved, so this needs nothing from
    // the physics rig beyond what the debug handle already carries.
    let speed = 0;
    if (last.current && delta > 0) {
      speed = Math.hypot(x - last.current[0], z - last.current[1]) / delta;
    }
    last.current = [x, z];

    const grounded = gameDebug.player.grounded;
    const moving = speed > MOVING;
    const runThreshold = (runtime.values.walkSpeed + runtime.values.runSpeed) / 2;
    const running = grounded && moving && speed >= runThreshold;
    if (!grounded && wasGrounded.current) {
      const selected = moving ? jump : standingJump;
      activeJump.current?.stop();
      activeJump.current = selected;
      selected?.reset().fadeIn(0.08).play();
    } else if (grounded && !wasGrounded.current && activeJump.current) {
      activeJump.current.fadeOut(0.12);
      activeJump.current = null;
    }
    wasGrounded.current = grounded;

    if (walk && idle && run) {
      // Crossfade by hand because the weights follow continuously changing
      // movement speed rather than a single state transition.
      const idleTarget = grounded && !moving ? 1 : 0;
      const walkTarget = grounded && moving && !running ? 1 : 0;
      const runTarget = running ? 1 : 0;
      idle.setEffectiveWeight(
        THREE.MathUtils.damp(idle.getEffectiveWeight(), idleTarget, 12, delta),
      );
      walk.setEffectiveWeight(
        THREE.MathUtils.damp(walk.getEffectiveWeight(), walkTarget, 12, delta),
      );
      run.setEffectiveWeight(
        THREE.MathUtils.damp(run.getEffectiveWeight(), runTarget, 12, delta),
      );
      walk.setEffectiveTimeScale(Math.min(MAX_PLAYBACK, Math.max(0.6, speed / CLIP_SPEED)));
      run.setEffectiveTimeScale(
        Math.min(MAX_RUN_PLAYBACK, Math.max(0.75, speed / RUN_CLIP_SPEED)),
      );
    }
    mixer.update(delta);

    group.position.set(x, y, z);
    group.rotation.y = gameDebug.player.yaw + FACING;
    group.visible = gameDebug.player.visible !== false;
  });

  return (
    <group ref={groupRef} scale={fit}>
      <primitive object={scene} />
    </group>
  );
}

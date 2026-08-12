import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { getInteraction, useInstrument, stopUsing } from '../world/interaction.js';
import { applyPlayerEvent } from '../world/player.js';
import { gameDebug } from '../debug.js';

// The pipe by the day bed can be smoked. On E the room's pipe leaves the
// table (the hidden-group mechanism), a working copy goes into the player's
// hand, the Mixamo smoking loop takes the body, and the camera walks a slow
// push-in while the bowl smolders and the exhale drifts up through the
// lamplight. Leaving applies the ledger entry: the nerves ease, the body
// pays. The ritual ends on E or Escape.

// Where the drag and the exhale fall, as fractions of the smoking clip.
// Tuned by eye against the Mixamo loop rather than read from the file.
const DRAW = [0.2, 0.36];
const EXHALE = [0.42, 0.68];

// Pipe pose in the right hand. The bone's +Y runs out along the fingers, so
// the stem is turned onto that axis, mouth end proximal.
const HAND_POSITION = [0.01, 0.1, 0.03];
const HAND_ROTATION = [0.25, 0, Math.PI / 2];

// The player smokes at the east side table, facing a wall. A camera in
// front of the figure would stand inside it, so the shot is a profile from
// whichever side has open floor, held inside the study's walls.
const STUDY_CENTRE = [-2.1, 7.3];
const CAMERA_X = [-3.6, -0.4];
const CAMERA_Z = [5.65, 9.1];

const MAX_PARTICLES = 130;
const scratch = new THREE.Vector3();
const scratchB = new THREE.Vector3();

function flickerNoise(time, seed) {
  return (
    Math.sin(time * 11.3 + seed) * 0.5 +
    Math.sin(time * 23.7 + seed * 2.9) * 0.3 +
    Math.sin(time * 41.9 + seed * 5.3) * 0.2
  );
}

// A ragged soft blob: dense core, torn edge. Rotated per particle in the
// shader, so a handful of sprites reads as churning smoke rather than a
// stack of identical discs.
function smokeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const core = context.createRadialGradient(64, 64, 4, 64, 64, 60);
  core.addColorStop(0, 'rgba(255,255,255,0.85)');
  core.addColorStop(0.4, 'rgba(255,255,255,0.42)');
  core.addColorStop(0.75, 'rgba(255,255,255,0.12)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = core;
  context.fillRect(0, 0, size, size);
  // Bite pieces out of the rim so the silhouette is not a circle.
  context.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2 + Math.sin(i * 37.7) * 0.6;
    const reach = 38 + Math.abs(Math.sin(i * 12.9)) * 24;
    const radius = 7 + Math.abs(Math.sin(i * 5.3)) * 13;
    const bite = context.createRadialGradient(
      64 + Math.cos(angle) * reach, 64 + Math.sin(angle) * reach, 1,
      64 + Math.cos(angle) * reach, 64 + Math.sin(angle) * reach, radius,
    );
    bite.addColorStop(0, 'rgba(0,0,0,0.75)');
    bite.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = bite;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A small teardrop of lamp-flame for the bowl while the player draws.
function flameTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.translate(32, 34);
  context.scale(1, 1.55);
  const glow = context.createRadialGradient(0, 0, 1, 0, 0, 20);
  glow.addColorStop(0, 'rgba(255,244,196,0.95)');
  glow.addColorStop(0.35, 'rgba(255,178,84,0.8)');
  glow.addColorStop(0.7, 'rgba(255,96,28,0.28)');
  glow.addColorStop(1, 'rgba(255,60,10,0)');
  context.fillStyle = glow;
  context.fillRect(-32, -22, 64, 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The pipe the hand holds: the same piece that lies on the tray, minus the
// tray. Authored along +X, mouth at -X, bowl standing up a third from the
// far end.
function buildHandPipe() {
  const group = new THREE.Group();
  const stemLength = 0.44;
  const bamboo = new THREE.MeshStandardMaterial({ color: '#7a5a33', roughness: 0.55 });
  const horn = new THREE.MeshStandardMaterial({ color: '#33261b', roughness: 0.4 });
  const brass = new THREE.MeshStandardMaterial({ color: '#8a6b3a', roughness: 0.35, metalness: 0.5 });
  const clay = new THREE.MeshStandardMaterial({ color: '#8a4a3a', roughness: 0.7 });

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, stemLength, 10), bamboo);
  stem.rotation.z = Math.PI / 2;
  stem.castShadow = true;
  group.add(stem);
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.035, 10), horn);
    cap.rotation.z = Math.PI / 2;
    cap.position.x = side * (stemLength / 2 - 0.014);
    group.add(cap);
  }
  const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 10), brass);
  saddle.rotation.z = Math.PI / 2;
  saddle.position.x = stemLength * 0.24;
  group.add(saddle);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.031, 14, 10), clay);
  bowl.position.set(stemLength * 0.24, 0.028, 0);
  bowl.castShadow = true;
  group.add(bowl);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.014, 10), horn);
  crown.position.set(stemLength * 0.24, 0.058, 0);
  group.add(crown);

  return { group, bowl };
}

function buildParticles(map) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const alphas = new Float32Array(MAX_PARTICLES);
  const angles = new Float32Array(MAX_PARTICLES);
  const warms = new Float32Array(MAX_PARTICLES);
  positions.fill(-100);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute('aWarm', new THREE.BufferAttribute(warms, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: map } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aAngle;
      attribute float aWarm;
      varying float vAlpha;
      varying float vAngle;
      varying float vWarm;
      void main() {
        vAlpha = aAlpha;
        vAngle = aAngle;
        vWarm = aWarm;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (300.0 / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      varying float vAlpha;
      varying float vAngle;
      varying float vWarm;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float c = cos(vAngle);
        float s = sin(vAngle);
        uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
        float a = texture2D(map, uv).a * vAlpha;
        if (a < 0.008) discard;
        // Fresh smoke is warmed by the lamp; it cools to blue-grey as it
        // spreads toward the ceiling.
        vec3 cool = vec3(0.60, 0.64, 0.70);
        vec3 warm = vec3(0.78, 0.69, 0.55);
        gl_FragColor = vec4(mix(cool, warm, vWarm), a);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 6;

  const pool = Array.from({ length: MAX_PARTICLES }, () => ({
    alive: false,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    life: 0,
    maxLife: 1,
    size0: 0.1,
    size1: 0.4,
    peak: 0.3,
    spin: 0,
    angle: 0,
    warm: 0,
    seed: Math.random() * 100,
  }));

  return { geometry, material, points, pool };
}

function spawn(pool, options) {
  const particle = pool.find((entry) => !entry.alive);
  if (!particle) return;
  particle.alive = true;
  particle.life = 0;
  particle.maxLife = options.maxLife;
  particle.position.copy(options.position);
  particle.velocity.copy(options.velocity);
  particle.size0 = options.size0;
  particle.size1 = options.size1;
  particle.peak = options.peak;
  particle.spin = (Math.random() - 0.5) * options.spin;
  particle.angle = Math.random() * Math.PI * 2;
  particle.warm = options.warm;
}

export default function OpiumRitual() {
  const smokeMap = useMemo(smokeTexture, []);
  const flameMap = useMemo(flameTexture, []);
  const particles = useMemo(() => buildParticles(smokeMap), [smokeMap]);
  const fxRef = useRef(null);
  const flameRef = useRef(null);
  const emberRef = useRef(null);
  const lightRef = useRef(null);

  const stateRef = useRef({
    active: false,
    since: 0,
    framing: null,
    anchor: null, // player position, yaw, and chosen camera side at ritual start
    pipe: null,
    hand: null,
    head: null,
    wispTimer: 0,
    exhaleTimer: 0,
    detachTimer: null,
    end: null,
  });

  useEffect(() => {
    const state = stateRef.current;

    const detachPipe = () => {
      if (state.pipe && state.hand) state.hand.remove(state.pipe.group);
      state.pipe = null;
      state.hand = null;
      state.head = null;
    };

    // Ends the ritual from any direction — the key, Escape, or something
    // else clearing the interaction — so the ledger entry never gets lost.
    const end = () => {
      if (!state.active) return;
      state.active = false;
      // Only release the interaction if it is still ours — when another mode
      // has already taken it, clearing it would end that mode too.
      if (getInteraction().using?.id === 'smoke-pipe') stopUsing();
      // The figure is easing out of the loop; the pipe leaves the hand once
      // the arm is back down, and the one on the tray returns with it.
      state.detachTimer = setTimeout(detachPipe, 700);
      const seconds = (performance.now() - state.since) / 1000;
      const relief = Math.min(32, 5 + seconds * 3.2);
      const cost = Math.min(4, seconds * 0.45);
      applyPlayerEvent({
        source: 'opium',
        label: 'Smoked the opium pipe',
        note: 'The craving loosens its grip — for now.',
        changes: { neurasthenia: -relief, health: -cost },
      });
    };
    state.end = end;

    const begin = (reach) => {
      const root = gameDebug.avatarRoot;
      if (!root) return;
      let hand = null;
      let head = null;
      root.traverse((node) => {
        if (!node.isBone) return;
        if (!hand && /RightHand$/.test(node.name)) hand = node;
        if (!head && /Head$/.test(node.name)) head = node;
      });
      if (!hand) return;
      // A fresh start within the fade-out window would otherwise stack a
      // second pipe in the hand.
      if (state.detachTimer) clearTimeout(state.detachTimer);
      detachPipe();
      state.head = head;

      const pipe = buildHandPipe();
      hand.add(pipe.group);
      hand.updateWorldMatrix(true, false);
      hand.getWorldScale(scratch);
      const inverse = 1 / Math.max(scratch.x, 1e-6);
      pipe.group.scale.setScalar(inverse);
      pipe.group.position.set(
        HAND_POSITION[0] * inverse,
        HAND_POSITION[1] * inverse,
        HAND_POSITION[2] * inverse,
      );
      pipe.group.rotation.set(...HAND_ROTATION);

      const [x, , z] = gameDebug.player.position;
      const yaw = gameDebug.player.yaw;
      // A camera position `d` metres out at `a` is anchor - (sin a, cos a)·d;
      // a = yaw is dead ahead. Offer the two near-profile angles and keep
      // the one that lands nearer the open middle of the room.
      const side = [yaw + Math.PI / 2 + 0.2, yaw - Math.PI / 2 - 0.2]
        .map((angle) => ({
          angle,
          distance:
            (x - Math.sin(angle) * 2.4 - STUDY_CENTRE[0]) ** 2 +
            (z - Math.cos(angle) * 2.4 - STUDY_CENTRE[1]) ** 2,
        }))
        .sort((a, b) => a.distance - b.distance)[0].angle;
      state.anchor = { x, z, yaw, side };
      // Seeded with the real opening pose so the camera never eases toward
      // the figure itself on the first frame.
      state.framing = {
        position: [
          Math.min(CAMERA_X[1], Math.max(CAMERA_X[0], x - Math.sin(side) * 2.45)),
          1.5,
          Math.min(CAMERA_Z[1], Math.max(CAMERA_Z[0], z - Math.cos(side) * 2.45)),
        ],
        target: [x - Math.sin(yaw) * 0.12, 1.3, z - Math.cos(yaw) * 0.12],
        fov: 44,
        showPlayer: true,
      };
      state.pipe = pipe;
      state.hand = hand;
      state.active = true;
      state.since = performance.now();
      state.wispTimer = 0;
      state.exhaleTimer = 0;
      useInstrument({ id: 'smoke-pipe', item: reach.item, framing: state.framing });
    };

    const onKey = (event) => {
      if (event.code === 'Escape' && state.active) {
        end();
        return;
      }
      if (event.code !== 'KeyE') return;
      const now = performance.now();
      if (state.active) {
        // The same key lights and lays it down; the delay swallows the press
        // that started the ritual.
        if (now - state.since > 600) end();
        return;
      }
      const reach = getInteraction().reach;
      if (!reach?.id?.startsWith('study-pipe')) return;
      begin(reach);
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      end();
      if (state.detachTimer) clearTimeout(state.detachTimer);
      detachPipe();
      state.end = null;
    };
  }, []);

  useFrame((frame, delta) => {
    const state = stateRef.current;
    const time = frame.clock.elapsedTime;

    // Something else may have ended the ritual (another mode taking the
    // interaction). Close it out properly so the ledger entry still lands.
    if (state.active && getInteraction().using?.id !== 'smoke-pipe') {
      state.end?.();
    }

    // Where in the loop the body is: the drag and the exhale hang off the
    // clip's own clock, so the smoke stays in step however the loop settles.
    let draw = 0;
    let exhaling = false;
    const action = gameDebug.smokingAction;
    if (state.active && action) {
      const duration = action.getClip()?.duration || 1;
      const phase = (action.time % duration) / duration;
      if (phase > DRAW[0] && phase < DRAW[1]) {
        const span = DRAW[1] - DRAW[0];
        const at = (phase - DRAW[0]) / span;
        draw = Math.sin(at * Math.PI);
      }
      exhaling = phase > EXHALE[0] && phase < EXHALE[1];
    }

    // Bowl and mouth in world space, from the animated bones themselves.
    let bowl = null;
    let mouth = null;
    if (state.active && state.pipe) {
      bowl = state.pipe.bowl.getWorldPosition(scratch);
      if (state.head) {
        mouth = state.head.getWorldPosition(scratchB);
        mouth.y += 0.02;
        mouth.x -= Math.sin(state.anchor.yaw) * 0.1;
        mouth.z -= Math.cos(state.anchor.yaw) * 0.1;
      }
    }

    // The bowl's fire: ember and flame breathe with the drag.
    const fx = fxRef.current;
    if (fx) {
      fx.visible = Boolean(bowl);
      if (bowl) fx.position.copy(bowl);
      const flicker = 1 + flickerNoise(time, 3.7) * 0.22;
      if (lightRef.current) lightRef.current.intensity = draw * 1.6 * flicker;
      if (emberRef.current) {
        emberRef.current.material.opacity = 0.25 + draw * 0.75;
        const pulse = 0.8 + draw * 0.5 * flicker;
        emberRef.current.scale.setScalar(pulse);
      }
      if (flameRef.current) {
        flameRef.current.material.opacity = draw * 0.9;
        flameRef.current.scale.set(
          0.05 + draw * 0.02 * flicker,
          0.07 + draw * 0.05 * flicker,
          1,
        );
        flameRef.current.position.y = 0.045 + draw * 0.012;
      }
    }

    // Emission. The bowl wisps while lit — thinner mid-drag, when the smoke
    // is going into the pipe — and the exhale comes off the mouth in a slow
    // forward plume.
    if (state.active && bowl) {
      state.wispTimer -= delta;
      const wispRate = 0.16 + draw * 0.1;
      if (state.wispTimer <= 0) {
        state.wispTimer = wispRate;
        spawn(particles.pool, {
          position: scratch.clone().setY(scratch.y + 0.05),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 0.03,
            0.1 + Math.random() * 0.05,
            (Math.random() - 0.5) * 0.03,
          ),
          maxLife: 2.4 + Math.random() * 0.8,
          size0: 0.03,
          size1: 0.22 + Math.random() * 0.1,
          peak: 0.16,
          spin: 1.6,
          warm: 0.75,
        });
      }
    }
    if (state.active && exhaling && mouth) {
      state.exhaleTimer -= delta;
      if (state.exhaleTimer <= 0) {
        state.exhaleTimer = 0.05;
        const forwardX = -Math.sin(state.anchor.yaw);
        const forwardZ = -Math.cos(state.anchor.yaw);
        spawn(particles.pool, {
          position: mouth,
          velocity: new THREE.Vector3(
            forwardX * (0.32 + Math.random() * 0.2) + (Math.random() - 0.5) * 0.08,
            0.14 + Math.random() * 0.1,
            forwardZ * (0.32 + Math.random() * 0.2) + (Math.random() - 0.5) * 0.08,
          ),
          maxLife: 3.6 + Math.random() * 1.8,
          size0: 0.07,
          size1: 0.55 + Math.random() * 0.35,
          peak: 0.34,
          spin: 1.1,
          warm: 0.25,
        });
      }
    }

    // Step the smoke. Buoyant, dragged, and stirred sideways so a plume
    // curls instead of rising in a rope.
    const attrs = particles.geometry.attributes;
    particles.pool.forEach((particle, index) => {
      if (!particle.alive) {
        attrs.aAlpha.array[index] = 0;
        return;
      }
      particle.life += delta;
      if (particle.life >= particle.maxLife) {
        particle.alive = false;
        attrs.aAlpha.array[index] = 0;
        attrs.position.array[index * 3 + 1] = -100;
        return;
      }
      const t = particle.life / particle.maxLife;
      particle.velocity.y += 0.055 * delta;
      particle.velocity.multiplyScalar(Math.exp(-delta * 0.55));
      particle.velocity.x += Math.sin(time * 1.1 + particle.seed * 13.7) * 0.02 * delta;
      particle.velocity.z += Math.cos(time * 0.9 + particle.seed * 7.9) * 0.02 * delta;
      particle.position.addScaledVector(particle.velocity, delta);
      particle.angle += particle.spin * delta;

      // Quick fade-in, long fade-out; cools from lamp-warm to grey en route.
      const envelope = Math.min(t / 0.12, 1) * (1 - Math.max(0, (t - 0.45) / 0.55)) ** 1.4;
      attrs.position.array[index * 3] = particle.position.x;
      attrs.position.array[index * 3 + 1] = particle.position.y;
      attrs.position.array[index * 3 + 2] = particle.position.z;
      attrs.aAlpha.array[index] = particle.peak * envelope;
      attrs.aSize.array[index] = particle.size0 + (particle.size1 - particle.size0) * t ** 0.7;
      attrs.aAngle.array[index] = particle.angle;
      attrs.aWarm.array[index] = particle.warm * (1 - t * 0.8);
    });
    attrs.position.needsUpdate = true;
    attrs.aAlpha.needsUpdate = true;
    attrs.aSize.needsUpdate = true;
    attrs.aAngle.needsUpdate = true;
    attrs.aWarm.needsUpdate = true;

    // The camera: a slow push-in on the figure in near-profile, with the
    // faint drift of a handheld hold. The Knick's move, at gaslight pace.
    if (state.active && state.framing) {
      const seconds = (performance.now() - state.since) / 1000;
      const settle = 1 - Math.exp(-seconds / 9);
      const distance = 2.45 - 0.75 * settle;
      const height = 1.5 - 0.14 * settle;
      const angle = state.anchor.side + Math.sin(seconds * 0.13) * 0.05;
      const px = state.anchor.x - Math.sin(angle) * distance;
      const pz = state.anchor.z - Math.cos(angle) * distance;
      state.framing.position[0] = Math.min(CAMERA_X[1], Math.max(CAMERA_X[0], px));
      state.framing.position[1] = height + Math.sin(seconds * 0.21) * 0.015;
      state.framing.position[2] = Math.min(CAMERA_Z[1], Math.max(CAMERA_Z[0], pz));
      state.framing.target[0] = state.anchor.x - Math.sin(state.anchor.yaw) * 0.12;
      state.framing.target[1] = 1.3;
      state.framing.target[2] = state.anchor.z - Math.cos(state.anchor.yaw) * 0.12;
    }
  });

  useEffect(() => () => {
    particles.geometry.dispose();
    particles.material.dispose();
    smokeMap.dispose();
    flameMap.dispose();
  }, [particles, smokeMap, flameMap]);

  return (
    <group>
      <primitive object={particles.points} />
      <group ref={fxRef} visible={false}>
        <mesh ref={emberRef} position={[0, 0.028, 0]}>
          <sphereGeometry args={[0.014, 10, 8]} />
          <meshBasicMaterial color="#ff8a3d" transparent opacity={0.3} toneMapped={false} />
        </mesh>
        <sprite ref={flameRef} position={[0, 0.05, 0]}>
          <spriteMaterial
            map={flameMap}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            transparent
            toneMapped={false}
          />
        </sprite>
        <pointLight ref={lightRef} color="#ff9a4a" distance={1.8} decay={2} intensity={0} />
      </group>
    </group>
  );
}

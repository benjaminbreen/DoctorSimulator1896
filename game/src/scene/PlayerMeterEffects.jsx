import { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { gameDebug } from '../debug.js';
import { getPlayer, subscribePlayer } from '../world/player.js';
import { meterFeedbackStrength, meterFeedbackStyle } from '../world/meterFeedback.js';

const PARTICLES_PER_METER = 18;
const PARTICLE_COUNT = PARTICLES_PER_METER * 2;
const EFFECT_SECONDS = 1.35;
const HEALTH_INDEX = 0;
const NERVES_INDEX = 1;
const particleObject = new THREE.Object3D();
const particleColor = new THREE.Color();
const AURA_VERTEX = `
  varying vec3 vNormalView;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    vLocalPosition = position;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const AURA_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec3 vNormalView;
  varying vec3 vViewDirection;
  varying vec3 vLocalPosition;
  void main() {
    float rim = 1.0 - abs(dot(normalize(vNormalView), normalize(vViewDirection)));
    rim = pow(clamp(rim, 0.0, 1.0), 1.45);
    float drift = sin(vLocalPosition.y * 16.0 + uTime * 4.2)
      * sin((vLocalPosition.x + vLocalPosition.z) * 13.0 - uTime * 2.7);
    float veil = 0.62 + drift * 0.25;
    float alpha = uOpacity * rim * veil;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;
const CLOUD_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const CLOUD_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float distanceFromCenter = length(p * vec2(1.0, 1.18));
    float softBody = smoothstep(0.52, 0.08, distanceFromCenter);
    float ribbons = sin(p.x * 19.0 + uTime * 2.8)
      * sin(p.y * 23.0 - uTime * 1.9);
    float eddies = sin((p.x + p.y) * 31.0 + uTime * 3.4);
    float veil = 0.46 + ribbons * 0.2 + eddies * 0.12;
    float alpha = uOpacity * softBody * clamp(veil, 0.08, 0.78);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const PARTICLES = Array.from({ length: PARTICLES_PER_METER }, (_, index) => ({
  angle: hash01(index * 5.13 + 1) * Math.PI * 2,
  height: hash01(index * 7.79 + 2),
  radius: hash01(index * 11.41 + 3),
  phase: hash01(index * 13.91 + 4),
  size: 0.044 + hash01(index * 17.17 + 5) * 0.052,
}));

function eventSeed(event, metric) {
  const text = `${event.source}:${metric}:${event.at}`;
  let seed = 0;
  for (let index = 0; index < text.length; index += 1) seed += text.charCodeAt(index) * (index + 1);
  return hash01(seed);
}

function beginEffect(target, metric, delta, event) {
  const style = meterFeedbackStyle(metric, delta);
  if (!style) return;
  const sameDirection = target.active
    && target.elapsed <= 0.3
    && Math.sign(target.delta) === Math.sign(delta);
  target.active = true;
  target.cleared = false;
  target.elapsed = 0;
  target.delta = sameDirection ? target.delta + delta : delta;
  target.style = style;
  target.seed = eventSeed(event, metric);
}

function envelopeAt(progress) {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) ** 0.72;
}

function hideInstances(mesh, start) {
  for (let index = 0; index < PARTICLES_PER_METER; index += 1) {
    particleObject.position.set(0, 0, 0);
    particleObject.scale.setScalar(0.0001);
    particleObject.updateMatrix();
    mesh.setMatrixAt(start + index, particleObject.matrix);
  }
}

function placeParticle(kind, particle, progress, seed) {
  const turn = particle.angle + seed * Math.PI * 2;
  if (kind === 'health-gain') {
    const cycle = (particle.height + progress * (1.08 + particle.phase * 0.5)) % 1;
    const radius = 0.28 + particle.radius * 0.24;
    particleObject.position.set(
      Math.cos(turn + progress * 0.45) * radius,
      0.08 + cycle * 1.72,
      Math.sin(turn + progress * 0.45) * radius * 0.74,
    );
  } else if (kind === 'health-loss') {
    const radius = (0.34 + particle.radius * 0.34) * (1 - progress * 0.62);
    particleObject.position.set(
      Math.cos(turn - progress * 0.7) * radius,
      0.18 + particle.height * 1.62 - progress * 0.16,
      Math.sin(turn - progress * 0.7) * radius * 0.72,
    );
  } else if (kind === 'neurasthenia-gain') {
    const radius = 0.2 + particle.radius * 0.38 + progress * 0.08;
    const jitter = Math.sin(progress * 28 + particle.phase * 19) * 0.045;
    particleObject.position.set(
      Math.cos(turn + progress * (2.2 + particle.phase)) * radius + jitter,
      1.25 + particle.height * 0.56 + progress * 0.18,
      Math.sin(turn + progress * (2.2 + particle.phase)) * radius * 0.78 - jitter,
    );
  } else {
    const radius = 0.18 + progress * (0.45 + particle.radius * 0.34);
    particleObject.position.set(
      Math.cos(turn + progress * 1.1) * radius,
      1.28 + particle.height * 0.45 + progress * 0.48,
      Math.sin(turn + progress * 1.1) * radius * 0.78,
    );
  }
}

function updateAura(effect, aura, band, progress, envelope) {
  const strength = meterFeedbackStrength(effect.delta);
  const gain = effect.delta > 0;
  aura.visible = true;
  aura.material.uniforms.uColor.value.set(effect.style.aura);
  aura.material.uniforms.uTime.value = effect.elapsed;

  if (effect.style.metric === 'health') {
    band.visible = true;
    band.material.color.set(effect.style.colors[1]);
    const pulse = 1 + Math.sin(progress * Math.PI * 3) * 0.025 * strength;
    aura.position.set(0, 0.92, 0);
    aura.scale.set(0.54 * pulse, 0.98 * pulse, 0.43 * pulse);
    aura.material.uniforms.uOpacity.value = envelope * (0.08 + strength * 0.09);
    band.position.y = gain ? 0.08 + progress * 1.72 : 1.7 - progress * 1.35;
    band.scale.setScalar(gain ? 0.82 + progress * 0.2 : 1.08 - progress * 0.28);
    band.material.opacity = envelope * (0.1 + strength * 0.14);
  } else {
    band.visible = false;
    const tremor = gain ? Math.sin(progress * 34) * 0.035 * strength : 0;
    aura.position.set(tremor, 1.51 + (gain ? 0 : progress * 0.18), -0.06);
    aura.scale.set(0.96 + progress * 0.16, 0.68 + progress * 0.12, 1);
    if (gameDebug.camera) aura.quaternion.copy(gameDebug.camera.quaternion);
    aura.material.uniforms.uOpacity.value = envelope * (0.16 + strength * 0.16);
  }
}

export default function PlayerMeterEffects() {
  const groupRef = useRef();
  const particlesRef = useRef();
  const healthAuraRef = useRef();
  const healthBandRef = useRef();
  const nervesAuraRef = useRef();
  const nervesBandRef = useRef();
  const lastEvent = useRef(getPlayer().log.at(-1) ?? null);
  const reducedMotion = useRef(false);
  const effects = useRef([
    { active: false, cleared: true, elapsed: 0, delta: 0, style: null, seed: 0 },
    { active: false, cleared: true, elapsed: 0, delta: 0, style: null, seed: 0 },
  ]);

  useLayoutEffect(() => {
    const mesh = particlesRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hideInstances(mesh, 0);
    hideInstances(mesh, PARTICLES_PER_METER);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useEffect(() => {
    const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = Boolean(media?.matches); };
    update();
    media?.addEventListener?.('change', update);
    return () => media?.removeEventListener?.('change', update);
  }, []);

  useEffect(() => subscribePlayer((next) => {
    const event = next.log.at(-1) ?? null;
    if (!event || event === lastEvent.current) return;
    lastEvent.current = event;
    const health = Number(event.changes?.health) || 0;
    const nerves = Number(event.changes?.neurasthenia) || 0;
    if (health) beginEffect(effects.current[HEALTH_INDEX], 'health', health, event);
    if (nerves) beginEffect(effects.current[NERVES_INDEX], 'neurasthenia', nerves, event);
  }), []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const mesh = particlesRef.current;
    if (!group || !mesh) return;
    const [x, y, z] = gameDebug.player.position;
    group.position.set(x, y, z);
    group.visible = gameDebug.player.visible !== false;

    const auraPairs = [
      [healthAuraRef.current, healthBandRef.current],
      [nervesAuraRef.current, nervesBandRef.current],
    ];
    let matricesChanged = false;
    let colorsChanged = false;
    for (let metricIndex = 0; metricIndex < effects.current.length; metricIndex += 1) {
      const effect = effects.current[metricIndex];
      const start = metricIndex * PARTICLES_PER_METER;
      const [aura, band] = auraPairs[metricIndex];
      if (!effect.active || !aura || !band) {
        if (aura) aura.visible = false;
        if (band) band.visible = false;
        if (!effect.cleared) {
          hideInstances(mesh, start);
          effect.cleared = true;
          matricesChanged = true;
        }
        continue;
      }
      effect.elapsed += Math.min(delta, 0.1);
      const progress = Math.min(1, effect.elapsed / EFFECT_SECONDS);
      const envelope = envelopeAt(progress);
      if (progress >= 1) {
        effect.active = false;
        aura.visible = false;
        band.visible = false;
        hideInstances(mesh, start);
        effect.cleared = true;
        matricesChanged = true;
        continue;
      }

      updateAura(effect, aura, band, reducedMotion.current ? 0.5 : progress, envelope);
      const strength = meterFeedbackStrength(effect.delta);
      const shown = reducedMotion.current ? 0 : Math.round(8 + strength * 10);
      for (let index = 0; index < PARTICLES_PER_METER; index += 1) {
        const instance = start + index;
        if (index >= shown) {
          particleObject.scale.setScalar(0.0001);
          particleObject.updateMatrix();
          mesh.setMatrixAt(instance, particleObject.matrix);
          matricesChanged = true;
          continue;
        }
        const particle = PARTICLES[index];
        placeParticle(effect.style.kind, particle, progress, effect.seed);
        const flutter = 0.72 + Math.sin(progress * 18 + particle.phase * 12) * 0.28;
        particleObject.rotation.set(progress * 4 + particle.phase, progress * 7, particle.angle);
        particleObject.scale.setScalar(particle.size * envelope * flutter * (0.78 + strength * 0.42));
        particleObject.updateMatrix();
        mesh.setMatrixAt(instance, particleObject.matrix);
        matricesChanged = true;
        particleColor.set(effect.style.colors[index % effect.style.colors.length]);
        particleColor.multiplyScalar(0.48 + envelope * 0.52);
        mesh.setColorAt(instance, particleColor);
        colorsChanged = true;
      }
    }
    if (matricesChanged) mesh.instanceMatrix.needsUpdate = true;
    if (colorsChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group ref={groupRef} visible={false}>
      <instancedMesh ref={particlesRef} args={[undefined, undefined, PARTICLE_COUNT]} frustumCulled={false}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <mesh ref={healthAuraRef} visible={false} frustumCulled={false}>
        <sphereGeometry args={[1, 20, 12]} />
        <shaderMaterial
          vertexShader={AURA_VERTEX}
          fragmentShader={AURA_FRAGMENT}
          uniforms={{
            uColor: { value: new THREE.Color('#7fa96d') },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
          }}
          transparent depthWrite={false} side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending} toneMapped={false}
        />
      </mesh>
      <mesh ref={healthBandRef} visible={false} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[0.52, 0.018, 6, 28]} />
        <meshBasicMaterial
          transparent opacity={0} depthWrite={false}
          blending={THREE.AdditiveBlending} toneMapped={false}
        />
      </mesh>
      <mesh ref={nervesAuraRef} visible={false} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          vertexShader={CLOUD_VERTEX}
          fragmentShader={CLOUD_FRAGMENT}
          uniforms={{
            uColor: { value: new THREE.Color('#7650a0') },
            uOpacity: { value: 0 },
            uTime: { value: 0 },
          }}
          transparent depthWrite={false} depthTest side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending} toneMapped={false}
        />
      </mesh>
      <mesh ref={nervesBandRef} visible={false} rotation={[Math.PI / 2, 0, 0]} frustumCulled={false}>
        <torusGeometry args={[0.45, 0.012, 6, 22, Math.PI * 1.55]} />
        <meshBasicMaterial
          transparent opacity={0} depthWrite={false}
          blending={THREE.AdditiveBlending} toneMapped={false}
        />
      </mesh>
    </group>
  );
}

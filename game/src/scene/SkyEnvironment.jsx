import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { environmentPalette, paletteDistance } from '../world/skyPalette.js';
import { gameDebug } from '../debug.js';

// Outdoor image-based light, rendered from the visible sky dome so the side
// of the street facing the sun gets the bright circumsolar sky and the other
// side the cooler zenith. Each refresh re-runs the PMREM chain and hitches,
// hence the long floor and movement thresholds below; brightness alone tracks
// every frame via environmentIntensity.
const PROBE_SIZE = 128;
const REFRESH_SECONDS = 8;
const CHANGE_THRESHOLD = 0.05;
// About two degrees of sun travel.
const SUN_CHANGE = 0.035;
// The sun disc is direct light's job; left in, it would double the key as a
// hard specular point. The clamp keeps the circumsolar glow, not the disc.
const PROBE_CLAMP = 2.4;
// Brings the dome's linear output down to the scale the old gradient probe
// was tuned at, so envIntensity keeps its meaning.
const PROBE_GAIN = 1.0;

const GRADIENT_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  void main() {
    float y = normalize(vDir).y;
    vec3 color = y > 0.0
      ? mix(uHorizon, uTop, smoothstep(0.0, 0.5, y))
      : mix(uHorizon, uGround, smoothstep(0.0, 0.35, -y));
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Probe-only tail for the dome's shader: clamp the disc, grey the sky under
// cloud, and put lit ground below the horizon where the dome has none.
const PROBE_TAIL = /* glsl */ `{
  vec3 probeSky = min(gl_FragColor.rgb, vec3(${PROBE_CLAMP.toFixed(2)}));
  float probeLuma = dot(probeSky, vec3(0.2126, 0.7152, 0.0722));
  probeSky = mix(probeSky, vec3(probeLuma), uProbeCloud);
  probeSky *= ${PROBE_GAIN.toFixed(2)};
  gl_FragColor.rgb = mix(probeSky, uProbeGround, smoothstep(0.0, -0.08, direction.y));
}
#include <tonemapping_fragment>`;

function createSkyProbeMesh(dome, uniforms) {
  const material = dome.material.clone();
  // Shared, not cloned: the dome's per-frame writes must reach the probe.
  material.uniforms = dome.material.uniforms;
  material.onBeforeCompile = (shader) => {
    dome.material.onBeforeCompile(shader);
    shader.uniforms.uProbeGround = uniforms.uGround;
    shader.uniforms.uProbeCloud = uniforms.uCloud;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uProbeGround;\nuniform float uProbeCloud;\nvoid main() {')
      .replace('#include <tonemapping_fragment>', PROBE_TAIL);
  };
  material.customProgramCacheKey = () => 'sky-probe-v1';
  const mesh = new THREE.Mesh(dome.geometry, material);
  mesh.scale.setScalar(40);
  return mesh;
}

export default function SkyEnvironment({ runtime }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const clock = useRef(REFRESH_SECONDS);
  const previous = useRef(null);
  const previousSun = useRef(new THREE.Vector3());
  const shotRevision = useRef(gameDebug.shotEnvironmentRevision);

  const probe = useMemo(() => {
    const uniforms = {
      uTop: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uGround: { value: new THREE.Vector3() },
      uCloud: { value: 0 },
    };
    const source = new THREE.Scene();
    // Stands in until the dome is found, which also covers the boot compile.
    const gradient = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms,
        vertexShader: `varying vec3 vDir;
          void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: GRADIENT_FRAGMENT,
      }),
    );
    source.add(gradient);
    return { source, uniforms, gradient, sky: null };
  }, []);

  // Layout effect: the stage's shader compile (also a layout effect, in a
  // parent mounted earlier) must see scene.environment, or every material
  // boot-compiles without an envMap and recompiles when first seen in play.
  useLayoutEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    let target = null;
    const render = (palette) => {
      if (!probe.sky) {
        const dome = scene.getObjectByName('sky-dome');
        if (dome) {
          probe.sky = createSkyProbeMesh(dome, probe.uniforms);
          probe.source.add(probe.sky);
          probe.gradient.visible = false;
        }
      }
      probe.uniforms.uTop.value.fromArray(palette.top);
      probe.uniforms.uHorizon.value.fromArray(palette.horizon);
      probe.uniforms.uGround.value.fromArray(palette.ground);
      probe.uniforms.uCloud.value = Math.min(1, runtime.values.cloudCover * 0.35);
      const next = generator.fromScene(probe.source, 0, 1, 100, { size: PROBE_SIZE });
      target?.dispose();
      target = next;
      scene.environment = next.texture;
    };
    render(environmentPalette(runtime.values.timeOfDay, runtime.values.dayOfYear, runtime.values));
    probe.render = render;
    return () => {
      probe.render = null;
      scene.environment = null;
      target?.dispose();
      generator.dispose();
      probe.gradient.geometry.dispose();
      probe.gradient.material.dispose();
      if (probe.sky) {
        probe.sky.material.dispose();
        probe.source.remove(probe.sky);
        probe.sky = null;
        probe.gradient.visible = true;
      }
    };
  }, [gl, scene, probe, runtime]);

  useFrame((_, delta) => {
    const values = runtime.values;
    const palette = environmentPalette(values.timeOfDay, values.dayOfYear, values);
    // 1.4: fill moved here from the outdoor flat ambient, which now runs
    // near zero (see SkyRig).
    scene.environmentIntensity = values.envIntensity * 1.4 * palette.intensity;
    clock.current += delta;
    const shotChanged = shotRevision.current !== gameDebug.shotEnvironmentRevision;
    // Swap the stand-in gradient for the dome as soon as it exists, checking
    // at most once a second.
    const needsDome = !probe.sky && clock.current >= 1;
    if (!shotChanged && !needsDome && clock.current < REFRESH_SECONDS) return;
    const sun = probe.sky?.material.uniforms.sunPosition.value;
    const sunMoved = sun ? sun.distanceTo(previousSun.current) > SUN_CHANGE : false;
    if (!shotChanged && !needsDome && !sunMoved && previous.current
      && paletteDistance(previous.current, palette) < CHANGE_THRESHOLD) return;
    probe.render?.(palette);
    if (probe.sky) previousSun.current.copy(probe.sky.material.uniforms.sunPosition.value);
    previous.current = palette;
    shotRevision.current = gameDebug.shotEnvironmentRevision;
    clock.current = 0;
  });

  return null;
}

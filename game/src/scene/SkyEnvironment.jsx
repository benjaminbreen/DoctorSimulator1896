import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { environmentPalette, paletteDistance } from '../world/skyPalette.js';

// Image-based light for the outdoors, taken from a three-stop gradient rather
// than a captured HDRI. A photograph is fixed at one hour; this tracks the sun,
// so shaded surfaces get sky colour that matches the time of day.
//
// Darwin's cadence: 128px, and only redo the convolution when the palette has
// actually moved. Scrubbing time of day still costs one PMREM every 2.5s.
const PROBE_SIZE = 128;
const REFRESH_SECONDS = 2.5;
const CHANGE_THRESHOLD = 0.03;

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

export default function SkyEnvironment({ runtime }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const clock = useRef(REFRESH_SECONDS);
  const previous = useRef(null);

  const probe = useMemo(() => {
    const uniforms = {
      uTop: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uGround: { value: new THREE.Vector3() },
    };
    const source = new THREE.Scene();
    source.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(50, 32, 16),
        new THREE.ShaderMaterial({
          side: THREE.BackSide,
          uniforms,
          vertexShader: `varying vec3 vDir;
            void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
          fragmentShader: GRADIENT_FRAGMENT,
        }),
      ),
    );
    return { source, uniforms };
  }, []);

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    let target = null;
    const render = (palette) => {
      probe.uniforms.uTop.value.fromArray(palette.top);
      probe.uniforms.uHorizon.value.fromArray(palette.horizon);
      probe.uniforms.uGround.value.fromArray(palette.ground);
      const next = generator.fromScene(probe.source, 0, 1, 100, { size: PROBE_SIZE });
      target?.dispose();
      target = next;
      scene.environment = next.texture;
    };
    render(environmentPalette(runtime.values.timeOfDay));
    probe.render = render;
    return () => {
      probe.render = null;
      scene.environment = null;
      target?.dispose();
      generator.dispose();
      probe.source.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
    };
  }, [gl, scene, probe, runtime]);

  useFrame((_, delta) => {
    const values = runtime.values;
    const palette = environmentPalette(values.timeOfDay);
    // 1.4: fill moved here from the outdoor flat ambient, which now runs
    // near zero (see SkyRig).
    scene.environmentIntensity = values.envIntensity * 1.4 * palette.intensity;
    clock.current += delta;
    if (clock.current < REFRESH_SECONDS) return;
    if (previous.current && paletteDistance(previous.current, palette) < CHANGE_THRESHOLD) return;
    probe.render?.(palette);
    previous.current = palette;
    clock.current = 0;
  });

  return null;
}

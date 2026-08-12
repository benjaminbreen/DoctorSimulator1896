import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { glassGrimeTexture } from './textures.js';
import { solarRamps } from '../world/solar.js';

// The pane itself. WindowView and WindowSky both draw what is beyond the
// glass and stop there, which leaves the opening reading as a hole in the
// wall. Two thin layers over the top fix that:
//
//   grime  a multiply map of soot and rain runs, so the view is looked at
//          through something rather than framed by it
//   sheen  an additive grazing-angle reflection. This is the one that
//          matters: glass is only obvious when it catches the light, and at
//          night it turns the window into a dim mirror of the gaslit room.
//
// Neither writes depth, so the curtains in front still sort correctly.

const SHEEN_VERTEX = `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// Schlick's approximation, with the dirt doing two jobs: it scatters the
// reflection where it is thick, and it keeps the sheen from being a clean
// even wash, which is what would give it away as a shader.
const SHEEN_FRAGMENT = `
  uniform sampler2D uGrime;
  uniform vec3 uRoom;
  uniform vec3 uSky;
  uniform float uStrength;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    float facing = abs(dot(view, normalize(vNormal)));
    float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);

    // Dirt coverage from the same map the grime layer uses. Thick dirt
    // scatters, so it lifts the floor of the sheen while cutting its peak.
    float dirt = texture2D(uGrime, vUv).a;
    float sheen = fresnel * mix(1.0, 0.45, dirt) + dirt * 0.14;

    // Reflected room low on the pane, reflected sky high up: a real window
    // shows the ceiling and the far wall, not one flat colour.
    vec3 tint = mix(uRoom, uSky, smoothstep(0.35, 0.95, vUv.y));
    gl_FragColor = vec4(tint * sheen * uStrength, 1.0);
  }
`;

// Scratch for the frame loop.
const room = new THREE.Color();
const sky = new THREE.Color();
const GAS_REFLECTION = new THREE.Color('#8a5a26');
const DAY_REFLECTION = new THREE.Color('#6d7078');

export default function WindowGlass({ holes, runtime }) {
  const windows = useMemo(() => holes.filter((hole) => hole.type === 'window'), [holes]);

  const { grimeMaterial, sheenMaterial } = useMemo(() => {
    const grime = glassGrimeTexture();
    return {
      grimeMaterial: new THREE.MeshBasicMaterial({
        map: grime,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      sheenMaterial: new THREE.ShaderMaterial({
        vertexShader: SHEEN_VERTEX,
        fragmentShader: SHEEN_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uGrime: { value: grime },
          uRoom: { value: new THREE.Color() },
          uSky: { value: new THREE.Color() },
          uStrength: { value: 0.5 },
        },
      }),
    };
  }, []);

  useEffect(
    () => () => {
      grimeMaterial.dispose();
      sheenMaterial.dispose();
    },
    [grimeMaterial, sheenMaterial],
  );

  useFrame(() => {
    const values = runtime.values;
    const { daylight } = solarRamps(values.timeOfDay, values.dayOfYear);
    const uniforms = sheenMaterial.uniforms;

    // By day the pane picks up the room's own daylight; after dark the only
    // thing left to reflect is the gas, which is why a lit parlor at night
    // shows itself in its windows.
    room.set(values.gaslightColor).multiplyScalar(0.5).lerp(GAS_REFLECTION, 0.4);
    sky.set(values.windowColor).lerp(DAY_REFLECTION, 0.5);
    uniforms.uRoom.value.copy(room);
    uniforms.uSky.value.copy(sky).multiplyScalar(0.25 + daylight * 0.75);
    // Weaker in daylight: the view beyond is bright enough to swamp a
    // reflection, and a strong sheen at noon reads as fog on the glass.
    uniforms.uStrength.value = (1.15 - daylight * 0.6) * values.glassSheen;
    grimeMaterial.opacity = values.glassGrime;
  });

  if (windows.length === 0) return null;
  return (
    <group>
      {windows.map((hole) => {
        const yaw = Math.atan2(-hole.normal[0], -hole.normal[2]);
        // A hair in front of the view plane, and the sheen in front of the
        // grime, so the three never fight over the same depth.
        const at = (offset) => [
          hole.position[0] - hole.normal[0] * offset,
          hole.position[1],
          hole.position[2] - hole.normal[2] * offset,
        ];
        return (
          <group key={`${hole.id}:glass`}>
            <mesh position={at(0.004)} rotation={[0, yaw, 0]} material={grimeMaterial} renderOrder={2}>
              <planeGeometry args={[hole.width, hole.height]} />
            </mesh>
            <mesh position={at(0.008)} rotation={[0, yaw, 0]} material={sheenMaterial} renderOrder={3}>
              <planeGeometry args={[hole.width, hole.height]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

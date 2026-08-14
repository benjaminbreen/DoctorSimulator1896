import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { solarRamps, smoothstep } from '../world/solar.js';

// What a window shows when the room is not placed in the built world: sky
// graded to the hour, and a city beyond it.
//
// Both are computed from the eye ray rather than painted on the glass. That
// is the whole point — a texture on the pane holds still as you cross the
// room, which is what makes a window read as a picture of a window. Here the
// rooflines are three ranks of brownstones on upright cylinders, so the near
// terrace slides past the far one as you walk, and two windows on different
// walls look at different parts of the same city.
//
// The numbers below are only the baseline shape. Distance, frontage, height,
// haze, the street's depth below the floor, and the defocus are all on live
// sliders in the Window view group — tune it there, not here.

const SKY_VERTEX = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uLamp;
  uniform float uGroundY;
  uniform float uLampsLit;
  uniform float uBlur;
  uniform float uHeight;
  uniform float uFrontage;
  uniform float uDistance;
  uniform float uHaze;
  uniform float uGradient;
  varying vec3 vWorld;

  const float TAU = 6.28318531;
  #ifndef TAPS
    #define TAPS 4
  #endif

  float hash1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
  float hash2(float a, float b) { return fract(sin(a * 127.1 + b * 269.5) * 43758.5453); }

  // Distance along the eye ray to an upright cylinder about the room. The eye
  // is always inside it, so there is exactly one hit ahead.
  float cylinderHit(vec3 origin, vec3 dir, float radius) {
    float a = dot(dir.xz, dir.xz);
    if (a < 1e-6) return -1.0;
    float b = dot(origin.xz, dir.xz);
    float c = dot(origin.xz, origin.xz) - radius * radius;
    float disc = b * b - a * c;
    if (disc < 0.0) return -1.0;
    return (-b + sqrt(disc)) / a;
  }

  // One rank of housefronts, drawn over whatever is behind it. The drop sinks
  // the rank's street below the near one: without it the far ranks, being
  // further away, sit closer to the horizon and bury everything in front of
  // them. Manhattan does fall away toward both rivers, so this is a lie that
  // the ground was already telling.
  void rank(vec3 origin, vec3 dir, float baseRadius, float baseWidth, float seed,
            float drop, float low, float high, float baseHaze, float detail,
            inout vec3 color) {
    float radius = baseRadius * uDistance;
    float haze = clamp(baseHaze * uHaze, 0.0, 1.0);
    float t = cylinderHit(origin, dir, radius);
    if (t <= 0.0) return;
    vec3 hit = origin + dir * t;

    float blocks = max(floor(TAU * radius / (baseWidth * uFrontage)), 4.0);
    float x = (atan(hit.x, hit.z) / TAU + 0.5) * blocks;
    float cell = floor(x);
    float local = fract(x);

    float ground = uGroundY - drop * uDistance;
    float roof = ground + mix(low, high, hash1(cell + seed)) * uHeight;
    // The occasional taller house or church tower breaks the terrace line.
    // One storey or two, not a skyscraper: in 1896 this is a street of
    // four-storey brownstones, and the tall buildings are downtown.
    if (hash2(cell, seed + 7.0) > 0.93) roof += (4.0 + hash1(cell + seed) * 5.0) * uHeight;
    if (hit.y > roof) return;

    float up = clamp((hit.y - ground) / max(roof - ground, 1.0), 0.0, 1.0);

    // Sandstone brown or a redder brick, per house, darker toward the street
    // where the light does not reach.
    float shade = hash1(cell + seed + 3.0);
    vec3 stone = mix(vec3(0.085, 0.052, 0.032), vec3(0.140, 0.098, 0.066), shade);
    vec3 brick = mix(vec3(0.098, 0.043, 0.031), vec3(0.150, 0.070, 0.048), shade);
    vec3 face = mix(stone, brick, step(0.62, hash1(cell + seed + 9.0)));
    face *= 0.55 + up * 0.6;

    // Window grid, and the heavy cornice every one of these houses carried.
    // Only worth drawing on the near rank; further off it is finer than a
    // pixel and would just shimmer.
    float rows = max(floor((roof - ground) / 3.6), 1.0);
    float row = floor(up * rows);
    float col = floor(local * 4.0);
    if (detail > 0.5) {
      vec2 grid = vec2(fract(local * 4.0), fract(up * rows));
      float pane = smoothstep(0.20, 0.26, grid.x) * (1.0 - smoothstep(0.74, 0.80, grid.x))
                 * smoothstep(0.16, 0.22, grid.y) * (1.0 - smoothstep(0.66, 0.72, grid.y));
      face = mix(face, face * 0.42, pane);
      float lit = step(0.86, hash2(cell * 31.0 + col, row + seed));
      face = mix(face, uLamp, pane * lit * uLampsLit * 0.9);
      face *= 1.0 - 0.4 * smoothstep(0.93, 0.96, up);
    } else {
      float lit = step(0.90, hash2(cell * 31.0 + col, row + seed));
      face = mix(face, uLamp, lit * uLampsLit * 0.6);
    }

    color = mix(face, uHorizon, haze);
  }

  // Sky and city along one ray.
  vec3 outside(vec3 origin, vec3 dir) {
    // Graded from below the roofline up, because a window looking down over
    // the roofs shows more sub-horizon air than sky and a flat wash there
    // reads as fog. The band is broad on purpose: 1896 Manhattan air was full
    // of coal smoke, and that haze is what sets the city back.
    vec3 color = mix(uHorizon, uZenith, smoothstep(-0.6 * uGradient, uGradient, dir.y));
    float sun = max(dot(dir, uSunDir), 0.0);
    color += uSunColor * (pow(sun, 6.0) * 0.3 + pow(sun, 180.0) * 1.6);

    // Furthest rank first, so the nearer terrace draws over it. Frontages are
    // narrow because they were: a Manhattan lot is 25 feet, and a wider block
    // than that puts one house across the whole window. Heights are four and
    // five storeys at 3.6m a floor. Only the near rank gets window panes; on
    // the others they are finer than a pixel and would shimmer.
    rank(origin, dir, 420.0, 13.0, 17.0, 14.0, 13.0, 20.0, 0.66, 0.0, color);
    rank(origin, dir, 140.0, 10.0, 5.0, 6.0, 12.0, 18.0, 0.34, 0.0, color);
    rank(origin, dir, 48.0, 8.0, 41.0, 0.0, 12.0, 16.0, 0.10, 1.0, color);
    return color;
  }

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);

    // The view outside is not what the eye is on, so it is not quite in
    // focus. Tap 0 is the centre; the rest sit on two rings around it. This
    // is cheaper than a blur pass and doubles as the anti-aliasing these hard
    // silhouettes need — a roofline resolved one sample per pixel is a
    // staircase.
    vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
    vec3 lift = cross(side, dir);
    vec3 sum = vec3(0.0);
    for (int i = 0; i < TAPS; i += 1) {
      float fi = float(i);
      float ring = i == 0 ? 0.0 : (mod(fi, 2.0) < 0.5 ? 0.55 : 1.0);
      float angle = fi * (TAU / float(TAPS));
      vec2 offset = vec2(cos(angle), sin(angle)) * ring * uBlur;
      sum += outside(vWorld, normalize(dir + side * offset.x + lift * offset.y));
    }

    gl_FragColor = vec4(sum / float(TAPS), 1.0);

    // The room is tone mapped; without these the glass is a white slab next
    // to it. Same two chunks every built-in material ends with.
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Scratch, so the frame loop allocates nothing.
const zenith = new THREE.Color();
const horizon = new THREE.Color();
const sunColor = new THREE.Color();
const NOON_ZENITH = new THREE.Color('#4a74b4');
const NIGHT_ZENITH = new THREE.Color('#101a2e');
const DUSK_ZENITH = new THREE.Color('#7a6ea6');
const DAY_HORIZON = new THREE.Color('#b6b4a8');
const NIGHT_HORIZON = new THREE.Color('#1d2334');
const DUSK_HORIZON = new THREE.Color('#e8a765');
const SUN_HIGH = new THREE.Color('#ffd9a0');
const SUN_LOW = new THREE.Color('#ff9440');

export default function WindowSky({ holes, room, runtime }) {
  // Open blocked doors show the same sky a window does.
  const windows = useMemo(
    () => holes.filter((hole) => hole.type === 'window' || (hole.type === 'door' && hole.open && hole.blocked)),
    [holes],
  );
  const floorY = room.floor.position[1] + room.floor.size[1] / 2;

  // Sample count is a compile-time constant, so it is the one control that
  // rebuilds rather than sliding.
  const taps = Number(runtime.values.skyBlurTaps) || 4;

  // One material for every pane: the city is in world space, so each window
  // finds its own part of it from the eye ray alone.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.DoubleSide,
        defines: { TAPS: taps },
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uLamp: { value: new THREE.Color('#ffbf72') },
          uGroundY: { value: floorY },
          uLampsLit: { value: 0 },
          uBlur: { value: 0.004 },
          uHeight: { value: 1 },
          uFrontage: { value: 1 },
          uDistance: { value: 1 },
          uHaze: { value: 1 },
          uGradient: { value: 0.5 },
        },
      }),
    [floorY, taps],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    const values = runtime.values;
    const { daylight, golden, night, altitude, direction } = solarRamps(values.timeOfDay, values.dayOfYear);
    const uniforms = material.uniforms;

    // Blue overhead by day, sinking to a warm smoky band at the horizon, to
    // deep slate at night. Same palette WindowView captures with, so a room
    // that has the real view and one that has this agree on the weather.
    zenith.copy(NOON_ZENITH).lerp(NIGHT_ZENITH, night).lerp(DUSK_ZENITH, golden * 0.55);
    horizon.copy(DAY_HORIZON).lerp(NIGHT_HORIZON, night).lerp(DUSK_HORIZON, golden);
    const level = (0.24 + daylight * 0.76) * values.skyBrightness;

    uniforms.uZenith.value.copy(zenith).multiplyScalar(level);
    uniforms.uHorizon.value.copy(horizon).multiplyScalar(level);
    uniforms.uSunColor.value.copy(sunColor.copy(SUN_HIGH).lerp(SUN_LOW, golden)).multiplyScalar(daylight);
    uniforms.uSunDir.value.set(direction[0], direction[1], direction[2]);
    // Lamps go round at dusk, not at true dark: `night` only rises once the
    // sun is 4 degrees under, which the time slider never reaches.
    uniforms.uLampsLit.value =
      Math.max(1 - smoothstep(2, 12, altitude), night) * values.skyLitWindows;

    uniforms.uGroundY.value = floorY - values.skyGroundDrop;
    uniforms.uBlur.value = values.skyBlur;
    uniforms.uHeight.value = values.skyHeight;
    uniforms.uFrontage.value = values.skyFrontage;
    uniforms.uDistance.value = values.skyDistance;
    uniforms.uHaze.value = values.skyHaze;
    uniforms.uGradient.value = values.skyGradient;
  });

  if (windows.length === 0) return null;
  return (
    <group>
      {windows.map((hole) => (
        <mesh
          key={`${hole.id}:sky`}
          position={hole.position}
          rotation={[0, Math.atan2(-hole.normal[0], -hole.normal[2]), 0]}
          material={material}
        >
          <planeGeometry args={[hole.width, hole.height]} />
        </mesh>
      ))}
    </group>
  );
}

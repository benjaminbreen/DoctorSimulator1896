import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { solarRamps } from '../world/solar.js';
import { streetItems, STREET_LEVEL } from '../world/streetGrid.js';
import { parkItems } from '../world/centralPark.js';
import { FACES } from '../world/facade.js';
import {
  createFacadeMaterial,
  FACADE_TEXTURE_URLS,
  prepareFacadeTextures,
} from './facadeMaterials.js';

// What you see out of an interior window. Rendering the real exterior zone
// would mean carrying the whole park in memory while indoors, so this builds
// a cheap stand-in — sky, ground, the street's building massing, the park's
// trees — and captures it to a cubemap once, from the building's actual
// position in the world. A parlor on the east side of Fifth therefore looks
// west over the park, because that is genuinely where its windows point.
//
// The capture is re-taken only when the sun has moved appreciably, so the
// per-frame cost is one cube texture lookup.

const CUBE_SIZE = 512;

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Zenith graded to horizon, with a broad warm bloom around the sun. The
// horizon band is deliberately wide: 1896 Manhattan air was full of coal
// smoke, and the haze is what makes the view read as atmosphere rather than
// as a low-resolution picture.
const SKY_FRAGMENT = `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 sky = mix(uHorizon, uZenith, pow(smoothstep(0.42, 1.0, height), 0.8));
    float sun = max(dot(dir, normalize(uSunDir)), 0.0);
    sky += uSunColor * (pow(sun, 6.0) * 0.5 + pow(sun, 120.0) * 2.2);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

// The pane samples the captured cubemap along the eye ray, corrected for
// parallax. Sampling by direction alone puts everything at infinity, so the
// view slides with the camera instead of staying put — the giveaway that
// you are looking at a texture. Intersecting the ray with a box the size of
// the surrounding block and sampling toward that hit point makes the street
// opposite hold still as you cross the room.
//
// `uToWorld` rotates the interior's frame (street wall to the south) onto
// the building's real facing; `uAnchor` is the point in the room that the
// capture was taken from.
const PANE_VERTEX = `
  varying vec3 vLocal;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vLocal = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PANE_FRAGMENT = `
  uniform samplerCube uView;
  uniform mat3 uToWorld;
  uniform vec3 uAnchor;
  uniform vec3 uBoxHalf;
  uniform vec3 uHaze;
  uniform float uBrightness;
  uniform float uHazeAmount;
  varying vec3 vLocal;

  void main() {
    vec3 dir = normalize(uToWorld * normalize(vLocal - cameraPosition));
    vec3 rel = uToWorld * (vLocal - uAnchor);

    // Far intersection of the eye ray with the environment box, centred on
    // the capture point.
    vec3 inv = 1.0 / dir;
    vec3 t1 = (-uBoxHalf - rel) * inv;
    vec3 t2 = (uBoxHalf - rel) * inv;
    vec3 tmax = max(t1, t2);
    float t = min(min(tmax.x, tmax.y), tmax.z);
    vec3 sampleDir = rel + dir * max(t, 0.001);

    vec3 outside = textureCube(uView, normalize(sampleDir)).rgb * uBrightness;
    // A veil of smoky air over the glass: softens the capture and keeps the
    // view from reading sharper than the room around it.
    outside = mix(outside, uHaze, uHazeAmount);
    gl_FragColor = vec4(outside, 1.0);
  }
`;

// Massing only: boxes for the street buildings, merged blobs for the park
// trees, two ground planes, and a sky shell.
function buildProxy(hostId, facadeTextures) {
  const scene = new THREE.Scene();
  const disposables = [];
  // Coal-smoke haze. Everything but the sky fades into the horizon colour
  // with distance, which is both period-correct and what keeps the capture
  // from looking like a flat cut-out.
  scene.fog = new THREE.FogExp2('#c6c8c4', 0.0072);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 24, 16),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color('#6f92c8') },
        uHorizon: { value: new THREE.Color('#c9cbc6') },
        uSunColor: { value: new THREE.Color('#ffd9a0') },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      },
    }),
  );
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);

  // Ground follows the real map: park west of the Fifth Avenue wall, paving
  // east of it. They used to overlap, which left every window looking at one
  // unbroken sheet of green instead of street, then wall, then park.
  const park = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 460),
    new THREE.MeshBasicMaterial({ color: '#5d6f42' }),
  );
  park.rotation.x = -Math.PI / 2;
  park.position.set(-74, 0.2, 30);
  scene.add(park);
  disposables.push(park.geometry, park.material);

  const paving = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 460),
    new THREE.MeshBasicMaterial({ color: '#6f6a63' }),
  );
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(246, STREET_LEVEL - 0.02, 30);
  scene.add(paving);
  disposables.push(paving.geometry, paving.material);

  for (const item of streetItems) {
    if (item.kind !== 'backdrop' || item.id === hostId) continue;
    const seed = Math.abs(item.position[0] * 7 + item.position[2] * 11) % 997;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...item.size),
      createFacadeMaterial(
        facadeTextures,
        item.facadeStyle ?? 0,
        seed,
        true,
        item.size[1],
        item.facadeTone,
      ),
    );
    mesh.position.set(...item.position);
    scene.add(mesh);
    disposables.push(mesh.geometry, mesh.material);
  }

  // The park's built things — the perimeter wall above all, which is what
  // gives the view a horizon line instead of one unbroken sheet of green.
  const stone = [];
  for (const item of parkItems) {
    if (item.kind === 'tree' || item.size[0] * item.size[2] < 2) continue;
    const box = new THREE.BoxGeometry(...item.size);
    box.rotateY(item.yaw ?? 0);
    box.translate(item.position[0], item.position[1] + (item.absoluteY ? 0 : 0.4), item.position[2]);
    stone.push(box);
  }
  if (stone.length > 0) {
    const merged = mergeGeometries(stone);
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: '#7d786c' }));
    scene.add(mesh);
    disposables.push(merged, mesh.material);
    stone.forEach((part) => part.dispose());
  }

  // Trees: trunk and a two-lobe canopy each, merged into one mesh. Enough
  // relief that the foliage reads as a mass of trees rather than a flat
  // green shape once the haze has softened it.
  const trunks = [];
  const canopies = [];
  for (const item of parkItems) {
    if (item.kind !== 'tree') continue;
    const { trunkH, trunkR, canopyR } = item.tree;
    const [x, , z] = item.position;
    const ground = item.position[1] - item.size[1] / 2;
    const trunk = new THREE.CylinderGeometry(trunkR * 0.8, trunkR * 1.3, trunkH, 5);
    trunk.translate(x, ground + trunkH / 2, z);
    trunks.push(trunk);
    const lower = new THREE.IcosahedronGeometry(canopyR, 1);
    lower.translate(x, ground + trunkH + canopyR * 0.2, z);
    canopies.push(lower);
    const upper = new THREE.IcosahedronGeometry(canopyR * 0.7, 1);
    upper.translate(x + canopyR * 0.2, ground + trunkH + canopyR * 0.85, z - canopyR * 0.15);
    canopies.push(upper);
  }
  for (const [parts, color] of [[trunks, '#5a4630'], [canopies, '#4f6a33']]) {
    if (parts.length === 0) continue;
    const merged = mergeGeometries(parts);
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color }));
    scene.add(mesh);
    disposables.push(merged, mesh.material);
    parts.forEach((part) => part.dispose());
  }

  return { scene, sky, disposables };
}

export default function WindowView({ holes, building, runtime, anchor }) {
  const gl = useThree((state) => state.gl);
  const lastBucket = useRef(null);
  const facadeSources = useLoader(THREE.TextureLoader, FACADE_TEXTURE_URLS);
  const facadeTextures = useMemo(
    () => prepareFacadeTextures(facadeSources),
    [...facadeSources],
  );

  const rig = useMemo(() => {
    const { scene, sky, disposables } = buildProxy(building.id, facadeTextures);
    const target = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const camera = new THREE.CubeCamera(0.5, 1200, target);

    // The interior is authored with its street wall to the south, so rotate
    // local directions onto the building's real outward normal.
    const normal = FACES[building.windowFaces?.[0] ?? '+z'].normal;

    // Capture from the middle of the facade, just outside it, at the same
    // height as the anchor — the two have to name the same point in space
    // or the parallax correction shears the view.
    const halfDepth = (normal[2] !== 0 ? building.size[2] : building.size[0]) / 2;
    camera.position.set(
      building.position[0] + normal[0] * (halfDepth + 0.8),
      STREET_LEVEL + anchor[1],
      building.position[2] + normal[2] * (halfDepth + 0.8),
    );
    const toWorld = new THREE.Matrix3().setFromMatrix4(
      new THREE.Matrix4().makeRotationY(Math.atan2(normal[0], normal[2])),
    );

    const material = new THREE.ShaderMaterial({
      vertexShader: PANE_VERTEX,
      fragmentShader: PANE_FRAGMENT,
      side: THREE.DoubleSide,
      uniforms: {
        uView: { value: target.texture },
        uToWorld: { value: toWorld },
        // Where in the room the capture was taken from, and how big the
        // surrounding block is — roughly the street opposite and the near
        // park, which is what parallax needs to be right for.
        uAnchor: { value: new THREE.Vector3(...anchor) },
        uBoxHalf: { value: new THREE.Vector3(46, 26, 46) },
        uHaze: { value: new THREE.Color('#c9cbc6') },
        uBrightness: { value: 1 },
        uHazeAmount: { value: 0.12 },
      },
    });

    return { scene, sky, camera, target, material, disposables };
  }, [building, anchor, facadeTextures]);

  useFrame(() => {
    const time = runtime.values.timeOfDay;
    const ramps = solarRamps(time, runtime.values.dayOfYear);
    // Recapture in half-hour steps: the view outside changes with the light,
    // but not so fast that it is worth six renders a frame.
    const bucket = Math.round(time * 2);
    if (bucket !== lastBucket.current) {
      lastBucket.current = bucket;
      const { daylight, golden, night } = ramps;
      const uniforms = rig.sky.material.uniforms;

      // Blue overhead by day, sinking to a warm smoky band at the horizon,
      // to deep slate at night. Golden hour pushes both toward amber.
      const zenith = new THREE.Color('#4a74b4').lerp(new THREE.Color('#101a2e'), night);
      zenith.lerp(new THREE.Color('#7a6ea6'), golden * 0.55);
      const horizon = new THREE.Color('#d3d2ca').lerp(new THREE.Color('#1d2334'), night);
      horizon.lerp(new THREE.Color('#e8a765'), golden);
      const level = 0.24 + daylight * 0.76;
      uniforms.uZenith.value.copy(zenith).multiplyScalar(level);
      uniforms.uHorizon.value.copy(horizon).multiplyScalar(level);
      uniforms.uSunColor.value
        .setHex(0xffd9a0)
        .lerp(new THREE.Color('#ff9440'), golden)
        .multiplyScalar(daylight);
      uniforms.uSunDir.value.set(...ramps.direction);

      // Haze thickens toward dusk and takes the horizon's colour, so the
      // glass and the captured distance agree.
      rig.scene.fog.color.copy(uniforms.uHorizon.value);
      rig.scene.fog.density = 0.006 + golden * 0.004 + night * 0.004;
      rig.material.uniforms.uHaze.value.copy(uniforms.uHorizon.value);

      rig.camera.update(gl, rig.scene);
    }
    rig.material.uniforms.uBrightness.value = 0.4 + ramps.daylight * 0.8;
  });

  useEffect(
    () => () => {
      for (const item of rig.disposables) item.dispose();
      rig.target.dispose();
      rig.material.dispose();
    },
    [rig],
  );

  return (
    <group>
      {holes.map((hole) => (
        <mesh
          key={`${hole.id}:view`}
          position={hole.position}
          rotation={[0, Math.atan2(-hole.normal[0], -hole.normal[2]), 0]}
          material={rig.material}
        >
          <planeGeometry args={[hole.width, hole.height]} />
        </mesh>
      ))}
    </group>
  );
}

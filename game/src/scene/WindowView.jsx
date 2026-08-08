import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingFacade } from './textures.js';
import { solarRamps } from '../world/solar.js';
import { streetItems, STREET_LEVEL } from '../world/streetGrid.js';
import { parkItems } from '../world/centralPark.js';
import { doorWorld, FACES } from '../world/facade.js';

// What you see out of an interior window. Rendering the real exterior zone
// would mean carrying the whole park in memory while indoors, so this builds
// a cheap stand-in — sky, ground, the street's building massing, the park's
// trees — and captures it to a cubemap once, from the building's actual
// position in the world. A parlor on the east side of Fifth therefore looks
// west over the park, because that is genuinely where its windows point.
//
// The capture is re-taken only when the sun has moved appreciably, so the
// per-frame cost is one cube texture lookup.

const CUBE_SIZE = 256;
const WINDOW_HEIGHT = STREET_LEVEL + 2.4;

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 uHigh;
  uniform vec3 uLow;
  varying vec3 vDir;
  void main() {
    float t = clamp(normalize(vDir).y * 0.5 + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(mix(uLow, uHigh, pow(t, 0.65)), 1.0);
  }
`;

// The pane samples the captured cubemap along the eye ray. `uToWorld`
// rotates the interior's frame (street wall to the south) onto the
// building's real facing, so the view lines up with the map.
const PANE_VERTEX = `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const PANE_FRAGMENT = `
  uniform samplerCube uView;
  uniform mat3 uToWorld;
  uniform float uBrightness;
  varying vec3 vWorld;
  void main() {
    vec3 dir = normalize(uToWorld * normalize(vWorld - cameraPosition));
    vec3 outside = textureCube(uView, dir).rgb * uBrightness;
    gl_FragColor = vec4(outside, 1.0);
  }
`;

// Massing only: boxes for the street buildings, merged blobs for the park
// trees, two ground planes, and a sky shell.
function buildProxy(hostId) {
  const scene = new THREE.Scene();
  const disposables = [];

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 16, 12),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uHigh: { value: new THREE.Color('#7d9ac6') }, uLow: { value: new THREE.Color('#cfd3d0') } },
    }),
  );
  scene.add(sky);
  disposables.push(sky.geometry, sky.material);

  const park = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 400),
    new THREE.MeshBasicMaterial({ color: '#5d6f42' }),
  );
  park.rotation.x = -Math.PI / 2;
  park.position.set(-10, 0.2, 20);
  scene.add(park);
  disposables.push(park.geometry, park.material);

  const paving = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 400),
    new THREE.MeshBasicMaterial({ color: '#6f6a63' }),
  );
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(150, STREET_LEVEL - 0.02, 90);
  scene.add(paving);
  disposables.push(paving.geometry, paving.material);

  for (const item of streetItems) {
    if (item.kind !== 'backdrop' || item.id === hostId) continue;
    const map = buildingFacade(item.facadeStyle ?? 0, Math.abs(item.position[0] * 7) % 97, item.size[0], item.size[1]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...item.size),
      new THREE.MeshBasicMaterial({ map }),
    );
    mesh.position.set(...item.position);
    scene.add(mesh);
    disposables.push(mesh.geometry, mesh.material);
  }

  // Trees as one merged mesh: a trunk column and a canopy sphere each.
  const parts = [];
  for (const item of parkItems) {
    if (item.kind !== 'tree') continue;
    const { trunkH, canopyR } = item.tree;
    const [x, , z] = item.position;
    const ground = item.position[1] - item.size[1] / 2;
    const canopy = new THREE.IcosahedronGeometry(canopyR, 0);
    canopy.translate(x, ground + trunkH + canopyR * 0.3, z);
    parts.push(canopy);
  }
  if (parts.length > 0) {
    const merged = mergeGeometries(parts);
    const trees = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: '#4c6630' }));
    scene.add(trees);
    disposables.push(merged, trees.material);
    parts.forEach((part) => part.dispose());
  }

  return { scene, sky, disposables };
}

export default function WindowView({ holes, building, runtime }) {
  const gl = useThree((state) => state.gl);
  const lastBucket = useRef(null);

  const rig = useMemo(() => {
    const { scene, sky, disposables } = buildProxy(building.id);
    const target = new THREE.WebGLCubeRenderTarget(CUBE_SIZE, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const camera = new THREE.CubeCamera(0.5, 1200, target);
    // Capture just outside the facade, at first-floor window height.
    const at = doorWorld(building, 0.8);
    camera.position.set(at.x, WINDOW_HEIGHT, at.z);

    // The interior is authored with its street wall to the south, so rotate
    // local directions onto the building's real outward normal.
    const normal = FACES[building.windowFaces?.[0] ?? '+z'].normal;
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
        uBrightness: { value: 1 },
      },
    });

    return { scene, sky, camera, target, material, disposables };
  }, [building]);

  useFrame(() => {
    const time = runtime.values.timeOfDay;
    const ramps = solarRamps(time);
    // Recapture in half-hour steps: the view outside changes with the light,
    // but not so fast that it is worth six renders a frame.
    const bucket = Math.round(time * 2);
    if (bucket !== lastBucket.current) {
      lastBucket.current = bucket;
      const level = 0.28 + ramps.daylight * 0.72;
      rig.sky.material.uniforms.uHigh.value.setRGB(
        0.49 * level * (1 + ramps.golden * 0.5),
        0.6 * level,
        0.78 * level * (1 - ramps.golden * 0.25),
      );
      rig.sky.material.uniforms.uLow.value.setRGB(
        0.81 * level * (1 + ramps.golden * 0.35),
        0.83 * level,
        0.82 * level * (1 - ramps.golden * 0.2),
      );
      rig.camera.update(gl, rig.scene);
    }
    rig.material.uniforms.uBrightness.value = 0.35 + ramps.daylight * 0.85;
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

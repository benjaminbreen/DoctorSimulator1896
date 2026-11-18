import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from './modelLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import DaneLectureBoard from './DaneLectureBoard.jsx';
import StaticColliders from './lib/StaticColliders.jsx';
import { buildDaneCollection } from './daneCollection.js';
import { seats, tables } from '../world/daneHall.js';

const folder = '/textures/dane-hall/';
const castFiles = [
  'characters/wine-merchant',
  'tripo-victorian-player-mobile-detail',
  'pushcart-vendor',
  'characters/samuel-taylor',
  'cab-driver',
  'ped-anim-sit',
].map((name) => '/models/' + name + '.glb');
const decode = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);
const textureFiles = [
  '/textures/props/laboratory-bench/pale-deal-albedo.webp',
  '/textures/props/laboratory-bench/pale-deal-normal-512.webp',
  ...['yard', 'notes', 'dial', 'eye-section', 'plate-1', 'plate-2'].map((id) => folder + id + '.webp'),
];

function classMember(gltf, spot, index, clip, standing = false) {
  const model = clone(gltf.scene),
    bones = {},
    owned = [],
    faces = [];
  model.traverse((node) => {
    if (node.isBone) bones[node.name.replace(/^mixamorig:?/, '')] = node;
    if (node.isMesh) {
      if (node.morphTargetDictionary?.jawOpen !== undefined) faces.push(node);
      const material = node.material.clone();
      material.color.multiply(new THREE.Color(['#fffaf4', '#ede6db', '#d8e1e4', '#f3e9df'][index % 4]));
      material.roughness = Math.max(0.55, material.roughness);
      owned.push(material);
      node.material = material;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    }
  });
  const mixer = new THREE.AnimationMixer(model);

  const action = mixer.clipAction(clip).play();
  action.time = (index * 0.73) % clip.duration;
  action.timeScale = 0.74 + index * 0.045;
  mixer.update(0);
  model.updateMatrixWorld(true);
  const point = (name) => bones[name].getWorldPosition(new THREE.Vector3());
  const hip = point('Hips'),
    knee = point('LeftLeg'),
    foot = point('LeftFoot');
  const scale = (0.84 + 0.014 * (index % 4)) / (point('LeftUpLeg').distanceTo(knee) + knee.distanceTo(foot));
  const pivot = new THREE.Group();
  pivot.position.set(spot.x, 0, spot.z);
  const direction = standing
    ? point('LeftToeBase').sub(foot)
    : knee.clone().add(point('RightLeg')).multiplyScalar(0.5).sub(hip);
  pivot.rotation.y = spot.yaw - Math.atan2(direction.x, direction.z);
  model.scale.setScalar(scale);
  model.position.set(
    -hip.x * scale,
    standing ? 0.086 - foot.y * scale : 0.575 - hip.y * scale,
    -hip.z * scale,
  );
  pivot.add(model);
  return {
    pivot,
    bones,
    faces,
    yawCorrection: pivot.rotation.y - spot.yaw,
    mixer,
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      owned.forEach((material) => material.dispose());
      const skeletons = new Set();
      model.traverse((node) => {
        if (node.isSkinnedMesh) skeletons.add(node.skeleton);
      });
      skeletons.forEach((skeleton) => skeleton.dispose());
    },
  };
}

function Class({ grain }) {
  const files = useLoader(GLTFLoader, castFiles, decode);
  const people = useMemo(() => {
    const ownClip = (i, name) => files[i].animations.find((a) => a.name === name);
    const sit = ownClip(5, 'Sit');
    // These Mixamo rigs share rotation channels; preserve the recipient's
    // limb lengths when borrowing the seated clip.
    const seatedRotations = new THREE.AnimationClip(
      'Seated posture',
      sit.duration,
      sit.tracks.filter((t) => t.name.endsWith('.quaternion')),
    );
    const cast = [1, 0, 3, 2, 0, 4, 1, 0];
    return [
      classMember(files[0], { x: -3.14, z: -3.39, yaw: 0.27 }, 0, ownClip(0, 'StandingIdle'), true),
      ...seats.flatMap((seat, i) => {
        if (!seat.occupied) return [];
        const part = cast[i];
        const clip = ownClip(part, 'ClinicIdle') ?? seatedRotations;
        return [classMember(files[part], seat, i + 1, clip)];
      }),
    ];
  }, [files]);
  useFrame((_, dt) => people.forEach((a) => a.mixer.update(Math.min(0.1, dt))), -1);
  useEffect(() => () => people.forEach((a) => a.dispose()), [people]);
  return <>
    {people.map((a, i) => <primitive key={i} object={a.pivot} />)}
    <DaneLectureBoard lecturer={people[0]} grain={grain} />
  </>;
}

export default function DaneClassroom() {
  const [grain, grainNormal, yard, notes, dial, eye, plateOne, plateTwo] = useLoader(
    THREE.TextureLoader,
    textureFiles,
  );
  const collection = useMemo(() => {
    for (const tex of [grain, yard, notes, dial, eye, plateOne, plateTwo]) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
    }
    RectAreaLightUniformsLib.init();
    return buildDaneCollection(grain, grainNormal);
  }, [grain, grainNormal, yard, notes, dial, eye, plateOne, plateTwo]);
  const probe = useRef(null);
  // The glass and brass reflect this room once. Moving the player never
  // triggers another six-face capture.
  useFrame(({ gl, scene }) => {
    if (probe.current) return;
    const cube = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    const camera = new THREE.CubeCamera(0.16, 45, cube);
    camera.position.set(1.4, 1.84, -4.95);
    camera.update(gl, scene);
    const filter = new THREE.PMREMGenerator(gl);
    const capture = filter.fromCubemap(cube.texture);
    filter.dispose();
    cube.dispose();
    for (const mesh of collection.root.children) {
      if (mesh.material.metalness > 0) {
        mesh.material.envMap = capture.texture;
        mesh.material.envMapIntensity = 0.75;
        mesh.material.needsUpdate = true;
      }
    }
    probe.current = capture;
  });
  useEffect(
    () => () => {
      probe.current?.dispose();
      probe.current = null;
      collection.dispose();
    },
    [collection],
  );
  return (
    <group>
      <primitive object={collection.root} />
      <rectAreaLight
        position={[6.42, 2.44, -0.55]}
        rotation={[0, Math.PI / 2, 0]}
        width={7.3}
        height={2.48}
        intensity={2.3}
        color="#fff0d9"
      />
      <StaticColliders entries={collection.colliders} />
      <Class grain={grain} />
      <mesh position={[-1.65, 1.47, -3.993]}>
        <circleGeometry args={[0.297, 80]} />
        <meshStandardMaterial map={eye} transparent alphaTest={0.5} roughness={0.62} />
      </mesh>
      <mesh position={[12.5, 2.8, -0.8]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[34, 14]} />
        <meshBasicMaterial map={yard} color="#f4f0e3" />
      </mesh>
      {[
        [-3.32, -1.65, plateOne],
        [0.68, 1.12, plateTwo],
      ].map(([x, z, map]) => (
        <mesh key={x} position={[x, 1.04, z - 0.163]} rotation={[-0.23, 0, 0]}>
          <planeGeometry args={[0.36, 0.33]} />
          <meshStandardMaterial map={map} roughness={0.85} />
        </mesh>
      ))}
      {seats.map((s, i) => (
        <mesh
          key={i}
          position={[s.x + 0.06, 0.825, tables[Math.floor(i / 2)].z + 0.11]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.373, 0.245]} />
          <meshStandardMaterial map={notes} roughness={0.92} />
        </mesh>
      ))}
      <group position={[1.63, 3.62, -5.48]}>
        <mesh>
          <boxGeometry args={[0.73, 0.75, 0.225]} />
          <meshStandardMaterial color="#523929" map={grain} />
        </mesh>
        <mesh position={[0, 0, 0.123]}>
          <circleGeometry args={[0.318, 64]} />
          <meshStandardMaterial map={dial} roughness={0.72} />
        </mesh>
        <mesh position={[0, 0, 0.128]}>
          <torusGeometry args={[0.321, 0.016, 10, 64]} />
          <meshStandardMaterial color="#a88a53" metalness={0.68} roughness={0.31} />
        </mesh>
      </group>
    </group>
  );
}

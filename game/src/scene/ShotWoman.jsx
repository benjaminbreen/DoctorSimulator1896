import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gameDebug } from '../debug.js';
import { PEDESTRIAN_ARCHETYPES } from '../world/pedestrianCatalog.js';
import { figureHeight } from '../world/figureHeights.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { getKTX2Loader } from './ktx2.js';

const STANDING_ARCHETYPES = Object.freeze(['w', 'd', 'f', 'h']);
const MODEL_PATHS = STANDING_ARCHETYPES.map((id) => PEDESTRIAN_ARCHETYPES[id].modelPath);

// A photographic subject made from standing-woman pedestrians already
// shipped in the game. This component exists only on ?shot=1 pages. It adds no
// asset or gameplay state and lets the sampler place a varied, still subject
// at windows, stoops, and rooftops without teleporting the male player there.
export default function ShotWoman() {
  const wrapperRef = useRef();
  const gl = useThree((state) => state.gl);
  const configure = useCallback((loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(getKTX2Loader(gl));
  }, [gl]);
  const gltfs = useLoader(GLTFLoader, MODEL_PATHS, configure);
  const subjects = useMemo(() => gltfs.map((gltf, index) => {
    const figure = cloneSkeleton(gltf.scene);
    figure.scale.setScalar(figureHeight(PEDESTRIAN_ARCHETYPES[STANDING_ARCHETYPES[index]].id));
    figure.visible = false;
    figure.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.isSkinnedMesh) node.frustumCulled = false;
      const source = Array.isArray(node.material) ? node.material : [node.material];
      const materials = source.filter(Boolean).map((material) => material.clone());
      node.material = Array.isArray(node.material) ? materials : materials[0];
      materials.forEach(normalizeNonmetallicCharacterMaterial);
    });
    const mixer = new THREE.AnimationMixer(figure);
    const clip = gltf.animations.find((candidate) => (
      candidate.name === 'Idle' || candidate.name === 'StandingIdle'
    )) ?? gltf.animations[0];
    const action = clip ? mixer.clipAction(clip) : null;
    action?.play();
    if (action && clip) action.time = clip.duration * 0.28;
    mixer.update(0);
    return { id: STANDING_ARCHETYPES[index], figure, mixer };
  }), [gltfs]);

  useEffect(() => () => {
    subjects.forEach(({ figure, mixer }) => {
      mixer.stopAllAction();
      mixer.uncacheRoot(figure);
      figure.traverse((node) => {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.filter(Boolean).forEach((material) => material.dispose());
      });
    });
  }, [subjects]);

  useEffect(() => {
    gameDebug.shotWomanReady = true;
    return () => { gameDebug.shotWomanReady = false; };
  }, []);

  useFrame((_, delta) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const shot = gameDebug.shotWoman;
    const requested = STANDING_ARCHETYPES.includes(shot.archetype) ? shot.archetype : 'w';
    subjects.forEach((subject) => {
      subject.figure.visible = shot.visible && subject.id === requested;
      if (subject.figure.visible) subject.mixer.update(Math.min(delta, 0.1));
    });
    wrapper.visible = shot.visible;
    wrapper.position.set(...shot.position);
    wrapper.rotation.y = shot.yaw;
  });

  return (
    <group ref={wrapperRef} visible={false}>
      {subjects.map((subject) => (
        <primitive key={subject.id} object={subject.figure} />
      ))}
    </group>
  );
}

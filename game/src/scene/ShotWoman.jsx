import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gameDebug } from '../debug.js';
import { PEDESTRIAN_ARCHETYPES } from '../world/pedestrianCatalog.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';

const SCALE = 1.62;

// A photographic subject made from the working-woman pedestrian already
// shipped in the game. This component exists only on ?shot=1 pages. It adds no
// model, asset, or gameplay state and lets an interior study place a still
// woman beside an existing window without teleporting the male player there.
export default function ShotWoman() {
  const wrapperRef = useRef();
  const gltf = useLoader(
    GLTFLoader,
    PEDESTRIAN_ARCHETYPES.w.modelPath,
    (loader) => loader.setMeshoptDecoder(MeshoptDecoder),
  );
  const { figure, mixer } = useMemo(() => {
    const root = cloneSkeleton(gltf.scene);
    root.scale.setScalar(SCALE);
    root.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.isSkinnedMesh) node.frustumCulled = false;
      const source = Array.isArray(node.material) ? node.material : [node.material];
      const materials = source.filter(Boolean).map((material) => material.clone());
      node.material = Array.isArray(node.material) ? materials : materials[0];
      materials.forEach(normalizeNonmetallicCharacterMaterial);
    });
    const animations = new THREE.AnimationMixer(root);
    const clip = gltf.animations.find((candidate) => candidate.name === 'Idle') ?? gltf.animations[0];
    const action = clip ? animations.clipAction(clip) : null;
    action?.play();
    if (action && clip) action.time = clip.duration * 0.28;
    animations.update(0);
    return { figure: root, mixer: animations };
  }, [gltf]);

  useEffect(() => () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(figure);
    figure.traverse((node) => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.filter(Boolean).forEach((material) => material.dispose());
    });
  }, [figure, mixer]);

  useEffect(() => {
    gameDebug.shotWomanReady = true;
    return () => { gameDebug.shotWomanReady = false; };
  }, []);

  useFrame((_, delta) => {
    mixer.update(Math.min(delta, 0.1));
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const shot = gameDebug.shotWoman;
    wrapper.visible = shot.visible;
    wrapper.position.set(...shot.position);
    wrapper.rotation.y = shot.yaw;
  });

  return (
    <group ref={wrapperRef} visible={false}>
      <primitive object={figure} />
    </group>
  );
}

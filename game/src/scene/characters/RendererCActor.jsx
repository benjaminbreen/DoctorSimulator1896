import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { BODY_CUE_CLIPS } from '../../../../shared/characters/recipe.js';
import { applyRendererCRecipe, cloneRendererCMaterials } from './rendererCController.js';
import { createFaceController } from './faceController.js';

export default function RendererCActor({ recipe, manifest, onReady, paused = false }) {
  const gltf = useLoader(GLTFLoader, recipe.asset?.path || manifest.path, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));
  const actor = useMemo(() => {
    const root = cloneSkeleton(gltf.scene);
    cloneRendererCMaterials(root);
    root.traverse((object) => {
      if (!object.isMesh && !object.isSkinnedMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.isSkinnedMesh) object.frustumCulled = false;
    });
    applyRendererCRecipe(root, manifest, recipe);
    const mixer = new THREE.AnimationMixer(root);
    const face = createFaceController(root, recipe);
    return { root, mixer, face };
  }, [gltf, manifest, recipe]);

  useEffect(() => {
    const clipName = BODY_CUE_CLIPS[recipe.animation.body] || 'ClinicIdle';
    const clip = gltf.animations.find((candidate) => candidate.name === clipName)
      || gltf.animations.find((candidate) => candidate.name === 'ClinicIdle');
    const action = clip ? actor.mixer.clipAction(clip) : null;
    action?.reset().fadeIn(0.18).play();
    if (paused && clip) actor.mixer.setTime(clip.duration * 0.18);
    return () => {
      action?.fadeOut(0.12);
      actor.mixer.stopAllAction();
    };
  }, [actor, gltf.animations, paused, recipe.animation.body]);

  const readyRef = useCallback((node) => {
    if (node) onReady?.(recipe.id);
  }, [onReady, recipe.id]);

  useFrame((_, delta) => {
    if (paused) return;
    actor.mixer.update(Math.min(delta, 0.1));
    actor.face.update(delta, recipe.animation);
  });

  const { position, rotation, scale } = recipe.placement;
  return (
    <group ref={readyRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={actor.root} />
    </group>
  );
}

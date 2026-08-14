import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { BODY_CUE_CLIPS } from '../../../../shared/characters/recipe.js';
import {
  applyRendererCRecipe,
  applyRendererCWardrobe,
  cloneRendererCMaterials,
} from './rendererCController.js';
import { createFaceController } from './faceController.js';

const TRANSIENT_BODY_CUES = new Set([
  'sit-down',
  'sitting-talking',
  'sitting-distressed',
  'sitting-self-soothing',
  'sitting-disapproval',
  'sitting-disbelief',
]);

export default function RendererCActor({ recipe, manifest, onReady, paused = false }) {
  const gltf = useLoader(
    GLTFLoader,
    recipe.asset?.path || manifest.path,
    (loader) => loader.setMeshoptDecoder(MeshoptDecoder),
  );
  const clips = gltf.animations;
  const currentActionRef = useRef(null);
  const settledAnimationRef = useRef(null);
  const actor = useMemo(() => {
    const root = cloneSkeleton(gltf.scene);
    root.rotation.x = Number(recipe.asset?.modelRotationX) || 0;
    root.updateMatrixWorld(true);
    cloneRendererCMaterials(root);
    root.traverse((object) => {
      if (!object.isMesh && !object.isSkinnedMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (object.isSkinnedMesh) object.frustumCulled = false;
      if (recipe.asset?.opaque) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material) continue;
          material.transparent = false;
          material.opacity = 1;
          material.alphaTest = 0;
          material.depthWrite = true;
          material.needsUpdate = true;
        }
      }
    });
    if (recipe.asset?.applyRecipe !== false) applyRendererCRecipe(root, manifest, recipe);
    const mixer = new THREE.AnimationMixer(root);
    const face = createFaceController(root, recipe);
    return { root, mixer, face };
  }, [
    gltf,
    manifest,
    recipe.anchor,
    recipe.appearanceSeed,
    recipe.asset,
    recipe.cohort,
    recipe.id,
    recipe.identitySeed,
    recipe.lod,
    recipe.presentation,
    recipe.renderer,
    recipe.restingFace,
    recipe.values,
  ]);

  // The wardrobe swaps seated and standing carriers independently of the
  // skeleton. Keep that live when a body cue changes without rebuilding the
  // actor or its materials.
  useLayoutEffect(() => {
    if (recipe.asset?.applyRecipe === false) return;
    applyRendererCWardrobe(actor.root, recipe);
    actor.root.updateMatrixWorld(true);
  }, [actor, recipe.animation.body, recipe.asset?.applyRecipe, recipe.presentation?.outfitId]);

  // Start and blend actions before the browser paints. A passive effect runs
  // one frame too late: the newly committed skeleton is visible in bind pose.
  useLayoutEffect(() => {
    settledAnimationRef.current = null;
    const responsiveSpokenGesture = recipe.presentation?.performanceStyle === 'responsive-consultation'
      && recipe.animation.speaking
      && TRANSIENT_BODY_CUES.has(recipe.animation.body);
    // The dejected source is almost still through the arms, and the ordinary
    // talking source moves the wrists only a few centimetres. The short seated
    // hand beat is legible from the consultation camera and returns cleanly to
    // the knee; expression and gaze continue to carry the response's mood.
    const clipName = responsiveSpokenGesture
      ? 'SittingKneeStrike'
      : recipe.asset?.clipMap?.[recipe.animation.body]
        || BODY_CUE_CLIPS[recipe.animation.body]
        || 'ClinicIdle';
    const fallbackName = recipe.asset?.clipMap?.['clinic-idle'] || 'ClinicIdle';
    const clip = clips.find((candidate) => candidate.name === clipName)
      || clips.find((candidate) => candidate.name === fallbackName)
      || clips[0];
    const action = clip ? actor.mixer.clipAction(clip) : null;
    const idleClip = clips.find((candidate) => candidate.name === fallbackName) || clips[0];
    const idleAction = idleClip ? actor.mixer.clipAction(idleClip) : null;
    const transient = TRANSIENT_BODY_CUES.has(recipe.animation.body) && action !== idleAction;
    const previous = currentActionRef.current?.mixer === actor.mixer
      ? currentActionRef.current.action
      : null;
    const returnToIdle = (event) => {
      if (!transient || event.action !== action || !idleAction) return;
      idleAction.reset().setLoop(THREE.LoopRepeat, Infinity);
      idleAction.clampWhenFinished = false;
      idleAction.enabled = true;
      idleAction.play();
      idleAction.crossFadeFrom(action, 0.18, true);
      currentActionRef.current = { mixer: actor.mixer, action: idleAction };
      if (recipe.presentation?.performanceStyle === 'responsive-consultation') {
        // The response begins as direct address. When the hand gesture returns
        // to the lap, release the patient's attention too: stop the speech
        // envelope and let the eyes settle away from the doctor. A discouraged
        // patient drops their gaze instead of looking sideways.
        settledAnimationRef.current = {
          ...recipe.animation,
          body: 'clinic-idle',
          gaze: recipe.animation.expression === 'discouraged' ? 'down' : 'away',
          speaking: false,
        };
      }
    };
    if (transient || recipe.animation.body === 'stand-up') {
      action?.setLoop(THREE.LoopOnce, 1);
      if (action) action.clampWhenFinished = true;
    } else if (action) {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    actor.mixer.addEventListener('finished', returnToIdle);
    if (action) {
      const restart = !previous
        || previous !== action
        || transient
        || recipe.animation.body === 'stand-up';
      if (restart) {
        action.reset();
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(1);
        action.play();
        if (previous && previous !== action) action.crossFadeFrom(previous, 0.12, true);
      }
      if (paused && clip) action.time = clip.duration * 0.18;
      currentActionRef.current = { mixer: actor.mixer, action };
      // AnimationMixer does not write its first pose until update(). Applying
      // a zero-time sample here closes the bind-pose frame on initial mount too.
      actor.mixer.update(0);
    }
    return () => {
      actor.mixer.removeEventListener('finished', returnToIdle);
    };
  }, [actor, clips, paused, recipe.animation]);

  // Primitive roots are not disposed by React Three Fiber. Clean up only when
  // this actual actor instance changes or unmounts, never for a performance cue.
  useEffect(() => () => {
    if (currentActionRef.current?.mixer === actor.mixer) currentActionRef.current = null;
    actor.mixer.stopAllAction();
    actor.mixer.uncacheRoot(actor.root);
    const materials = new Set();
    const ownedTextures = new Set();
    actor.root.traverse((object) => {
      if (!object.isMesh && !object.isSkinnedMesh) return;
      const found = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of found) {
        if (!material) continue;
        materials.add(material);
        for (const texture of Object.values(material.userData?.rendererCFabricTextures ?? {})) {
          if (texture) ownedTextures.add(texture);
        }
        if (material.userData?.rendererCEyeTintSource && material.map) {
          ownedTextures.add(material.map);
        }
      }
    });
    for (const texture of ownedTextures) texture.dispose();
    for (const material of materials) material.dispose();
  }, [actor]);

  const readyRef = useCallback((node) => {
    if (node) onReady?.(recipe.id);
  }, [onReady, recipe.id]);

  useFrame((_, delta) => {
    if (paused) return;
    actor.mixer.update(Math.min(delta, 0.1));
    actor.face.update(delta, settledAnimationRef.current || recipe.animation);
  });

  const { position, rotation, scale } = recipe.placement;
  return (
    <group ref={readyRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={actor.root} />
    </group>
  );
}

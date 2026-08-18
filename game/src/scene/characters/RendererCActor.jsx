import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { createPatientMotion } from './patientMotion.js';
import {
  buildPatientHat, disposePatientHat, fitPatientHat, HAT_DESIGN_RADIUS,
} from './patientHat.js';
import { gameDebug } from '../../debug.js';
import { examinationPresentation } from '../../consultation/examPresentation.js';
import { clearExamAnchors, publishExamAnchors } from '../../consultation/examAnchors.js';

const ENTRANCE_WALK_SPEED = 1.05;

const TRANSIENT_BODY_CUES = new Set([
  'sit-down',
  'sitting-talking',
  'sitting-distressed',
  'sitting-self-soothing',
  'sitting-disapproval',
  'sitting-disbelief',
]);

export default function RendererCActor({ recipe, manifest, onReady, paused = false, walkIn = false }) {
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
    const motion = createPatientMotion(root, recipe);
    // A caller keeps her hat on: parent it to the head bone so it rides
    // every clip and procedural motion. The fit is measured from the actual
    // skull-and-hair vertices, so it clears any cohort, age, or coiffure.
    let hat = null;
    if (recipe.presentation?.hat && motion.bones.head) {
      hat = buildPatientHat(recipe.presentation.hat);
      const fit = fitPatientHat(root, motion.bones.head);
      if (fit) {
        const head = motion.bones.head;
        // Size and place in root space (metres, +Y up at bind pose), then
        // express as head-bone local so the hat rides the animation. The
        // inverse world quaternion keeps the hat upright whatever the
        // bind-pose bone axes do; bone world scale is divided back out.
        const worldScale = head.getWorldScale(new THREE.Vector3());
        const boneScale = (worldScale.x + worldScale.y + worldScale.z) / 3 || 1;
        hat.scale.setScalar(((fit.radius * 1.14) / HAT_DESIGN_RADIUS) / boneScale);
        hat.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert());
        const crown = new THREE.Vector3(fit.centerX, fit.topY - fit.radius * 0.18, fit.centerZ);
        hat.position.copy(head.worldToLocal(crown));
        head.add(hat);
      } else {
        hat = null;
      }
    }
    return { root, mixer, face, motion, hat };
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

  // Walk-in: a summoned patient enters by the waiting-room door and takes the
  // chair, when the asset carries the walking clips. Otherwise they begin
  // seated as before. Declared before the cue effect so the gate is set ahead
  // of the first cue.
  const [entranceDone, setEntranceDone] = useState(false);
  const entranceRef = useRef(null);
  const groupRef = useRef(null);
  // Reused world positions for the examination annotation anchors.
  const examAnchorsRef = useRef({
    head: [0, 0, 0], neck: [0, 0, 0], chest: [0, 0, 0], abdomen: [0, 0, 0],
    leftHand: [0, 0, 0], rightHand: [0, 0, 0],
  });
  useEffect(() => () => clearExamAnchors(), []);
  useLayoutEffect(() => {
    const config = recipe.presentation?.entrance;
    const walkClip = clips.find((clip) => clip.name === 'Walk');
    const sitClip = clips.find((clip) => clip.name === 'SitDown');
    if (!walkIn || !config || !walkClip || !sitClip || entranceDone || paused) {
      entranceRef.current = null;
      return;
    }
    const [px, , pz] = recipe.placement.position;
    const walk = actor.mixer.clipAction(walkClip);
    walk.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    actor.mixer.update(0);
    entranceRef.current = {
      phase: 'walk',
      started: false,
      // Swing east of the chair, then approach its front and sit backward.
      waypoints: [
        [config.from[0], 0, config.from[2]],
        [1.6, 0, -0.4],
        [px, 0, pz - 0.35],
      ],
      leg: 1,
      yaw: null,
      sitTime: 0,
      sitDuration: sitClip.duration,
      sitFrom: null,
      walkAction: walk,
      sitAction: actor.mixer.clipAction(sitClip),
    };
  }, [actor, clips, entranceDone, paused, walkIn, recipe.placement.position, recipe.presentation?.entrance]);

  // Start and blend actions before the browser paints. A passive effect runs
  // one frame too late: the newly committed skeleton is visible in bind pose.
  useLayoutEffect(() => {
    if (entranceRef.current) return undefined;
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
  }, [actor, clips, paused, recipe.animation, entranceDone]);

  // Primitive roots are not disposed by React Three Fiber. Clean up only when
  // this actual actor instance changes or unmounts, never for a performance cue.
  useEffect(() => () => {
    if (currentActionRef.current?.mixer === actor.mixer) currentActionRef.current = null;
    actor.mixer.stopAllAction();
    actor.mixer.uncacheRoot(actor.root);
    // Hat geometry is built per actor, unlike the shared GLB geometry.
    disposePatientHat(actor.hat);
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
    const dt = Math.min(delta, 0.1);
    const entrance = entranceRef.current;
    const group = groupRef.current;
    if (entrance && group) {
      const { position, rotation } = recipe.placement;
      if (entrance.phase === 'walk') {
        if (!entrance.started) {
          group.position.set(entrance.waypoints[0][0], 0, entrance.waypoints[0][2]);
          entrance.started = true;
        }
        const target = entrance.waypoints[entrance.leg];
        const dx = target[0] - group.position.x;
        const dz = target[2] - group.position.z;
        const distance = Math.hypot(dx, dz);
        const step = ENTRANCE_WALK_SPEED * dt;
        // Mixamo rigs face +z at rest (the seated pose faces -z via its π
        // placement rotation), so the walking yaw faces along the velocity.
        const walkYaw = Math.atan2(dx, dz);
        entrance.yaw = entrance.yaw == null
          ? walkYaw
          : entrance.yaw + (walkYaw - entrance.yaw) * (1 - Math.exp(-dt * 8));
        group.rotation.y = entrance.yaw;
        if (distance <= step) {
          group.position.set(target[0], 0, target[2]);
          if (entrance.leg < entrance.waypoints.length - 1) {
            entrance.leg += 1;
          } else {
            entrance.phase = 'sit';
            entrance.sitFrom = [group.position.x, group.position.z, entrance.yaw];
            entrance.sitAction.reset().setLoop(THREE.LoopOnce, 1);
            entrance.sitAction.clampWhenFinished = true;
            entrance.sitAction.play();
            entrance.sitAction.crossFadeFrom(entrance.walkAction, 0.2, true);
          }
        } else {
          group.position.x += (dx / distance) * step;
          group.position.z += (dz / distance) * step;
        }
      } else {
        // Ease from the standing spot onto the chair while SitDown plays,
        // turning to face the desk on the way down.
        entrance.sitTime += dt;
        const raw = Math.min(1, entrance.sitTime / Math.max(entrance.sitDuration - 0.15, 0.4));
        const k = raw * raw * (3 - 2 * raw);
        const [fx, fz, fyaw] = entrance.sitFrom;
        group.position.x = fx + (position[0] - fx) * k;
        group.position.z = fz + (position[2] - fz) * k;
        group.position.y = position[1] * k;
        let yawDelta = rotation[1] - fyaw;
        while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
        while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
        group.rotation.y = fyaw + yawDelta * k;
        if (raw >= 1) {
          group.position.set(...position);
          group.rotation.set(...rotation);
          // Hand the seated pose to the cue effect so the idle crossfades
          // from the end of SitDown instead of restarting cold.
          currentActionRef.current = { mixer: actor.mixer, action: entrance.sitAction };
          entranceRef.current = null;
          setEntranceDone(true);
        }
      }
      actor.mixer.update(dt);
      actor.face.update(dt, recipe.animation);
      return;
    }
    actor.mixer.update(dt);
    const animation = settledAnimationRef.current || recipe.animation;
    actor.motion.update(dt, animation, gameDebug.camera);
    actor.face.update(delta, animation);
    // While the examination reading is up, publish where the annotated body
    // parts actually are, so the leader lines track the pose and the camera.
    if (examinationPresentation()) {
      const bones = actor.motion.bones;
      const buffer = examAnchorsRef.current;
      const write = (bone, out, lift = 0) => {
        if (!bone) return;
        bone.updateWorldMatrix(true, false);
        const elements = bone.matrixWorld.elements;
        out[0] = elements[12];
        out[1] = elements[13] + lift;
        out[2] = elements[14];
      };
      write(bones.head, buffer.head, 0.06);
      write(bones.neck, buffer.neck, 0.02);
      write(bones.spine2, buffer.chest);
      write(bones.spine ?? bones.spine2, buffer.abdomen);
      write(bones.leftHand, buffer.leftHand);
      write(bones.rightHand, buffer.rightHand);
      publishExamAnchors(buffer);
    }
  });

  const { position, rotation, scale } = recipe.placement;
  return (
    <group ref={(node) => { groupRef.current = node; readyRef(node); }} position={position} rotation={rotation} scale={scale}>
      <primitive object={actor.root} />
    </group>
  );
}

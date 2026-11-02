import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { patientModelPath } from './patientModelPath.js';
import { prepareStage } from '../prepareStage.js';
import { GLTFLoader } from '../modelLoader.js';
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
import {createHeadwear} from '../../../../shared/characters/headwearPerformance.js';
import {HEADWEAR_TEXTURE_URLS,configureHeadwearTextures} from '../../../../shared/characters/headwearMaterials.js';
import {createModularEyelashes} from '../../../../shared/characters/modularEyelashes.js';
import {createPeriodAccessories} from '../../../../shared/characters/periodAccessories.js';
import { gameDebug } from '../../debug.js';
import { examinationPresentation } from '../../consultation/examPresentation.js';
import { getKTX2Loader } from '../ktx2.js';
import { clearExamAnchors, publishExamAnchors } from '../../consultation/examAnchors.js';
import { createCostumeShell, findBones as findCostumeBones } from '../../../../shared/characters/costumeShell.js';
import { rendererCWomenPalette } from '../../../../shared/characters/rendererCWardrobeSurface.js';
import { createModularFacialHair } from '../../../../shared/characters/modularFacialHair.js';
import { createModularBody } from '../../../../shared/characters/modularBody.js';
import { createModularWardrobe } from '../../../../shared/characters/modularWardrobe.js';
import { createModularIdentity } from '../../../../shared/characters/modularIdentity.js';
import { createModularAppearance } from '../../../../shared/characters/modularAppearance.js';
import { createModularVariation } from '../../../../shared/characters/modularVariants.js';
import { createModularHair } from '../../../../shared/characters/modularHair.js';
import { MODULAR_CAST_LOOKS } from '../../../../shared/characters/modularCast.js';

const ENTRANCE_WALK_SPEED = 1.05;

// Body cues whose clips sit the patient; the shell rebuilds its skirt shape
// per posture the way the lab does at motion endpoints.
const SHELL_SEATED_CUES = new Set([
  'clinic-idle', 'sit-down', 'sitting-talking', 'sitting-distressed',
  'sitting-self-soothing', 'sitting-disapproval', 'sitting-disbelief',
]);
// ?shellDress=1 forces every woman into the procedural shell, for A/B review
// against the authored dresses without touching cast files.
const FORCE_SHELL_DRESS = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('shellDress') === '1';

const TRANSIENT_BODY_CUES = new Set([
  'sit-down',
  'sitting-talking',
  'sitting-distressed',
  'sitting-self-soothing',
  'sitting-disapproval',
  'sitting-disbelief',
]);

export default function RendererCActor({ recipe, manifest, onReady, paused = false, walkIn = false }) {
  const gl = useThree((state) => state.gl);
  const renderScene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const configure = useCallback((loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(getKTX2Loader(gl));
  }, [gl]);
  const review = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
  const reviewing = ['carmela-russo-1896','samuel-taylor-1896'].includes(recipe.id) && review?.has('playtest');
  const castLook = reviewing ? MODULAR_CAST_LOOKS.find(preset => preset.id === review.get('appearancePreset')) : null;
  const reviewSeed = reviewing ? review.get('appearanceSeed') : null;
  // Bump the review URL when an exported character's geometry changes.
  const reviewVersion=castLook?.cohort==='men'?'20261101-eye-fit-1':'20261030-4';
  const bodyPath = castLook ? `/models/characters/${castLook.model}.glb?v=${reviewVersion}` : patientModelPath(recipe, manifest);
  const [gltf, motionGltf] = useLoader(GLTFLoader,
    [bodyPath, recipe.asset?.motionPath || bodyPath], configure);
  const hatTextures=useLoader(THREE.TextureLoader,HEADWEAR_TEXTURE_URLS);
  configureHeadwearTextures(hatTextures);
  const clips = useMemo(() => {
    let merged = gltf.animations;
    if (recipe.asset?.motionPath) {
      const owned = new Set(gltf.animations.map((clip) => clip.name));
      merged = [...gltf.animations, ...motionGltf.animations.filter((clip) => !owned.has(clip.name))];
    }
    // Newer Blender exports constant channels as STEP. The mixer does not
    // re-assert a STEP value between keyframes, so the procedural gaze and
    // gesture deltas accumulate instead of resetting — heads spin. Linear
    // over equal keys renders identically and is written every frame.
    for (const clip of merged) {
      for (const track of clip.tracks) {
        if (track.getInterpolation() === THREE.InterpolateDiscrete) {
          track.setInterpolation(THREE.InterpolateLinear);
        }
      }
    }
    return merged;
  }, [gltf, motionGltf, recipe.asset?.motionPath]);
  const currentActionRef = useRef(null);
  const settledAnimationRef = useRef(null);
  const actor = useMemo(() => {
    const root = cloneSkeleton(gltf.scene);
    root.userData.patientId = recipe.id;
    root.userData.assetPath = bodyPath;
    root.userData.appearancePreset = castLook?.id || null;
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
          // Keep strand cutouts; forcing them opaque produces solid cards.
          if (!material || material.alphaTest > 0) continue;
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
    const wardrobe = createModularWardrobe(root);
    const hair = createModularHair(root);
    const identity = createModularIdentity(root);
    const look = castLook ? {...recipe.asset,...castLook.look}
      : reviewSeed !== null ? {...recipe.asset,...createModularVariation(Number(reviewSeed),recipe.cohort==='men')} : recipe.asset||{};
    identity.update(look?.identityVariant, look?.features);
    const appearance = createModularAppearance(root, identity.frame);
    appearance.update(look);
    hair.update(look);
    createModularBody(root).update(look);
    createModularFacialHair(root).update(look);
    const hatLook={hatStyle:recipe.presentation?.hat?.style||'none',hatColor:recipe.presentation?.hat?.color,hatBandColor:recipe.presentation?.hat?.band,...look};
    // The original Samuel mesh includes its cap as part of the head.
    if(bodyPath.split('?')[0]==='/models/characters/samuel-taylor.glb')hatLook.hatStyle='none';
    const headwear=createHeadwear(root,hatLook);
    const eyelashes=createModularEyelashes(root,{cohort:recipe.cohort,seed:recipe.appearanceSeed});
    eyelashes.updateLook(look);
    wardrobe.update({seated:false,outfit:look.outfit,apron:look.outfit==='work-apron',palette:look.palette,dt:0});
    const accessories=createPeriodAccessories(root,{cohort:recipe.cohort,frame:identity.frame});accessories.updateLook(look);
    const lips = root.getObjectByName('Carmela_Lips');
    let mouthAnchor = null;
    if (lips && motion.bones.head) {
      // These vertices are stored in skin bind space. All fitted lips follow
      // the head, so one vertex's skin weights also transform their centre.
      mouthAnchor = new THREE.Box3().setFromBufferAttribute(lips.geometry.attributes.position).getCenter(new THREE.Vector3());
      if (lips.isSkinnedMesh) lips.applyBoneTransform(0, mouthAnchor);
      lips.localToWorld(mouthAnchor);
      motion.bones.head.worldToLocal(mouthAnchor);
    }
    return { root, mixer, face, motion, headwear, eyelashes, accessories, hatLook, hatClock:0, hatAutomatic:false, wardrobe, identity, appearance, hair, look, mouthAnchor, mouthPoint:new THREE.Vector3() };
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
    castLook,
    reviewSeed,
    bodyPath,
  ]);

  const shellDress = recipe.cohort === 'women'
    && (recipe.presentation?.outfitId === 'shell-dress' || FORCE_SHELL_DRESS);
  const shellRef = useRef(null);
  const shellRefitAtRef = useRef(0);

  // The wardrobe swaps seated and standing carriers independently of the
  // skeleton. Keep that live when a body cue changes without rebuilding the
  // actor or its materials. Under the procedural shell, the authored dresses
  // hide and the carrier stays as the underlayer.
  useLayoutEffect(() => {
    if (recipe.asset?.applyRecipe === false) return;
    const effective = shellDress
      ? { ...recipe, presentation: { ...recipe.presentation, outfitId: 'shell-dress' } }
      : recipe;
    applyRendererCWardrobe(actor.root, effective);
    if (effective.presentation?.outfitId === 'golden-dress') {
      for (const name of ['RendererC_GoldenDressSkirt', 'RendererC_GoldenDressSeatedSkirt']) {
        const skirt = actor.root.getObjectByName(name);
        if (skirt) skirt.userData.preparing = true;
      }
    }
    actor.root.updateMatrixWorld(true);
  }, [actor, recipe.animation.body, recipe.asset?.applyRecipe, recipe.presentation?.outfitId, shellDress]);

  // Walk-in: a summoned patient enters by the waiting-room door and takes the
  // chair, when the asset carries the walking clips. Otherwise they begin
  // seated as before. Declared before the cue effect so the gate is set ahead
  // of the first cue.
  const [entranceDone, setEntranceDone] = useState(false);
  const entranceRef = useRef(null);
  const groupRef = useRef(null);
  // Reused world positions for the examination annotation anchors.
  const examAnchorsRef = useRef({
    head: [0, 0, 0], mouth:[0,0,0], neck: [0, 0, 0], chest: [0, 0, 0], abdomen: [0, 0, 0],
    leftHand: [0, 0, 0], rightHand: [0, 0, 0],
  });
  useEffect(() => () => clearExamAnchors(), []);
  // Shell refits at cue endpoints, after the 0.12-0.2s crossfades settle;
  // rebinding mid-fade bakes an in-between pose into the garment.
  useLayoutEffect(() => {
    if (!shellDress) return;
    shellRefitAtRef.current = performance.now() + 350;
  }, [shellDress, recipe.animation.body, entranceDone]);
  const updateShell = useCallback((dt) => {
    if (!shellDress) return;
    const seated = !entranceRef.current && SHELL_SEATED_CUES.has(recipe.animation.body) ? 1 : 0;
    let shell = shellRef.current;
    if (!shell) {
      const bones = findCostumeBones(actor.root);
      if (!bones.pelvis || !bones.head) {
        shellRef.current = { costume: null, values: null };
        return;
      }
      const palette = rendererCWomenPalette(recipe.values?.womenPalette) || rendererCWomenPalette('plum-taupe');
      const values = {
        ...recipe.values,
        gender: 0.3,
        dressColor: recipe.values?.dressColor || palette.primary,
        secondaryColor: recipe.values?.secondaryColor || palette.secondary,
        trimColor: recipe.values?.trimColor || palette.accent,
      };
      actor.root.updateMatrixWorld(true);
      const costume = createCostumeShell(actor.root, bones, actor.root);
      costume.rebuild({ ...values, seated });
      shellRef.current = shell = { costume, values };
    }
    if (!shell.costume) return;
    if (shellRefitAtRef.current && performance.now() >= shellRefitAtRef.current) {
      shellRefitAtRef.current = 0;
      actor.root.updateMatrixWorld(true);
      shell.costume.rebuild({ ...shell.values, seated });
    }
    shell.costume.update(dt, shell.values);
  }, [actor, recipe.animation.body, recipe.values, shellDress]);
  useLayoutEffect(() => {
    const config = recipe.presentation?.entrance;
    const walkClip = clips.find((clip) => clip.name === 'Walk');
    const sitClip = clips.find((clip) => clip.name === 'SitDown');
    if (!walkIn || !config || !walkClip || !sitClip || entranceDone || paused) {
      entranceRef.current = null;
      return;
    }
    const [px, , pz] = recipe.placement.position;
    // SitDown carries authored root motion: the hips drift ~0.46m backward
    // over the clip, and ClinicIdle then holds them ~0.52m forward of that
    // end pose. Easing the group to the chair as well drove the patient into
    // the chair back, then the idle switch popped her forward. Measure the
    // two hip positions and ease the group to the offset target instead, so
    // the clip's own motion performs the sit and the idle continues in place.
    const idleClip = clips.find((clip) => clip.name === 'ClinicIdle');
    const pelvis = findCostumeBones(actor.root).pelvis;
    let seatDelta = [0, 0];
    if (idleClip && pelvis) {
      const sampleHip = (clip, time) => {
        const action = actor.mixer.clipAction(clip);
        actor.mixer.stopAllAction();
        action.reset().play();
        action.time = time;
        actor.mixer.update(0);
        actor.root.updateMatrixWorld(true);
        const world = pelvis.getWorldPosition(new THREE.Vector3());
        action.stop();
        return world;
      };
      const sitEnd = sampleHip(sitClip, Math.max(0, sitClip.duration - 0.001));
      const idleStart = sampleHip(idleClip, 0);
      seatDelta = [idleStart.x - sitEnd.x, idleStart.z - sitEnd.z];
    }
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
      seatDelta,
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
      && !recipe.asset?.clipMap
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
          gaze: recipe.animation.gaze !== 'doctor' ? recipe.animation.gaze
            : ['discouraged', 'ashamed'].includes(recipe.animation.expression) ? 'down' : 'away',
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
    shellRef.current?.costume?.dispose();
    shellRef.current = null;
    actor.mixer.stopAllAction();
    actor.mixer.uncacheRoot(actor.root);
    actor.wardrobe.dispose?.();
    // Hat geometry is built per actor, unlike the shared GLB geometry.
    actor.headwear.dispose();
    actor.eyelashes.dispose();
    actor.accessories.dispose();
    const materials = new Set();
    const ownedTextures = new Set();
    actor.root.traverse((object) => {
      if (!object.isMesh && !object.isSkinnedMesh) return;
      if (object.geometry?.userData.modularIdentity || object.geometry?.userData.modularAppearance) object.geometry.dispose();
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

  useEffect(() => {
    let cancelled = false;
    actor.root.visible = false;
    prepareStage(gl, actor.root, camera, renderScene, () => cancelled).then(() => {
      if (cancelled) return;
      actor.root.visible = true;
      onReady?.(recipe.id);
    }, error => {
      if (!cancelled) { actor.root.visible = true; console.error('Patient preparation failed', error); }
    });
    return () => { cancelled = true; };
  }, [actor, gl, camera, renderScene, onReady, recipe.id]);

  useFrame((_, delta) => {
    if (paused || !actor.root.visible) return;
    actor.headwear.restorePose();
    actor.motion.restorePose();
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
        // Target is offset by the measured hip delta between SitDown's end
        // and ClinicIdle's hold, so the hips land where the idle keeps them.
        const [dxSeat, dzSeat] = entrance.seatDelta;
        group.position.x = fx + ((position[0] + dxSeat) - fx) * k;
        group.position.z = fz + ((position[2] + dzSeat) - fz) * k;
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
      updateShell(dt);
      actor.face.update(dt, recipe.animation);
      actor.headwear.update(dt);
      actor.eyelashes.update(camera,gl.domElement.height);actor.root.userData.eyelashes=actor.eyelashes.describe();
      actor.accessories.update();actor.root.userData.accessories=actor.accessories.describe();
      actor.root.userData.headwear=actor.headwear.describe();
      actor.root.userData.performance = recipe.animation;
      return;
    }
    actor.mixer.update(dt);
    updateShell(dt);
    const animation = settledAnimationRef.current || recipe.animation;
    actor.motion.update(dt, animation, gameDebug.camera);
    actor.face.update(delta, animation);
    actor.hatClock+=dt;
    const hatDemo=review?.has('playtest')&&review.get('hatDemo')==='1';
    if(hatDemo)actor.headwear.request(actor.hatClock<1 || actor.hatClock>=7&&actor.hatClock<13);
    else if(animation.gesture==='remove-hat')actor.headwear.request(false);
    else if(animation.gesture==='put-on-hat'||animation.body==='stand-up')actor.headwear.request(true);
    else if(!actor.hatAutomatic&&actor.headwear.hat){
      actor.hatAutomatic=true;
      if(recipe.presentation?.hat?.removeInside ?? (recipe.cohort==='men'))actor.headwear.request(false);
    }
    actor.headwear.update(dt,{followHand:animation.gesture==='extend-both-arms'});
    actor.eyelashes.update(camera,gl.domElement.height);actor.root.userData.eyelashes=actor.eyelashes.describe();
    actor.accessories.update();actor.root.userData.accessories=actor.accessories.describe();
    actor.root.userData.headwear=actor.headwear.describe();
    actor.root.userData.performance = animation;
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
      write(bones.head, buffer.mouth, -.035);
      if (actor.mouthAnchor && bones.head) {
        bones.head.localToWorld(actor.mouthPoint.copy(actor.mouthAnchor));
        actor.mouthPoint.toArray(buffer.mouth);
      }
      write(bones.neck, buffer.neck, 0.02);
      write(bones.spine2, buffer.chest);
      write(bones.spine ?? bones.spine2, buffer.abdomen);
      write(bones.leftHand, buffer.leftHand);
      write(bones.rightHand, buffer.rightHand);
      publishExamAnchors(buffer);
    }
  });

  useFrame((_, delta) => {
    actor.identity.update(actor.look?.identityVariant, actor.look?.features);
    actor.appearance.update(actor.look);
    actor.hair.update(actor.look);
    const entrance = entranceRef.current;
    const seated = entrance
      ? entrance.phase === 'sit' && entrance.sitTime / entrance.sitDuration > .65
      : SHELL_SEATED_CUES.has(recipe.animation.body);
    actor.wardrobe.update({
      seated,
      dt:delta,
      outfit: actor.look?.outfit,
      apron: actor.look?.outfit === 'work-apron',
      palette: actor.look?.palette,
    });
  });

  const { position, rotation, scale } = recipe.placement;
  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scale}>
      <primitive object={actor.root} />
    </group>
  );
}

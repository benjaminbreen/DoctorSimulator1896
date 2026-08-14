import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {
  RigidBody,
  CapsuleCollider,
  CuboidCollider,
  CylinderCollider,
  useRapier,
} from '@react-three/rapier';
import { handlesAlive } from '../physics/useCharacterController.js';
import { terrainHeight } from '../world/terrain.js';
import { parkItems } from '../world/centralPark.js';
import { APRON_W, GAPSTOW, walkY as gapstowWalkY } from '../world/gapstow.js';
import { reportAgent, removeAgent } from '../world/agents.js';
import { clearActorImpacts, queueActorImpact, takeActorImpacts } from '../world/actorImpacts.js';
import {
  REACTION_MOTION,
  REACTION_PHASE,
  beginReaction,
  classifyPedestrianStartle,
  createReactionState,
  stepReaction,
} from '../world/actorReactions.js';
import { gameDebug } from '../debug.js';
import { applyPlayerEvent, npcStartleEffect } from '../world/player.js';
import {
  PEDESTRIAN_STROLLER_CIRCUITS as STROLLER_CIRCUITS,
  strollerScheduleState,
} from '../world/strollerPedestrians.js';
import {
  PARK_VISITOR_ITINERARY,
  parkVisitorItineraryState,
} from '../world/parkVisitorItinerary.js';
import {
  PING_PONG_PHASE,
  createPingPongRouteState,
  interpolateRouteTurnYaw,
  routeTurnProgress,
  stepPingPongRoute,
} from '../world/pingPongRoute.js';
import { buildPeriodStroller } from './strollerModel.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';
import {
  PEDESTRIAN_ARCHETYPES,
  PEDESTRIAN_BENCH_SITTERS as BENCH_SITTERS,
  PEDESTRIAN_MAN_CLIP_FILES as MAN_CLIP_FILES,
  PEDESTRIAN_POSERS as POSERS,
  PEDESTRIAN_REACTION_FILE,
  PEDESTRIAN_ROUTES as ROUTES,
  PEDESTRIAN_SHARED_CLIPS as SHARED_CLIPS,
  PEDESTRIAN_STANDERS as STANDERS,
  pedestrianScheduleActive,
  PEDESTRIAN_STRAWHAT_MOTION_FILE,
  PEDESTRIAN_WOMAN_CLIP_FILES as WOMAN_CLIP_FILES,
} from '../world/pedestrianCatalog.js';

// Background pedestrians: the bowler-hat man (pedestrian-b.glb) and the
// four women (pedestrian-c/d/e/f.glb). Walkers follow sidewalk routes on real
// walk cycles; standers loiter; in the park a few rest on the grass or sit on
// a bench. Clips retarget across figures that share the same Mixamo skeleton.
const WALK_TOP = 1.29;
const WALK_SPEED = 1.35;
// Animation throttle: skinning pays per mixer update, so near figures
// animate every frame, mid-distance every third, and past freeze they
// hold pose until approached again.
const ANIM_NEAR = 25;
const ANIM_FREEZE = 60;
// The Mixamo rigs stand about 1.08 m; scale to street height.
const NPC_SCALE = 1.62;
const POSE_PADDING = 1.7;

// Bumping into a figure: kinematic capsules make them solid, and standers
// and walkers play a startle clip when the player presses in.
const BUMP_DISTANCE = 0.85;
const BUMP_RELEASE_DISTANCE = 1.15;
const BUMP_COOLDOWN = 4;
const STANDING_COLLIDER = Object.freeze({ halfHeight: 0.55, radius: 0.28, y: 0.88 });
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function playReactionPhase(entry) {
  const { phase } = entry.reaction;
  if (entry.renderedPhase === phase) return;
  const previous = entry.activeAction;
  const next = phase === REACTION_PHASE.STAGGER ? entry.actions.stagger : null;

  if (phase === REACTION_PHASE.NORMAL) {
    previous?.fadeOut(0.25);
    entry.base.fadeIn(0.28).play();
    entry.activeAction = null;
  } else if (next) {
    if (entry.ambientAction) {
      entry.ambientAction.stop();
      entry.ambientAction = null;
      entry.ambientName = null;
      entry.nextAmbientAt = entry.reaction.phaseUntil + 5;
    }
    entry.base.fadeOut(0.14);
    if (previous && previous !== next) previous.fadeOut(0.16);
    next.reset().setEffectiveTimeScale(REACTION_MOTION.stagger.timeScale).fadeIn(0.12).play();
    entry.activeAction = next;
  }
  entry.renderedPhase = phase;
}

function playAmbient(entry, name, now) {
  const next = entry.actions[name];
  if (!next || entry.activeAction || entry.ambientAction) return false;
  entry.base.fadeOut(0.18);
  next.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.16).play();
  next.clampWhenFinished = true;
  entry.ambientAction = next;
  entry.ambientName = name;
  entry.ambientUntil = now + next.getClip().duration / Math.max(0.1, entry.speed) + 0.08;
  return true;
}

function finishAmbient(entry, now) {
  restoreLoopingIdle(entry.mixer, entry.base, entry.ambientAction);
  entry.ambientAction = null;
  entry.ambientName = null;
  entry.ambientIndex += 1;
  entry.nextAmbientAt = now + 7 + hash01(entry.ambientIndex * 17.3 + entry.age) * 12;
}

function benchSitterPose({ benchId, along, yawOffset = 0 }) {
  const bench = parkItems.find((item) => item.id === benchId);
  if (!bench) throw new Error(`Pedestrian bench not found: ${benchId}`);
  const yaw = bench.yaw ?? 0;
  const x = bench.position[0] + Math.cos(yaw) * along;
  const z = bench.position[2] - Math.sin(yaw) * along;
  return { x, z, yaw: yaw + yawOffset };
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function compatibleClips(source, clips) {
  const names = new Set();
  source.traverse((node) => {
    if (node.name) names.add(node.name);
  });
  return clips.map((clip) => {
    const copy = clip.clone();
    copy.tracks = copy.tracks.filter((track) => names.has(track.name.split('.')[0]));
    return copy;
  });
}

// Mixamo animations carry no props; the briefcase is ours, hung from the
// carry hand. Dimensions are metres — the bone's world scale is divided out.
function attachBriefcase(figure) {
  let hand = null;
  figure.traverse((node) => {
    if (!hand && node.isBone && /RightHand$/.test(node.name)) hand = node;
  });
  if (!hand) return;
  const leather = new THREE.MeshStandardMaterial({ color: '#3a2c1e', roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: '#8a6f33', roughness: 0.4, metalness: 0.7 });
  const case_ = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.11), leather);
  body.castShadow = true;
  case_.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), leather);
  handle.position.y = 0.16;
  case_.add(handle);
  const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), brass);
  clasp.position.set(0, 0.13, 0.06);
  case_.add(clasp);
  hand.add(case_);
  hand.updateWorldMatrix(true, false);
  const worldScale = new THREE.Vector3();
  hand.getWorldScale(worldScale);
  const inverse = 1 / Math.max(worldScale.x, 1e-6);
  // Hang below the grip, handle up. The bone's world scale already includes
  // the figure scale, so dividing it out leaves the case in plain metres.
  case_.scale.setScalar(inverse);
  case_.position.set(0, 0.09 * inverse, 0.02 * inverse);
}

function routePoint(points, dist) {
  let remaining = dist;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, z1] = points[i];
    const [x2, z2] = points[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (remaining <= len) {
      const t = remaining / len;
      return [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, x2 - x1, z2 - z1];
    }
    remaining -= len;
  }
  const [x1, z1] = points[points.length - 2];
  const [x2, z2] = points[points.length - 1];
  return [x2, z2, x2 - x1, z2 - z1];
}

function routeLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  }
  return total;
}

function routeGroundY(route, x, z) {
  if (route.crossesGapstow) {
    const dx = x - GAPSTOW.x;
    const dz = z - GAPSTOW.z;
    const cos = Math.cos(GAPSTOW.yaw);
    const sin = Math.sin(GAPSTOW.yaw);
    const along = dx * cos - dz * sin;
    const across = dx * sin + dz * cos;
    if (Math.abs(along) <= APRON_W && Math.abs(across) <= 2.2) {
      return gapstowWalkY(along) + 0.02;
    }
  }
  return route.onTerrain ? terrainHeight(x, z) : WALK_TOP;
}

function setBaseAction(entry, next) {
  if (!next || next === entry.base) return;
  entry.base.fadeOut(0.24);
  next.reset().fadeIn(0.24).play();
  entry.base = next;
}

export default function Pedestrians({ runtime }) {
  // All pedestrian GLBs are meshopt-compressed.
  const withMeshopt = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);
  const manGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.m.modelPath, withMeshopt);
  const womanGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.w.modelPath, withMeshopt);
  const dressGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.d.modelPath, withMeshopt);
  const somberGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.s.modelPath, withMeshopt);
  const fortiesGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.f.modelPath, withMeshopt);
  const strawhatGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.h.modelPath, withMeshopt);
  const strawhatMotionGltf = useLoader(GLTFLoader, PEDESTRIAN_STRAWHAT_MOTION_FILE, withMeshopt);
  const manClipGltfs = useLoader(GLTFLoader, MAN_CLIP_FILES, withMeshopt);
  const womanClipGltfs = useLoader(GLTFLoader, WOMAN_CLIP_FILES, withMeshopt);
  const reactGltf = useLoader(GLTFLoader, PEDESTRIAN_REACTION_FILE, withMeshopt);
  const { world, rapier } = useRapier();
  const bodyQuaternion = useRef(new THREE.Quaternion());

  const { group, walkers, figures } = useMemo(() => {
    const reactClip = reactGltf.animations[0];
    const manClips = compatibleClips(manGltf.scene, [
      ...manGltf.animations,
      ...manClipGltfs.flatMap((entry) => entry.animations),
      reactClip,
    ]);
    const sharedClips = manClips.filter((clip) => SHARED_CLIPS.includes(clip.name));
    const womanWalk = womanClipGltfs.flatMap((entry) => entry.animations);
    const cast = {
      m: { source: manGltf.scene, clips: manClips },
      w: {
        source: womanGltf.scene,
        clips: compatibleClips(womanGltf.scene, [
          ...womanGltf.animations,
          ...womanWalk,
          ...sharedClips,
          ...strawhatMotionGltf.animations,
        ]),
      },
      // These three figures carry the same complete 65-bone Mixamo skeleton
      // as Strawhat, so her standalone motion library transfers directly.
      d: {
        source: dressGltf.scene,
        clips: compatibleClips(dressGltf.scene, [
          ...dressGltf.animations,
          ...womanWalk,
          ...strawhatMotionGltf.animations,
        ]),
      },
      // This figure carries its own long seated loop. The matching full
      // Mixamo rig also leaves walking clips available if she is reused later.
      s: { source: somberGltf.scene, clips: compatibleClips(somberGltf.scene, somberGltf.animations) },
      f: {
        source: fortiesGltf.scene,
        clips: compatibleClips(fortiesGltf.scene, [
          ...fortiesGltf.animations,
          ...strawhatGltf.animations,
          ...strawhatMotionGltf.animations,
        ]),
      },
      h: {
        source: strawhatGltf.scene,
        clips: compatibleClips(strawhatGltf.scene, [
          ...strawhatGltf.animations,
          ...strawhatMotionGltf.animations,
        ]),
      },
    };
    const findClip = (who, name) => {
      const clip = cast[who].clips.find((candidate) => candidate.name === name);
      if (!clip) throw new Error(`Pedestrian ${who} is missing animation ${name}`);
      return clip;
    };

    const root = new THREE.Group();
    const walking = [];
    // Every clone shares the source geometry, so the padded bind-pose sphere
    // is computed once per part rather than once per figure.
    const spheres = new Map();
    const all = [];

    const spawn = (index, spec, clipName = spec.clip) => {
      const { who } = spec;
      const figure = cloneSkeleton(cast[who].source);
      figure.scale.setScalar(NPC_SCALE * (0.95 + hash01(index * 3.7) * 0.1));
      const meshes = [];
      figure.traverse((node) => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        meshes.push(node);
        if (node.isSkinnedMesh) {
          let sphere = spheres.get(node.geometry.uuid);
          if (!sphere) {
            node.computeBoundingSphere();
            sphere = node.boundingSphere.clone();
            sphere.radius *= POSE_PADDING;
            spheres.set(node.geometry.uuid, sphere);
          }
          node.boundingSphere = sphere;
        }
        // One suit reads as a uniform; drift the colour a little per figure.
        // Kept small and symmetric: the figure has one material, so any
        // lightness drop darkens the face along with the suit.
        if (node.material) {
          const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
          const materials = sourceMaterials.map((material) => material.clone());
          node.material = Array.isArray(node.material) ? materials : materials[0];
          for (const material of materials) {
            normalizeNonmetallicCharacterMaterial(material);
            material.color.offsetHSL(
              (hash01(index * 7.1) - 0.5) * 0.02,
              -0.03,
              (hash01(index * 5.3) - 0.5) * 0.06,
            );
          }
        }
      });
      // A wrapper carries position/yaw so placement stays in world terms.
      const wrapper = new THREE.Group();
      wrapper.add(figure);
      const stroller = spec.strollerVariant
        ? buildPeriodStroller(spec.strollerVariant)
        : null;
      if (stroller) {
        wrapper.add(stroller.group);
        meshes.push(...stroller.meshes);
      }
      root.add(wrapper);
      if (/Briefcase/.test(clipName)) attachBriefcase(figure);
      const clip = findClip(who, clipName);
      const mixer = new THREE.AnimationMixer(figure);
      const base = mixer.clipAction(clip);
      base.play();
      mixer.setTime(hash01(index * 11.3) * clip.duration);
      const action = (name) => {
        const found = cast[who].clips.find((entry) => entry.name === name);
        return found ? mixer.clipAction(found) : null;
      };
      const actions = {
        stagger: action(REACTION_MOTION.stagger.clip),
      };
      for (const name of spec.ambientClips ?? []) actions[name] = action(name);
      actions.stagger?.setLoop(THREE.LoopOnce, 1);
      if (actions.stagger) actions.stagger.clampWhenFinished = true;
      const entry = {
        id: spec.id,
        age: spec.age,
        gender: who === 'm' ? 'male' : 'female',
        wrapper,
        meshes,
        mixer,
        base,
        actions,
        reaction: createReactionState(),
        activeAction: null,
        ambientAction: null,
        ambientName: null,
        ambientClips: spec.ambientClips ?? null,
        ambientIndex: 0,
        ambientUntil: Infinity,
        nextAmbientAt: 8 + hash01(index * 19.7 + 4) * 13,
        renderedPhase: REACTION_PHASE.NORMAL,
        cooldownUntil: 0,
        playerNear: false,
        velocity: [0, 0],
        refs: {
          body: null,
          standingCollider: null,
          restingCollider: null,
          strollerCollider: null,
        },
        poser: false,
        schedule: spec.schedule ?? null,
        stroller,
        speed: 0.92 + hash01(index * 13.7) * 0.16,
        pending: 0,
      };
      all.push(entry);
      return entry;
    };

    STANDERS.forEach((spec, index) => {
      const entry = spawn(index, spec);
      entry.wrapper.position.set(spec.x, spec.onTerrain ? terrainHeight(spec.x, spec.z) : WALK_TOP, spec.z);
      entry.wrapper.rotation.y = spec.yaw;
    });

    POSERS.forEach((spec, index) => {
      const entry = spawn(index + 20, spec);
      entry.wrapper.position.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      entry.wrapper.rotation.y = spec.yaw;
      // Ground figures stay in repose when bumped; only their collider acts.
      entry.poser = true;
    });

    BENCH_SITTERS.forEach((sitter, index) => {
      const { x, z, yaw } = benchSitterPose(sitter);
      const entry = spawn(index + 30, sitter);
      entry.wrapper.position.set(x, terrainHeight(x, z), z);
      entry.wrapper.rotation.y = yaw;
      entry.poser = true;
    });

    ROUTES.forEach((route, index) => {
      const entry = spawn(index + 40, route, 'Walk');
      const idleName = cast[route.who].clips.some((clip) => clip.name === 'Idle')
        ? 'Idle'
        : 'StandingIdle';
      const idle = entry.mixer.clipAction(findClip(route.who, idleName));
      idle.setLoop(THREE.LoopRepeat, Infinity);
      const length = routeLength(route.points);
      // Same object in both lists, so the bump state is shared.
      walking.push(Object.assign(entry, {
        route,
        length,
        routeMotion: createPingPongRouteState({
          distance: hash01(index * 5.9) * length,
          seed: index + 40,
        }),
        routeActions: { walk: entry.base, idle },
        turnFromYaw: entry.wrapper.rotation.y,
        turnToYaw: entry.wrapper.rotation.y,
      }));
    });

    {
      const spec = PARK_VISITOR_ITINERARY;
      const entry = spawn(55, spec, 'Walk');
      const [x, z] = spec.toCarousel.points[0];
      entry.wrapper.position.set(x, terrainHeight(x, z), z);
      entry.wrapper.rotation.y = spec.initialYaw;
      walking.push(Object.assign(entry, {
        itinerary: spec,
        itineraryActions: {
          walk: entry.base,
          idle: entry.mixer.clipAction(findClip(spec.who, 'Idle')),
        },
        itineraryPhase: null,
      }));
    }

    STROLLER_CIRCUITS.forEach((route, index) => {
      const entry = spawn(index + 60, route, 'StrollerWalk');
      const length = routeLength(route.points);
      const idleClip = findClip(route.who, 'StrollerIdle');
      walking.push(Object.assign(entry, {
        route,
        length,
        dist: route.startFraction * length,
        dir: 1,
        speed: route.speed,
        strollerActions: {
          walk: entry.base,
          idle: entry.mixer.clipAction(idleClip),
        },
        strollerPaused: false,
        wheelSpin: 0,
      }));
    });

    return { group: root, walkers: walking, figures: all };
  }, [manGltf, womanGltf, dressGltf, somberGltf, fortiesGltf, strawhatGltf, strawhatMotionGltf, manClipGltfs, womanClipGltfs, reactGltf]);

  const frameCount = useRef(0);
  const trackedPeople = useMemo(
    () => figures.map((entry) => ({
      id: entry.id,
      gender: entry.gender,
      position: [entry.wrapper.position.x, entry.wrapper.position.y, entry.wrapper.position.z],
      yaw: entry.wrapper.rotation.y,
    })),
    [figures],
  );
  useEffect(() => {
    gameDebug.pedestrians = trackedPeople;
    return () => {
      if (gameDebug.pedestrians === trackedPeople) gameDebug.pedestrians = [];
    };
  }, [trackedPeople]);
  useFrame((state, delta) => {
    // Casting a shadow means a second full pass over the figure. Past a few
    // metres the sun's shadow of a stranger is a smudge; only the ones near
    // the camera pay for it.
    const eye = state.camera.position;
    const t = state.clock.elapsedTime;
    frameCount.current += 1;
    for (const [index, entry] of figures.entries()) {
      const { x, z } = entry.wrapper.position;
      const tracked = trackedPeople[index];
      tracked.position[0] = x;
      tracked.position[1] = entry.wrapper.position.y;
      tracked.position[2] = z;
      tracked.yaw = entry.wrapper.rotation.y;
      const scheduleActive = pedestrianScheduleActive(entry.schedule, runtime.values.timeOfDay);
      entry.wrapper.visible = scheduleActive;
      if (!scheduleActive) {
        removeAgent(entry.id);
        const inactiveCollider = entry.poser
          ? entry.refs.restingCollider
          : entry.refs.standingCollider;
        if (entry.refs.body && handlesAlive(world, entry.refs.body, inactiveCollider)) {
          entry.refs.body.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
        }
        continue;
      }
      const dist2 = (x - eye.x) ** 2 + (z - eye.z) ** 2;
      const shadowDistance = runtime.values.outdoorShadowDistance;
      const near = dist2 < shadowDistance * shadowDistance;
      for (const mesh of entry.meshes) mesh.castShadow = near;
      // Accumulate time so a throttled figure moves at true speed, just in
      // coarser steps. The +index staggers mid-tier updates across frames.
      const reacting = entry.reaction.phase !== REACTION_PHASE.NORMAL;
      if (entry.ambientAction && t >= entry.ambientUntil) finishAmbient(entry, t);
      entry.pending = Math.min(entry.pending + delta * (reacting ? 1 : entry.speed), 1);
      const animate =
        dist2 < ANIM_NEAR * ANIM_NEAR ||
        ((reacting || dist2 < ANIM_FREEZE * ANIM_FREEZE)
          && (frameCount.current + index) % 3 === 0);
      if (animate) {
        entry.mixer.update(entry.pending);
        entry.pending = 0;
      }
      // The carriages steer around whatever is reported here. A stroller is
      // reported from the combined adult/carriage centre, not the adult's
      // feet, so traffic clears the whole rig.
      const yaw = entry.wrapper.rotation.y;
      const agentOffset = entry.stroller ? 0.55 : 0;
      reportAgent(
        entry.id,
        x + Math.sin(yaw) * agentOffset,
        z + Math.cos(yaw) * agentOffset,
        entry.stroller ? 0.9 : 0.45,
        {
          kind: 'pedestrian',
          gender: entry.gender,
          velocity: [...entry.velocity],
        },
      );

      // The collider tracks the figure; the player's controller resolves
      // against it, so nobody can be walked through.
      const activeCollider = entry.poser
        ? entry.refs.restingCollider
        : entry.refs.standingCollider;
      const { body } = entry.refs;
      if (body && handlesAlive(world, body, activeCollider)) {
        const p = entry.wrapper.position;
        body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
        if (entry.stroller) {
          bodyQuaternion.current.setFromAxisAngle(Y_AXIS, entry.wrapper.rotation.y);
          body.setNextKinematicRotation(bodyQuaternion.current);
        }
      }

      if (!entry.poser) {
        for (const impact of takeActorImpacts(entry.id)) {
          const sourceVelocity = impact.sourceVelocity ?? [0, 0, 0];
          const relativeSpeed = Math.hypot(
            sourceVelocity[0] - entry.velocity[0],
            sourceVelocity[2] - entry.velocity[1],
          );
          const next = beginReaction(
            entry.reaction,
            {
              ...impact,
              relativeSpeed,
              response: classifyPedestrianStartle({ ...impact, relativeSpeed }),
            },
            t,
          );
          if (next !== entry.reaction) {
            entry.reaction = next;
            entry.cooldownUntil = t + BUMP_COOLDOWN;
            playReactionPhase(entry);
          }
        }

        const stepped = stepReaction(entry.reaction, t);
        if (stepped !== entry.reaction) {
          entry.reaction = stepped;
          playReactionPhase(entry);
        }
      }

      if (
        entry.ambientClips
        && entry.reaction.phase === REACTION_PHASE.NORMAL
        && !entry.ambientAction
        && t >= entry.nextAmbientAt
      ) {
        const name = entry.ambientClips[entry.ambientIndex % entry.ambientClips.length];
        if (!playAmbient(entry, name, t)) entry.nextAmbientAt = t + 2;
      }

      // Preserve the forgiving proximity trigger from the original reaction:
      // Rapier contacts are precise, but the character controller may stop a
      // fraction before two kinematic capsules technically overlap.
      if (!entry.poser) {
        const player = gameDebug.player.position;
        const separation2 = (x - player[0]) ** 2 + (z - player[2]) ** 2;
        const bumped = separation2 < BUMP_DISTANCE * BUMP_DISTANCE;
        if (!entry.playerNear && bumped && t > entry.cooldownUntil) {
          entry.playerNear = true;
          const playerVelocity = gameDebug.player.velocity;
          const relativeSpeed = Math.hypot(
            playerVelocity[0] - entry.velocity[0],
            playerVelocity[2] - entry.velocity[1],
          );
          const next = beginReaction(
            entry.reaction,
            {
              cause: 'player-body',
              relativeSpeed,
              running: gameDebug.player.running,
              direction: [playerVelocity[0], playerVelocity[2]],
              response: classifyPedestrianStartle({
                cause: 'player-body',
                relativeSpeed,
                running: gameDebug.player.running,
              }),
            },
            t,
          );
          if (next !== entry.reaction) {
            entry.reaction = next;
            entry.cooldownUntil = t + BUMP_COOLDOWN;
            playReactionPhase(entry);
            applyPlayerEvent(npcStartleEffect(entry.id));
          }
        } else if (separation2 > BUMP_RELEASE_DISTANCE * BUMP_RELEASE_DISTANCE) {
          entry.playerNear = false;
        }
      }
    }

    for (const walker of walkers) {
      // Any full-body reaction owns the route until its standing pose returns.
      if (walker.reaction.phase !== REACTION_PHASE.NORMAL) {
        walker.velocity[0] = 0;
        walker.velocity[1] = 0;
        continue;
      }

      if (walker.itinerary) {
        const itineraryState = parkVisitorItineraryState(runtime.values.timeOfDay);
        if (itineraryState.phase !== walker.itineraryPhase) {
          walker.itineraryPhase = itineraryState.phase;
          setBaseAction(
            walker,
            itineraryState.action === 'Idle'
              ? walker.itineraryActions.idle
              : walker.itineraryActions.walk,
          );
        }
        const [x, z, dx, dz] = routePoint(
          itineraryState.route.points,
          itineraryState.distance,
        );
        walker.wrapper.position.set(x, routeGroundY(itineraryState.route, x, z), z);
        if (itineraryState.moving) {
          walker.wrapper.rotation.y = Math.atan2(dx, dz);
          const length = Math.hypot(dx, dz) || 1;
          walker.velocity[0] = (dx / length) * WALK_SPEED;
          walker.velocity[1] = (dz / length) * WALK_SPEED;
        } else {
          walker.wrapper.rotation.y = itineraryState.yaw;
          walker.velocity[0] = 0;
          walker.velocity[1] = 0;
        }
        continue;
      }

      if (walker.stroller) {
        const paused = strollerScheduleState(walker.route.schedule, t).paused;
        if (paused !== walker.strollerPaused) {
          walker.strollerPaused = paused;
          setBaseAction(walker, paused ? walker.strollerActions.idle : walker.strollerActions.walk);
        }
        if (paused) {
          walker.velocity[0] = 0;
          walker.velocity[1] = 0;
          continue;
        }
      }

      if (walker.routeMotion) {
        const stepped = stepPingPongRoute(walker.routeMotion, {
          delta,
          now: t,
          length: walker.length,
          speed: WALK_SPEED * walker.speed,
        });
        const [x, z, dx, dz] = routePoint(walker.route.points, walker.routeMotion.distance);
        const y = routeGroundY(walker.route, x, z);
        walker.wrapper.position.set(x, y, z);
        const targetYaw = Math.atan2(
          dx * walker.routeMotion.direction,
          dz * walker.routeMotion.direction,
        );
        if (stepped.phaseChanged) {
          if (stepped.phase === PING_PONG_PHASE.WALKING) {
            setBaseAction(walker, walker.routeActions.walk);
            walker.wrapper.rotation.y = targetYaw;
          } else {
            setBaseAction(walker, walker.routeActions.idle);
            if (stepped.phase === PING_PONG_PHASE.TURNING) {
              walker.turnFromYaw = walker.wrapper.rotation.y;
              walker.turnToYaw = targetYaw;
            }
          }
        }
        if (stepped.phase === PING_PONG_PHASE.TURNING) {
          walker.wrapper.rotation.y = interpolateRouteTurnYaw(
            walker.turnFromYaw,
            walker.turnToYaw,
            routeTurnProgress(walker.routeMotion, t),
          );
        } else if (stepped.phase === PING_PONG_PHASE.WALKING) {
          walker.wrapper.rotation.y = targetYaw;
        }
        if (stepped.moving) {
          const tangentLength = Math.hypot(dx, dz) || 1;
          walker.velocity[0] = (dx / tangentLength) * WALK_SPEED
            * walker.routeMotion.direction * walker.speed;
          walker.velocity[1] = (dz / tangentLength) * WALK_SPEED
            * walker.routeMotion.direction * walker.speed;
        } else {
          walker.velocity[0] = 0;
          walker.velocity[1] = 0;
        }
        continue;
      }

      const travel = WALK_SPEED * delta * walker.dir * walker.speed;
      walker.dist += travel;
      if (walker.route.loop) {
        walker.dist = ((walker.dist % walker.length) + walker.length) % walker.length;
      } else if (walker.dist > walker.length) {
        walker.dist = walker.length;
        walker.dir = -1;
      } else if (walker.dist < 0) {
        walker.dist = 0;
        walker.dir = 1;
      }
      const [x, z, dx, dz] = routePoint(walker.route.points, walker.dist);
      const y = routeGroundY(walker.route, x, z);
      walker.wrapper.position.set(x, y, z);
      walker.wrapper.rotation.y = Math.atan2(dx * walker.dir, dz * walker.dir);
      const length = Math.hypot(dx, dz) || 1;
      walker.velocity[0] = (dx / length) * WALK_SPEED * walker.dir * walker.speed;
      walker.velocity[1] = (dz / length) * WALK_SPEED * walker.dir * walker.speed;
      if (walker.stroller) {
        walker.wheelSpin += Math.abs(travel) / walker.stroller.wheelRadius;
        for (const wheel of walker.stroller.wheels) wheel.rotation.x = walker.wheelSpin;
      }
    }
  });

  useEffect(
    () => () => {
      figures.forEach((entry) => {
        removeAgent(entry.id);
        clearActorImpacts(entry.id);
      });
      for (const entry of figures) {
        entry.stroller?.dispose();
        for (const mesh of entry.meshes) mesh.material?.dispose?.();
      }
    },
    [figures],
  );

  return (
    <>
      <primitive object={group} />
      {figures.map((entry, index) => (
        <RigidBody
          key={entry.id}
          ref={(node) => (entry.refs.body = node)}
          type="kinematicPosition"
          colliders={false}
          position={[0, -30 - index * 3, 0]}
          userData={{ gameKind: 'pedestrian', actorId: entry.id }}
          onCollisionEnter={({ other }) => {
            if (entry.poser || other.rigidBodyObject?.userData?.gameKind !== 'player') return;
            const velocity = gameDebug.player.velocity;
            queueActorImpact(entry.id, {
              cause: 'player-body',
              running: gameDebug.player.running,
              sourceVelocity: [...velocity],
              direction: [velocity[0], velocity[2]],
            });
          }}
        >
          {entry.poser ? (
            <CylinderCollider
              ref={(node) => (entry.refs.restingCollider = node)}
              args={[0.25, 0.45]}
              position={[0, 0.3, 0]}
            />
          ) : (
            <>
              <CapsuleCollider
                ref={(node) => (entry.refs.standingCollider = node)}
                args={[STANDING_COLLIDER.halfHeight, STANDING_COLLIDER.radius]}
                position={[0, STANDING_COLLIDER.y, 0]}
                activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
              />
              {entry.stroller ? (
                <CuboidCollider
                  ref={(node) => (entry.refs.strollerCollider = node)}
                  args={[0.4, 0.5, 0.58]}
                  position={[0, 0.66, 0.82]}
                  activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
                />
              ) : null}
            </>
          )}
        </RigidBody>
      ))}
    </>
  );
}

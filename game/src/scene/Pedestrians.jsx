import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { getKTX2Loader } from './ktx2.js';
import {
  RigidBody,
  CapsuleCollider,
  CuboidCollider,
  CylinderCollider,
  useRapier,
} from '@react-three/rapier';
import { handlesAlive } from '../physics/useCharacterController.js';
import { dampAngle, shortestArc } from '../movement/mathUtils.js';
import { terrainHeight } from '../world/terrain.js';
import { parkItems } from '../world/centralPark.js';
import { APRON_W, GAPSTOW, walkY as gapstowWalkY } from '../world/gapstow.js';
import { listAgents, removeAgent, reportAgent } from '../world/agents.js';
import { getInteraction } from '../world/interaction.js';
import { crowdSpeakerDetails } from '../world/crowdDialogue.js';
import {
  createQuirkState,
  maybeStartQuirk,
  quirkCooldown,
  rollWalkerQuirk,
} from '../world/crowdQuirks.js';
import { overhearBenchTalk, overhearQuirk } from '../world/overheard.js';
import { raiseBumpProtest } from '../world/outcry.js';
import { clearActorImpacts, queueActorImpact, takeActorImpacts } from '../world/actorImpacts.js';
import {
  CONFRONT_PHASE,
  confrontationFor,
  provokeConfrontation,
  releaseConfrontation,
  stepConfrontation,
} from '../world/confrontation.js';
import {
  REACTION_MOTION,
  REACTION_PHASE,
  beginReaction,
  classifyPedestrianStartle,
  createReactionState,
  stepReaction,
} from '../world/actorReactions.js';
import { gameDebug } from '../debug.js';
import { applyPlayerEvent, getPlayer, npcStartleEffect } from '../world/player.js';
import {
  PEDESTRIAN_STROLLER_CIRCUITS as STROLLER_CIRCUITS,
  strollerScheduleState,
} from '../world/strollerPedestrians.js';
import {
  PARK_VISITOR_ITINERARY,
  parkVisitorItineraryState,
} from '../world/parkVisitorItinerary.js';
import { ROAD_TOP, ROADS } from '../world/streetGrid.js';
import { buildWalkGraph } from '../world/walkGraph.js';
import {
  CROWD_SLOT_ARCHETYPES,
  createCrowdState,
  createIncidentBudget,
  crowdRoll,
  crowdSlotLogical,
  incidentAllowed,
  isSlotActive,
  recordIncident,
} from '../world/crowdScheduler.js';
import { createCrowdAgentState, samplePolyline, stepCrowdAgent } from '../world/crowdAgent.js';
import { buildPeriodStroller } from './strollerModel.js';
import { figureHeight } from '../world/figureHeights.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { fadeInAction, restoreLoopingIdle } from './characterGestures.js';
import { useFarPedestrianLod } from './pedestrianLod.js';
import {
  CROWD_CAST_AGES,
  PEDESTRIAN_ARCHETYPES,
  PEDESTRIAN_BENCH_SITTERS as BENCH_SITTERS,
  PEDESTRIAN_LOD_ARCHETYPES,
  PEDESTRIAN_LOD_FILES,
  PEDESTRIAN_MAN_CLIP_FILES as MAN_CLIP_FILES,
  PEDESTRIAN_POSERS as POSERS,
  PEDESTRIAN_REACTION_FILE,
  PEDESTRIAN_SHARED_CLIPS as SHARED_CLIPS,
  PEDESTRIAN_STANDERS as STANDERS,
  pedestrianScheduleActive,
  PEDESTRIAN_STANDUP_FILE,
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
// Bind-pose spheres are computed before a clip moves the limbs, so they are
// padded to cover the reach of any pose.
const POSE_PADDING = 1.7;

// Bumping into a figure: kinematic capsules make them solid, and standers
// and walkers play a startle clip when the player presses in.
const BUMP_DISTANCE = 0.85;
const BUMP_RELEASE_DISTANCE = 1.15;
const BUMP_COOLDOWN = 4;
// Seconds between looks for a pair of sitters worth overhearing.
const OVERHEARD_CHECK = 3;
// A near miss: the vehicle's own radius plus an arm's length, and fast enough
// that it reads as being swept past rather than idling by.
const NEAR_MISS_MARGIN = 1.1;
const NEAR_MISS_SPEED = 2;
const STANDING_COLLIDER = Object.freeze({ halfHeight: 0.55, radius: 0.28, y: 0.88 });
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const scratchViewProjection = new THREE.Matrix4();
const scratchFrustum = new THREE.Frustum();
// 3m: figures just past the frame edge keep near-full pose rate, so a shadow
// cast into view from beside the camera does not visibly step.
const scratchFigureSphere = new THREE.Sphere(new THREE.Vector3(), 3);

// Reused every frame by the crowd loop. Rapier and the agent registry read
// these synchronously, so a single instance is enough and a fresh one per
// figure per frame is the crowd's largest source of garbage.
const scratchVehicles = [];
const scratchTranslation = { x: 0, y: 0, z: 0 };

function playReactionPhase(entry) {
  const { phase } = entry.reaction;
  if (entry.renderedPhase === phase) return;
  const previous = entry.activeAction;
  const next = phase === REACTION_PHASE.STAGGER ? entry.actions.stagger : null;

  // Reaction poses leave the bind-pose bounding sphere; culling a figure
  // mid-stagger reads as a blink out of existence.
  for (const mesh of entry.meshes) mesh.frustumCulled = phase === REACTION_PHASE.NORMAL;

  if (phase === REACTION_PHASE.NORMAL) {
    if (previous) {
      // Freeze the outgoing pose during the blend; letting the clip keep
      // playing drags the figure toward the ground while it fades.
      previous.setEffectiveTimeScale(0);
      previous.fadeOut(0.25);
    }
    // The base was faded out when the reaction began, and a completed fade
    // leaves the action disabled: fading it in again is a no-op unless it is
    // re-enabled first, and the figure stays in its face-down bind pose.
    fadeInAction(entry.base, 0.28);
    entry.activeAction = null;
  } else if (next) {
    // A habit is stopped outright rather than blended out, because a clamped
    // one-shot holds its final root transform. That leaves nothing to blend
    // from, so the reaction takes full weight at once instead of ramping up
    // from an empty skeleton.
    const hardStopped = Boolean(entry.ambientAction);
    if (entry.ambientAction) {
      entry.ambientAction.stop();
      entry.ambientAction = null;
      entry.ambientName = null;
      entry.nextAmbientAt = entry.reaction.phaseUntil + 5;
    }
    entry.base.fadeOut(0.14);
    if (previous && previous !== next) previous.fadeOut(0.16);
    // A flinch plays only the opening recoil of the shared clip; the phase
    // ends and fades back to the base before the clip reaches the ground.
    const spec = REACTION_MOTION[entry.reaction.variant] ?? REACTION_MOTION.stagger;
    next.reset().setEffectiveTimeScale(spec.timeScale);
    if (hardStopped) next.setEffectiveWeight(1);
    else next.fadeIn(0.12);
    next.play();
    entry.activeAction = next;
  }
  entry.renderedPhase = phase;
}

// One pose per confrontation phase. A habit or a lingering recoil is dropped
// outright: the figure has somewhere to be.
function playConfrontPose(entry, phase) {
  if (entry.confrontPose === phase) return;
  entry.confrontPose = phase;
  if (entry.ambientAction) {
    entry.ambientAction.stop();
    entry.ambientAction = null;
    entry.ambientName = null;
  }
  if (entry.activeAction) {
    entry.activeAction.fadeOut(0.2);
    entry.activeAction = null;
    entry.renderedPhase = REACTION_PHASE.NORMAL;
  }
  for (const mesh of entry.meshes) mesh.frustumCulled = true;
  const { actions } = entry;
  if (phase === CONFRONT_PHASE.ROUSING) setBaseAction(entry, actions.confrontStand);
  else if (phase === CONFRONT_PHASE.APPROACHING) setBaseAction(entry, actions.confrontWalk);
  else setBaseAction(entry, actions.confrontIdle);
}

// Clips that leave a figure sitting upright on a bench or the grass, and the
// gestures that read as talking from that pose.
const SEATED_CLIPS = new Set(['Sit', 'SittingIdle', 'Bench Sit', 'Sit Ground']);
const SEATED_TALK_CLIPS = Object.freeze([
  'SittingGesticulating', 'SittingTalkingIntensely', 'SittingCrossedLegTalking',
]);
// Standing habits a figure can fall into while waiting on the pavement. A
// crowd walker only ever stands for a few seconds, so one clip is enough.
const CROWD_AMBIENT_CLIPS = Object.freeze(['SmokingOrEating']);

// A seated speaker gestures every couple of seconds. The ambient crowd stays
// far quieter than an authored figure: fourteen of them share the street.
function ambientGap(entry, speaking) {
  if (speaking) return 1.5;
  return entry.crowdActions ? 40 : 7;
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

function finishAmbient(entry, now, gap = 7) {
  restoreLoopingIdle(entry.mixer, entry.base, entry.ambientAction);
  entry.ambientAction = null;
  entry.ambientName = null;
  entry.ambientIndex += 1;
  entry.nextAmbientAt = now + gap + hash01(entry.ambientIndex * 17.3 + entry.age) * 12;
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
  // The hand bone's +Y points roughly world-down in this pose, so flip the
  // case to put the handle up, then drop it so the handle sits in the grip.
  // The bone's world scale already includes the figure scale, so dividing it
  // out leaves the case in plain metres.
  case_.rotation.z = Math.PI;
  case_.scale.setScalar(inverse);
  case_.position.set(0, 0.18 * inverse, 0.02 * inverse);
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

const ROAD_BANDS = new Map(ROADS.map((road) => [road.id, road]));

// A crossing edge spans pavement centre to pavement centre; only the part
// between the curbs is down at road level.
function crossingGroundY(segment, x, z) {
  const road = ROAD_BANDS.get(segment.roadId);
  if (!road) return ROAD_TOP + 0.02;
  const at = road.axis === 'z' ? z : x;
  return at > road.lo && at < road.hi ? ROAD_TOP + 0.02 : WALK_TOP;
}

function setBaseAction(entry, next) {
  if (!next || next === entry.base) return;
  entry.base.fadeOut(0.24);
  next.reset().fadeIn(0.24).play();
  entry.base = next;
}

export default function Pedestrians({ runtime, graphics }) {
  // All pedestrian GLBs are meshopt-compressed; the figure models also carry
  // KTX2 textures.
  const gl = useThree((state) => state.gl);
  const withMeshopt = useCallback((loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(getKTX2Loader(gl));
  }, [gl]);
  const manGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.m.modelPath, withMeshopt);
  const womanGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.w.modelPath, withMeshopt);
  const dressGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.d.modelPath, withMeshopt);
  const somberGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.s.modelPath, withMeshopt);
  const fortiesGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.f.modelPath, withMeshopt);
  const strawhatGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.h.modelPath, withMeshopt);
  const nursemaidGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.n.modelPath, withMeshopt);
  const lilacGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.l.modelPath, withMeshopt);
  const rationalGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.r.modelPath, withMeshopt);
  const maidGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.hm.modelPath, withMeshopt);
  const bellhopGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.bh.modelPath, withMeshopt);
  const lodGltfs = useLoader(GLTFLoader, PEDESTRIAN_LOD_FILES, withMeshopt);
  const strawhatMotionGltf = useLoader(GLTFLoader, PEDESTRIAN_STRAWHAT_MOTION_FILE, withMeshopt);
  const standupGltf = useLoader(GLTFLoader, PEDESTRIAN_STANDUP_FILE, withMeshopt);
  const manClipGltfs = useLoader(GLTFLoader, MAN_CLIP_FILES, withMeshopt);
  const womanClipGltfs = useLoader(GLTFLoader, WOMAN_CLIP_FILES, withMeshopt);
  const reactGltf = useLoader(GLTFLoader, PEDESTRIAN_REACTION_FILE, withMeshopt);
  const { world, rapier } = useRapier();
  const bodyQuaternion = useRef(new THREE.Quaternion());

  const { group, walkers, figures, crowdGraph } = useMemo(() => {
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
      // Like the nursemaid: own rig carries only a standing idle, everything
      // else comes from the shared strawhat pack.
      l: {
        source: lilacGltf.scene,
        clips: compatibleClips(lilacGltf.scene, [
          ...lilacGltf.animations,
          ...strawhatMotionGltf.animations,
        ]),
      },
      r: {
        source: rationalGltf.scene,
        clips: compatibleClips(rationalGltf.scene, [
          ...rationalGltf.animations,
          ...strawhatMotionGltf.animations,
        ]),
      },
      // Hotel service staff, off duty or on an errand through the park. Both
      // carry only an idle; the shared pack supplies the walk and gestures.
      hm: {
        source: maidGltf.scene,
        clips: compatibleClips(maidGltf.scene, [
          ...maidGltf.animations,
          ...strawhatMotionGltf.animations,
        ]),
      },
      bh: {
        source: bellhopGltf.scene,
        clips: compatibleClips(bellhopGltf.scene, [
          ...bellhopGltf.animations,
          ...strawhatMotionGltf.animations,
        ]),
      },
      // Her own rig carries only an idle; everything she does comes from the
      // shared strawhat pack, including the perambulator clips.
      n: {
        source: nursemaidGltf.scene,
        clips: compatibleClips(nursemaidGltf.scene, [
          ...nursemaidGltf.animations,
          ...strawhatMotionGltf.animations,
        ]),
      },
    };
    PEDESTRIAN_LOD_ARCHETYPES.forEach((who, index) => {
      let lodGeometry = null;
      lodGltfs[index].scene.traverse((node) => {
        if (!lodGeometry && node.isSkinnedMesh) lodGeometry = node.geometry;
      });
      if (!lodGeometry?.getAttribute('skinIndex') || !lodGeometry.getAttribute('skinWeight')) {
        throw new Error(`Pedestrian ${who} far LOD is missing skin data`);
      }
      cast[who].lodGeometry = lodGeometry;
    });
    // Getting up off a bench is the one thing every rig needs and none of the
    // packs carried, so it is added to all of them in one pass.
    for (const member of Object.values(cast)) {
      member.clips = [...member.clips, ...compatibleClips(member.source, standupGltf.animations)];
    }
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
      // Height varies by ±5% within an archetype so a crowd is not one man
      // repeated at one size.
      const height = figureHeight(PEDESTRIAN_ARCHETYPES[who].id);
      figure.scale.setScalar(height * (0.95 + hash01(index * 3.7) * 0.1));
      const meshes = [];
      const lodMeshes = [];
      figure.traverse((node) => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        meshes.push(node);
        if (node.isSkinnedMesh) {
          lodMeshes.push({
            mesh: node,
            fullGeometry: node.geometry,
            farGeometry: cast[who].lodGeometry,
          });
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
      // The bind pose only resolves once the clone's own matrices are updated.
      // Computing the sphere before that collapses every vertex onto the
      // origin and leaves a two-centimetre sphere for the frustum to cull
      // against, so the figure vanishes the moment its feet leave the view.
      wrapper.updateMatrixWorld(true);
      for (const node of meshes) {
        if (!node.isSkinnedMesh) continue;
        let sphere = spheres.get(node.geometry.uuid);
        if (!sphere) {
          node.computeBoundingSphere();
          sphere = node.boundingSphere.clone();
          sphere.radius *= POSE_PADDING;
          spheres.set(node.geometry.uuid, sphere);
        }
        node.boundingSphere = sphere;
      }
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
      // Gestures for a seated figure being spoken to. Only the full Mixamo
      // rigs carry them; the bowler man and the somber sitter just sit.
      const talkClips = SEATED_TALK_CLIPS.filter((name) => {
        const found = action(name);
        if (found) actions[name] = found;
        return Boolean(found);
      });
      actions.stagger?.setLoop(THREE.LoopOnce, 1);
      if (actions.stagger) actions.stagger.clampWhenFinished = true;
      // Coming over to complain about a thrown object: get up if seated, walk
      // across, then quarrel. Any rig missing a piece just skips that step.
      actions.confrontStand = action('StandUp');
      actions.confrontWalk = action('Walk');
      actions.confrontIdle = action('StandingArguing') ?? action('Idle') ?? action('StandingIdle');
      // What they do once they have said their piece: they are on their feet
      // in the middle of a path, so it is a standing idle, never the bench.
      actions.confrontRest = action('Idle') ?? action('StandingIdle') ?? actions.confrontIdle;
      actions.confrontStand?.setLoop(THREE.LoopOnce, 1);
      if (actions.confrontStand) actions.confrontStand.clampWhenFinished = true;
      const entry = {
        id: spec.id,
        age: spec.age,
        archetype: who,
        gender: who === 'm' ? 'male' : 'female',
        wrapper,
        meshes,
        lodMeshes,
        farLod: false,
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
        talkClips: talkClips.length > 0 ? talkClips : null,
        seated: SEATED_CLIPS.has(clipName),
        renderedPhase: REACTION_PHASE.NORMAL,
        confrontPose: null,
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
        // Where a figure who holds one spot looks when nobody is talking to
        // them. Route walkers have no post and leave this null.
        postYaw: null,
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
      entry.postYaw = spec.yaw;
      entry.dialogueProfile = crowdSpeakerDetails({
        archetype: spec.who,
        role: spec.clip === 'Briefcase Idle' ? 'commuter' : 'stroller',
        activity: 'standing',
        hour: 12,
        seed: index + 1,
        age: spec.age,
      });
    });

    POSERS.forEach((spec, index) => {
      const entry = spawn(index + 20, spec);
      entry.wrapper.position.set(spec.x, terrainHeight(spec.x, spec.z), spec.z);
      entry.wrapper.rotation.y = spec.yaw;
      // Ground figures stay in repose when bumped; only their collider acts.
      entry.poser = true;
      entry.dialogueProfile = crowdSpeakerDetails({
        archetype: spec.who, role: 'rest', activity: 'resting', hour: 12, seed: index + 21, age: spec.age,
      });
    });

    BENCH_SITTERS.forEach((sitter, index) => {
      const { x, z, yaw } = benchSitterPose(sitter);
      const entry = spawn(index + 30, sitter);
      entry.wrapper.position.set(x, terrainHeight(x, z), z);
      entry.wrapper.rotation.y = yaw;
      entry.poser = true;
      entry.dialogueProfile = crowdSpeakerDetails({
        archetype: sitter.who, role: 'rest', activity: 'sitting', hour: 12, seed: index + 31, age: sitter.age,
      });
    });

    // The ambient crowd: pool slots driven by the scheduler over the walk
    // graph. They spawn hidden; the frame loop materializes them once their
    // logical position is far enough from the player to appear unseen.
    const graph = buildWalkGraph();
    CROWD_SLOT_ARCHETYPES.forEach((who, index) => {
      const entry = spawn(index + 80, {
        id: `crowd-${index}`,
        who,
        age: CROWD_CAST_AGES[index],
      }, 'Walk');
      const idleName = cast[who].clips.some((clip) => clip.name === 'Idle')
        ? 'Idle'
        : 'StandingIdle';
      const idle = entry.mixer.clipAction(findClip(who, idleName));
      idle.setLoop(THREE.LoopRepeat, Infinity);
      // A quick nod for figures whose rig carries the clip; the bowler rig
      // simply stops and faces instead.
      if (cast[who].clips.some((clip) => clip.name === 'StandingAcknowledging')) {
        entry.actions.StandingAcknowledging = entry.mixer.clipAction(findClip(who, 'StandingAcknowledging'));
      }
      // A habit for the corners and crossings where the walk stalls.
      const ambient = CROWD_AMBIENT_CLIPS.filter((name) => {
        if (!cast[who].clips.some((clip) => clip.name === name)) return false;
        entry.actions[name] = entry.mixer.clipAction(findClip(who, name));
        return true;
      });
      // Resting clips this rig can play at a bench or lawn spot.
      const rest = {};
      for (const clipName of ['Sit', 'SittingIdle', 'Sit Ground', 'Lie Down']) {
        if (cast[who].clips.some((clip) => clip.name === clipName)) {
          rest[clipName] = entry.mixer.clipAction(findClip(who, clipName));
          rest[clipName].setLoop(THREE.LoopRepeat, Infinity);
        }
      }
      entry.wrapper.visible = false;
      entry.dialogueProfile = crowdSpeakerDetails({
        archetype: who, role: 'stroller', activity: 'walking', hour: 12, seed: index + 80, age: CROWD_CAST_AGES[index],
      });
      walking.push(Object.assign(entry, {
        crowdSlot: index,
        crowdAgent: createCrowdAgentState(),
        crowdActions: { walk: entry.base, idle },
        crowdRest: rest,
        crowdRestClip: null,
        ambientClips: ambient.length > 0 ? ambient : null,
        standingSince: Infinity,
        crowdWalking: true,
        crowdHidden: true,
        wasYielding: false,
        nextAcknowledgeAt: 0,
        quirk: null,
        quirkState: createQuirkState(),
        nextQuirkCheckAt: 0,
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
      entry.dialogueProfile = crowdSpeakerDetails({
        archetype: route.who, role: 'stroller', activity: 'walking', hour: 12, seed: index + 61, age: route.age,
      });
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

    return { group: root, walkers: walking, figures: all, crowdGraph: graph };
  }, [manGltf, womanGltf, dressGltf, somberGltf, fortiesGltf, strawhatGltf, nursemaidGltf, lilacGltf, rationalGltf, maidGltf, bellhopGltf, lodGltfs, strawhatMotionGltf, standupGltf, manClipGltfs, womanClipGltfs, reactGltf]);

  // Crowd scheduling state survives re-renders but resets on a new game day.
  const crowdRef = useRef(null);

  const frameCount = useRef(0);
  const trackedPeople = useMemo(
    () => figures.map((entry) => ({
      id: entry.id,
      archetype: entry.archetype,
      gender: entry.gender,
      position: [entry.wrapper.position.x, entry.wrapper.position.y, entry.wrapper.position.z],
      yaw: entry.wrapper.rotation.y,
    })),
    [figures],
  );
  useEffect(() => {
    gameDebug.pedestrians = trackedPeople;
    return () => {
      if (gameDebug.pedestrians === trackedPeople) {
        gameDebug.pedestrians = [];
        gameDebug.stats.pedestrianFarLods = 0;
        gameDebug.stats.pedestrianLodTotal = 0;
      }
    };
  }, [trackedPeople]);
  useFrame((state, delta) => {
    // Casting a shadow means a second full pass over the figure. Past a few
    // metres the sun's shadow of a stranger is a smudge; only the ones near
    // the camera pay for it.
    const eye = state.camera.position;
    const t = state.clock.elapsedTime;
    frameCount.current += 1;
    // For throttling figures the camera cannot see. Their shadows can still
    // reach the view, so the sphere is generous and nothing fully freezes.
    scratchViewProjection.multiplyMatrices(
      state.camera.projectionMatrix,
      state.camera.matrixWorldInverse,
    );
    scratchFrustum.setFromProjectionMatrix(scratchViewProjection);
    const values = runtime.values;
    const civilSeconds = (values.dayOfYear ?? 0) * 86400 + (values.timeOfDay ?? 0) * 3600;
    if (!crowdRef.current || crowdRef.current.day !== values.dayOfYear) {
      const isRollover = crowdRef.current !== null;
      crowdRef.current = {
        day: values.dayOfYear,
        state: createCrowdState(values.dayOfYear ?? 0),
        budget: createIncidentBudget(),
        // Quarrels are rationed separately from crossing lapses.
        quirkBudget: createIncidentBudget(300),
      };
      // A new day rebuilds every chain; relocate figures unseen rather than
      // letting the night walker snap to a fresh spawn in view.
      if (isRollover) {
        for (const walker of walkers) {
          if (walker.crowdActions) walker.crowdHidden = true;
        }
      }
    }
    const crowd = crowdRef.current;
    // Two people sharing a bench near the player are talking about something
    // they both know. Checked on its own slow beat, not per walker.
    if (t >= (crowd.nextOverheardAt ?? 0)) {
      crowd.nextOverheardAt = t + OVERHEARD_CHECK;
      const listener = gameDebug.player.position;
      overhearBenchTalk({
        playerX: listener[0],
        playerZ: listener[2],
        hour: values.timeOfDay,
        seed: Math.floor(civilSeconds / 30),
      });
    }
    const vehicleAgents = scratchVehicles;
    vehicleAgents.length = 0;
    for (const agent of listAgents()) {
      if (agent.trafficId) vehicleAgents.push(agent);
    }
    const conversation = getInteraction().using;
    const speakingId = conversation?.kind === 'conversation' ? conversation.agentId : null;
    let activePedestrianLods = 0;
    let farPedestrianLods = 0;
    for (let index = 0; index < figures.length; index += 1) {
      const entry = figures[index];
      const { x, z } = entry.wrapper.position;
      const tracked = trackedPeople[index];
      tracked.position[0] = x;
      tracked.position[1] = entry.wrapper.position.y;
      tracked.position[2] = z;
      tracked.yaw = entry.wrapper.rotation.y;
      const scheduleActive = pedestrianScheduleActive(entry.schedule, runtime.values.timeOfDay)
        && !entry.crowdHidden;
      entry.wrapper.visible = scheduleActive;
      tracked.hidden = !scheduleActive;
      if (!scheduleActive) {
        removeAgent(entry.id);
        releaseConfrontation(entry.id);
        const inactiveCollider = entry.poser
          ? entry.refs.restingCollider
          : entry.refs.standingCollider;
        if (entry.refs.body && handlesAlive(world, entry.refs.body, inactiveCollider)) {
          scratchTranslation.x = 0;
          scratchTranslation.y = -100;
          scratchTranslation.z = 0;
          entry.refs.body.setNextKinematicTranslation(scratchTranslation);
        }
        continue;
      }
      const dist2 = (x - eye.x) ** 2 + (z - eye.z) ** 2;
      const farLod = useFarPedestrianLod(entry.farLod, dist2);
      if (farLod !== entry.farLod) {
        entry.farLod = farLod;
        for (const lod of entry.lodMeshes) {
          lod.mesh.geometry = farLod ? lod.farGeometry : lod.fullGeometry;
        }
      }
      activePedestrianLods += 1;
      if (farLod) farPedestrianLods += 1;
      const shadowDistance = Math.min(
        runtime.values.outdoorShadowDistance,
        graphics?.maxDynamicShadowDistance ?? Infinity,
      );
      const near = dist2 < shadowDistance * shadowDistance;
      for (const mesh of entry.meshes) mesh.castShadow = near;
      // Accumulate time so a throttled figure moves at true speed, just in
      // coarser steps. The +index staggers mid-tier updates across frames.
      const reacting = entry.reaction.phase !== REACTION_PHASE.NORMAL;
      // Gesturing only reads from a seated pose, so a standing speaker keeps
      // the nod it already gets from the yield path.
      const speaking = entry.id === speakingId;
      const gesturing = speaking && Boolean(entry.talkClips) && (entry.crowdActions
        ? SEATED_CLIPS.has(entry.crowdRestClip)
        : entry.seated);
      if (entry.ambientAction && t >= entry.ambientUntil) {
        finishAmbient(entry, t, ambientGap(entry, gesturing));
      }
      entry.pending = Math.min(entry.pending + delta * (reacting ? 1 : entry.speed), 1);
      // Distance sets the base rate; being outside the view slows it further.
      // Time still accumulates, so a throttled figure moves at true speed.
      let step;
      if (dist2 < ANIM_NEAR * ANIM_NEAR) step = 1;
      else if (reacting || dist2 < ANIM_FREEZE * ANIM_FREEZE) step = 3;
      else step = 0;
      if (step > 0 && !speaking) {
        scratchFigureSphere.center.set(x, entry.wrapper.position.y + 0.9, z);
        if (!scratchFrustum.intersectsSphere(scratchFigureSphere)) {
          step = Math.max(step, dist2 > 225 ? 4 : 2);
        }
      }
      const animate = step === 1 || (step > 0 && (frameCount.current + index) % step === 0);
      if (animate) {
        entry.mixer.update(entry.pending);
        entry.pending = 0;
      }
      entry.animatedThisFrame = animate;
      // The carriages steer around whatever is reported here. A stroller is
      // reported from the combined adult/carriage centre, not the adult's
      // feet, so traffic clears the whole rig.
      const yaw = entry.wrapper.rotation.y;
      const agentOffset = entry.stroller ? 0.55 : 0;
      const agent = reportAgent(
        entry.id,
        x + Math.sin(yaw) * agentOffset,
        z + Math.cos(yaw) * agentOffset,
        entry.stroller ? 0.9 : 0.45,
      );
      agent.kind = 'pedestrian';
      agent.gender = entry.gender;
      // The figure's own array, not a copy: every reader uses it within the
      // frame it was reported.
      agent.velocity = entry.velocity;
      if (entry.dialogueProfile) {
        const profile = entry.dialogueProfile;
        // One context object per figure, updated in place. Readers spread it
        // before use, so none of them holds on to a stale snapshot.
        entry.agentContext ??= { ...profile.dialogueContext };
        const context = entry.agentContext;
        context.hour = values.timeOfDay;
        context.place = values.zone;
        context.activity = entry.crowdActivity ?? profile.dialogueContext.activity;
        context.role = entry.crowdRole ?? profile.dialogueContext.role;
        context.seed = entry.crowdDialogueSeed ?? profile.dialogueContext.seed;
        agent.dialogueId = entry.id;
        agent.dialogueName = profile.dialogueName;
        agent.dialogueContext = context;
      }

      // Someone hit by a thrown object leaves whatever they were doing and
      // comes over. This runs before the collider write so the capsule
      // follows them across rather than trailing a frame behind.
      const confronting = confrontationFor(entry.id);
      if (confronting) {
        const playerPosition = gameDebug.player.position;
        // Pavement sits above the terrain surface; holding the gap the figure
        // already had keeps them level whether they set off from a kerb or
        // from the grass, without asking which route they were on.
        entry.confrontLift ??= entry.wrapper.position.y - terrainHeight(x, z);
        const march = stepConfrontation(entry.id, {
          x: entry.wrapper.position.x,
          z: entry.wrapper.position.z,
          playerX: playerPosition[0],
          playerZ: playerPosition[2],
          delta,
          now: t,
        });
        if (march) {
          entry.wrapper.position.x = march.x;
          entry.wrapper.position.z = march.z;
          entry.wrapper.position.y = terrainHeight(march.x, march.z) + entry.confrontLift;
          entry.wrapper.rotation.y = march.yaw;
          playConfrontPose(entry, march.phase);
          entry.velocity[0] = 0;
          entry.velocity[1] = 0;
        }
      } else if (entry.confrontPose) {
        // Finished. A seated figure does not go back to the bench — they have
        // left it, and their seated habits go with it. Crowd walkers pick
        // their own animation back up in the walker loop below.
        entry.confrontPose = null;
        entry.confrontLift = null;
        entry.poser = false;
        entry.seated = false;
        if (!entry.crowdActions) {
          entry.ambientClips = null;
          entry.talkClips = null;
          setBaseAction(entry, entry.actions.confrontRest);
        }
        releaseConfrontation(entry.id);
      }

      // Being spoken to turns you toward the speaker. A seated figure keeps
      // the pose the bench gave them; a stander goes back to facing their
      // post (their cart, the street) once the talk ends.
      if (!confronting && !entry.poser && entry.crowdActivity !== 'resting') {
        const facing = speaking
          ? Math.atan2(
            gameDebug.player.position[0] - entry.wrapper.position.x,
            gameDebug.player.position[2] - entry.wrapper.position.z,
          )
          : entry.postYaw;
        if (facing !== null && facing !== undefined) {
          entry.wrapper.rotation.y = dampAngle(entry.wrapper.rotation.y, facing, 7, delta);
        }
      }

      // The collider tracks the figure; the player's controller resolves
      // against it, so nobody can be walked through.
      const activeCollider = entry.poser && !confronting
        ? entry.refs.restingCollider
        : entry.refs.standingCollider;
      const { body } = entry.refs;
      if (body && handlesAlive(world, body, activeCollider)) {
        const p = entry.wrapper.position;
        scratchTranslation.x = p.x;
        scratchTranslation.y = p.y;
        scratchTranslation.z = p.z;
        body.setNextKinematicTranslation(scratchTranslation);
        if (entry.stroller) {
          bodyQuaternion.current.setFromAxisAngle(Y_AXIS, entry.wrapper.rotation.y);
          body.setNextKinematicRotation(bodyQuaternion.current);
        }
      }

      // Everyone reads their queue, seated figures included: a thrown object
      // gets a person off a bench even though a shoulder bump does not.
      for (const impact of takeActorImpacts(entry.id)) {
        if (impact.cause === 'projectile') {
          provokeConfrontation(entry.id, {
            itemLabel: impact.itemLabel,
            archetype: entry.archetype,
            name: entry.dialogueProfile?.dialogueName,
            dialogueId: entry.id,
            seated: entry.seated || entry.crowdActivity === 'resting',
            now: t,
          });
        }
        if (entry.poser) continue;
        // The kinematic capsules re-enter contact every frame while the
        // player stands inside someone; without the cooldown the reaction
        // restarts the moment it ends, forever.
        if (t < entry.cooldownUntil) break;
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
          // Walked into hard enough to stagger somebody: they say so. Only
          // the player earns a word; the crowd clipping shoulders does not.
          if (impact.cause === 'player-body') {
            raiseBumpProtest({
              speaker: entry.dialogueProfile?.dialogueName,
              anchorId: entry.id,
              seed: Math.round(t),
            });
          }
        }
      }

      if (!entry.poser && !confronting) {

        // A carriage that passes close enough to feel is worth a recoil even
        // when it never touches. Contact itself arrives as an impact above.
        if (entry.reaction.phase === REACTION_PHASE.NORMAL && t > entry.cooldownUntil) {
          for (const vehicle of vehicleAgents) {
            if ((vehicle.speed ?? 0) < NEAR_MISS_SPEED) continue;
            const dx = vehicle.x - x;
            const dz = vehicle.z - z;
            const reach = (vehicle.r ?? 1.7) + NEAR_MISS_MARGIN;
            if (dx * dx + dz * dz > reach * reach) continue;
            const next = beginReaction(entry.reaction, {
              cause: vehicle.id.startsWith('carriage-') ? 'horseless-carriage' : 'horse-drawn-vehicle',
              response: 'flinch',
              direction: [-dx, -dz],
            }, t);
            if (next === entry.reaction) break;
            entry.reaction = next;
            entry.cooldownUntil = t + BUMP_COOLDOWN;
            playReactionPhase(entry);
            break;
          }
        }

        const stepped = stepReaction(entry.reaction, t);
        if (stepped !== entry.reaction) {
          entry.reaction = stepped;
          playReactionPhase(entry);
        }
      }

      // A crowd walker only picks up a habit while it is genuinely stalled:
      // held up for a few seconds, not seated, not busy with a quirk. The
      // clip runs nine seconds and freezes the figure for all of them, so a
      // walker pausing at a kerb must not start one.
      const clips = gesturing ? entry.talkClips : entry.ambientClips;
      const idleEnough = !entry.crowdActions || (
        t - entry.standingSince > 4
        && entry.crowdActivity !== 'resting'
        && t >= entry.quirkState.until
      );
      if (
        clips
        && !confronting
        && (gesturing || (!speaking && idleEnough))
        && entry.reaction.phase === REACTION_PHASE.NORMAL
        && !entry.ambientAction
        && t >= entry.nextAmbientAt
      ) {
        const name = clips[entry.ambientIndex % clips.length];
        if (!playAmbient(entry, name, t)) entry.nextAmbientAt = t + 2;
      }

      // Preserve the forgiving proximity trigger from the original reaction:
      // Rapier contacts are precise, but the character controller may stop a
      // fraction before two kinematic capsules technically overlap.
      if (!entry.poser && !confronting) {
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
    gameDebug.stats.pedestrianFarLods = farPedestrianLods;
    gameDebug.stats.pedestrianLodTotal = activePedestrianLods;

    for (const walker of walkers) {
      // Coming over to complain overrides the route entirely; the figures
      // loop above has already placed them.
      if (confrontationFor(walker.id)) continue;
      // Any full-body reaction owns the route until its standing pose returns.
      if (walker.reaction.phase !== REACTION_PHASE.NORMAL) {
        walker.velocity[0] = 0;
        walker.velocity[1] = 0;
        continue;
      }
      // Mid-conversation the figure holds still and lets the figures loop
      // above turn them; the slowed clock keeps their schedule from drifting
      // far meanwhile. A seated speaker keeps the pose the bench gave them.
      if (walker.id === speakingId) {
        walker.velocity[0] = 0;
        walker.velocity[1] = 0;
        if (walker.crowdActions && walker.crowdActivity !== 'resting') {
          walker.crowdWalking = false;
          setBaseAction(walker, walker.crowdActions.idle);
        } else if (walker.itineraryActions) {
          setBaseAction(walker, walker.itineraryActions.idle);
        } else if (walker.strollerActions) {
          setBaseAction(walker, walker.strollerActions.idle);
        }
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

      if (walker.crowdActions) {
        const playerPos = gameDebug.player.position;
        const active = isSlotActive(values.timeOfDay ?? 12, walker.crowdSlot);
        if (!active) {
          // Leave only while unobserved; otherwise finish the walk first.
          if (!walker.crowdHidden) {
            const dx = walker.wrapper.position.x - playerPos[0];
            const dz = walker.wrapper.position.z - playerPos[2];
            if (dx * dx + dz * dz > 40 * 40) walker.crowdHidden = true;
          }
          if (walker.crowdHidden) {
            walker.velocity[0] = 0;
            walker.velocity[1] = 0;
            continue;
          }
        }
        const pose = crowdSlotLogical(crowd.state, walker.crowdSlot, crowdGraph, civilSeconds);
        const assignment = pose.assignment;
        if (!assignment.polyline) {
          walker.crowdActivity = 'standing';
          walker.crowdWalking = false;
          setBaseAction(walker, walker.crowdActions.idle);
          walker.velocity[0] = 0;
          walker.velocity[1] = 0;
          continue;
        }
        const wx = walker.wrapper.position.x;
        const wz = walker.wrapper.position.z;
        const neighbours = [];
        for (const tracked of trackedPeople) {
          if (tracked.id === walker.id || tracked.hidden) continue;
          const dx = tracked.position[0] - wx;
          const dz = tracked.position[2] - wz;
          if (dx * dx + dz * dz < 9) {
            neighbours.push({ x: tracked.position[0], z: tracked.position[2] });
          }
        }
        const nearPlayer = (wx - playerPos[0]) ** 2 + (wz - playerPos[2]) ** 2 < 60 * 60;
        // The shared loop scales clip time by entry.speed; keep the walk
        // cycle in step with this assignment's pace so feet do not slide.
        if (walker.crowdAgent.assignmentIndex !== assignment.index) {
          walker.speed = assignment.pace / WALK_SPEED;
          // A new assignment is a new logical person; they roll their own
          // habits.
          walker.quirk = rollWalkerQuirk(
            walker.dialogueProfile?.dialogueContext.archetype,
            assignment.seed,
          );
        }
        const step = stepCrowdAgent(walker.crowdAgent, {
          dt: delta,
          now: t,
          logicalDistance: pose.distance,
          dwelling: pose.dwelling,
          assignment,
          neighbours,
          vehicles: vehicleAgents,
          intruder: { x: playerPos[0], z: playerPos[2] },
          frozen: Boolean(walker.ambientAction) || t < walker.quirkState.until,
          crossingRoll: crowdRoll(assignment.seed, 100 + Math.floor(civilSeconds / 8)),
          incidentAllowed: incidentAllowed(crowd.budget, civilSeconds) && nearPlayer,
        });
        if (step.lapse) recordIncident(crowd.budget, civilSeconds);
        // Reaching a door means going inside: the figure vanishes there,
        // in full view if need be — the door explains it.
        if (pose.dwelling && assignment.insideDoor) {
          walker.crowdHidden = true;
          walker.velocity[0] = 0;
          walker.velocity[1] = 0;
          continue;
        }
        if (walker.crowdHidden) {
          // Measure from where the figure would actually appear (its logical
          // position), not from the route start the fresh agent sits at.
          const [lx, lz] = samplePolyline(
            assignment.polyline,
            Math.min(pose.distance, assignment.length),
          );
          const dx = lx - playerPos[0];
          const dz = lz - playerPos[2];
          // Stepping out of a door is visible on purpose; anywhere else
          // needs to be far enough away to appear unseen.
          const emerging = assignment.fromDoor && !pose.dwelling && pose.distance < 8;
          if (emerging || dx * dx + dz * dz > 35 * 35) {
            walker.crowdAgent.distance = Math.min(pose.distance, assignment.length);
            walker.crowdHidden = false;
          }
          walker.velocity[0] = 0;
          walker.velocity[1] = 0;
          continue;
        }
        walker.crowdRole = assignment.role;
        walker.crowdDialogueSeed = assignment.seed;
        // Settled at a bench or lawn spot: sit there in the spot's clip.
        if (pose.dwelling && step.dwelling && assignment.occupy) {
          const spot = assignment.occupy;
          const restAction = walker.crowdRest[spot.clip] ?? walker.crowdActions.idle;
          walker.crowdActivity = 'resting';
          walker.crowdRestClip = walker.crowdRest[spot.clip] ? spot.clip : null;
          walker.wrapper.position.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
          walker.wrapper.rotation.y = spot.yaw;
          if (walker.base !== restAction) {
            setBaseAction(walker, restAction);
            walker.crowdWalking = false;
          }
          walker.velocity[0] = 0;
          walker.velocity[1] = 0;
          continue;
        }
        walker.crowdActivity = step.moving ? 'walking' : pose.dwelling ? 'standing' : 'waiting';
        walker.crowdRestClip = null;
        const segment = step.segment;
        const y = segment?.surface === 'road'
          ? crossingGroundY(segment, step.x, step.z)
          : routeGroundY({
            crossesGapstow: segment?.crossesGapstow ?? false,
            onTerrain: segment?.surface === 'terrain',
          }, step.x, step.z);
        walker.wrapper.position.set(step.x, y, step.z);
        if (step.moving) walker.wrapper.rotation.y = step.yaw;
        const movingNow = step.moving;
        // Set every frame, not only on the moving/standing edge: a figure that
        // stops resting and then stands still shares `crowdWalking === false`
        // with the rest it just left, and would carry the sitting clip onto
        // the path. setBaseAction ignores a repeat of the current action.
        walker.crowdWalking = movingNow;
        walker.standingSince = movingNow ? Infinity : Math.min(walker.standingSince, t);
        setBaseAction(walker, movingNow ? walker.crowdActions.walk : walker.crowdActions.idle);
        const quirkState = walker.quirkState;
        if (t < quirkState.until) {
          // Mid-quirk: hold still (the frozen flag above), face the object of
          // attention, and keep a quarrel's gestures coming.
          walker.wrapper.rotation.y += shortestArc(walker.wrapper.rotation.y, quirkState.faceYaw)
            * Math.min(1, delta * 5);
          if (quirkState.kind === 'quarrel' && t >= walker.nextAcknowledgeAt
            && playAmbient(walker, 'StandingArguing', t)) {
            walker.nextAcknowledgeAt = t + 2.2;
          }
        } else if (movingNow && walker.quirk && !walker.ambientAction
          && t >= quirkState.cooldownUntil && t >= walker.nextQuirkCheckAt && nearPlayer) {
          walker.nextQuirkCheckAt = t + 1.6;
          const others = [];
          for (const other of walkers) {
            if (other === walker || other.crowdSlot === undefined || other.crowdHidden) continue;
            const ox = other.wrapper.position.x;
            const oz = other.wrapper.position.z;
            if ((ox - step.x) ** 2 + (oz - step.z) ** 2 > 16) continue;
            others.push({
              id: other.id,
              x: ox,
              z: oz,
              archetype: other.dialogueProfile?.dialogueContext.archetype,
              moving: other.crowdWalking,
              busy: t < other.quirkState.until || Boolean(other.ambientAction),
            });
          }
          const action = maybeStartQuirk({
            quirk: walker.quirk,
            x: step.x,
            z: step.z,
            now: t,
            roll: crowdRoll(assignment.seed, 300 + Math.floor(civilSeconds / 10)),
            partnerRoll: crowdRoll(assignment.seed, 400 + Math.floor(civilSeconds / 10)),
            others,
            quarrelAllowed: incidentAllowed(crowd.quirkBudget, civilSeconds),
          });
          if (action) {
            Object.assign(quirkState, {
              kind: action.kind,
              until: action.until,
              faceYaw: action.faceYaw,
              partnerId: action.partnerId,
              cooldownUntil: quirkCooldown(action.kind, t),
            });
            if (action.kind === 'quarrel') recordIncident(crowd.quirkBudget, civilSeconds);
            if (action.kind.startsWith('gallant')) playAmbient(walker, 'QuickFormalBow', t);
            if (action.partner) {
              const partner = walkers.find((other) => other.id === action.partner.id);
              // Close enough and the player catches the answer he gets.
              overhearQuirk({
                kind: action.kind,
                selfName: walker.dialogueProfile?.dialogueName,
                partnerName: partner?.dialogueProfile?.dialogueName,
                x: step.x,
                z: step.z,
                playerX: playerPos[0],
                playerZ: playerPos[2],
                seed: assignment.seed + Math.floor(civilSeconds / 60),
              });
              if (partner?.quirkState) {
                Object.assign(partner.quirkState, {
                  kind: action.partner.kind,
                  until: action.partner.until,
                  faceYaw: action.partner.faceYaw,
                  partnerId: walker.id,
                  cooldownUntil: quirkCooldown(action.partner.kind, t),
                });
              }
            }
          }
        }
        if (step.yielding) {
          // Turn toward whoever is pressing close; nod if the rig can.
          if (step.faceYaw !== null) {
            walker.wrapper.rotation.y += shortestArc(walker.wrapper.rotation.y, step.faceYaw)
              * Math.min(1, delta * 5);
          }
          if (!walker.wasYielding && t > walker.nextAcknowledgeAt
            && playAmbient(walker, 'StandingAcknowledging', t)) {
            walker.nextAcknowledgeAt = t + 12;
          }
        }
        walker.wasYielding = step.yielding;
        walker.velocity[0] = step.moving ? step.tx * assignment.pace : 0;
        walker.velocity[1] = step.moving ? step.tz * assignment.pace : 0;
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

    // Last pass: a figure that neither animated nor moved this frame keeps
    // last frame's matrices, which skips composing its ~50 bones. Most of the
    // crowd is standing or seated at any moment, so most figures skip.
    for (const entry of figures) {
      const wrapper = entry.wrapper;
      if (!wrapper.visible) {
        wrapper.matrixWorldAutoUpdate = false;
        continue;
      }
      const pose = entry.lastPose ?? (entry.lastPose = [NaN, 0, 0, 0]);
      const { x, y, z } = wrapper.position;
      const yaw = wrapper.rotation.y;
      const dirty = entry.animatedThisFrame
        || pose[0] !== x || pose[1] !== y || pose[2] !== z || pose[3] !== yaw;
      pose[0] = x;
      pose[1] = y;
      pose[2] = z;
      pose[3] = yaw;
      wrapper.matrixWorldAutoUpdate = dirty;
    }
  });

  useEffect(
    () => () => {
      figures.forEach((entry) => {
        removeAgent(entry.id);
        clearActorImpacts(entry.id);
        releaseConfrontation(entry.id);
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
            if (entry.poser) return;
            const data = other.rigidBodyObject?.userData;
            if (data?.gameKind === 'player') {
              const velocity = gameDebug.player.velocity;
              queueActorImpact(entry.id, {
                cause: 'player-body',
                running: gameDebug.player.running,
                sourceVelocity: [...velocity],
                direction: [velocity[0], velocity[2]],
              });
            } else if (data?.gameKind === 'pedestrian' && data.actorId) {
              // Crowd agents can genuinely clip shoulders; each capsule's own
              // handler fires, so both figures react. Rate-limited per pair
              // partner so a lingering contact cannot retrigger every frame.
              const now = getPlayer().clock;
              if (now - (entry.lastPedestrianBumpAt ?? -Infinity) < 4) return;
              const source = figures.find((figure) => figure.id === data.actorId);
              if (!source) return;
              entry.lastPedestrianBumpAt = now;
              queueActorImpact(entry.id, {
                cause: 'pedestrian-body',
                sourceVelocity: [source.velocity[0], 0, source.velocity[1]],
                direction: [source.velocity[0], source.velocity[1]],
              });
            }
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

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { damp, dampAngle } from '../movement/mathUtils.js';
import { handlesAlive } from '../physics/useCharacterController.js';
import { gameDebug } from '../debug.js';
import { getAgent, listAgents, removeAgent, reportAgent } from '../world/agents.js';
import { clearActorImpacts, takeActorImpacts } from '../world/actorImpacts.js';
import {
  CONFRONT_PHASE,
  confrontationFor,
  provokeConfrontation,
  releaseConfrontation,
  stepConfrontation,
} from '../world/confrontation.js';
import { hashString } from '../world/npcIdentity.js';
import { raiseNightWatch, raisePoliceWhistle } from '../world/outcry.js';
import {
  latestMajorStreetEventId,
  majorStreetEventsSince,
} from '../world/majorStreetEvents.js';
import { HOTEL_DOORMAN_MOTION_FILE } from '../world/hotelDoormen.js';
import {
  STREET_POLICEMAN_MODEL_FILE,
  STREET_POLICEMAN_MOTION_FILE,
  STREET_POLICE_POSTS,
  POLICE_SPEECH_AUDIENCE,
  POLICE_TRAFFIC_CLEARANCE,
  POLICE_BUMP_SEQUENCE,
  isApproachingFemalePedestrian,
  isPassingTraffic,
  majorEventForPolice,
  policeFidgetInterval,
  policeFacingForEvent,
  policeSidestepOffset,
  policeSpeechAudienceState,
  policeTurnInterval,
  policeTurnMotion,
  policeVehicleGesture,
} from '../world/streetPolice.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';
import { restoreLoopingIdle } from './characterGestures.js';
import { updateNpcAnimation } from './npcAnimationThrottle.js';
import { figureHeight } from '../world/figureHeights.js';

const NPC_SCALE = figureHeight('street-policeman');
const TRAFFIC_GREETING_COOLDOWN = 15;
const PEDESTRIAN_GREETING_COOLDOWN = 22;
const GLOBAL_GESTURE_COOLDOWN = 2.6;
const PLAYER_BUMP_DISTANCE = 0.86;
const PLAYER_BUMP_RELEASE = 1.18;
const PLAYER_BUMP_COOLDOWN = 4.5;
const TURN_RADIANS = 2.135;
// He reacts to the hit before he starts walking. About the MildlyAnnoyed clip.
const FLINCH_SECONDS = 1.2;
// Long enough for a bystander's cry to have been read before he takes over.
const WHISTLE_DELAY = 2.6;
const NIGHT_WATCH_HOUR = 22;
const DAWN_HOUR = 5;
const WATCH_RANGE = 11;
const WATCH_GAP = 90;

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function compatibleClip(clip, nodes) {
  const copy = clip.clone();
  copy.tracks = copy.tracks.filter((track) => nodes.has(track.name.split('.')[0]));
  return copy;
}

function playGesture(actor, name, now, priority, target = null) {
  if (actor.active && actor.priority > priority) return false;
  const next = actor.actions[name];
  if (!next) return false;
  actor.active?.fadeOut(0.12);
  actor.idle.fadeOut(0.12);
  next.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
  next.clampWhenFinished = true;
  actor.active = next;
  actor.activeName = name;
  actor.priority = priority;
  actor.gestureUntil = now + next.getClip().duration + 0.08;
  actor.nextGestureAt = now + GLOBAL_GESTURE_COOLDOWN;
  if (target) {
    actor.targetYaw = Math.atan2(
      target.x - actor.worldX,
      target.z - actor.worldZ,
    );
  }
  return true;
}

function completeGesture(actor, now) {
  restoreLoopingIdle(actor.mixer, actor.idle, actor.active);
  if (actor.activeName === 'LeftTurn') {
    actor.figure.rotation.y += TURN_RADIANS;
    actor.targetYaw += TURN_RADIANS;
  } else if (actor.activeName === 'RightTurn') {
    actor.figure.rotation.y -= TURN_RADIANS;
    actor.targetYaw -= TURN_RADIANS;
  }
  actor.active = null;
  actor.activeName = null;
  actor.priority = -1;
  const queued = actor.gestureQueue.shift();
  if (queued && playGesture(actor, queued, now, 3)) return;
}

function startBumpSequence(actor, now) {
  actor.gestureQueue.length = 0;
  const [first, ...rest] = POLICE_BUMP_SEQUENCE;
  if (!playGesture(actor, first, now, 3)) return false;
  actor.gestureQueue.push(...rest);
  actor.bumpCooldownUntil = now + PLAYER_BUMP_COOLDOWN;
  return true;
}

function returnToIdle(actor) {
  restoreLoopingIdle(actor.mixer, actor.idle, actor.active);
  actor.active = null;
  actor.activeName = null;
  actor.priority = -1;
}

// A confrontation outranks every gesture and loops until it is over, so it
// bypasses playGesture's priority and one-shot handling entirely.
function playConfrontLoop(actor, name) {
  if (actor.confrontPose === name) return;
  actor.confrontPose = name;
  const next = actor.actions[name];
  if (!next) return;
  actor.active?.fadeOut(0.15);
  actor.idle.fadeOut(0.15);
  next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.15).play();
  actor.active = next;
  actor.activeName = name;
  actor.priority = 9;
  actor.gestureUntil = Infinity;
}

export default function StreetPolice({ runtime }) {
  const modelGltf = useLoader(GLTFLoader, STREET_POLICEMAN_MODEL_FILE, withMeshopt);
  const kissGltf = useLoader(GLTFLoader, STREET_POLICEMAN_MOTION_FILE, withMeshopt);
  const standingGltf = useLoader(GLTFLoader, HOTEL_DOORMAN_MOTION_FILE, withMeshopt);
  const { world, rapier } = useRapier();

  const actors = useMemo(() => {
    const actorPosts = [
      ...STREET_POLICE_POSTS.map((post) => ({ post, audienceIndex: null })),
      ...POLICE_SPEECH_AUDIENCE.map((_, audienceIndex) => {
        const state = policeSpeechAudienceState(audienceIndex, 9.5);
        return {
          audienceIndex,
          post: {
            id: `cop-cot-speech-policeman-${audienceIndex + 1}`,
            label: 'Cop Cot speech policeman',
            location: 'Roosevelt speech audience at Cop Cot',
            position: state.position,
            yaw: state.yaw,
            age: audienceIndex === 0 ? 41 : 48,
          },
        };
      }),
    ];
    return actorPosts.map(({ post, audienceIndex }, index) => {
    const figure = cloneSkeleton(modelGltf.scene);
    figure.name = post.id;
    figure.scale.setScalar(NPC_SCALE);
    const nodeNames = new Set();
    figure.traverse((node) => {
      if (node.name) nodeNames.add(node.name);
      if (!node.isMesh && !node.isSkinnedMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
      node.material = Array.isArray(node.material)
        ? sourceMaterials.map((material) => material?.clone?.() ?? material)
        : node.material?.clone?.() ?? node.material;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        normalizeNonmetallicCharacterMaterial(material);
        if (!material) continue;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.needsUpdate = true;
      }
    });
    const clips = [...modelGltf.animations, ...kissGltf.animations, ...standingGltf.animations]
      .map((clip) => compatibleClip(clip, nodeNames));
    const mixer = new THREE.AnimationMixer(figure);
    const actions = Object.fromEntries(clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const idle = actions.PolicemanIdle ?? mixer.clipAction(clips[0]);
    idle.play();
    mixer.setTime((0.17 + index * 0.39) * idle.getClip().duration);
    figure.rotation.y = post.yaw;
    figure.visible = audienceIndex === null;
    return {
      post,
      audienceIndex,
      figure,
      mixer,
      actions,
      idle,
      active: null,
      activeName: null,
      priority: -1,
      gestureUntil: 0,
      nextGestureAt: 0,
      targetYaw: post.yaw,
      worldX: post.position[0],
      worldZ: post.position[2],
      body: null,
      collider: null,
      sidestep: 0,
      vehiclePassCount: index,
      greetedVehicles: new Map(),
      greetedPedestrians: new Map(),
      turnIndex: 0,
      nextTurnAt: null,
      fidgetIndex: 0,
      nextFidgetAt: null,
      gestureQueue: [],
      playerBumpNear: false,
      collisionQueued: false,
      bumpCooldownUntil: 0,
      lastMajorEventId: latestMajorStreetEventId(),
      majorEventCooldownUntil: 0,
      whistleEvent: null,
      whistleAt: 0,
      nextWatchAt: 0,
    };
    });
  }, [kissGltf, modelGltf, standingGltf]);

  const animationFrame = useRef(0);
  useFrame((_, delta) => {
    animationFrame.current += 1;
    const now = performance.now() / 1000;
    const agents = [...listAgents()];
    const player = gameDebug.player.position;
    for (const [index, actor] of actors.entries()) {
      const isSpeechAudience = actor.audienceIndex !== null;
      const speechAudience = isSpeechAudience
        ? policeSpeechAudienceState(actor.audienceIndex, runtime.values.timeOfDay)
        : null;
      actor.figure.visible = !isSpeechAudience || Boolean(speechAudience);
      if (isSpeechAudience && !speechAudience) {
        removeAgent(actor.post.id);
        releaseConfrontation(actor.post.id);
        if (handlesAlive(world, actor.body, actor.collider)) {
          actor.body.setNextKinematicTranslation({ x: 0, y: -100, z: 0 });
        }
        continue;
      }
      updateNpcAnimation(
        actor,
        Math.min(delta, 0.1),
        (actor.worldX - player[0]) ** 2 + (actor.worldZ - player[2]) ** 2,
        animationFrame.current,
        index,
      );
      actor.figure.rotation.x = 0;
      actor.figure.rotation.z = 0;
      actor.figure.rotation.y = dampAngle(actor.figure.rotation.y, actor.targetYaw, 7, delta);
      if (actor.active && now >= actor.gestureUntil) completeGesture(actor, now);
      const [x, y, z] = speechAudience?.position ?? actor.post.position;
      const sidestepTarget = speechAudience ? 0 : policeSidestepOffset(agents, actor.post.position);
      if (speechAudience) {
        actor.targetYaw = speechAudience.yaw;
      }
      actor.sidestep = damp(actor.sidestep, sidestepTarget, 3.8, delta);

      // Being pelted takes an officer off his post. He starts, walks over,
      // says his piece, and afterwards drifts back to the post placement.
      for (const impact of takeActorImpacts(actor.post.id)) {
        if (impact.cause !== 'projectile') continue;
        playGesture(actor, 'MildlyAnnoyed', now, 4);
        provokeConfrontation(actor.post.id, {
          itemLabel: impact.itemLabel,
          kind: 'policeman',
          name: 'A policeman',
          dialogueId: actor.post.id,
          startDelay: FLINCH_SECONDS,
          now,
        });
      }
      const march = confrontationFor(actor.post.id)
        ? stepConfrontation(actor.post.id, {
          x: actor.worldX,
          z: actor.worldZ,
          playerX: player[0],
          playerZ: player[2],
          delta,
          now,
        })
        : null;
      if (march) {
        // He keeps last frame's position while marching: resetting to the post
        // every frame is what left him walking on the spot.
        actor.worldX = march.x;
        actor.worldZ = march.z;
        actor.targetYaw = march.yaw;
        if (march.phase !== CONFRONT_PHASE.ROUSING) {
          playConfrontLoop(actor, march.walking ? 'Walk' : 'StandingArguing');
        }
      } else {
        actor.worldX = x;
        actor.worldZ = z + actor.sidestep;
      }
      if (!march && actor.confrontPose) {
        actor.confrontPose = null;
        actor.gestureUntil = 0;
        releaseConfrontation(actor.post.id);
        returnToIdle(actor);
      }
      if (handlesAlive(world, actor.body, actor.collider)) {
        actor.body.setNextKinematicTranslation({ x: actor.worldX, y, z: actor.worldZ });
      }
      reportAgent(actor.post.id, actor.worldX, actor.worldZ, 0.42, {
        kind: 'policeman',
        gender: 'male',
        velocity: [0, (sidestepTarget - actor.sidestep) * 3.8],
        trafficClearance: speechAudience ? undefined : POLICE_TRAFFIC_CLEARANCE,
        dialogueId: actor.post.id,
        dialogueName: 'A policeman',
        dialogueContext: {
          archetype: 'p',
          role: 'police',
          activity: 'standing',
          hour: runtime.values.timeOfDay,
          place: runtime.values.zone,
          seed: hashString(actor.post.id),
        },
      });

      // Mid-confrontation nothing else gets a say: no bump gesture for the
      // player standing in front of him, no traffic nods, no post fidgets.
      if (march) continue;

      const playerDistance = Math.hypot(actor.worldX - player[0], actor.worldZ - player[2]);
      const bumping = playerDistance < PLAYER_BUMP_DISTANCE;
      const enteredBump = !actor.playerBumpNear && bumping;
      if ((actor.collisionQueued || enteredBump) && now >= actor.bumpCooldownUntil) {
        startBumpSequence(actor, now);
      }
      actor.collisionQueued = false;
      if (bumping) actor.playerBumpNear = true;
      else if (playerDistance > PLAYER_BUMP_RELEASE) actor.playerBumpNear = false;

      if (actor.nextTurnAt === null) {
        actor.nextTurnAt = now + policeTurnInterval(index, actor.turnIndex);
        actor.nextFidgetAt = now + policeFidgetInterval(index, actor.fidgetIndex);
      }

      if (speechAudience) {
        if (!actor.active && now >= actor.nextFidgetAt) {
          playGesture(actor, 'ArmsCrossedFidget', now, 1);
          actor.fidgetIndex += 1;
          actor.nextFidgetAt = now + policeFidgetInterval(index, actor.fidgetIndex);
        }
        continue;
      }

      const streetEvents = majorStreetEventsSince(actor.lastMajorEventId);
      if (streetEvents.length) {
        actor.lastMajorEventId = streetEvents.at(-1).id;
        const event = majorEventForPolice(streetEvents, [actor.worldX, y, actor.worldZ]);
        if (event && now >= actor.majorEventCooldownUntil) {
          actor.targetYaw = policeFacingForEvent(event, [actor.worldX, y, actor.worldZ]);
          if (startBumpSequence(actor, now)) actor.majorEventCooldownUntil = now + 8;
          // He looks first and takes charge after: shouting over the witness
          // who is still calling for a doctor makes both lines noise.
          actor.whistleEvent = event;
          actor.whistleAt = now + WHISTLE_DELAY;
        }
      }
      // After hours he moves a lingerer along. Posted officers only: the
      // speech detail is not there at midnight.
      const hour = ((runtime.values.timeOfDay % 24) + 24) % 24;
      if (!isSpeechAudience && (hour >= NIGHT_WATCH_HOUR || hour < DAWN_HOUR)
        && now >= actor.nextWatchAt
        && Math.hypot(player[0] - actor.worldX, player[2] - actor.worldZ) <= WATCH_RANGE) {
        actor.nextWatchAt = now + WATCH_GAP;
        raiseNightWatch({ anchorId: actor.post.id, seed: Math.round(now) });
      }
      if (actor.whistleEvent && now >= actor.whistleAt) {
        raisePoliceWhistle(actor.whistleEvent, getAgent(actor.post.id));
        actor.whistleEvent = null;
      }

      if (now >= actor.nextGestureAt) {
        const approaching = agents
          .filter((agent) => isApproachingFemalePedestrian(agent, [actor.worldX, y, actor.worldZ]))
          .filter((agent) => now - (actor.greetedPedestrians.get(agent.id) ?? -Infinity) >= PEDESTRIAN_GREETING_COOLDOWN)
          .sort((left, right) => (
            Math.hypot(left.x - actor.worldX, left.z - actor.worldZ)
              - Math.hypot(right.x - actor.worldX, right.z - actor.worldZ)
          ))[0];
        if (approaching && playGesture(actor, 'BlowAKiss', now, 2, approaching)) {
          actor.greetedPedestrians.set(approaching.id, now);
        }
      }

      if (!actor.active && now >= actor.nextGestureAt) {
        const vehicle = agents
          .filter((agent) => isPassingTraffic(agent, [actor.worldX, y, actor.worldZ]))
          .filter((agent) => now - (actor.greetedVehicles.get(agent.id) ?? -Infinity) >= TRAFFIC_GREETING_COOLDOWN)
          .sort((left, right) => (
            Math.hypot(left.x - actor.worldX, left.z - actor.worldZ)
              - Math.hypot(right.x - actor.worldX, right.z - actor.worldZ)
          ))[0];
        if (vehicle) {
          const gesture = policeVehicleGesture(actor.vehiclePassCount);
          if (playGesture(actor, gesture, now, 1, vehicle)) {
            actor.greetedVehicles.set(vehicle.id, now);
            actor.vehiclePassCount += 1;
          }
        }
      }

      if (!actor.active && now >= actor.nextGestureAt && now >= actor.nextTurnAt) {
        const gesture = policeTurnMotion(index, actor.turnIndex);
        if (playGesture(actor, gesture, now, 0)) actor.turnIndex += 1;
        actor.nextTurnAt = now + policeTurnInterval(index, actor.turnIndex);
      }

      if (!actor.active && now >= actor.nextGestureAt && now >= actor.nextFidgetAt) {
        if (playGesture(actor, 'ArmsCrossedFidget', now, 0)) actor.fidgetIndex += 1;
        actor.nextFidgetAt = now + policeFidgetInterval(index, actor.fidgetIndex);
      }
    }
    gameDebug.streetPolice = actors.filter((actor) => actor.figure.visible).map((actor) => ({
      id: actor.post.id,
      position: [actor.worldX, actor.post.position[1], actor.worldZ],
      action: actor.activeName ?? 'PolicemanIdle',
      vehiclePassCount: actor.vehiclePassCount,
    }));
  });

  useEffect(() => () => {
    gameDebug.streetPolice = [];
    for (const actor of actors) {
      removeAgent(actor.post.id);
      clearActorImpacts(actor.post.id);
      releaseConfrontation(actor.post.id);
      actor.mixer.stopAllAction();
      actor.figure.traverse((node) => {
        if (!node.isMesh && !node.isSkinnedMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material?.dispose?.());
      });
    }
  }, [actors]);

  return actors.map((actor) => (
    <RigidBody
      key={actor.post.id}
      ref={(node) => { actor.body = node; }}
      type="kinematicPosition"
      colliders={false}
      position={actor.audienceIndex === null ? actor.post.position : [0, -100, 0]}
      userData={{ gameKind: 'policeman', actorId: actor.post.id }}
      onCollisionEnter={({ other }) => {
        if (other.rigidBodyObject?.userData?.gameKind === 'player') actor.collisionQueued = true;
      }}
    >
      <primitive object={actor.figure} />
      <CapsuleCollider
        ref={(node) => { actor.collider = node; }}
        args={[0.55, 0.28]}
        position={[0, 0.88, 0]}
        activeCollisionTypes={rapier.ActiveCollisionTypes.ALL}
      />
    </RigidBody>
  ));
}

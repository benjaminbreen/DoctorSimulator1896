import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { RigidBody, CapsuleCollider, CylinderCollider, useRapier } from '@react-three/rapier';
import { handlesAlive } from '../physics/useCharacterController.js';
import { terrainHeight } from '../world/terrain.js';
import { parkItems } from '../world/centralPark.js';
import { reportAgent, removeAgent } from '../world/agents.js';
import { gameDebug } from '../debug.js';
import { applyPlayerEvent, npcStartleEffect } from '../world/player.js';
import {
  PEDESTRIAN_ARCHETYPES,
  PEDESTRIAN_BENCH_SITTERS as BENCH_SITTERS,
  PEDESTRIAN_MAN_CLIP_FILES as MAN_CLIP_FILES,
  PEDESTRIAN_POSERS as POSERS,
  PEDESTRIAN_REACTION_FILE,
  PEDESTRIAN_ROUTES as ROUTES,
  PEDESTRIAN_SHARED_CLIPS as SHARED_CLIPS,
  PEDESTRIAN_STANDERS as STANDERS,
  PEDESTRIAN_WOMAN_CLIP_FILES as WOMAN_CLIP_FILES,
} from '../world/pedestrianCatalog.js';

// Background pedestrians: the bowler-hat man (pedestrian-b.glb) and the
// four women (pedestrian-c/d/e/f.glb). Walkers follow sidewalk routes on real
// walk cycles; standers loiter; in the park a few rest on the grass or sit on
// a bench. Clips retarget across figures that share the same Mixamo skeleton.
const WALK_TOP = 1.29;
const WALK_SPEED = 1.35;
// How close a figure has to be before it is worth casting a shadow.
const SHADOW_DISTANCE = 18;
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
const BUMP_COOLDOWN = 4;

function benchSitterPose({ benchId, along }) {
  const bench = parkItems.find((item) => item.id === benchId);
  if (!bench) throw new Error(`Pedestrian bench not found: ${benchId}`);
  const yaw = bench.yaw ?? 0;
  const x = bench.position[0] + Math.cos(yaw) * along;
  const z = bench.position[2] - Math.sin(yaw) * along;
  return { x, z, yaw };
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
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

export default function Pedestrians() {
  // All pedestrian GLBs are meshopt-compressed.
  const withMeshopt = (loader) => loader.setMeshoptDecoder(MeshoptDecoder);
  const manGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.m.modelPath, withMeshopt);
  const womanGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.w.modelPath, withMeshopt);
  const dressGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.d.modelPath, withMeshopt);
  const somberGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.s.modelPath, withMeshopt);
  const fortiesGltf = useLoader(GLTFLoader, PEDESTRIAN_ARCHETYPES.f.modelPath, withMeshopt);
  const manClipGltfs = useLoader(GLTFLoader, MAN_CLIP_FILES, withMeshopt);
  const womanClipGltfs = useLoader(GLTFLoader, WOMAN_CLIP_FILES, withMeshopt);
  const reactGltf = useLoader(GLTFLoader, PEDESTRIAN_REACTION_FILE, withMeshopt);
  const { world } = useRapier();

  const { group, walkers, figures } = useMemo(() => {
    const reactClip = reactGltf.animations[0];
    const manClips = [...manGltf.animations, ...manClipGltfs.flatMap((entry) => entry.animations), reactClip];
    const sharedClips = manClips.filter((clip) => SHARED_CLIPS.includes(clip.name));
    const womanWalk = womanClipGltfs.flatMap((entry) => entry.animations);
    const cast = {
      m: { source: manGltf.scene, clips: manClips },
      w: {
        source: womanGltf.scene,
        clips: [...womanGltf.animations, ...womanWalk, ...sharedClips, reactClip],
      },
      // The summer-dress woman walks and stands only; she shares the
      // working-class woman's gait.
      d: { source: dressGltf.scene, clips: [...dressGltf.animations, ...womanWalk, reactClip] },
      // This figure carries its own long seated loop. The matching full
      // Mixamo rig also leaves walking clips available if she is reused later.
      s: { source: somberGltf.scene, clips: somberGltf.animations },
      f: { source: fortiesGltf.scene, clips: [...fortiesGltf.animations, reactClip] },
    };
    const findClip = (who, name) =>
      cast[who].clips.find((clip) => clip.name === name) ?? cast[who].clips[0];

    const root = new THREE.Group();
    const walking = [];
    // Every clone shares the source geometry, so the padded bind-pose sphere
    // is computed once per part rather than once per figure.
    const spheres = new Map();
    const all = [];

    const spawn = (index, clipName, who) => {
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
          node.material = node.material.clone();
          node.material.color.offsetHSL(
            (hash01(index * 7.1) - 0.5) * 0.02,
            -0.03,
            (hash01(index * 5.3) - 0.5) * 0.06,
          );
        }
      });
      // A wrapper carries position/yaw so placement stays in world terms.
      const wrapper = new THREE.Group();
      wrapper.add(figure);
      root.add(wrapper);
      if (/Briefcase/.test(clipName)) attachBriefcase(figure);
      const clip = findClip(who, clipName);
      const mixer = new THREE.AnimationMixer(figure);
      const base = mixer.clipAction(clip);
      base.play();
      mixer.setTime(hash01(index * 11.3) * clip.duration);
      const react = mixer.clipAction(reactClip);
      react.setLoop(THREE.LoopOnce, 1);
      react.clampWhenFinished = true;
      const entry = {
        wrapper,
        meshes,
        mixer,
        base,
        react,
        reacting: false,
        reactEnd: 0,
        cooldownUntil: 0,
        refs: { body: null, collider: null },
        poser: false,
        speed: 0.92 + hash01(index * 13.7) * 0.16,
        pending: 0,
      };
      all.push(entry);
      return entry;
    };

    STANDERS.forEach(([x, z, yaw, onTerrain, clipName, who], index) => {
      const entry = spawn(index, clipName, who);
      entry.wrapper.position.set(x, onTerrain ? terrainHeight(x, z) : WALK_TOP, z);
      entry.wrapper.rotation.y = yaw;
    });

    POSERS.forEach(([x, z, yaw, clipName, who], index) => {
      const entry = spawn(index + 20, clipName, who);
      entry.wrapper.position.set(x, terrainHeight(x, z), z);
      entry.wrapper.rotation.y = yaw;
      // Ground figures stay in repose when bumped; only their collider acts.
      entry.poser = true;
    });

    BENCH_SITTERS.forEach((sitter, index) => {
      const { x, z, yaw } = benchSitterPose(sitter);
      const entry = spawn(index + 30, sitter.clip, sitter.who);
      entry.wrapper.position.set(x, terrainHeight(x, z), z);
      entry.wrapper.rotation.y = yaw;
      entry.poser = true;
    });

    ROUTES.forEach((route, index) => {
      const entry = spawn(index + 40, 'Walk', route.who);
      // Same object in both lists, so the bump state is shared.
      walking.push(Object.assign(entry, {
        route,
        length: routeLength(route.points),
        dist: hash01(index * 5.9) * routeLength(route.points),
        dir: 1,
      }));
    });

    return { group: root, walkers: walking, figures: all };
  }, [manGltf, womanGltf, dressGltf, somberGltf, fortiesGltf, manClipGltfs, womanClipGltfs, reactGltf]);

  const frameCount = useRef(0);
  useFrame((state, delta) => {
    // Casting a shadow means a second full pass over the figure. Past a few
    // metres the sun's shadow of a stranger is a smudge; only the ones near
    // the camera pay for it.
    const eye = state.camera.position;
    frameCount.current += 1;
    for (const [index, entry] of figures.entries()) {
      const { x, z } = entry.wrapper.position;
      const dist2 = (x - eye.x) ** 2 + (z - eye.z) ** 2;
      const near = dist2 < SHADOW_DISTANCE * SHADOW_DISTANCE;
      for (const mesh of entry.meshes) mesh.castShadow = near;
      // Accumulate time so a throttled figure moves at true speed, just in
      // coarser steps. The +index staggers mid-tier updates across frames.
      entry.pending = Math.min(entry.pending + delta * entry.speed, 1);
      const animate =
        dist2 < ANIM_NEAR * ANIM_NEAR ||
        (dist2 < ANIM_FREEZE * ANIM_FREEZE && (frameCount.current + index) % 3 === 0);
      if (animate) {
        entry.mixer.update(entry.pending);
        entry.pending = 0;
      }
      // The carriages steer around whatever is reported here.
      reportAgent(`pedestrian-${index}`, x, z);

      // The collider tracks the figure; the player's controller resolves
      // against it, so nobody can be walked through.
      const { body, collider } = entry.refs;
      if (body && handlesAlive(world, body, collider)) {
        const p = entry.wrapper.position;
        body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      }

      // A close player startles standers and walkers, once per approach.
      if (!entry.poser) {
        const player = gameDebug.player.position;
        const t = state.clock.elapsedTime;
        const bumped =
          (x - player[0]) ** 2 + (z - player[2]) ** 2 < BUMP_DISTANCE * BUMP_DISTANCE;
        if (!entry.reacting && bumped && t > entry.cooldownUntil) {
          entry.reacting = true;
          entry.reactEnd = t + entry.react.getClip().duration - 0.25;
          entry.base.fadeOut(0.15);
          entry.react.reset().fadeIn(0.12).play();
          applyPlayerEvent(npcStartleEffect(`pedestrian-${index}`));
        } else if (entry.reacting && t > entry.reactEnd) {
          entry.reacting = false;
          entry.cooldownUntil = t + BUMP_COOLDOWN;
          entry.react.fadeOut(0.3);
          entry.base.reset().fadeIn(0.3).play();
        }
      }
    }

    for (const walker of walkers) {
      // A startled walker stands their ground until the moment passes.
      if (walker.reacting) continue;
      walker.dist += WALK_SPEED * delta * walker.dir * walker.speed;
      if (walker.dist > walker.length) {
        walker.dist = walker.length;
        walker.dir = -1;
      } else if (walker.dist < 0) {
        walker.dist = 0;
        walker.dir = 1;
      }
      const [x, z, dx, dz] = routePoint(walker.route.points, walker.dist);
      const y = walker.route.onTerrain ? terrainHeight(x, z) : WALK_TOP;
      walker.wrapper.position.set(x, y, z);
      walker.wrapper.rotation.y = Math.atan2(dx * walker.dir, dz * walker.dir);
    }
  });

  useEffect(
    () => () => {
      figures.forEach((_, index) => removeAgent(`pedestrian-${index}`));
      for (const entry of figures) {
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
          key={index}
          ref={(node) => (entry.refs.body = node)}
          type="kinematicPosition"
          colliders={false}
          position={[0, -30 - index * 3, 0]}
        >
          {entry.poser ? (
            <CylinderCollider
              ref={(node) => (entry.refs.collider = node)}
              args={[0.25, 0.45]}
              position={[0, 0.3, 0]}
            />
          ) : (
            <CapsuleCollider
              ref={(node) => (entry.refs.collider = node)}
              args={[0.55, 0.28]}
              position={[0, 0.88, 0]}
            />
          )}
        </RigidBody>
      ))}
    </>
  );
}

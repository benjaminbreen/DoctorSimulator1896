import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from './modelLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { gameDebug } from '../debug.js';
import { listAgents } from '../world/agents.js';
import { terrainHeight } from '../world/terrain.js';
import { createFlock, stepFlock, GREEN } from '../world/sheepFlock.js';
import { normalizeNonmetallicCharacterMaterial } from './characterMaterials.js';

// The park flock on the Green. world/sheepFlock.js decides where each sheep
// goes; the model has no usable clips, so grazing and the walking and
// trotting gaits are posed on its bones here.
const COUNT = 16;
const SCALE = 1.2; // the source is a 1.04m sheep; a grown ewe is nearer 1.25m
// People further than this from the Green's centre cannot bother the flock.
const NOTICE_RANGE = 30;

// Euler offsets added to each bone's rest pose, found by trial on this rig.
const GRAZE = [['Shoulders_022', 'x', 1.15], ['Neck_023', 'x', 0.3], ['Head_024', 'x', -0.15]];
// Turning an upper leg about y swings the hoof forward or back on all four.
// Diagonal pairs move together, as in both the walk and the trot.
const LEGS = [['FrontUpLegR_06', 0], ['BackUpLegL_017', 0], ['FrontUpLegL_00', Math.PI], ['BackUpLegR_010', Math.PI]];

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

const scratchEuler = new THREE.Euler();

function pose(bones, name, axis, angle) {
  const bone = bones[name];
  scratchEuler.copy(bone.userData.rest);
  scratchEuler[axis] += angle;
  bone.quaternion.setFromEuler(scratchEuler);
}

export default function SheepFlock() {
  const gltf = useLoader(GLTFLoader, '/models/sheep.glb', withMeshopt);

  const { flock, bodies } = useMemo(() => {
    gltf.scene.traverse((node) => {
      if (node.isMesh) normalizeNonmetallicCharacterMaterial(node.material);
    });
    const bodies = Array.from({ length: COUNT }, (_, index) => {
      const object = cloneSkeleton(gltf.scene);
      object.scale.setScalar(SCALE);
      const bones = {};
      object.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
        if (node.isBone) {
          node.userData.rest = node.rotation.clone();
          bones[node.name] = node;
        }
      });
      return { object, bones, stepPhase: index * 1.7, chew: index * 2.3 };
    });
    return { flock: createFlock(COUNT), bodies };
  }, [gltf]);

  // Other walkers report positions only; their speed comes from the last frame.
  const people = useMemo(() => ({ threats: [], last: new Map() }), []);

  useEffect(() => () => {
    for (const body of bodies) body.object.traverse((node) => node.skeleton?.dispose());
  }, [bodies]);

  useFrame(({ clock, camera }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const t = clock.elapsedTime;
    const { threats, last } = people;
    threats.length = 0;
    const player = gameDebug.player;
    threats.push({ x: player.position[0], z: player.position[2], vx: player.velocity[0], vz: player.velocity[2] });
    for (const agent of listAgents()) {
      if (Math.hypot(agent.x - GREEN.x, agent.z - GREEN.z) > NOTICE_RANGE) continue;
      const before = last.get(agent.id);
      const vx = before && delta > 0 ? (agent.x - before.x) / delta : 0;
      const vz = before && delta > 0 ? (agent.z - before.z) / delta : 0;
      last.set(agent.id, { x: agent.x, z: agent.z });
      threats.push({ x: agent.x, z: agent.z, vx, vz });
    }
    stepFlock(flock, delta, t, threats);

    flock.forEach((sheep, index) => {
      const { object, bones } = bodies[index];
      object.position.set(sheep.x, terrainHeight(sheep.x, sheep.z), sheep.z);
      object.rotation.y = sheep.yaw;
      // Distant sheep keep moving but skip the bone work.
      if (camera.position.distanceToSquared(object.position) > 70 ** 2) return;

      // A trot takes longer, higher strides than a walk.
      const trot = THREE.MathUtils.clamp((sheep.speed - 1) / 1.2, 0, 1);
      const stride = 0.9 + trot * 0.6;
      bodies[index].stepPhase += (sheep.speed * delta / stride) * Math.PI * 2;
      const gait = Math.min(1, sheep.speed / 0.3);
      const swing = (0.3 + trot * 0.18) * gait;
      const phase = bodies[index].stepPhase;

      const chew = Math.sin((t + bodies[index].chew) * 5) * 0.04 * sheep.headDown;
      for (const [name, axis, angle] of GRAZE) {
        pose(bones, name, axis, angle * sheep.headDown + (name === 'Head_024' ? chew : 0));
      }
      for (const [name, offset] of LEGS) pose(bones, name, 'y', Math.sin(phase + offset) * swing);
      object.position.y += Math.abs(Math.sin(phase)) * (0.02 + trot * 0.05) * gait;
    });
  });

  return (
    <group>
      {bodies.map((body, index) => <primitive key={index} object={body.object} />)}
    </group>
  );
}

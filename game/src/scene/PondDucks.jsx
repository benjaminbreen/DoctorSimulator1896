import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { GLTFLoader } from './modelLoader.js';
import { pondDepth } from '../world/terrain.js';
import { WATER_LEVEL } from '../world/centralPark.js';

// Mallards on the Pond. They paddle slowly in loose pairs, turn away before
// the bank, and now and then up-end to feed with their tails in the air. The
// walk clip, played slow with the legs under water, serves as paddling.

// Start points in open water: two pairs in the big lobe, a pair up the arm
// toward Gapstow, and a loner off the landing.
const DUCKS = [[22, 45], [23, 46.2], [-14, 57], [-13, 58.2], [19, 27], [20, 28.2], [-2, 51]];
const SPEED = 0.28;
const WATERLINE = 0.13; // how far the model sits below the surface
const MODEL_FORWARD = 0; // the model faces +z

function withMeshopt(loader) {
  loader.setMeshoptDecoder(MeshoptDecoder);
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Deep enough water about a metre ahead of the bill.
function openWater(x, z) {
  return pondDepth(x, z) < -0.16;
}

export default function PondDucks() {
  const gltf = useLoader(GLTFLoader, '/models/mallard.glb', withMeshopt);
  const ducks = useMemo(() => DUCKS.map(([x, z], index) => {
    const object = cloneSkeleton(gltf.scene);
    object.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.frustumCulled = false;
      }
    });
    const mixer = new THREE.AnimationMixer(object);
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
    action.timeScale = 0.45;
    mixer.setTime(index * 0.31);
    return { object, mixer, x, z, yaw: hash01(index) * Math.PI * 2, turn: 0, dabble: 0, nextDabble: 6 + hash01(index * 3) * 20, seed: index * 7.3 };
  }), [gltf]);
  useEffect(() => () => ducks.forEach((duck) => duck.mixer.stopAllAction()), [ducks]);

  useFrame(({ clock }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const t = clock.elapsedTime;
    ducks.forEach((duck, index) => {
      // Pairs: every second duck keeps close to the one before it.
      const lead = index % 2 === 1 ? ducks[index - 1] : null;
      let heading = duck.yaw + Math.sin(t * 0.23 + duck.seed) * 0.35;
      if (lead) {
        const dx = lead.x - duck.x;
        const dz = lead.z - duck.z;
        if (Math.hypot(dx, dz) > 1.4) heading = Math.atan2(dx, dz);
      }
      // Feel ahead for the bank and turn away from it.
      const ahead = (angle) => openWater(duck.x + Math.sin(angle) * 1.2, duck.z + Math.cos(angle) * 1.2);
      if (!ahead(heading)) {
        for (const offset of [0.6, -0.6, 1.2, -1.2, 2, -2, Math.PI]) {
          if (ahead(heading + offset)) {
            heading += offset;
            break;
          }
        }
      }
      const turn = Math.atan2(Math.sin(heading - duck.yaw), Math.cos(heading - duck.yaw));
      duck.yaw += Math.max(-1.1 * delta, Math.min(1.1 * delta, turn));

      // Up-ending: stop, tip forward until the tail points up, and come back.
      duck.nextDabble -= delta;
      if (duck.nextDabble <= 0 && duck.dabble <= 0) {
        duck.dabble = 3 + hash01(duck.seed + t) * 2;
        duck.nextDabble = 12 + hash01(duck.seed + t * 2) * 30;
      }
      let tip = 0;
      if (duck.dabble > 0) {
        duck.dabble -= delta;
        tip = Math.min(1, duck.dabble, 4 - duck.dabble);
      }
      const speed = SPEED * (1 - Math.min(1, tip * 2));
      const nx = duck.x + Math.sin(duck.yaw) * speed * delta;
      const nz = duck.z + Math.cos(duck.yaw) * speed * delta;
      if (openWater(nx, nz)) {
        duck.x = nx;
        duck.z = nz;
      }
      duck.object.position.set(duck.x, WATER_LEVEL - WATERLINE + Math.sin(t * 1.7 + duck.seed) * 0.008 - tip * 0.08, duck.z);
      duck.object.rotation.set(Math.max(0, tip) * 1.25, duck.yaw + MODEL_FORWARD, 0);
      duck.mixer.update(delta * (tip > 0.2 ? 1.6 : 1));
    });
  });

  return ducks.map((duck, index) => <primitive key={index} object={duck.object} />);
}

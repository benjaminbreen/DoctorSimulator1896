import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from './modelLoader.js';
import { groundStain } from './lib/groundStain.js';
import StaticColliders from './lib/StaticColliders.jsx';
import {
  Coachwork,
  batchCoachwork,
  isAuthoredDrawGear,
  makeDriver,
  makeHorse,
} from './HorseDrawnTraffic.jsx';
import { HORSE_RIG_CONFIG, horseDrawnCollider } from '../world/horseDrawnTraffic.js';
import { buildCoachworkPreset } from '../world/coachworks.js';
import { WALK_TOP } from '../world/streetGrid.js';

// The cab stand at the Plaza: hansoms and a brougham waiting nose to tail
// for fares into the park, the lead horse at its nosebag, and a granite
// trough at the head of the line. Parked on the apron so they stay clear of
// the street traffic and the Belt Line rails.

const Y = WALK_TOP + 0.02;
// Heading is the horse's facing: forward is (sin, cos). All face north,
// toward the park entrance, along the apron's west side.
const RANK = [
  { type: 'hansom', x: 77.4, z: 69.0, heading: Math.PI, nosebag: true },
  { type: 'hansom', x: 77.5, z: 75.2, heading: Math.PI },
  { type: 'brougham', x: 77.9, z: 81.2, heading: Math.PI + 0.08 },
];
const TROUGH = { x: 80.2, z: 64.8, yaw: Math.PI / 2 };

function roadPoint(x, z, yaw, forward, side, y) {
  return new THREE.Vector3(
    x + Math.sin(yaw) * forward - Math.cos(yaw) * side,
    Y + y,
    z + Math.cos(yaw) * forward + Math.sin(yaw) * side,
  );
}

// A straight rod between two points; reins get a sag at the middle.
function rods(start, end, sag = 0) {
  const middle = start.clone().add(end).multiplyScalar(0.5);
  middle.y -= sag;
  const pairs = sag ? [[start, middle], [middle, end]] : [[start, end]];
  return pairs.map(([a, b]) => {
    const direction = b.clone().sub(a);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      length: direction.length(),
    };
  });
}

function layout(entry, coachParts) {
  const rig = HORSE_RIG_CONFIG[entry.type];
  const yaw = entry.heading;
  const reach = rig.drawbarLength + rig.socketForward + 0.05;
  // The given x, z is the coach; the horse stands ahead of it on the shafts.
  const horse = { x: entry.x + Math.sin(yaw) * reach, z: entry.z + Math.cos(yaw) * reach };
  const coach = (forward, side, y) => roadPoint(entry.x, entry.z, yaw, forward, side, y);
  const atHorse = (forward, side, y) => roadPoint(horse.x, horse.z, yaw, forward, side, y);
  const seat = coachParts.find((part) => part.sculptPart === 'driver-seat');
  const driverSeat = { x: seat?.position[0] ?? 0.8, y: seat?.position[1] ?? 1.25 };
  const spread = rig.shaftSpread;
  return {
    yaw,
    horseAt: horse,
    driverSeat,
    shafts: [-1, 1].flatMap((side) => rods(
      coach(rig.socketForward, side * spread, 0.8),
      atHorse(-0.05, side * spread, 1.02),
    )),
    traces: [-1, 1].flatMap((side) => rods(
      coach(rig.socketForward + 0.06, side * 0.22, 0.84),
      atHorse(0.46, side * 0.22, 1.22),
      0.1,
    )),
    // Left slack while the cab waits.
    reins: [-1, 1].flatMap((side) => rods(
      coach(driverSeat.x + 0.28, side * 0.17, driverSeat.y + 0.55),
      atHorse(1.02, side * 0.18, 1.67),
      0.38,
    )),
  };
}

function Rods({ list, radius, material, cast = true }) {
  return list.map((rod, index) => (
    <mesh key={index} position={rod.position} quaternion={rod.quaternion} scale={[1, rod.length, 1]} material={material} castShadow={cast}>
      <cylinderGeometry args={[radius, radius, 1, 6]} />
    </mesh>
  ));
}

function nosebag(horse, material) {
  const head = horse.getObjectByName('scull_22') ?? horse.getObjectByName('scull');
  if (!head) return;
  const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.34, 10), material);
  bag.castShadow = true;
  // The bone's local frame is not the horse's; the bag is placed in horse
  // space and then reparented so it rides with the head.
  horse.updateMatrixWorld(true);
  bag.position.set(0, 1.22, 1.16);
  bag.rotation.x = 0.5;
  horse.add(bag);
  head.attach(bag);
}

// UVs in metres, so the granite grain is the same size on every face.
function stoneBox(size) {
  const geometry = new THREE.BoxGeometry(...size);
  const uv = geometry.attributes.uv;
  const normal = geometry.attributes.normal;
  for (let index = 0; index < uv.count; index += 1) {
    const [nx, ny] = [Math.abs(normal.getX(index)), Math.abs(normal.getY(index))];
    const [w, h] = ny > 0.5 ? [size[0], size[2]] : nx > 0.5 ? [size[2], size[1]] : [size[0], size[1]];
    uv.setXY(index, (uv.getX(index) * w) / 0.7, (uv.getY(index) * h) / 0.7);
  }
  return geometry;
}

function trough(stone, water) {
  const parts = [];
  const box = (size, position, material = stone) => parts.push({ size, position, material });
  box([2.5, 0.08, 1.04], [0, 0.04, 0]);
  box([2.3, 0.5, 0.86], [0, 0.33, 0]);
  // An open rim, so the water shows.
  for (const side of [-1, 1]) {
    box([2.42, 0.14, 0.16], [0, 0.65, side * 0.43]);
    box([0.16, 0.14, 0.7], [side * 1.13, 0.65, 0]);
  }
  box([2.1, 0.02, 0.7], [0, 0.66, 0], water);
  // The low basin at the foot is for dogs.
  box([0.7, 0.26, 0.46], [1.58, 0.13, 0]);
  box([0.54, 0.02, 0.3], [1.58, 0.265, 0], water);
  return parts;
}

export default function CabRank() {
  const horseGltf = useLoader(GLTFLoader, '/models/horse.glb');
  const [graniteCol, graniteNrm] = useLoader(THREE.TextureLoader, [
    '/textures/street/granite_col.webp',
    '/textures/street/granite_nrm.webp',
  ]);
  const driverGltf = useLoader(GLTFLoader, '/models/carriage-driver.glb', (loader) =>
    loader.setMeshoptDecoder(MeshoptDecoder));
  const materials = useMemo(() => ({
    harness: new THREE.MeshStandardMaterial({ color: '#241b16', roughness: 0.76 }),
    wood: new THREE.MeshStandardMaterial({ color: '#57402b', roughness: 0.72 }),
    trace: new THREE.MeshStandardMaterial({ color: '#44311e', roughness: 0.9 }),
    rein: new THREE.MeshStandardMaterial({ color: '#211916', roughness: 0.86 }),
    canvas: new THREE.MeshStandardMaterial({ color: '#8a7b5e', roughness: 0.95 }),
    granite: groundStain(new THREE.MeshStandardMaterial({
      // Shared through the loader cache with the curbs; set the same way.
      map: Object.assign(graniteCol, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, colorSpace: THREE.SRGBColorSpace }), normalMap: Object.assign(graniteNrm, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping }), color: '#8a8882', roughness: 0.88,
    }), { ground: WALK_TOP, height: 0.2 }),
    water: new THREE.MeshStandardMaterial({ color: '#3b4b4a', roughness: 0.08, metalness: 0.2 }),
  }), [graniteCol, graniteNrm]);

  const cabs = useMemo(() => {
    const clip = horseGltf.animations[0];
    return RANK.map((entry, index) => {
      const [coach] = buildCoachworkPreset(entry.type, `cab-rank-${index}`, [0, 0, 0]);
      const parts = coach.parts.filter((part) => !isAuthoredDrawGear(part));
      const horse = makeHorse(horseGltf.scene, clip, index * 0.37, materials.harness);
      // The only clip is a walk: it is held still, and stepped on a little
      // now and then so the horse shifts its weight.
      horse.action.timeScale = 0;
      if (entry.nosebag) nosebag(horse.object, materials.canvas);
      const driver = makeDriver(driverGltf.scene, driverGltf.animations, index * 0.41);
      driver.mixer.update(0);
      return {
        ...entry,
        horse,
        driver,
        batches: batchCoachwork(parts),
        refs: { wheels: [] },
        nextShift: 3 + index * 4,
        shifting: 0,
        ...layout(entry, parts),
      };
    });
  }, [driverGltf, horseGltf, materials]);

  useEffect(() => () => {
    cabs.forEach((cab) => {
      cab.horse.mixer.stopAllAction();
      cab.driver.mixer.stopAllAction();
      cab.batches.forEach((batch) => batch.geometry.dispose());
    });
    Object.values(materials).forEach((material) => material.dispose());
  }, [cabs, materials]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    cabs.forEach((cab, index) => {
      cab.nextShift -= delta;
      if (cab.nextShift <= 0) {
        cab.shifting = 0.9;
        cab.nextShift = 6 + ((index * 5.3 + cab.nextShift * -7.1) % 9 + 9) % 9;
      }
      if (cab.shifting > 0) {
        cab.shifting -= delta;
        cab.horse.mixer.update(delta * 0.3);
      }
    });
  });

  const colliders = useMemo(() => cabs.flatMap((cab) => {
    const collider = horseDrawnCollider(cab.type);
    const yaw = cab.yaw - Math.PI / 2;
    return [
      { type: 'box', p: [cab.x, Y + collider.coachY, cab.z], size: collider.coachHalf.map((half) => half * 2), yaw },
      { type: 'box', p: [cab.horseAt.x, Y + collider.horseY, cab.horseAt.z], size: collider.horseHalf.map((half) => half * 2), yaw },
    ];
  }).concat([{ type: 'box', p: [TROUGH.x + Math.cos(TROUGH.yaw) * 0.4, Y + 0.35, TROUGH.z - Math.sin(TROUGH.yaw) * 0.4], size: [3.4, 0.7, 1.0], yaw: TROUGH.yaw }]), [cabs]);

  return (
    <group>
      {cabs.map((cab, index) => (
        <group key={index}>
          <group position={[cab.x, Y, cab.z]} rotation={[0, cab.yaw - Math.PI / 2, 0]}>
            <Coachwork batches={cab.batches} refs={cab.refs} />
            <group position={[cab.driverSeat.x, cab.driverSeat.y - 0.42, 0]} rotation={[0, Math.PI / 2, 0]}>
              <primitive object={cab.driver.figure} />
            </group>
          </group>
          <group position={[cab.horseAt.x, Y, cab.horseAt.z]} rotation={[0, cab.yaw, 0]} scale={0.94}>
            <primitive object={cab.horse.object} />
          </group>
          <Rods list={cab.shafts} radius={0.035} material={materials.wood} />
          <Rods list={cab.traces} radius={0.014} material={materials.trace} />
          <Rods list={cab.reins} radius={0.01} material={materials.rein} cast={false} />
        </group>
      ))}
      <group position={[TROUGH.x, Y, TROUGH.z]} rotation={[0, TROUGH.yaw, 0]}>
        {trough(materials.granite, materials.water).map((part, index) => (
          <mesh key={index} position={part.position} material={part.material} castShadow receiveShadow>
            <primitive object={stoneBox(part.size)} attach="geometry" />
          </mesh>
        ))}
      </group>
      <StaticColliders entries={colliders} />
    </group>
  );
}

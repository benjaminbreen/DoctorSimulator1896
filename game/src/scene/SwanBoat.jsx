import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_LEVEL } from '../world/centralPark.js';
import { LANDING_BERTH } from '../world/rusticwork.js';

// A pedal swan boat on the Pond: twin pontoons, benches under an awning, and
// the swan at the stern where the boatman sits and pedals. It leaves the
// landing, rounds both lobes, and lies alongside the landing again for a
// while before the next trip. The route keeps the hull 2m or more off shore.
const [BX, BZ] = LANDING_BERTH.point;
const [HX, HZ] = LANDING_BERTH.heading;
// The berth's neighbours lie on its heading, so the boat comes in straight.
const ROUTE = [
  [BX, BZ], [BX + HX * 6, BZ + HZ * 6], [10, 51.5], [16, 49.5], [22, 47], [28, 45.5], [30, 40], [24, 41.5],
  [16, 46], [8, 48.5], [-2, 50.5], [-10, 51.5], [-15, 54.5], [-12, 57.5], [BX - HX * 6, BZ - HZ * 6],
];
const SPEED = 0.7; // m/s, a walking boatman's pedal
const RAMP = 5; // metres to get under way, and to come to rest
const DWELL = 40; // seconds alongside, loading

function merged(parts) {
  const geometries = parts.map(([geometry, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    ),
  ));
  const out = mergeGeometries(geometries);
  geometries.forEach((geometry) => geometry.dispose());
  return out;
}

// Bow toward +z; the swan's neck rises at the stern and the head looks
// forward over the passengers.
function buildBoat() {
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sphere = (r) => new THREE.SphereGeometry(r, 16, 12);
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.5, -3.0),
    new THREE.Vector3(0, 2.3, -3.35),
    new THREE.Vector3(0, 3.0, -3.1),
    new THREE.Vector3(0, 3.3, -2.55),
  ]);
  const white = merged([
    [new THREE.CapsuleGeometry(0.32, 5.2, 6, 12), 0.85, 0.05, 0, Math.PI / 2],
    [new THREE.CapsuleGeometry(0.32, 5.2, 6, 12), -0.85, 0.05, 0, Math.PI / 2],
    // Body, wings folded up round the boatman's seat, tail.
    [sphere(1), 0, 1.0, -2.55, 0, 0, 0, 1.0, 0.7, 1.15],
    [sphere(1), 0.92, 1.3, -2.35, 0, 0, -0.2, 0.22, 0.62, 1.25],
    [sphere(1), -0.92, 1.3, -2.35, 0, 0, 0.2, 0.22, 0.62, 1.25],
    [new THREE.ConeGeometry(0.35, 0.8, 10), 0, 1.35, -3.75, -Math.PI / 2 - 0.5],
    [new THREE.TubeGeometry(neckCurve, 20, 0.14, 10), 0, 0, 0],
    [sphere(0.2), 0, 3.36, -2.45, 0, 0, 0, 0.85, 0.8, 1.3],
    // The awning roof.
    [box(2.45, 0.05, 4.4), 0, 2.45, 0.35],
  ]);
  const beak = merged([[new THREE.ConeGeometry(0.075, 0.32, 8), 0, 3.32, -2.08, Math.PI / 2]]);
  const benches = [1.95, 1.0, 0.05, -0.9];
  const wood = merged([
    [box(2.3, 0.1, 5.4), 0, 0.42, 0],
    ...benches.map((z) => [box(1.9, 0.06, 0.4), 0, 0.85, z]),
  ]);
  const posts = [[1.1, 2.4], [-1.1, 2.4], [1.1, -1.7], [-1.1, -1.7]];
  const paint = merged([
    // Gunwale rails, bench backs and fronts, awning posts and valance.
    [box(0.06, 0.08, 5.2), 1.12, 0.66, 0],
    [box(0.06, 0.08, 5.2), -1.12, 0.66, 0],
    ...benches.flatMap((z) => [[box(1.9, 0.42, 0.05), 0, 1.1, z - 0.2], [box(1.9, 0.38, 0.05), 0, 0.64, z + 0.18]]),
    ...posts.map(([x, z]) => [new THREE.CylinderGeometry(0.035, 0.035, 2.0, 6), x, 1.45, z]),
    [box(2.5, 0.2, 0.03), 0, 2.33, 2.56],
    [box(2.5, 0.2, 0.03), 0, 2.33, -1.86],
    [box(0.03, 0.2, 4.4), 1.24, 2.33, 0.35],
    [box(0.03, 0.2, 4.4), -1.24, 2.33, 0.35],
  ]);
  return [
    [white, new THREE.MeshStandardMaterial({ color: '#ece8de', roughness: 0.7 })],
    [beak, new THREE.MeshStandardMaterial({ color: '#d27a2c', roughness: 0.6 })],
    [wood, new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.85 })],
    [paint, new THREE.MeshStandardMaterial({ color: '#2f4d3c', roughness: 0.6 })],
  ];
}

const tangent = new THREE.Vector3();

export default function SwanBoat() {
  const group = useRef();
  const parts = useMemo(buildBoat, []);
  const route = useMemo(() => new THREE.CatmullRomCurve3(
    ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal',
  ), []);
  const length = useMemo(() => route.getLength(), [route]);

  // Distance travelled since leaving the berth: rest, speed up evenly over
  // RAMP, cruise, and slow evenly into the berth. The berth is u = 0.
  const travel = useMemo(() => {
    const rampTime = (2 * RAMP) / SPEED;
    const tripTime = (length + 2 * RAMP) / SPEED;
    return (t) => {
      const phase = t % (DWELL + tripTime) - DWELL;
      if (phase <= 0) return 0;
      if (phase < rampTime) return (SPEED / rampTime / 2) * phase * phase;
      const left = tripTime - phase;
      if (left < rampTime) return length - (SPEED / rampTime / 2) * left * left;
      return RAMP + (phase - rampTime) * SPEED;
    };
  }, [length]);

  useFrame(({ clock }) => {
    const node = group.current;
    if (!node) return;
    const t = clock.elapsedTime;
    const u = Math.min(travel(t) / length, 0.99999);
    route.getPointAt(u, node.position);
    route.getTangentAt(u, tangent);
    node.position.y = WATER_LEVEL - 0.12 + Math.sin(t * 1.3) * 0.02;
    node.rotation.set(Math.sin(t * 0.9) * 0.008, Math.atan2(tangent.x, tangent.z), Math.sin(t * 1.1) * 0.012);
  });

  useEffect(() => () => parts.forEach(([geometry, material]) => {
    geometry.dispose();
    material.dispose();
  }), [parts]);

  return (
    <group ref={group} name="swan-boat">
      {parts.map(([geometry, material], index) => (
        <mesh key={index} geometry={geometry} material={material} castShadow receiveShadow />
      ))}
    </group>
  );
}

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameDebug } from '../debug.js';
import { capsuleTouchesPoint, stepMaterialSpring } from '../world/materialResponse.js';
import { playSfx } from '../audio/sound.js';

export default function ResponsiveSconce({ item, gltf }) {
  const built = useMemo(() => {
    const object = gltf.scene.clone(true);
    const materials = [];
    object.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = node.material.clone();
      materials.push(node.material);
    });
    const shades = ['shade-left', 'shade-right'].map((name) => ({
      node: object.getObjectByName(name),
      x: { value: 0, velocity: 0 }, z: { value: 0, velocity: 0 }, touching: false,
    }));
    object.userData.materialResponse = { kind: 'sconce', hits: 0, tilt: 0 };
    object.name = `responsive-${item.id}`;
    return { object, materials, shades, last: new THREE.Vector3(Infinity, 0, 0), point: new THREE.Vector3() };
  }, [gltf, item.id]);

  useEffect(() => () => built.materials.forEach((material) => material.dispose()), [built]);

  useFrame((_, delta) => {
    const player = gameDebug.player;
    const feet = player.position;
    const radius = gameDebug.tuning?.capsuleRadius ?? 0.28;
    const height = player.posture === 'prone' ? 0.5
      : 2 * ((gameDebug.tuning?.capsuleHalfHeight ?? 0.56) + radius);
    const dt = Math.max(0.001, delta);
    const dx = feet[0] - built.last.x;
    const dy = feet[1] - built.last.y;
    const dz = feet[2] - built.last.z;
    const moved = Math.hypot(dx, dy, dz);
    const speed = Math.min(8, moved / dt);
    const yaw = item.yaw ?? 0;
    let tilt = 0;
    for (const shade of built.shades) {
      // Test the shade volume, never the brass arms or the wall behind it.
      shade.node.localToWorld(built.point.set(0, 0.11, 0));
      const touching = capsuleTouchesPoint(built.point.toArray(), feet, height, radius, 0.13);
      if (touching && !shade.touching && moved < 1 && speed > 0.2) {
        const localX = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / dt;
        const localZ = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / dt;
        shade.x.velocity += THREE.MathUtils.clamp(-localZ * 1.4 - Math.max(0, dy / dt) * 0.3, -4, 4);
        shade.z.velocity += THREE.MathUtils.clamp(localX * 1.4 + Math.max(0, dy / dt) * 0.15, -4, 4);
        built.object.userData.materialResponse.hits += 1;
        playSfx('shade-rattle', Math.min(1, speed * 0.25));
      }
      shade.touching = touching;
      shade.node.rotation.x = stepMaterialSpring(shade.x, 0, delta, 115, 6, 0.22);
      shade.node.rotation.z = stepMaterialSpring(shade.z, 0, delta, 115, 6, 0.22);
      tilt = Math.max(tilt, Math.abs(shade.x.value), Math.abs(shade.z.value));
    }
    built.object.userData.materialResponse.tilt = tilt;
    built.last.fromArray(feet);
  });

  return <group position={item.position} rotation={[0, item.yaw ?? 0, 0]} scale={item.modelScale ?? 1}>
    <primitive object={built.object} />
  </group>;
}

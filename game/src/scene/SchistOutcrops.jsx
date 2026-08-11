import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { buildParkRocks } from '../world/parkRocks.js';
import { makeCraggyRockGeometry, makeHeroCraggyRockGeometry, makeSchistMaterial } from './rockGeometry.js';
import { instanced } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';

// Park boulders and pebble litter, instanced per geometry variant. Boulders
// big enough to block a walker carry ball colliders; pebbles are decor.

export default function SchistOutcrops() {
  const [rockCol, rockNrm] = useLoader(THREE.TextureLoader, [
    '/textures/rock_col.webp',
    '/textures/rock_nrm.webp',
  ]);

  const { meshes, colliders } = useMemo(() => {
    rockCol.colorSpace = THREE.SRGBColorSpace;
    rockCol.wrapS = rockCol.wrapT = THREE.RepeatWrapping;
    rockNrm.wrapS = rockNrm.wrapT = THREE.RepeatWrapping;
    const material = makeSchistMaterial(rockCol, rockNrm);
    const { boulders, pebbles } = buildParkRocks();

    const built = [];
    const heroes = boulders.filter((rock) => rock.hero);
    const smalls = boulders.filter((rock) => !rock.hero);
    if (heroes.length) built.push(instanced(makeHeroCraggyRockGeometry(2.9), material, heroes));
    if (smalls.length) built.push(instanced(makeCraggyRockGeometry(4.2), material, smalls));
    if (pebbles.length) built.push(instanced(makeCraggyRockGeometry(8.9), material, pebbles, { cast: false }));
    return {
      meshes: built,
      colliders: boulders
        .filter((rock) => rock.s[1] > 0.45)
        .map((rock) => ({ type: 'ball', p: rock.p, radius: Math.max(rock.s[0], rock.s[2]) * 0.85 })),
    };
  }, [rockCol, rockNrm]);

  return (
    <group>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
      <StaticColliders entries={colliders} />
    </group>
  );
}

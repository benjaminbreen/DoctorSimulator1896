import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { terrainHeight, pathsDistance, pondDepth } from '../world/terrain.js';

const WIDTH = 160;
const DEPTH = 140;
const SEGMENTS_X = 150;
const SEGMENTS_Z = 130;

// Grass palette with per-vertex variation so the ground reads as lawn, not
// a flat green sheet. Gravel on paths, sand at the pond edge.
const GRASS = new THREE.Color('#55673d');
const GRASS_DRY = new THREE.Color('#6f7444');
const GRAVEL = new THREE.Color('#b3a077');
const SAND = new THREE.Color('#9a8a68');
const scratch = new THREE.Color();

export default function Terrain() {
  const { geometry, vertices, indices } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(WIDTH, DEPTH, SEGMENTS_X, SEGMENTS_Z);
    geo.rotateX(-Math.PI / 2);
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      positions.setY(i, terrainHeight(x, z));

      const tone = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
      const jitter = tone - Math.floor(tone);
      scratch.copy(GRASS).lerp(GRASS_DRY, jitter * 0.55);
      const nearPath = Math.max(0, 1 - pathsDistance(x, z) / 1.6);
      scratch.lerp(GRAVEL, nearPath * nearPath);
      const pond = pondDepth(x, z);
      if (pond < 0.35) scratch.lerp(SAND, 1 - Math.max(0, pond) / 0.35);
      colors[i * 3] = scratch.r;
      colors[i * 3 + 1] = scratch.g;
      colors[i * 3 + 2] = scratch.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return {
      geometry: geo,
      vertices: new Float32Array(positions.array),
      indices: new Uint32Array(geo.index.array),
    };
  }, []);

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <TrimeshCollider args={[vertices, indices]} />
      </RigidBody>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} />
      </mesh>
    </group>
  );
}

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Instanced trees: one trunk mesh and one canopy mesh per archetype, so a
// few hundred trees cost six draw calls. Canopies are merged, jittered
// icosahedron lobes with flat shading — stylized, not lollipops.
const ARCHETYPES = [
  // 0: elm — tall, vase-shaped, canopy held high.
  { lobes: [[0, 0, 0, 1], [0.55, 0.25, 0.1, 0.6], [-0.5, 0.3, -0.15, 0.55], [0.1, 0.55, 0.3, 0.5]], squash: 0.9 },
  // 1: oak — broad and round, low crown.
  { lobes: [[0, 0, 0, 1], [0.7, -0.05, 0.2, 0.7], [-0.65, 0, -0.2, 0.65], [0.2, 0.4, -0.5, 0.55], [-0.2, 0.35, 0.55, 0.5]], squash: 0.78 },
  // 2: pond willow — wide, flattened, drooping toward the water.
  { lobes: [[0, 0, 0, 1], [0.8, -0.2, 0, 0.7], [-0.8, -0.15, 0.1, 0.7], [0, -0.25, 0.75, 0.6], [0.1, -0.2, -0.75, 0.6]], squash: 0.62 },
];

function jitter(value, seed) {
  const noise = Math.sin(seed * 127.1 + value * 311.7) * 43758.5453;
  return (noise - Math.floor(noise) - 0.5) * 0.16;
}

function buildCanopyGeometry(archetype, seed) {
  const spec = ARCHETYPES[archetype];
  const parts = spec.lobes.map(([x, y, z, scale]) => {
    const lobe = new THREE.IcosahedronGeometry(scale, 1);
    lobe.translate(x, y * spec.squash + 0.1, z);
    return lobe;
  });
  const merged = mergeGeometries(parts);
  const positions = merged.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setXYZ(
      i,
      positions.getX(i) + jitter(i, seed),
      positions.getY(i) * spec.squash + jitter(i + 1, seed),
      positions.getZ(i) + jitter(i + 2, seed),
    );
  }
  merged.computeVertexNormals();
  parts.forEach((part) => part.dispose());
  return merged;
}

const scratchMatrix = new THREE.Matrix4();
const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export default function TreeField({ items }) {
  const [barkCol, barkNrm] = useLoader(THREE.TextureLoader, [
    '/textures/bark_col.jpg',
    '/textures/bark_nrm.jpg',
  ]);

  const meshes = useMemo(() => {
    barkCol.wrapS = barkCol.wrapT = THREE.RepeatWrapping;
    barkNrm.wrapS = barkNrm.wrapT = THREE.RepeatWrapping;
    barkCol.colorSpace = THREE.SRGBColorSpace;

    const built = [];
    for (let archetype = 0; archetype < ARCHETYPES.length; archetype += 1) {
      const trees = items.filter((item) => (item.tree?.archetype ?? 0) === archetype);
      if (trees.length === 0) continue;

      const trunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 1, 8);
      trunkGeo.translate(0, 0.5, 0);
      const trunkMat = new THREE.MeshStandardMaterial({
        map: barkCol,
        normalMap: barkNrm,
        color: '#b0a294',
        roughness: 0.9,
      });
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);

      const canopyGeo = buildCanopyGeometry(archetype, archetype * 17 + 5);
      const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
      const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);

      trees.forEach((item, index) => {
        const { trunkH, trunkR, canopyR } = item.tree;
        const groundY = item.position[1] - item.size[1] / 2;
        const spin = (item.position[0] * 3.1 + item.position[2]) % Math.PI;

        scratchQuat.setFromAxisAngle(UP, spin);
        scratchPos.set(item.position[0], groundY, item.position[2]);
        scratchScale.set(trunkR / 0.34, trunkH, trunkR / 0.34);
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
        trunks.setMatrixAt(index, scratchMatrix);

        scratchPos.set(item.position[0], groundY + trunkH * 0.92 + canopyR * 0.35, item.position[2]);
        scratchScale.setScalar(canopyR);
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
        canopies.setMatrixAt(index, scratchMatrix);
        canopies.setColorAt(index, scratchColor.set(item.color));
      });

      trunks.instanceMatrix.needsUpdate = true;
      canopies.instanceMatrix.needsUpdate = true;
      if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
      trunks.castShadow = true;
      trunks.receiveShadow = true;
      canopies.castShadow = true;
      canopies.receiveShadow = true;
      built.push(trunks, canopies);
    }
    return built;
  }, [items, barkCol, barkNrm]);

  useEffect(
    () => () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
        mesh.dispose();
      }
    },
    [meshes],
  );

  return (
    <group>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}

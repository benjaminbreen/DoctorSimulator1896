import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Instanced trees from the Quaternius Ultimate Nature Pack (CC0). Each tree
// item picks one of five model variants per archetype; every variant part
// (bark, leaves) is one InstancedMesh, so a few hundred trees stay cheap.
const VARIANTS = 5;
const ARCHETYPE_MODELS = ['BirchTree', 'CommonTree', 'Willow'];
// Model height relative to trunkH + canopyR, tuned per archetype: elms tall,
// oaks broad, pond willows low.
const HEIGHT_SCALE = [2.05, 1.85, 1.5];

const MODEL_URLS = ARCHETYPE_MODELS.flatMap((name) =>
  Array.from({ length: VARIANTS }, (_, i) => `/models/trees/${name}_${i + 1}.glb`),
);

// Leaf parts take per-instance canopy colors; bark parts get shared period
// tones (the birch's white bark reads wrong for an elm and is recolored).
const BARK_COLORS = { Wood: '#6a563f', White: '#8b8072', Black: '#3f3831' };

function isLeafMaterial(name) {
  return /green/i.test(name ?? '');
}

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Flatten a loaded GLB into world-space geometries with the trunk base at the
// origin, split into leaf and bark parts.
function extractParts(gltf) {
  const parts = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(node.matrixWorld);
    parts.push({ geometry, materialName: node.material?.name ?? '' });
  });
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox);
  }
  const center = box.getCenter(new THREE.Vector3());
  for (const part of parts) {
    part.geometry.translate(-center.x, -box.min.y, -center.z);
  }
  return { parts, height: box.max.y - box.min.y };
}

const scratchMatrix = new THREE.Matrix4();
const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export default function TreeField({ items }) {
  const gltfs = useLoader(GLTFLoader, MODEL_URLS);

  const meshes = useMemo(() => {
    const models = gltfs.map(extractParts);
    const modelFor = (archetype, variant) => models[archetype * VARIANTS + variant];

    // Bucket trees by archetype + variant so each bucket instances one model.
    const buckets = new Map();
    for (const item of items) {
      const archetype = item.tree?.archetype ?? 0;
      const variant = Math.floor(hash01(item.position[0] * 7.3 + item.position[2] * 13.7) * VARIANTS);
      const key = archetype * VARIANTS + variant;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    }

    const built = [];
    for (const [key, trees] of buckets) {
      const archetype = Math.floor(key / VARIANTS);
      const model = modelFor(archetype, key % VARIANTS);
      for (const part of model.parts) {
        const leaf = isLeafMaterial(part.materialName);
        const material = new THREE.MeshStandardMaterial({
          color: leaf ? '#ffffff' : (BARK_COLORS[part.materialName] ?? '#6a563f'),
          roughness: 0.92,
        });
        const mesh = new THREE.InstancedMesh(part.geometry, material, trees.length);
        trees.forEach((item, index) => {
          const { trunkH, canopyR } = item.tree;
          const groundY = item.position[1] - item.size[1] / 2;
          const spin = (item.position[0] * 3.1 + item.position[2]) % Math.PI;
          const scale = ((trunkH + canopyR) * HEIGHT_SCALE[archetype]) / model.height;
          scratchQuat.setFromAxisAngle(UP, spin);
          scratchPos.set(item.position[0], groundY, item.position[2]);
          scratchScale.setScalar(scale);
          scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
          mesh.setMatrixAt(index, scratchMatrix);
          if (leaf) {
            scratchColor.set(item.color);
            scratchColor.offsetHSL(0, 0, (hash01(index * 3.7 + key) - 0.5) * 0.07);
            mesh.setColorAt(index, scratchColor);
          }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        built.push(mesh);
      }
    }
    return built;
  }, [items, gltfs]);

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

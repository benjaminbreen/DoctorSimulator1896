import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { TREE_MODEL_URLS, TREE_SOURCE_VARIANTS } from '../world/treeModels.js';
import { applyWind } from './foliageWind.js';

// How far a canopy top travels, as a fraction of the tree's height. A big elm
// moving a quarter of a metre is a breeze; much more and it reads as a storm.
const TREE_SWAY = 0.03;

// Instanced trees from the Shapespark exterior plants kit, split into pieces
// by the model converter; world/treeModels.js lists which pieces.
const VARIANTS = TREE_SOURCE_VARIANTS.length;
// Model height relative to trunkH + canopyR, tuned per archetype: elms tall,
// oaks broad, pond willows low.
const HEIGHT_SCALE = [2.05, 1.85, 1.5];

// Leaf cards take per-instance canopy colors; the trunk keeps its own bark.
function isLeafMaterial(name) {
  return /branch|leaf/i.test(name ?? '');
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
    parts.push({ geometry, material: node.material, materialName: node.material?.name ?? '' });
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
  const gltfs = useLoader(GLTFLoader, TREE_MODEL_URLS, (loader) => loader.setMeshoptDecoder(MeshoptDecoder));

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
        // The kit's own materials carry the bark and leaf textures, and the
        // leaves are an alpha cutout that has to keep both faces. Instance
        // colour multiplies the map, so the base has to stay white.
        const material = part.material.clone();
        material.color.set('#ffffff');
        if (material.alphaTest > 0) material.depthWrite = true;
        const mesh = new THREE.InstancedMesh(part.geometry, material, trees.length);
        // Leaves take the wind; the trunk holds still, which is what the
        // height ramp inside the shader would nearly do anyway.
        if (leaf) {
          mesh.customDepthMaterial = applyWind(material, {
            reference: model.height,
            amplitude: TREE_SWAY,
          });
        }
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
        mesh.customDepthMaterial?.dispose();
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

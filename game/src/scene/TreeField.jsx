import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { GLTFLoader } from './modelLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { TREE_MODEL_URLS, TREE_LOD_URLS, TREE_SOURCE_VARIANTS } from '../world/treeModels.js';
import { applyWind } from './foliageWind.js';
import { getKTX2Loader } from './ktx2.js';
import { sharePackTextures } from './packTextures.js';
import { freezeStaticTransforms } from './lib/staticScene.js';

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
function extractParts(gltf, origin = null) {
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
  const center = origin?.center ?? box.getCenter(new THREE.Vector3());
  const base = origin?.base ?? box.min.y;
  for (const part of parts) {
    part.geometry.translate(-center.x, -base, -center.z);
  }
  return { parts, height: origin?.height ?? box.max.y - box.min.y, center, base };
}

const scratchMatrix = new THREE.Matrix4();
const scratchPos = new THREE.Vector3();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export default function TreeField({ items }) {
  const gl = useThree((state) => state.gl);
  const configure = useCallback((loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(getKTX2Loader(gl));
  }, [gl]);
  const gltfs = useLoader(GLTFLoader, [...TREE_MODEL_URLS, ...TREE_LOD_URLS], configure);

  const meshes = useMemo(() => {
    const models = gltfs.slice(0, TREE_MODEL_URLS.length).map((gltf) => extractParts(sharePackTextures(gltf)));
    const distant = gltfs.slice(TREE_MODEL_URLS.length).map((gltf, index) => extractParts(gltf, models[index]));
    const materials = new Map();
    const modelFor = (archetype, variant) => models[archetype * VARIANTS + variant];

    // Small geographic cells let both the eye and the sun cull whole groves.
    const buckets = new Map();
    for (const item of items) {
      const archetype = item.tree?.archetype ?? 0;
      const variant = Math.floor(hash01(item.position[0] * 7.3 + item.position[2] * 13.7) * VARIANTS);
      const model = archetype * VARIANTS + variant;
      const key = `${model}:${Math.floor(item.position[0] / 72)}:${Math.floor(item.position[2] / 72)}`;
      if (!buckets.has(key)) buckets.set(key, { model, trees: [] });
      buckets.get(key).trees.push(item);
    }

    const built = [];
    for (const { model: key, trees } of buckets.values()) {
      const archetype = Math.floor(key / VARIANTS);
      const model = modelFor(archetype, key % VARIANTS);
      for (const part of model.parts) {
        const leaf = isLeafMaterial(part.materialName);
        // The kit's own materials carry the bark and leaf textures, and the
        // leaves are an alpha cutout that has to keep both faces. Instance
        // colour multiplies the map, so the base has to stay white.
        let surface = materials.get(part);
        if (!surface) {
          const material = part.material.clone();
          material.color.set('#ffffff');
          if (material.alphaTest > 0) material.depthWrite = true;
          const depth = leaf ? applyWind(material, { reference: model.height, amplitude: TREE_SWAY }) : undefined;
          materials.set(part, surface = { material, depth });
        }
        const mesh = new THREE.InstancedMesh(part.geometry, surface.material, trees.length);
        mesh.customDepthMaterial = surface.depth;
        mesh.name = `tree-cell-${key}`;
        const farPart = distant[key].parts.find((candidate) => candidate.materialName === part.materialName);
        mesh.userData.nearGeometry = part.geometry;
        mesh.userData.farGeometry = farPart?.geometry ?? part.geometry;
        mesh.userData.warmGeometries = [part.geometry, mesh.userData.farGeometry];
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
            scratchColor.offsetHSL(0, -0.06, (hash01(item.position[0] * 3.7 + item.position[2]) - 0.5) * 0.055);
            mesh.setColorAt(index, scratchColor);
          }
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.boundingSphere.radius += model.height * .06;
        built.push(mesh);
      }
    }
    return built;
  }, [items, gltfs]);

  useFrame(({ camera }) => {
    for (const mesh of meshes) {
      const distance = camera.position.distanceTo(mesh.boundingSphere.center) - mesh.boundingSphere.radius;
      const far = distance > (mesh.userData.far ? 80 : 95);
      if (far !== mesh.userData.far) {
        mesh.userData.far = far;
        mesh.geometry = far ? mesh.userData.farGeometry : mesh.userData.nearGeometry;
      }
    }
  });

  useEffect(() => () => {
    const resources = new Set();
    for (const mesh of meshes) {
      resources.add(mesh.userData.nearGeometry);
      resources.add(mesh.userData.farGeometry);
      resources.add(mesh.material);
      if (mesh.customDepthMaterial) resources.add(mesh.customDepthMaterial);
      mesh.dispose();
    }
    for (const resource of resources) resource.dispose();
  }, [meshes]);

  return (
    <group ref={(node) => freezeStaticTransforms(node)}>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}

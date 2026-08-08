import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODEL_URL } from '../world/victorianCatalog.js';

// Renders the Victorian pack models an interior asked for. Items carry a
// `model` name from the catalog. The converter recentres every piece with
// its base at the origin, so a position is the model's floor-contact point.
// Repeated models are instanced.
export default function VictorianProps({ items }) {
  const models = useMemo(() => {
    const names = new Set();
    for (const item of items) if (item.model) names.add(item.model);
    return [...names].sort();
  }, [items]);

  const gltfs = useLoader(GLTFLoader, models.map(MODEL_URL));

  const meshes = useMemo(() => {
    const byName = new Map(models.map((name, index) => [name, gltfs[index]]));
    const built = [];

    for (const name of models) {
      const gltf = byName.get(name);
      const placements = items.filter((item) => item.model === name);
      if (!gltf || placements.length === 0) continue;

      // Flatten the model into world-space geometry per material, so each
      // distinct part becomes one InstancedMesh across all placements.
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((node) => {
        if (!node.isMesh) return;
        const geometry = node.geometry.clone();
        geometry.applyMatrix4(node.matrixWorld);
        parts.push({ geometry, material: node.material });
      });

      for (const part of parts) {
        const material = Array.isArray(part.material)
          ? part.material[0].clone()
          : part.material.clone();
        material.side = THREE.FrontSide;
        const mesh = new THREE.InstancedMesh(part.geometry, material, placements.length);
        placements.forEach((item, index) => {
          const matrix = new THREE.Matrix4();
          const scale = item.modelScale ?? 1;
          matrix.compose(
            new THREE.Vector3(item.position[0], item.position[1], item.position[2]),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw ?? 0),
            new THREE.Vector3(scale, scale, scale),
          );
          mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        built.push(mesh);
      }
    }
    return built;
  }, [items, models, gltfs]);

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

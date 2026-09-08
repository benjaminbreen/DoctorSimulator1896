import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameDebug } from '../debug.js';
import { SHELTERS } from '../world/rusticwork.js';
import { terrainHeight } from '../world/terrain.js';

// Small ambient contact patches share one draw. They do not cast shadows or
// allocate textures, and disappear with hidden, distant, or airborne actors.
export default function GroundContacts() {
  const { mesh, dummy, posts } = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: '#161b15', transparent: true, opacity: 0.23,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec2 contactUv;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\ncontactUv = uv;');
      shader.fragmentShader = 'varying vec2 contactUv;\n' + shader.fragmentShader.replace(
        '#include <opaque_fragment>', `
          float radius = length((contactUv - 0.5) * 2.0);
          diffuseColor.a *= 1.0 - smoothstep(0.05, 1.0, radius);
          #include <opaque_fragment>
        `);
    };
    material.customProgramCacheKey = () => 'ground-contact-v1';
    const mesh = new THREE.InstancedMesh(geometry, material, 160);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    const posts = SHELTERS.flatMap((shelter) => Array.from({ length: shelter.sides }, (_, k) => {
      const angle = shelter.yaw + k * Math.PI * 2 / shelter.sides;
      const x = shelter.x + Math.cos(angle) * shelter.radius;
      const z = shelter.z + Math.sin(angle) * shelter.radius;
      return [x, terrainHeight(x, z) + 0.025, z, shelter.postR * 5];
    }));
    return { mesh, dummy: new THREE.Object3D(), posts };
  }, []);
  useEffect(() => () => { mesh.geometry.dispose(); mesh.material.dispose(); }, [mesh]);
  useFrame(() => {
    let count = 0;
    const player = gameDebug.player;
    const put = (x, y, z, width, depth = width) => {
      const distance = Math.hypot(x - player.position[0], z - player.position[2]);
      if (distance >= 22 || count >= 160) return;
      const fade = Math.min(1, (22 - distance) / 5);
      dummy.position.set(x, y + 0.015, z);
      dummy.scale.set(width * fade, 1, depth * fade);
      dummy.updateMatrix();
      mesh.setMatrixAt(count++, dummy.matrix);
    };
    if (player.visible && player.grounded) put(...player.position, 0.85, 0.65);
    for (const actor of gameDebug.pedestrians) {
      if (!actor.hidden && actor.contact) put(...actor.position, 0.8, 0.65);
    }
    for (const post of posts) put(...post);
    mesh.count = count;
    if (count) mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}

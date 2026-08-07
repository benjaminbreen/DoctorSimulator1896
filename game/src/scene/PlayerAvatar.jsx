import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { gameDebug } from '../debug.js';

// Character-lab GLB following the physics capsule. Mounted OUTSIDE the
// RigidBody: suspending a loader inside the physics subtree crashed React's
// dev logging on the model's circular scene graph. It only has idle clips —
// no walk animation yet, so it glides when moving.
export default function PlayerAvatar() {
  const groupRef = useRef();
  const gltf = useLoader(GLTFLoader, '/models/mrs-ostrander-1896.glb', (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
  });
  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf]);

  useEffect(() => {
    gltf.scene.traverse((object) => {
      object.userData = {};
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    // Both lab clips bake the SEATED pose, so playing them here puts a
    // sitting figure mid-stride. Standing bind pose until the lab exports a
    // standing idle and a walk cycle.
    return () => mixer.stopAllAction();
  }, [gltf, mixer]);

  useFrame((_, delta) => {
    mixer.update(delta);
    const group = groupRef.current;
    if (!group) return;
    const [x, y, z] = gameDebug.player.position;
    group.position.set(x, y, z);
    group.rotation.y = gameDebug.player.yaw;
  });

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
    </group>
  );
}

import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { buildingFacade } from './textures.js';

function hash01(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function idHash(id) {
  let total = 0;
  for (let i = 0; i < id.length; i += 1) total = (total * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(total);
}

// Street buildings: facade sized to the massing, roof cap, chimneys, and a
// water tank on the taller blocks — the 1890s skyline furniture.
function Backdrop({ item }) {
  const seed = idHash(item.id);
  const map = buildingFacade(item.facadeStyle ?? seed % 4, seed % 97, item.size[0], item.size[1]);
  const capY = item.size[1] / 2 + 0.25;
  const chimneys = 1 + (seed % 3);
  return (
    <group position={item.position} rotation={[0, item.yaw ?? 0, 0]}>
      <mesh castShadow={false} receiveShadow={false}>
        <boxGeometry args={item.size} />
        <meshStandardMaterial map={map} roughness={0.9} />
      </mesh>
      <mesh position={[0, capY, 0]}>
        <boxGeometry args={[item.size[0] + 0.5, 0.5, item.size[2] + 0.5]} />
        <meshStandardMaterial color="#4c4138" roughness={0.95} />
      </mesh>
      {Array.from({ length: chimneys }, (_, index) => (
        <mesh
          key={index}
          position={[
            (hash01(seed + index * 3) - 0.5) * item.size[0] * 0.7,
            capY + 0.85,
            (hash01(seed + index * 7) - 0.5) * item.size[2] * 0.6,
          ]}
        >
          <boxGeometry args={[0.55, 1.2, 0.55]} />
          <meshStandardMaterial color="#4a3a32" roughness={0.95} />
        </mesh>
      ))}
      {item.roof === 'cone' && (
        <mesh position={[0, capY + 2.4, 0]}>
          <coneGeometry args={[Math.min(item.size[0], item.size[2]) * 0.42, 5, 12]} />
          <meshStandardMaterial color="#3e4046" roughness={0.85} />
        </mesh>
      )}
      {item.roof === 'mansard' && (
        <mesh position={[0, capY + 1.5, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[Math.max(item.size[0], item.size[2]) * 0.6, 3.2, 4]} />
          <meshStandardMaterial color="#43454c" roughness={0.9} />
        </mesh>
      )}
      {!item.roof && item.size[1] > 18 && seed % 3 === 0 && (
        <group position={[item.size[0] * 0.2, capY + 1.3, -item.size[2] * 0.15]}>
          <mesh>
            <cylinderGeometry args={[0.95, 1.05, 1.7, 12]} />
            <meshStandardMaterial color="#5a4636" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.15, 0]}>
            <coneGeometry args={[1.1, 0.7, 12]} />
            <meshStandardMaterial color="#4a3a2e" roughness={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function ItemGeometry({ item }) {
  if (item.shape === 'cylinder') {
    return <cylinderGeometry args={[item.size[0] / 2, item.size[0] / 2, item.size[1], 14]} />;
  }
  if (item.shape === 'sphere') {
    return <sphereGeometry args={[item.size[0] / 2, 18, 14]} />;
  }
  if (item.shape === 'cone') {
    return <coneGeometry args={[item.size[0] / 2, item.size[1], 16]} />;
  }
  return <boxGeometry args={item.size} />;
}

function ItemCollider({ item }) {
  if (item.shape === 'cylinder' || item.shape === 'tree') {
    return <CylinderCollider args={[item.size[1] / 2, item.size[0] / 2]} position={item.position} />;
  }
  return (
    <CuboidCollider
      args={[item.size[0] / 2, item.size[1] / 2, item.size[2] / 2]}
      position={item.position}
      rotation={item.rotation ?? [0, item.yaw ?? 0, 0]}
    />
  );
}

// Placeholder props: box, cylinder, sphere, or cone per blueprint entry, mesh
// and collider from the same data. `collider: false` marks decor.
export default function Furniture({ items }) {
  const [barkCol, barkNrm, brickCol, pavingCol] = useLoader(THREE.TextureLoader, [
    '/textures/bark_col.jpg',
    '/textures/bark_nrm.jpg',
    '/textures/brick_col.jpg',
    '/textures/paving_col.jpg',
  ]);
  const maps = useMemo(() => {
    for (const texture of [barkCol, brickCol, pavingCol, barkNrm]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
    }
    barkCol.colorSpace = THREE.SRGBColorSpace;
    brickCol.colorSpace = THREE.SRGBColorSpace;
    pavingCol.colorSpace = THREE.SRGBColorSpace;
    return { bark: barkCol, barkNormal: barkNrm, brick: brickCol, paving: pavingCol };
  }, [barkCol, barkNrm, brickCol, pavingCol]);

  const solid = items.filter((item) => item.collider !== false);
  const pavingClones = useMemo(() => new Map(), [maps]);

  function materialFor(item) {
    if (item.kind === 'tree' && item.shape === 'cylinder') {
      return <meshStandardMaterial map={maps.bark} normalMap={maps.barkNormal} color="#b0a294" roughness={0.9} />;
    }
    if (item.texture === 'brick') {
      return <meshStandardMaterial map={maps.brick} roughness={0.85} />;
    }
    if (item.texture === 'paving' || item.texture === 'road') {
      // Clone per item so the repeat matches its footprint; roads tile finer
      // (granite setts) and carry a darker tint.
      const tile = item.texture === 'road' ? 1.7 : 2.4;
      let paving = pavingClones.get(item.id);
      if (!paving) {
        paving = maps.paving.clone();
        paving.repeat.set(Math.max(1, item.size[0] / tile), Math.max(1, item.size[2] / tile));
        pavingClones.set(item.id, paving);
      }
      return <meshStandardMaterial map={paving} color={item.color ?? '#ffffff'} roughness={0.9} />;
    }
    // Cast iron and painted metal pick up the sky; wood and stone stay flat.
    if (item.metal) {
      return (
        <meshStandardMaterial
          color={item.color ?? '#33383c'}
          metalness={0.85}
          roughness={0.38}
          envMapIntensity={0.8}
        />
      );
    }
    return (
      <meshStandardMaterial
        color={item.color ?? '#4a3826'}
        roughness={0.8}
        emissive={item.emissive ?? '#000000'}
        emissiveIntensity={item.emissive ? 2.2 : 0}
      />
    );
  }

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {solid.map((item) => (
          <ItemCollider key={item.id} item={item} />
        ))}
      </RigidBody>
      {items.map((item) => {
        if (item.kind === 'backdrop') return <Backdrop key={item.id} item={item} />;
        // Trees render through the instanced TreeField.
        if (item.kind === 'tree') return null;
        return (
          <mesh
            key={item.id}
            position={item.position}
            rotation={item.rotation ?? [0, item.yaw ?? 0, 0]}
            castShadow={item.collider !== false || item.shape === 'sphere'}
            receiveShadow
          >
            <ItemGeometry item={item} />
            {materialFor(item)}
          </mesh>
        );
      })}
    </group>
  );
}

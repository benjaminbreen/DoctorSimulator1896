import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';

// Placeholder props: box, cylinder, or sphere per blueprint entry, mesh and
// collider from the same data. `collider: false` marks decor (paths, canopies).
function hash01(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

// Tree canopies render as a cluster of three overlapping spheres instead of
// one ball, which is most of the difference between a lollipop and a tree.
function CanopyCluster({ item }) {
  const radius = item.size[0] / 2;
  const seed = item.position[0] * 7.3 + item.position[2] * 3.1;
  const lobes = [
    { offset: [0, 0, 0], scale: 1 },
    { offset: [radius * 0.55, radius * 0.3, radius * (hash01(seed) - 0.5) * 0.6], scale: 0.62 },
    { offset: [-radius * 0.5, radius * 0.42, radius * (hash01(seed + 1) - 0.5) * 0.6], scale: 0.55 },
  ];
  return lobes.map((lobe, index) => (
    <mesh key={index} position={lobe.offset} scale={[1, 0.85, 1]} castShadow>
      <sphereGeometry args={[radius * lobe.scale, 16, 12]} />
      <meshStandardMaterial color={item.color} roughness={0.9} />
    </mesh>
  ));
}

function ItemGeometry({ item }) {
  if (item.shape === 'cylinder') {
    return <cylinderGeometry args={[item.size[0] / 2, item.size[0] / 2, item.size[1], 14]} />;
  }
  if (item.shape === 'sphere') {
    return <sphereGeometry args={[item.size[0] / 2, 18, 14]} />;
  }
  return <boxGeometry args={item.size} />;
}

function ItemCollider({ item }) {
  if (item.shape === 'cylinder') {
    return <CylinderCollider args={[item.size[1] / 2, item.size[0] / 2]} position={item.position} />;
  }
  return (
    <CuboidCollider
      args={[item.size[0] / 2, item.size[1] / 2, item.size[2] / 2]}
      position={item.position}
      rotation={[0, item.yaw ?? 0, 0]}
    />
  );
}

export default function Furniture({ items }) {
  const solid = items.filter((item) => item.collider !== false);
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {solid.map((item) => (
          <ItemCollider key={item.id} item={item} />
        ))}
      </RigidBody>
      {items.map((item) =>
        item.kind === 'tree' && item.shape === 'sphere' ? (
          <group key={item.id} position={item.position}>
            <CanopyCluster item={item} />
          </group>
        ) : (
          <mesh
            key={item.id}
            position={item.position}
            rotation={[0, item.yaw ?? 0, 0]}
            castShadow={item.collider !== false || item.shape === 'sphere'}
            receiveShadow
          >
            <ItemGeometry item={item} />
            <meshStandardMaterial color={item.color ?? '#4a3826'} roughness={0.8} />
          </mesh>
        ),
      )}
    </group>
  );
}

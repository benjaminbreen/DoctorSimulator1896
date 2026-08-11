import { RigidBody, CylinderCollider, CuboidCollider, BallCollider } from '@react-three/rapier';

// One fixed body for a feature's collider list. Entries come from world
// builders in world coordinates: {type: 'cylinder', p, radius, height},
// {type: 'box', p, size, yaw?}, or {type: 'ball', p, radius}.

export default function StaticColliders({ entries }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {entries.map((entry, index) => {
        if (entry.type === 'cylinder') {
          return <CylinderCollider key={index} args={[entry.height / 2, entry.radius]} position={entry.p} />;
        }
        if (entry.type === 'ball') {
          return <BallCollider key={index} args={[entry.radius]} position={entry.p} />;
        }
        return (
          <CuboidCollider
            key={index}
            args={[entry.size[0] / 2, entry.size[1] / 2, entry.size[2] / 2]}
            position={entry.p}
            rotation={[0, entry.yaw ?? 0, 0]}
          />
        );
      })}
    </RigidBody>
  );
}

import { memo } from 'react';
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { itemBoxes, rotateOffset } from '../physics/propBodies.js';

function ItemCollider({ item }) {
  if (item.shape === 'cylinder' || item.shape === 'tree') {
    return <CylinderCollider args={[item.size[1] / 2, item.size[0] / 2]} position={item.position} />;
  }
  if (item.colliderQuaternion) {
    return (
      <CuboidCollider
        args={[item.size[0] / 2, item.size[1] / 2, item.size[2] / 2]}
        position={item.position}
        quaternion={item.colliderQuaternion}
      />
    );
  }
  // Tilted props (planks, awnings) keep a single box: the compound offsets
  // below only rotate about Y.
  if (item.rotation) {
    return (
      <CuboidCollider
        args={[item.size[0] / 2, item.size[1] / 2, item.size[2] / 2]}
        position={item.position}
        rotation={item.rotation}
      />
    );
  }
  const yaw = item.yaw ?? 0;
  return itemBoxes(item).map((box, index) => (
    <CuboidCollider
      key={index}
      args={box.half}
      position={rotateOffset(item.position, box.center, yaw)}
      rotation={[0, yaw, 0]}
    />
  ));
}

export default memo(function FurnitureColliders({ items }) {
  return (
    <RigidBody type="fixed" colliders={false}>
      {items.map((item) => item.collider !== false && !item.dynamic
        ? <ItemCollider key={item.id} item={item} />
        : null)}
    </RigidBody>
  );
});

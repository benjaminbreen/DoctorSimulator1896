import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { itemBoxes, rotateOffset } from '../physics/propBodies.js';

// Wireframe overlay of the fixed collider boxes, toggled live via
// showColliders. Dynamic pieces move, so their boxes are Rapier's to draw.
export default function ColliderDebug({ room, runtime }) {
  const groupRef = useRef();
  const boxes = [...room.wallBoxes, ...room.blockerBoxes];
  // Furniture may be several boxes; draw what the colliders actually are.
  for (const item of room.furnitureBoxes) {
    if (item.collider === false || item.dynamic) continue;
    if (item.shape || item.rotation || item.colliderQuaternion) {
      boxes.push(item);
      continue;
    }
    const yaw = item.yaw ?? 0;
    itemBoxes(item).forEach((box, index) => {
      boxes.push({
        id: `${item.id}:${index}`,
        position: rotateOffset(item.position, box.center, yaw),
        size: [box.half[0] * 2, box.half[1] * 2, box.half[2] * 2],
        yaw,
      });
    });
  }

  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = runtime.values.showColliders;
  });

  return (
    <group ref={groupRef} visible={false}>
      {boxes.map((box) => (
        <mesh
          key={box.id}
          position={box.position}
          rotation={box.colliderQuaternion ? undefined : [0, box.yaw ?? 0, 0]}
          quaternion={box.colliderQuaternion}
        >
          <boxGeometry args={box.size} />
          <meshBasicMaterial color="#3ddc84" wireframe depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

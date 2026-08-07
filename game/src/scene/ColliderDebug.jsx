import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

// Wireframe overlay of every collider box, toggled live via showColliders.
export default function ColliderDebug({ room, runtime }) {
  const groupRef = useRef();
  const boxes = [
    ...room.wallBoxes,
    ...room.blockerBoxes,
    ...room.furnitureBoxes.filter((item) => item.collider !== false),
  ];

  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = runtime.values.showColliders;
  });

  return (
    <group ref={groupRef} visible={false}>
      {boxes.map((box) => (
        <mesh key={box.id} position={box.position} rotation={[0, box.yaw ?? 0, 0]}>
          <boxGeometry args={box.size} />
          <meshBasicMaterial color="#3ddc84" wireframe depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

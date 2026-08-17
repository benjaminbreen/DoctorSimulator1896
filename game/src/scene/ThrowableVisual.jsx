import { CABBAGE_GEOMETRY } from './cabbageGeometry.js';
import { throwableDefinition } from '../world/throwables.js';

function AppleVisual({ definition, castShadow }) {
  return (
    <group scale={definition.visualScale}>
      <mesh scale={[1, 0.92, 1]} castShadow={castShadow}>
        <sphereGeometry args={[0.5, 10, 7]} />
        <meshStandardMaterial color={definition.color} roughness={0.48} />
      </mesh>
      <mesh position={[0.04, 0.52, 0]} rotation={[0, 0, -0.18]} castShadow={castShadow}>
        <cylinderGeometry args={[0.035, 0.045, 0.28, 6]} />
        <meshStandardMaterial color="#4f3821" roughness={0.82} />
      </mesh>
      <mesh position={[0.12, 0.55, 0]} rotation={[0.1, 0, -0.55]} scale={[0.2, 0.05, 0.1]}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshStandardMaterial color="#65763f" roughness={0.85} />
      </mesh>
    </group>
  );
}

// A paper folded once: two leaves at a slight angle, with a grey printed
// face so it reads as newsprint rather than a plank.
function NewspaperVisual({ definition, castShadow }) {
  return (
    <group scale={definition.visualScale}>
      {[-0.035, 0.035].map((offset, index) => (
        <mesh
          key={index}
          position={[0, offset, 0]}
          rotation={[0, 0, index === 0 ? 0.06 : -0.06]}
          castShadow={castShadow}
        >
          <boxGeometry args={[0.3, 0.012, 0.22]} />
          <meshStandardMaterial color={index === 0 ? '#b9ad8e' : definition.color} roughness={0.94} />
        </mesh>
      ))}
    </group>
  );
}

export default function ThrowableVisual({ type, castShadow = true }) {
  const definition = throwableDefinition(type);
  if (!definition) return null;
  if (definition.visual === 'cabbage') {
    return (
      <mesh geometry={CABBAGE_GEOMETRY} scale={definition.visualScale} castShadow={castShadow}>
        <meshStandardMaterial color={definition.color} vertexColors roughness={0.72} />
      </mesh>
    );
  }
  if (definition.visual === 'apple') return <AppleVisual definition={definition} castShadow={castShadow} />;
  if (definition.visual === 'newspaper') return <NewspaperVisual definition={definition} castShadow={castShadow} />;
  // A new round object can use the system without a scene component. Distinct
  // silhouettes can add another visual case when their art is ready.
  return (
    <mesh scale={definition.visualScale} castShadow={castShadow}>
      <sphereGeometry args={[0.5, 10, 7]} />
      <meshStandardMaterial color={definition.color ?? '#a79a7b'} roughness={0.7} />
    </mesh>
  );
}

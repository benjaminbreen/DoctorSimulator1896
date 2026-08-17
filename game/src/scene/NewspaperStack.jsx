import { useEffect, useState } from 'react';
import StaticColliders from './lib/StaticColliders.jsx';
import { NEWSPAPER_STACKS } from '../world/newspapers.js';
import { good } from '../world/goods.js';
import { removeThrowableSource, reportThrowableSource } from '../world/throwablePlay.js';
import { recordGrievance } from '../world/grievances.js';
import { raiseTheftOutcry } from '../world/outcry.js';

// A newsboy's papers, stacked on the pavement in front of him. Taking one is
// off his stock, so it costs him a paper and earns a grievance; buying one
// comes through the dialogue ribbon instead.

const SHEET = { width: 0.42, depth: 0.29, thickness: 0.018 };
const PAPER_COLORS = ['#cfc4a6', '#c8bc9d', '#d4c9ac'];

function Stack({ spec }) {
  const { id, ownerId, goodId, position, yaw, count } = spec;
  const [taken, setTaken] = useState(0);
  const remaining = Math.max(0, count - taken);
  const sourceId = `${id}:throwable`;
  const throwable = good(goodId)?.throwable ?? 'newspaper';
  const topY = position[1] + remaining * SHEET.thickness;

  useEffect(() => () => removeThrowableSource(sourceId), [sourceId]);

  useEffect(() => {
    if (remaining === 0) {
      removeThrowableSource(sourceId);
      return;
    }
    reportThrowableSource(sourceId, throwable, [position[0], topY, position[2]], () => {
      if (ownerId) recordGrievance(ownerId, 'theft');
      raiseTheftOutcry({ x: position[0], z: position[2], seed: remaining });
      setTaken((previous) => previous + 1);
      return true;
    });
  }, [ownerId, position, remaining, sourceId, throwable, topY]);

  if (remaining === 0) return null;

  const height = remaining * SHEET.thickness;
  return (
    <>
      <group position={position} rotation={[0, yaw, 0]}>
        {Array.from({ length: remaining }, (_, index) => (
          <mesh
            key={index}
            position={[
              ((index * 37) % 9 - 4) * 0.004,
              index * SHEET.thickness + SHEET.thickness / 2,
              ((index * 53) % 7 - 3) * 0.005,
            ]}
            rotation={[0, ((index * 29) % 11 - 5) * 0.012, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[SHEET.width, SHEET.thickness, SHEET.depth]} />
            <meshStandardMaterial color={PAPER_COLORS[index % PAPER_COLORS.length]} roughness={0.95} />
          </mesh>
        ))}
        {/* The twine round the bundle, so it reads as stock, not as litter. */}
        <mesh position={[0, height / 2, 0]} castShadow>
          <boxGeometry args={[0.016, height * 0.9, SHEET.depth + 0.01]} />
          <meshStandardMaterial color="#8c7a52" roughness={0.9} />
        </mesh>
      </group>
      {/* Collider entries are world-space, so this stays outside the group. */}
      <StaticColliders
        entries={[{
          type: 'box',
          p: [position[0], position[1] + height / 2, position[2]],
          size: [SHEET.width, height, SHEET.depth],
          yaw,
        }]}
      />
    </>
  );
}

export default function NewspaperStacks() {
  return NEWSPAPER_STACKS.map((spec) => <Stack key={spec.id} spec={spec} />);
}

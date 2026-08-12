import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CABBAGE_GEOMETRY } from './cabbageGeometry.js';

// The shape vocabulary a built prop is written in.
//
// Three renderers draw these items — the room, the props workbench and the
// instrument view — and they had a copy each. A cone that is a cylinder in one
// of them is the kind of bug nobody finds, so there is one of these now.

export default function PropShape({ item }) {
  const [sx, sy, sz] = item.size;
  const generated = useMemo(() => {
    if (item.shape === 'roundedBox') {
      const smallest = Math.min(sx, sy, sz);
      const radius = Math.min(item.bevelRadius ?? 0.008, smallest * 0.24);
      return new RoundedBoxGeometry(sx, sy, sz, item.bevelSegments ?? 2, radius);
    }
    if (item.shape === 'lathe') {
      const points = (item.profile ?? []).map(([radius, height]) => new THREE.Vector2(radius, height));
      return new THREE.LatheGeometry(points, item.radialSegments ?? 48);
    }
    return null;
  }, [item.shape, item.profile, item.radialSegments, item.bevelRadius, item.bevelSegments, sx, sy, sz]);

  useEffect(() => () => generated?.dispose(), [generated]);

  if (generated) return <primitive object={generated} attach="geometry" />;
  if (item.shape === 'cabbage') return <primitive object={CABBAGE_GEOMETRY} attach="geometry" />;
  if (item.shape === 'cylinder') return <cylinderGeometry args={[sx / 2, sx / 2, sy, item.radialSegments ?? 16]} />;
  if (item.shape === 'cylinderSector') {
    return (
      <cylinderGeometry
        args={[
          sx / 2,
          sx / 2,
          sy,
          item.radialSegments ?? 48,
          1,
          true,
          item.thetaStart ?? 0,
          item.thetaLength ?? Math.PI * 2,
        ]}
      />
    );
  }
  if (item.shape === 'frustum') return <cylinderGeometry args={[(item.topDiameter ?? sx) / 2, sx / 2, sy, item.radialSegments ?? 16]} />;
  if (item.shape === 'sphere') return <sphereGeometry args={[sx / 2, item.radialSegments ?? 18, 14]} />;
  if (item.shape === 'cone') return <coneGeometry args={[sx / 2, sy, item.radialSegments ?? 16]} />;
  // Rings: a dynamometer's spring, a binding post's collar, a drum hoop.
  // `size` is the outer diameter across x and z; `size[1]` the stock.
  if (item.shape === 'torus') return <torusGeometry args={[(sx - sy) / 2, sy / 2, 8, item.radialSegments ?? 24]} />;
  return <boxGeometry args={[sx, sy, sz]} />;
}

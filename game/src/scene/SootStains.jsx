import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { sootTexture } from './textures.js';

// The mark an open gas flame leaves on the ceiling above it. Every Victorian
// room that burned gas carried these, and their absence is one of the things
// that makes a reconstructed interior look scrubbed.
//
// A plume spreads as it rises, so a burner close under the ceiling leaves a
// small hard ring and one hung low leaves a wide soft cloud. Size and
// strength both come from that gap.

export default function SootStains({ room }) {
  const built = useMemo(() => {
    if (!room.ceiling || room.lightMarkers.length === 0) return null;
    const ceilingY = room.ceiling.position[1] - room.ceiling.size[1] / 2;
    const map = sootTexture();
    const group = new THREE.Group();
    const disposables = [];

    for (const marker of room.lightMarkers) {
      const gap = ceilingY - marker.position[1];
      // Fixtures at or above the ceiling line, and anything hung more than a
      // storey below it, are not making a mark worth drawing.
      if (gap < 0.15 || gap > 2.6) continue;
      const width = THREE.MathUtils.clamp(0.7 + gap * 1.15, 0.7, 3.2);
      const material = new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        // Fainter the further the plume has had to travel.
        opacity: THREE.MathUtils.clamp(1.1 - gap * 0.3, 0.35, 1),
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(marker.position[0], ceilingY - 0.012, marker.position[2]);
      mesh.renderOrder = 1;
      group.add(mesh);
      disposables.push(mesh.geometry, material);
    }

    return { group, disposables };
  }, [room]);

  useEffect(() => {
    if (!built) return undefined;
    return () => {
      for (const item of built.disposables) item.dispose();
    };
  }, [built]);

  if (!built) return null;
  return <primitive object={built.group} />;
}

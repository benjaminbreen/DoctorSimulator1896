import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// The plaster rose a gasolier hangs from. Concentric runs of moulding
// stepping down to a central boss — the one piece of ceiling ornament
// anybody in the room actually looks at, because the light hangs off it.
//
// Only for fixtures hung under the ceiling and standing clear of the walls.
// A bracket on the wall is fed from the wall, and never had one.

const CEILING_GAP = 1.5;
const WALL_CLEARANCE = 1.2;

export default function CeilingRose({ room, lighting }) {
  const built = useMemo(() => {
    if (!room.ceiling || room.lightMarkers.length === 0) return null;
    const ceilingY = room.ceiling.position[1] - room.ceiling.size[1] / 2;
    const half = [room.floor.size[0] / 2, 0, room.floor.size[2] / 2];
    const color = lighting.materials.ceiling ?? '#eef0ed';
    const group = new THREE.Group();
    const disposables = [];

    // One material for every ring: plaster, whitened with the ceiling.
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    disposables.push(material);

    let placed = 0;
    for (const marker of room.lightMarkers) {
      const gap = ceilingY - marker.position[1];
      if (gap < 0.1 || gap > CEILING_GAP) continue;
      const inset = Math.min(
        half[0] - Math.abs(marker.position[0] - room.floor.position[0]),
        half[2] - Math.abs(marker.position[2] - room.floor.position[2]),
      );
      if (inset < WALL_CLEARANCE) continue;

      // A tall room carried a bigger rose.
      const scale = THREE.MathUtils.clamp(0.6 + (ceilingY - room.floor.position[1]) * 0.09, 0.6, 1.4);
      const node = new THREE.Group();
      node.position.set(marker.position[0], ceilingY, marker.position[2]);

      // Rings, widest and shallowest first, stepping down to the boss.
      const rings = [
        [0.55, 0.05, 24],
        [0.41, 0.07, 20],
        [0.27, 0.06, 16],
        [0.15, 0.05, 12],
      ];
      let drop = 0;
      for (const [radius, depth, segments] of rings) {
        const thickness = depth * scale;
        const geometry = new THREE.CylinderGeometry(
          radius * scale, radius * scale * 0.93, thickness, segments,
        );
        const mesh = new THREE.Mesh(geometry, material);
        // Each ring hangs a little below the one outside it; they overlap
        // by half so no gap opens between the steps.
        mesh.position.y = -drop - thickness / 2;
        drop += thickness * 0.5;
        node.add(mesh);
        disposables.push(geometry);
      }

      // Central boss the drop rod comes through.
      const boss = new THREE.SphereGeometry(0.1 * scale, 10, 8);
      const bossMesh = new THREE.Mesh(boss, material);
      bossMesh.position.y = -drop - 0.04 * scale;
      bossMesh.scale.set(1, 0.7, 1);
      node.add(bossMesh);
      disposables.push(boss);

      group.add(node);
      placed += 1;
    }

    if (placed === 0) {
      material.dispose();
      return null;
    }
    return { group, disposables };
  }, [room, lighting]);

  useEffect(() => {
    if (!built) return undefined;
    return () => {
      for (const item of built.disposables) item.dispose();
    };
  }, [built]);

  if (!built) return null;
  return <primitive object={built.group} />;
}

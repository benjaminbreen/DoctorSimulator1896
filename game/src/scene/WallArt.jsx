import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { printTexture } from './textures.js';

// Framed prints and diplomas. The Victorian pack's painting carries a modern
// colour photograph, which dates a room to the wrong century the moment you
// look at it, so what hangs on these walls is drawn here instead: a gilt or
// walnut moulding, a mount, and a plate under glass.
//
// Placements are furniture items with `kind: 'wallArt'`. `art` picks the
// plate ('diploma' or 'engraving'); yaw turns the frame to face the room.

const MOULDINGS = {
  gilt: { color: '#b08a3c', roughness: 0.42, metalness: 0.55 },
  walnut: { color: '#4a3121', roughness: 0.6, metalness: 0.1 },
  ebony: { color: '#241c15', roughness: 0.5, metalness: 0.1 },
};

export default function WallArt({ items }) {
  const built = useMemo(() => {
    const frames = items.filter((item) => item.kind === 'wallArt');
    if (frames.length === 0) return null;
    const group = new THREE.Group();
    const disposables = [];

    frames.forEach((item, index) => {
      const [width, height] = item.size;
      const art = item.art ?? 'engraving';
      // A diploma was framed narrow and dark; a print took a wide gilt
      // moulding with a mount inside it.
      const diploma = art === 'diploma';
      const rail = diploma ? 0.035 : 0.055;
      const mount = diploma ? 0.02 : 0.06;
      const spec = MOULDINGS[item.moulding ?? (diploma ? 'ebony' : 'gilt')];

      const node = new THREE.Group();
      node.position.set(...item.position);
      node.rotation.set(item.pitch ?? 0, item.yaw ?? 0, 0);
      // `moulding: 'none'` is the unframed case — a newspaper left on a
      // table, laid flat with pitch -PI/2. Plate only, no rails, no mount.
      if (item.moulding === 'none') {
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshStandardMaterial({
          map: printTexture(art, item.seed ?? index * 7),
          roughness: 0.85,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = false;
        node.add(mesh);
        disposables.push(geometry, material);
        group.add(node);
        return;
      }

      const frameMaterial = new THREE.MeshStandardMaterial(spec);
      disposables.push(frameMaterial);
      // Four rails mitred round the opening, standing off the wall.
      const runs = [
        [0, height / 2 - rail / 2, width, rail],
        [0, -height / 2 + rail / 2, width, rail],
        [-width / 2 + rail / 2, 0, rail, height - rail * 2],
        [width / 2 - rail / 2, 0, rail, height - rail * 2],
      ];
      for (const [x, y, sx, sy] of runs) {
        const geometry = new THREE.BoxGeometry(sx, sy, 0.045);
        const mesh = new THREE.Mesh(geometry, frameMaterial);
        mesh.position.set(x, y, 0.022);
        // No shadow: a rail sits six millimetres in front of the plate, and
        // at the interior shadow radius its own shadow smears across the
        // whole picture and blacks it out.
        mesh.castShadow = false;
        node.add(mesh);
        disposables.push(geometry);
      }

      // Mount board, then the plate itself set back inside it.
      if (mount > 0.03) {
        const geometry = new THREE.PlaneGeometry(width - rail * 2, height - rail * 2);
        const material = new THREE.MeshStandardMaterial({ color: '#e6dfcc', roughness: 0.95 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = 0.012;
        node.add(mesh);
        disposables.push(geometry, material);
      }

      const plateW = width - rail * 2 - mount * 2;
      const plateH = height - rail * 2 - mount * 2;
      const geometry = new THREE.PlaneGeometry(Math.max(plateW, 0.05), Math.max(plateH, 0.05));
      const material = new THREE.MeshStandardMaterial({
        map: printTexture(art, item.seed ?? index * 7),
        roughness: 0.55,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = 0.016;
      mesh.receiveShadow = false;
      node.add(mesh);
      disposables.push(geometry, material);

      // Cord to the picture rail, if the placement says where the rail is.
      if (item.railY != null) {
        const rise = item.railY - (item.position[1] + height / 2);
        if (rise > 0.05) {
          const cordMaterial = new THREE.MeshStandardMaterial({ color: '#4a3a24', roughness: 0.9 });
          disposables.push(cordMaterial);
          for (const side of [-1, 1]) {
            const drop = new THREE.Mesh(new THREE.BoxGeometry(0.012, rise * 1.06, 0.012), cordMaterial);
            // Cords splay out from one hook, which is what makes them read as
            // hung rather than glued to the wall.
            drop.position.set(side * width * 0.3, height / 2 + rise / 2, 0.02);
            drop.rotation.z = side * Math.atan2(width * 0.3, rise);
            node.add(drop);
            disposables.push(drop.geometry);
          }
        }
      }

      group.add(node);
    });

    return { group, disposables };
  }, [items]);

  useEffect(() => {
    if (!built) return undefined;
    return () => {
      for (const item of built.disposables) item.dispose();
    };
  }, [built]);

  if (!built) return null;
  return <primitive object={built.group} />;
}

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { damaskTexture } from './textures.js';

// Door curtains. An 1890s interior hung a portière over any doorway left
// open between rooms; this builds one over every opening whose blueprint
// entry carries `portiere`. Two heavy panels tied back at the jambs, a
// gathered valance across the head, a pole above the casing — the same
// fabric language as the window curtains, so the room reads as one scheme.

// A hung panel pulled to its jamb: pleated on a sine like the window
// panels, but waisted where the tie-back cinches it, flaring again below.
function tiedPanel(width, height, folds, depth, tie) {
  const geometry = new THREE.PlaneGeometry(width, height, folds * 4, 12);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const t = (position.getY(i) + height / 2) / height; // 0 hem, 1 head
    let spread;
    if (t > tie) {
      const up = (t - tie) / (1 - tie);
      spread = 0.45 + 0.55 * up ** 1.4;
    } else {
      const down = (tie - t) / tie;
      spread = 0.45 + 0.4 * down ** 1.7;
    }
    const phase = ((x + width / 2) / width) * folds * Math.PI * 2;
    position.setX(i, x * spread);
    // Folds deepen toward the hem, where the cloth hangs loose.
    position.setZ(i, Math.sin(phase) * depth * (0.55 + 0.45 * (1 - t)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// The valance gathers evenly and bows toward the room.
function gatheredValance(width, height, folds, depth) {
  const geometry = new THREE.PlaneGeometry(width, height, folds * 4, 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const t = (position.getY(i) + height / 2) / height;
    const phase = ((x + width / 2) / width) * folds * Math.PI * 2;
    position.setZ(i, Math.sin(phase) * depth * (0.5 + 0.5 * (1 - t)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export default function Portiere({ holes }) {
  const built = useMemo(() => {
    const group = new THREE.Group();
    const disposables = [];
    const keep = (object) => {
      disposables.push(object.geometry, object.material);
      return object;
    };

    for (const hole of holes) {
      if (!hole.portiere) continue;
      const damask = damaskTexture();
      const color = hole.portiere.color ?? '#4a6152';
      const inward = 0.14;

      const node = new THREE.Group();
      node.position.set(
        hole.position[0] - hole.normal[0] * inward,
        hole.position[1],
        hole.position[2] - hole.normal[2] * inward,
      );
      node.rotation.y = Math.atan2(-hole.normal[0], -hole.normal[2]);

      const top = hole.height / 2;
      const rodY = top + 0.18;

      // Pole and finials in brass, sitting above the head casing.
      const rod = keep(new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, hole.width * 1.24, 10),
        new THREE.MeshStandardMaterial({ color: '#8a6b3a', roughness: 0.4, metalness: 0.55 }),
      ));
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, rodY, 0.12);
      node.add(rod);
      for (const side of [-1, 1]) {
        const finial = keep(new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 10, 8),
          new THREE.MeshStandardMaterial({ color: '#8a6b3a', roughness: 0.4, metalness: 0.55 }),
        ));
        finial.position.set(side * hole.width * 0.62, rodY, 0.12);
        node.add(finial);
      }

      // Panels: hung from the rod to the floor, tied back at each jamb so
      // the opening — and the room beyond it — stays visible between them.
      const panelW = hole.width * 0.56;
      // Hung from just under the rod (rodY - 0.05) down to the floor at
      // -height/2: any longer and the hem clips through the boards.
      const panelH = hole.height + 0.12;
      const tie = 0.44;
      for (const side of [-1, 1]) {
        const geometry = tiedPanel(panelW, panelH, 5, 0.06, tie);
        const material = new THREE.MeshStandardMaterial({
          map: damask, color, roughness: 0.92, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(side * (hole.width / 2 - panelW * 0.2), rodY - 0.05 - panelH / 2, 0.1);
        mesh.castShadow = true;
        node.add(mesh);
        disposables.push(geometry, material);

        // Tie cord at the waist.
        const cord = keep(new THREE.Mesh(
          new THREE.TorusGeometry(panelW * 0.26, 0.02, 6, 12),
          new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.5, metalness: 0.3 }),
        ));
        cord.position.set(
          side * (hole.width / 2 - panelW * 0.2),
          rodY - 0.05 - panelH * (1 - tie),
          0.12,
        );
        cord.rotation.y = Math.PI / 2;
        node.add(cord);
      }

      // Valance across the head, fringed in the same gold as the cords.
      const valanceGeometry = gatheredValance(hole.width * 1.18, 0.38, 8, 0.045);
      const valanceMaterial = new THREE.MeshStandardMaterial({
        map: damask,
        color: new THREE.Color(color).multiplyScalar(0.9),
        roughness: 0.92,
        side: THREE.DoubleSide,
      });
      const valance = new THREE.Mesh(valanceGeometry, valanceMaterial);
      valance.position.set(0, rodY - 0.14, 0.13);
      valance.castShadow = true;
      node.add(valance);
      disposables.push(valanceGeometry, valanceMaterial);

      const fringe = keep(new THREE.Mesh(
        new THREE.PlaneGeometry(hole.width * 1.18, 0.05),
        new THREE.MeshStandardMaterial({
          color: '#c8a24a', roughness: 0.8, metalness: 0.15, side: THREE.DoubleSide,
        }),
      ));
      fringe.position.set(0, rodY - 0.35, 0.14);
      node.add(fringe);

      group.add(node);
    }

    return { group, disposables };
  }, [holes]);

  useEffect(
    () => () => {
      for (const item of built.disposables) item.dispose();
    },
    [built],
  );

  return <primitive object={built.group} />;
}

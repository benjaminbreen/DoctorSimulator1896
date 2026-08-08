import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { laceTexture, damaskTexture } from './textures.js';

// Window dressing for generated interiors. A period parlor window carried
// three layers: lace or muslin against the glass, heavy over-curtains at
// each side, and a valance across the head. Curtains also soften the window
// light, which is what stops a sash reading as a hole cut in the wall.
//
// Panels are pleated by displacing a plane's vertices on a sine, so a fold
// costs a handful of triangles rather than a cloth simulation.

const TREATMENTS = {
  humble: { lace: true, heavy: false, valance: false, colors: ['#8d8674'] },
  middling: { lace: true, heavy: true, valance: false, colors: ['#6d4038', '#42513f', '#4a4258'] },
  grand: { lace: true, heavy: true, valance: true, colors: ['#6b2b2a', '#2f4a44', '#5b4420', '#452f52'] },
};

function hash01(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// A plane with vertical pleats: x is folded on a sine, and z pushed out at
// the fold crests so the panel has depth from the side.
function pleatedPanel(width, height, folds, depth) {
  const geometry = new THREE.PlaneGeometry(width, height, folds * 4, 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const phase = ((x + width / 2) / width) * folds * Math.PI * 2;
    position.setZ(i, Math.sin(phase) * depth);
    // Gather the fabric slightly toward the top, as a hung curtain does.
    const t = (position.getY(i) + height / 2) / height;
    position.setX(i, x * (0.9 + 0.1 * (1 - t)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export default function Curtains({ holes, wealth = 'middling', seed = 0 }) {
  const built = useMemo(() => {
    const treatment = TREATMENTS[wealth] ?? TREATMENTS.middling;
    const lace = laceTexture();
    const damask = damaskTexture();
    const group = new THREE.Group();
    const disposables = [];

    holes.forEach((hole, index) => {
      if (hole.type !== 'window') return;
      const roll = hash01(seed + index * 7.3);
      const yaw = Math.atan2(-hole.normal[0], -hole.normal[2]);
      const rod = hole.height / 2 + 0.22;
      const inward = 0.14;

      const node = new THREE.Group();
      node.position.set(
        hole.position[0] - hole.normal[0] * inward,
        hole.position[1],
        hole.position[2] - hole.normal[2] * inward,
      );
      node.rotation.y = yaw;

      // Lace sheer across the whole opening.
      if (treatment.lace) {
        const geometry = pleatedPanel(hole.width * 1.02, hole.height * 0.98, 7, 0.02);
        // Veiling, not blocking: the net has to read as fabric without
        // drowning the view and the sky colour behind it.
        const material = new THREE.MeshStandardMaterial({
          map: lace, color: '#f6f1e4', transparent: true, opacity: 0.5,
          alphaTest: 0.06, depthWrite: false,
          side: THREE.DoubleSide, roughness: 0.95,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.z = 0.02;
        node.add(mesh);
        disposables.push(geometry, material);
      }

      // Heavy panels at each jamb, tied back so the glass stays visible.
      if (treatment.heavy) {
        const color = treatment.colors[Math.floor(roll * treatment.colors.length) % treatment.colors.length];
        const panelW = hole.width * 0.34;
        const panelH = hole.height + 0.5;
        for (const side of [-1, 1]) {
          const geometry = pleatedPanel(panelW, panelH, 4, 0.05);
          const material = new THREE.MeshStandardMaterial({
            map: damask, color, roughness: 0.92, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(side * (hole.width / 2 - panelW * 0.32), -0.12, 0.09);
          mesh.castShadow = true;
          node.add(mesh);
          disposables.push(geometry, material);

          // Tie-back cord at sill height.
          const cord = new THREE.Mesh(
            new THREE.TorusGeometry(panelW * 0.3, 0.018, 6, 12),
            new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.5, metalness: 0.3 }),
          );
          cord.position.set(side * (hole.width / 2 - panelW * 0.32), -hole.height * 0.18, 0.11);
          cord.rotation.y = Math.PI / 2;
          node.add(cord);
          disposables.push(cord.geometry, cord.material);
        }
      }

      // Valance and rod across the head.
      if (treatment.valance) {
        const color = treatment.colors[Math.floor(roll * treatment.colors.length) % treatment.colors.length];
        const geometry = pleatedPanel(hole.width * 1.12, 0.34, 9, 0.03);
        const material = new THREE.MeshStandardMaterial({
          map: damask, color, roughness: 0.92, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, rod - 0.16, 0.12);
        node.add(mesh);
        disposables.push(geometry, material);
      }
      if (treatment.heavy) {
        const rodMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, hole.width * 1.2, 8),
          new THREE.MeshStandardMaterial({ color: '#6a5330', roughness: 0.45, metalness: 0.55 }),
        );
        rodMesh.rotation.z = Math.PI / 2;
        rodMesh.position.set(0, rod, 0.11);
        node.add(rodMesh);
        disposables.push(rodMesh.geometry, rodMesh.material);
      }

      group.add(node);
    });

    return { group, disposables };
  }, [holes, wealth, seed]);

  useEffect(
    () => () => {
      for (const item of built.disposables) item.dispose();
    },
    [built],
  );

  return <primitive object={built.group} />;
}

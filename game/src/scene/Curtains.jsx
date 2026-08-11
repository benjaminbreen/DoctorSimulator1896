import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { laceTexture, damaskTexture, hollandTexture } from './textures.js';

// Window dressing for interiors. What hangs where is decided in
// `world/windowDressing.js`; this file only builds it. A period window
// carried up to four layers, front to back: a spring roller shade or a
// wooden Venetian blind inside the reveal, a lace sheer across the
// opening, heavy over-curtains at each jamb, and a valance at the head.
// Curtains also soften the window light, which is what stops a sash
// reading as a hole cut in the wall.
//
// Panels are pleated by displacing a plane's vertices on a sine, so a fold
// costs a handful of triangles rather than a cloth simulation.

// Wide-slat wood, the 1890s kind: about two and a half inches, hung on
// cloth tapes rather than the modern cord ladder.
const SLAT_DEPTH = 0.055;
const SLAT_PITCH = 0.048;
const SLAT_THICKNESS = 0.005;
const SLAT_LIMIT = 60;

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

export default function Curtains({ holes, dressing }) {
  const built = useMemo(() => {
    const lace = laceTexture();
    const damask = damaskTexture();
    const holland = hollandTexture();
    const group = new THREE.Group();
    const disposables = [];
    const keep = (object) => {
      disposables.push(object.geometry, object.material);
      return object;
    };

    holes.forEach((hole, index) => {
      if (hole.type !== 'window') return;
      const plan = dressing?.get(hole.id);
      if (!plan) return;
      const roll = hash01(index * 7.3 + hole.width);
      const rod = hole.height / 2 + 0.22;
      const inward = 0.14;
      // Local z runs into the room; the inner wall face sits here, and the
      // shade and blind mount behind it, up in the reveal.
      const face = hole.thickness / 2 - inward;

      const node = new THREE.Group();
      node.position.set(
        hole.position[0] - hole.normal[0] * inward,
        hole.position[1],
        hole.position[2] - hole.normal[2] * inward,
      );
      node.rotation.y = Math.atan2(-hole.normal[0], -hole.normal[2]);

      // Spring roller shade against the glass: a roller at the head, the
      // cloth hanging as far as it was left, a hem bar and a ring pull.
      if (plan.shade) {
        const shadeZ = face - 0.075;
        const width = hole.width * 0.94;
        const top = hole.height / 2 - 0.05;

        const roller = keep(new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, width, 8),
          new THREE.MeshStandardMaterial({ color: '#6b573a', roughness: 0.8 }),
        ));
        roller.rotation.z = Math.PI / 2;
        roller.position.set(0, top, shadeZ);
        node.add(roller);

        const drop = Math.max(0.06, plan.shade.drop * hole.height);
        const cloth = keep(new THREE.Mesh(
          new THREE.PlaneGeometry(width, drop),
          new THREE.MeshStandardMaterial({
            map: holland, color: '#e6dcc2', roughness: 0.95,
            side: THREE.DoubleSide,
          }),
        ));
        cloth.position.set(0, top - drop / 2, shadeZ + 0.03);
        node.add(cloth);

        const hem = keep(new THREE.Mesh(
          new THREE.BoxGeometry(width, 0.028, 0.016),
          new THREE.MeshStandardMaterial({ color: '#5d4c33', roughness: 0.7 }),
        ));
        hem.position.set(0, top - drop, shadeZ + 0.03);
        node.add(hem);

        const ring = keep(new THREE.Mesh(
          new THREE.TorusGeometry(0.022, 0.005, 4, 10),
          new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.5, metalness: 0.4 }),
        ));
        ring.position.set(0, top - drop - 0.035, shadeZ + 0.03);
        node.add(ring);
      }

      // Wooden Venetian blind: slats over the covered span, the rest
      // stacked under the head rail, on two cloth tapes.
      if (plan.blind) {
        const blindZ = face - 0.032;
        const width = hole.width * 0.9;
        const top = hole.height / 2 - 0.07;
        const angle = (1 - plan.blind.tilt) * 1.2;
        const full = Math.floor((hole.height - 0.16) / SLAT_PITCH);
        const shown = Math.min(SLAT_LIMIT, Math.max(1, Math.round(full * plan.blind.drop)));
        const covered = shown * SLAT_PITCH;

        const rail = keep(new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.03, 0.05, SLAT_DEPTH + 0.01),
          new THREE.MeshStandardMaterial({ color: '#7a6242', roughness: 0.75 }),
        ));
        rail.position.set(0, top + 0.05, blindZ);
        node.add(rail);

        const slatGeometry = new THREE.BoxGeometry(width, SLAT_THICKNESS, SLAT_DEPTH);
        const slatMaterial = new THREE.MeshStandardMaterial({ color: '#8a6f4a', roughness: 0.7 });
        const slats = new THREE.InstancedMesh(slatGeometry, slatMaterial, shown);
        const matrix = new THREE.Matrix4();
        const euler = new THREE.Euler(angle, 0, 0);
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3(1, 1, 1);
        for (let i = 0; i < shown; i += 1) {
          position.set(0, top - 0.03 - i * SLAT_PITCH, blindZ);
          matrix.compose(position, quaternion, scale);
          slats.setMatrixAt(i, matrix);
        }
        slats.instanceMatrix.needsUpdate = true;
        slats.castShadow = true;
        node.add(slats);
        disposables.push(slatGeometry, slatMaterial);

        // Slats drawn up bunch under the rail rather than vanishing.
        const stacked = Math.max(0, full - shown);
        if (stacked > 2) {
          const stack = keep(new THREE.Mesh(
            new THREE.BoxGeometry(width, Math.min(0.2, stacked * 0.011), SLAT_DEPTH),
            new THREE.MeshStandardMaterial({ color: '#7f6544', roughness: 0.75 }),
          ));
          stack.position.set(0, top + 0.01, blindZ);
          node.add(stack);
        }

        const bottom = keep(new THREE.Mesh(
          new THREE.BoxGeometry(width + 0.01, 0.022, SLAT_DEPTH),
          new THREE.MeshStandardMaterial({ color: '#6b5436', roughness: 0.7 }),
        ));
        bottom.position.set(0, top - 0.03 - covered, blindZ);
        node.add(bottom);

        for (const side of [-1, 1]) {
          const tape = keep(new THREE.Mesh(
            new THREE.BoxGeometry(0.022, covered + 0.09, 0.004),
            new THREE.MeshStandardMaterial({ color: '#c9bda0', roughness: 0.9 }),
          ));
          tape.position.set(side * width * 0.27, top - covered / 2, blindZ - SLAT_DEPTH / 2 - 0.004);
          node.add(tape);
        }
      }

      // Lace sheer across the whole opening.
      if (plan.lace) {
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
      // A working room takes narrower ones, hung to the sill.
      if (plan.heavy) {
        const narrow = plan.role === 'office';
        const panelW = hole.width * (narrow ? 0.26 : 0.34);
        const panelH = hole.height + (narrow ? 0.2 : 0.5);
        for (const side of [-1, 1]) {
          const geometry = pleatedPanel(panelW, panelH, 4, 0.05);
          const material = new THREE.MeshStandardMaterial({
            map: damask, color: plan.color, roughness: 0.92, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(side * (hole.width / 2 - panelW * 0.32), -0.12, 0.09);
          mesh.castShadow = true;
          node.add(mesh);
          disposables.push(geometry, material);

          // Tie-back cord at sill height.
          const cord = keep(new THREE.Mesh(
            new THREE.TorusGeometry(panelW * 0.3, 0.018, 6, 12),
            new THREE.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.5, metalness: 0.3 }),
          ));
          cord.position.set(side * (hole.width / 2 - panelW * 0.32), -hole.height * 0.18, 0.11);
          cord.rotation.y = Math.PI / 2;
          node.add(cord);
        }
      }

      // Valance across the head, with a fringe below it in a grand room.
      if (plan.valance) {
        const geometry = pleatedPanel(hole.width * 1.12, 0.34, 9, 0.03);
        const material = new THREE.MeshStandardMaterial({
          map: damask, color: plan.color, roughness: 0.92, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, rod - 0.16, 0.12);
        node.add(mesh);
        disposables.push(geometry, material);

        const fringe = keep(new THREE.Mesh(
          new THREE.PlaneGeometry(hole.width * 1.12, 0.05),
          new THREE.MeshStandardMaterial({
            color: '#c8a24a', roughness: 0.8, metalness: 0.15, side: THREE.DoubleSide,
          }),
        ));
        fringe.position.set(0, rod - 0.35, 0.13);
        node.add(fringe);
      }

      // The pole shows only where there is something hung from it.
      if (plan.heavy || plan.valance) {
        const rodMesh = keep(new THREE.Mesh(
          new THREE.CylinderGeometry(0.022, 0.022, hole.width * 1.2, 8),
          new THREE.MeshStandardMaterial({ color: '#6a5330', roughness: 0.45, metalness: 0.55 }),
        ));
        rodMesh.rotation.z = Math.PI / 2;
        rodMesh.position.set(0, rod, 0.11);
        node.add(rodMesh);
      }

      // A hint of variety in the fabric tone between windows.
      node.traverse((child) => {
        if (child.material?.map === damask) child.material.color.multiplyScalar(0.94 + roll * 0.12);
      });

      group.add(node);
    });

    return { group, disposables };
  }, [holes, dressing]);

  useEffect(
    () => () => {
      for (const item of built.disposables) item.dispose();
    },
    [built],
  );

  return <primitive object={built.group} />;
}

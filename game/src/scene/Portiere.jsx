import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { damaskTexture } from './textures.js';
import { gameDebug } from '../debug.js';
import { curtainContactOffset, stepMaterialSpring } from '../world/materialResponse.js';
import { playSfx } from '../audio/sound.js';

// Door curtains. An 1890s interior hung a portière over any doorway left
// open between rooms; this builds one over every opening whose blueprint
// entry carries `portiere`. Two heavy panels tied back at the jambs, a
// gathered valance across the head, a pole above the casing — the same
// fabric language as the window curtains, so the room reads as one scheme.

// A hung panel pulled to its jamb: pleated on a sine like the window
// panels, but waisted where the tie-back cinches it, flaring again below.
function tiedPanel(width, height, folds, depth, tie) {
  const geometry = new THREE.PlaneGeometry(width, height, folds * 4, 24);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    let t = (position.getY(i) + height / 2) / height; // 0 hem, 1 head
    if (Math.abs(t - tie) < 1 / 48) t = tie;
    position.setY(i, (t - 0.5) * height);
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
    const panels = [];
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
        mesh.name = `portiere-${hole.id}-${side}`;
        mesh.userData.materialResponse = { kind: 'curtain', contact: false, displacement: 0 };
        node.add(mesh);
        geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
        geometry.computeBoundingSphere();
        geometry.boundingSphere.radius += 0.6;
        panels.push({
          mesh, tie, panelH, rest: geometry.attributes.position.array.slice(),
          springs: Array.from({ length: geometry.attributes.position.count }, () => ({ value: 0, velocity: 0 })),
          targets: new Float32Array(geometry.attributes.position.count),
          smoothed: new Float32Array(geometry.attributes.position.count),
          direction: 1, lastPlayer: new THREE.Vector3(Infinity, 0, 0), soundAfter: 0,
        });
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

    return { group, disposables, panels, player: new THREE.Vector3() };
  }, [holes]);

  useFrame(({ clock }, delta) => {
    const player = gameDebug.player;
    const height = player.posture === 'prone' ? 0.5
      : 2 * ((gameDebug.tuning?.capsuleHalfHeight ?? 0.56) + (gameDebug.tuning?.capsuleRadius ?? 0.28));
    const radius = (gameDebug.tuning?.capsuleRadius ?? 0.28) + 0.04;
    for (const panel of built.panels) {
      const local = panel.mesh.worldToLocal(built.player.fromArray(player.position));
      const jumped = local.distanceTo(panel.lastPlayer) > 1.5;
      if (Math.abs(local.z) > radius + 0.15) panel.direction = local.z < 0 ? 1 : -1;
      const localPlayer = [local.x, local.y, local.z];
      const response = panel.mesh.userData.materialResponse;
      if (Math.hypot(local.x, local.z) > 2 && response.displacement === 0) {
        panel.lastPlayer.copy(local);
        continue;
      }
      const positions = panel.mesh.geometry.attributes.position;
      let peak = 0;
      let contact = false;
      let changed = false;
      for (let i = 0; i < positions.count; i += 1) {
        const x = panel.rest[i * 3];
        const y = panel.rest[i * 3 + 1];
        const z = panel.rest[i * 3 + 2];
        panel.targets[i] = jumped ? 0 : curtainContactOffset(
          x, y, z, localPlayer, height, radius,
          panel.direction, panel.tie, panel.panelH,
        );
        contact ||= Math.abs(panel.targets[i]) > 0.001;
      }
      // Spread pressure into neighbouring folds. Independent vertex motion
      // makes a hard crease at the top of the character's head.
      const columns = panel.mesh.geometry.parameters.widthSegments + 1;
      for (let pass = 0; pass < 3; pass += 1) {
        for (let i = 0; i < positions.count; i += 1) {
          const t = (panel.rest[i * 3 + 1] + panel.panelH / 2) / panel.panelH;
          const pinned = Math.abs(t - panel.tie) < 0.001 || t > 0.999;
          const left = i % columns > 0 ? i - 1 : i;
          const right = i % columns < columns - 1 ? i + 1 : i;
          const above = i >= columns ? i - columns : i;
          const below = i + columns < positions.count ? i + columns : i;
          panel.smoothed[i] = pinned ? 0 : (4 * panel.targets[i] + panel.targets[left]
            + panel.targets[right] + panel.targets[above] + panel.targets[below]) / 8;
        }
        panel.targets.set(panel.smoothed);
      }
      for (let i = 0; i < positions.count; i += 1) {
        const x = panel.rest[i * 3];
        const z = panel.rest[i * 3 + 2];
        const spring = panel.springs[i];
        if (jumped) { spring.value = 0; spring.velocity = 0; }
        const offset = stepMaterialSpring(spring, panel.targets[i], delta, 85, 9, 0.55);
        changed ||= Math.abs(positions.getZ(i) - z - offset) > 0.000001;
        positions.setZ(i, z + offset);
        // Fabric spreads a little at the jamb as the body carries it through.
        positions.setX(i, x + Math.sign(panel.mesh.position.x) * Math.abs(offset) * 0.12);
        peak = Math.max(peak, Math.abs(offset));
      }
      if (changed) {
        positions.needsUpdate = true;
        panel.mesh.geometry.computeVertexNormals();
      }
      Object.assign(panel.mesh.userData.materialResponse, { contact, displacement: peak, direction: panel.direction });
      if (contact && Math.hypot(...player.velocity) > 0.2 && clock.elapsedTime > panel.soundAfter) {
        playSfx('cloth-brush', 0.3 + Math.min(0.6, Math.hypot(...player.velocity) * 0.12));
        panel.soundAfter = clock.elapsedTime + 0.65;
      }
      panel.lastPlayer.copy(local);
    }
  });

  useEffect(
    () => () => {
      for (const item of built.disposables) item.dispose();
    },
    [built],
  );

  return <primitive object={built.group} />;
}

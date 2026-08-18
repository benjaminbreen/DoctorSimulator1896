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
  'victorian-brass': { color: '#b9913e', roughness: 0.2, metalness: 0.88, envMapIntensity: 1.65 },
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
      // A diploma and a tenant directory were framed close to their plate; a
      // print took a wide gilt moulding with a mount inside it.
      const diploma = art === 'diploma';
      const ornateBrass = item.frameStyle === 'victorian-brass';
      // A canvas painting sits close in its gilt frame; only prints get the
      // wide paper mount.
      const closeMounted = diploma || art === 'directory' || art === 'painting';
      const rail = item.frameRail ?? (diploma ? 0.035 : 0.055);
      const mount = item.mount ?? (closeMounted ? 0.02 : 0.06);
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
        const geometry = new THREE.BoxGeometry(sx, sy, ornateBrass ? 0.065 : 0.045);
        const mesh = new THREE.Mesh(geometry, frameMaterial);
        mesh.position.set(x, y, ornateBrass ? 0.032 : 0.022);
        // No shadow: a rail sits six millimetres in front of the plate, and
        // at the interior shadow radius its own shadow smears across the
        // whole picture and blacks it out.
        mesh.castShadow = false;
        node.add(mesh);
        disposables.push(geometry);
      }

      if (ornateBrass) {
        const agedBrass = new THREE.MeshStandardMaterial({
          color: '#6f5424', roughness: 0.38, metalness: 0.82, envMapIntensity: 1.25,
        });
        const highlightBrass = new THREE.MeshStandardMaterial({
          color: '#d2ad57', roughness: 0.14, metalness: 0.92, envMapIntensity: 1.9,
        });
        disposables.push(agedBrass, highlightBrass);

        // A stepped Victorian profile: a dark recessed course just inside
        // the broad outer rail, then a fine polished bead against the mount.
        const addInsetRuns = (inset, stock, depth, material) => {
          const innerW = width - inset * 2;
          const innerH = height - inset * 2;
          const insetRuns = [
            [0, innerH / 2, innerW, stock],
            [0, -innerH / 2, innerW, stock],
            [-innerW / 2, 0, stock, innerH],
            [innerW / 2, 0, stock, innerH],
          ];
          for (const [x, y, sx, sy] of insetRuns) {
            const geometry = new THREE.BoxGeometry(sx, sy, depth);
            const moulding = new THREE.Mesh(geometry, material);
            moulding.position.set(x, y, 0.055 + depth / 2);
            moulding.castShadow = false;
            node.add(moulding);
            disposables.push(geometry);
          }
        };
        addInsetRuns(rail * 0.66, rail * 0.42, 0.024, agedBrass);
        addInsetRuns(rail * 1.02, 0.012, 0.018, highlightBrass);

        // Small cast corner rosettes keep the frame recognisably 1890s while
        // remaining restrained enough for a laboratory rather than a salon.
        for (const cornerX of [-1, 1]) {
          for (const cornerY of [-1, 1]) {
            const x = cornerX * (width / 2 - rail * 0.48);
            const y = cornerY * (height / 2 - rail * 0.48);
            const ringGeometry = new THREE.TorusGeometry(rail * 0.22, rail * 0.07, 8, 18);
            const ring = new THREE.Mesh(ringGeometry, highlightBrass);
            ring.position.set(x, y, 0.081);
            ring.castShadow = false;
            node.add(ring);
            const bossGeometry = new THREE.SphereGeometry(rail * 0.12, 12, 8);
            const boss = new THREE.Mesh(bossGeometry, agedBrass);
            boss.position.set(x, y, 0.084);
            boss.scale.z = 0.42;
            boss.castShadow = false;
            node.add(boss);
            disposables.push(ringGeometry, bossGeometry);
          }
        }
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
      const plateTexture = item.artTexture
        ? new THREE.TextureLoader().load(item.artTexture)
        : printTexture(art, item.seed ?? index * 7);
      if (item.artTexture) {
        plateTexture.colorSpace = THREE.SRGBColorSpace;
        plateTexture.wrapS = plateTexture.wrapT = THREE.ClampToEdgeWrapping;
        plateTexture.anisotropy = 8;
        disposables.push(plateTexture);
      }
      const material = new THREE.MeshStandardMaterial({
        map: plateTexture,
        roughness: 0.55,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = 0.016;
      mesh.receiveShadow = false;
      node.add(mesh);
      disposables.push(geometry, material);

      if (ornateBrass) {
        // Thin period picture glass: mostly invisible, but it catches a soft
        // moving reflection as the player crosses the room.
        const glassGeometry = new THREE.PlaneGeometry(Math.max(plateW, 0.05), Math.max(plateH, 0.05));
        const glassMaterial = new THREE.MeshPhysicalMaterial({
          color: '#f4ead4', transparent: true, opacity: 0.1, roughness: 0.08,
          metalness: 0, transmission: 0.15, envMapIntensity: 1.7,
          depthWrite: false, side: THREE.DoubleSide,
        });
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.z = 0.079;
        glass.renderOrder = 2;
        node.add(glass);
        disposables.push(glassGeometry, glassMaterial);
      }

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

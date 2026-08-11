import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { buildShelters } from '../world/rusticwork.js';
import { fillInstances } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';

// The park's rustic summerhouses, rendered from world/rusticwork.js: one
// instanced mesh of cedar poles, one of branchwork, one of bench planks,
// and the shingled roofs merged into a single geometry (plus a dark
// underside). About six draw calls for all three shelters.

// The shelters' shingle roofs, all merged into one geometry: cones to a
// peak, or frustums where a lantern interrupts (topR/topY set). `inset`
// shrinks and flips everything for the dark underside. Winding is checked
// against the computed normal, never assumed.
function roofGeometry(roofs, inset = 0) {
  const positions = [];
  const uvs = [];
  const wantUp = inset === 0;
  const pushTriangle = (a, b, c, uvA, uvB, uvC) => {
    const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const flip = (normalY > 0) !== wantUp;
    const order = flip ? [b, a, c] : [a, b, c];
    const uvOrder = flip ? [uvB, uvA, uvC] : [uvA, uvB, uvC];
    for (let i = 0; i < 3; i += 1) {
      positions.push(...order[i]);
      uvs.push(...uvOrder[i]);
    }
  };
  for (const roof of roofs) {
    const { center, yaw, sides, eaveY, eaveR } = roof;
    const r = eaveR - inset * 0.12;
    const ring = (radius, y) => (k) => {
      const angle = yaw + (k * Math.PI * 2) / sides;
      return [center[0] + Math.cos(angle) * radius, y, center[1] + Math.sin(angle) * radius];
    };
    const eave = ring(r, eaveY - inset * 0.05);
    if (roof.topR) {
      const top = ring(roof.topR, roof.topY - inset * 0.05);
      const slope = Math.hypot(r - roof.topR, roof.topY - eaveY);
      for (let k = 0; k < sides; k += 1) {
        const [e1, e2, t1, t2] = [eave(k), eave(k + 1), top(k), top(k + 1)];
        const edge = Math.hypot(e2[0] - e1[0], e2[2] - e1[2]);
        pushTriangle(e1, e2, t2, [0, 0], [edge / 1.6, 0], [edge / 1.6, slope / 1.6]);
        pushTriangle(e1, t2, t1, [0, 0], [edge / 1.6, slope / 1.6], [0, slope / 1.6]);
      }
    } else {
      const apex = [center[0], roof.apexY - inset * 0.07, center[1]];
      const slope = Math.hypot(r, roof.apexY - eaveY);
      for (let k = 0; k < sides; k += 1) {
        const [e1, e2] = [eave(k), eave(k + 1)];
        const edge = Math.hypot(e2[0] - e1[0], e2[2] - e1[2]);
        pushTriangle(e1, e2, apex, [0, 0], [edge / 1.6, 0], [edge / 3.2, slope / 1.6]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

export default function RusticShelters() {
  const [barkCol, barkNrm, shingleCol, shingleNrm, planksCol, planksNrm] = useLoader(THREE.TextureLoader, [
    '/textures/bark_col.webp',
    '/textures/bark_nrm.webp',
    '/textures/shingle_col.jpg',
    '/textures/shingle_nrm.jpg',
    '/textures/planks_col.jpg',
    '/textures/planks_nrm.jpg',
  ]);

  const { meshes, colliders } = useMemo(() => {
    for (const texture of [barkCol, shingleCol, planksCol, barkNrm, shingleNrm, planksNrm]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
    barkCol.colorSpace = THREE.SRGBColorSpace;
    shingleCol.colorSpace = THREE.SRGBColorSpace;
    planksCol.colorSpace = THREE.SRGBColorSpace;

    const built = buildShelters();
    const bark = new THREE.MeshStandardMaterial({
      map: barkCol,
      normalMap: barkNrm,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.95,
      color: '#c9bba6',
    });
    // The plank albedo is dark; gain over 1 lifts it to weathered cedar.
    const planks = new THREE.MeshStandardMaterial({
      map: planksCol,
      normalMap: planksNrm,
      roughness: 0.9,
    });
    planks.color.setRGB(1.6, 1.5, 1.28);
    const shingles = new THREE.MeshStandardMaterial({
      map: shingleCol,
      normalMap: shingleNrm,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.94,
    });
    const underside = new THREE.MeshStandardMaterial({
      map: planksCol,
      roughness: 0.97,
      color: '#5c5244',
      side: THREE.DoubleSide,
    });

    // Poles are faceted and slightly tapered; branches thinner and rougher.
    const poleGeo = new THREE.CylinderGeometry(0.82, 1, 1, 7);
    const branchGeo = new THREE.CylinderGeometry(0.86, 1, 1, 5);
    const roofMesh = new THREE.Mesh(roofGeometry(built.roofs), shingles);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    const roofUnder = new THREE.Mesh(roofGeometry(built.roofs, 1), underside);

    return {
      meshes: [
        fillInstances(new THREE.InstancedMesh(poleGeo, bark, built.poles.length), built.poles),
        fillInstances(new THREE.InstancedMesh(branchGeo, bark, built.branches.length), built.branches),
        fillInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), planks, built.seats.length), built.seats),
        roofMesh,
        roofUnder,
      ],
      colliders: built.colliders,
    };
  }, [barkCol, barkNrm, shingleCol, shingleNrm, planksCol, planksNrm]);

  return (
    <group>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
      <StaticColliders entries={colliders} />
    </group>
  );
}

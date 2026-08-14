import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { buildDairy, DAIRY } from '../world/dairy.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { PARK_LANDMARKS } from '../world/parkLandmarks.js';
import { instanced } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';

// Vaux's Dairy from world/dairy.js: instanced stone, painted trim, dark
// recesses, and plank work, under one slate roof. The stone half's walk
// collider lives in centralPark.js; the loggia's colliders come from the
// build. About seven draw calls.

function roofGeometry(roof) {
  const { x0, x1, width, eaveY, ridgeY } = roof;
  const half = width / 2;
  const positions = [];
  const uvs = [];
  const slope = Math.hypot(half, ridgeY - eaveY);
  const push = (p, u, v) => {
    positions.push(...p);
    uvs.push(u, v);
  };
  for (const side of [-1, 1]) {
    const e1 = [x0, eaveY, side * half];
    const e2 = [x1, eaveY, side * half];
    const r1 = [x0, ridgeY, 0];
    const r2 = [x1, ridgeY, 0];
    const order = side > 0 ? [e1, e2, r2, e1, r2, r1] : [e2, e1, r1, e2, r1, r2];
    const uvOrder = side > 0
      ? [[x0, 0], [x1, 0], [x1, slope], [x0, 0], [x1, slope], [x0, slope]]
      : [[x1, 0], [x0, 0], [x0, slope], [x1, 0], [x0, slope], [x1, slope]];
    for (let i = 0; i < 6; i += 1) push(order[i], uvOrder[i][0] / 1.15, uvOrder[i][1] / 1.15);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

// Vertical triangles closing the gable ends: stone over the cottage,
// near-black over the open loggia end so the roof reads hollow, not empty.
// Winding is checked so the normal points out the `facing` side.
function gableGeometry(x, width, eaveY, ridgeY, facing) {
  const half = width / 2;
  let tri = [[x, eaveY, -half], [x, eaveY, half], [x, ridgeY, 0]];
  let uv = [[0, 0], [width / 2.2, 0], [width / 4.4, (ridgeY - eaveY) / 2.2]];
  const [a, b, c] = tri;
  const normalX = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  if (Math.sign(normalX) !== Math.sign(facing)) {
    tri = [tri[1], tri[0], tri[2]];
    uv = [uv[1], uv[0], uv[2]];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
  geo.computeVertexNormals();
  return geo;
}

export default function DairyCottage() {
  const [rockCol, rockNrm, slateCol, slateNrm, planksCol, planksNrm] = useLoader(THREE.TextureLoader, [
    '/textures/rock_col.webp',
    '/textures/rock_nrm.webp',
    '/textures/slate_col.jpg',
    '/textures/slate_nrm.jpg',
    '/textures/planks_col.jpg',
    '/textures/planks_nrm.jpg',
  ]);

  const { meshes, colliders, ground } = useMemo(() => {
    for (const texture of [rockCol, slateCol, planksCol, rockNrm, slateNrm, planksNrm]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
    rockCol.colorSpace = THREE.SRGBColorSpace;
    slateCol.colorSpace = THREE.SRGBColorSpace;
    planksCol.colorSpace = THREE.SRGBColorSpace;

    const built = buildDairy();
    // Stone walls get individual meshes with the texture repeat matched to
    // each box, so masonry never stretches across a whole wall. A cloned
    // texture shares the underlying image; only the transform differs.
    const stoneGain = [2.1, 2.05, 1.9];
    const stoneMeshFor = (entry) => {
      const [sx, sy, sz] = entry.s;
      const col = rockCol.clone();
      const nrm = rockNrm.clone();
      col.repeat.set(Math.max(sx, sz) / 2.2, sy / 2.2);
      nrm.repeat.copy(col.repeat);
      col.needsUpdate = true;
      nrm.needsUpdate = true;
      const material = new THREE.MeshStandardMaterial({
        map: col,
        normalMap: nrm,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughness: 0.92,
      });
      material.color.setRGB(stoneGain[0] * entry.tint[0], stoneGain[1] * entry.tint[1], stoneGain[2] * entry.tint[2]);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
      mesh.position.set(...entry.p);
      if (entry.r) mesh.rotation.set(...entry.r);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };
    const gableStone = new THREE.MeshStandardMaterial({
      map: rockCol,
      normalMap: rockNrm,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.92,
    });
    gableStone.color.setRGB(...stoneGain);
    const creamMat = new THREE.MeshStandardMaterial({
      map: planksCol,
      roughness: 0.75,
    });
    creamMat.color.setRGB(1.5, 1.45, 1.3);
    // Window glass: near-black with a low-roughness sheen so panes catch
    // the sky instead of reading as tar.
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#20272b',
      roughness: 0.22,
      metalness: 0.1,
      envMapIntensity: 1.1,
    });
    const planksMat = new THREE.MeshStandardMaterial({
      map: planksCol,
      normalMap: planksNrm,
      roughness: 0.9,
    });
    planksMat.color.setRGB(1.4, 1.32, 1.15);
    const slateMat = new THREE.MeshStandardMaterial({
      map: slateCol,
      normalMap: slateNrm,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 0.8,
    });
    slateMat.color.setRGB(0.92, 0.97, 1.08);

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const roofMesh = new THREE.Mesh(roofGeometry(built.roof), slateMat);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    const eastGable = new THREE.Mesh(
      gableGeometry(built.roof.gables[0] - 0.4, 5.1, built.roof.eaveY, built.roof.ridgeY - 0.15, 1),
      gableStone,
    );
    eastGable.castShadow = true;
    const westGable = new THREE.Mesh(
      gableGeometry(built.roof.gables[1] + 0.45, 5.1, built.roof.eaveY, built.roof.ridgeY - 0.15, -1),
      new THREE.MeshStandardMaterial({ color: '#242019', roughness: 1, side: THREE.DoubleSide }),
    );

    return {
      meshes: [
        ...built.stone.map(stoneMeshFor),
        instanced(unit, creamMat, built.cream),
        instanced(unit, darkMat, built.dark),
        instanced(unit, planksMat, built.planks),
        roofMesh,
        eastGable,
        westGable,
      ],
      colliders: built.colliders,
      ground: built.ground,
    };
  }, [rockCol, rockNrm, slateCol, slateNrm, planksCol, planksNrm]);

  return (
    <>
      <group
        position={[DAIRY.x, ground, DAIRY.z]}
        rotation={[0, DAIRY.yaw, 0]}
        onClick={(event) => identifyLandmark(PARK_LANDMARKS.dairy, event)}
      >
        {meshes.map((mesh, index) => (
          <primitive key={index} object={mesh} />
        ))}
      </group>
      <StaticColliders entries={colliders} />
    </>
  );
}

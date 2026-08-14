import { useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { buildGapstow, walkY, localToWorld, GAPSTOW, RUN_W } from '../world/gapstow.js';
import { terrainHeight } from '../world/terrain.js';
import { makeCraggyRockGeometry, makeHeroCraggyRockGeometry, makeSchistMaterial } from './rockGeometry.js';
import { fillInstances } from './lib/instances.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { PARK_LANDMARKS } from '../world/parkLandmarks.js';

// Gapstow Bridge rendered from the placed-stone layout in world/gapstow.js:
// instanced textured masonry, craggy abutment boulders, the vault soffit,
// and the gravel walk. Collision stays on the invisible stepped boxes in
// centralPark.js.

// The rock albedo averages 0.31, so the stone materials carry a gain that
// lifts it to schist mid-grey; instance tints modulate around 1.
const STONE_GAIN = [1.75, 1.75, 1.66];
const ROCK_GAIN = 1.5;

export default function GapstowBridge() {
  const [rockCol, rockNrm, pathCol] = useLoader(THREE.TextureLoader, [
    '/textures/rock_col.webp',
    '/textures/rock_nrm.webp',
    '/textures/path_col.webp',
  ]);

  const { meshes, vaultMesh, deckGeometry, deckMaterial } = useMemo(() => {
    rockCol.colorSpace = THREE.SRGBColorSpace;
    pathCol.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [rockCol, rockNrm, pathCol]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    }
    const built = buildGapstow();

    // Masonry: the rock texture carries the grain, instance tints the
    // course-to-course variation, the material color the gain.
    const stoneMaterial = new THREE.MeshStandardMaterial({
      map: rockCol,
      normalMap: rockNrm,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.93,
    });
    stoneMaterial.color.setRGB(...STONE_GAIN);
    const rockMaterial = makeSchistMaterial(rockCol, rockNrm, { gain: ROCK_GAIN });

    // Abutment boulders seat on the terrain, buried a third.
    const rocks = built.rocks.map((rock) => {
      const [wx, wz] = localToWorld(rock.p[0], rock.p[2]);
      return { ...rock, p: [rock.p[0], terrainHeight(wx, wz) + rock.s[1] * 0.35, rock.p[2]] };
    });
    const heroes = rocks.filter((rock) => rock.hero);
    const smalls = rocks.filter((rock) => !rock.hero);
    const meshList = [
      fillInstances(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMaterial, built.stones.length), built.stones),
    ];
    if (heroes.length) meshList.push(fillInstances(new THREE.InstancedMesh(makeHeroCraggyRockGeometry(6.1), rockMaterial, heroes.length), heroes));
    if (smalls.length) meshList.push(fillInstances(new THREE.InstancedMesh(makeCraggyRockGeometry(1.7), rockMaterial, smalls.length), smalls));

    // Two barrels under the arch: the soffit the walker sees, and a darker
    // backing just outside the ring so any chink between face stones shows
    // shadowed stone instead of daylight through the hollow interior.
    const { radius, cy, theta, halfWidth } = built.vault;
    const barrel = (r, halfW) => {
      const segments = 24;
      const positions = [];
      const indices = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = theta[0] + ((theta[1] - theta[0]) * i) / segments;
        positions.push(Math.cos(angle) * r, cy + Math.sin(angle) * r, -halfW);
        positions.push(Math.cos(angle) * r, cy + Math.sin(angle) * r, halfW);
        if (i < segments) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };
    const vaultMat = new THREE.MeshStandardMaterial({ map: rockCol, roughness: 0.95, side: THREE.DoubleSide });
    vaultMat.color.setRGB(1.35, 1.35, 1.3);
    const vault = new THREE.Mesh(barrel(radius, halfWidth), vaultMat);
    vault.receiveShadow = true;
    const backingMat = new THREE.MeshStandardMaterial({ map: rockCol, roughness: 0.98, side: THREE.DoubleSide });
    backingMat.color.setRGB(0.85, 0.85, 0.82);
    const backing = new THREE.Mesh(barrel(radius + 0.62, 2.1), backingMat);
    vault.add(backing);

    // Walk ribbon over the whole crossing, gravel-textured along its run.
    const { halfWidth: deckHalf, apron } = built.deck;
    const deckPos = [];
    const deckUv = [];
    const deckIdx = [];
    const runSegments = 34;
    for (let i = 0; i <= runSegments; i += 1) {
      const x = -apron + (2 * apron * i) / runSegments;
      const y = walkY(x) + 0.02;
      deckPos.push(x, y, -deckHalf, x, y, deckHalf);
      deckUv.push(x / 2.6, 0, x / 2.6, 1);
      if (i < runSegments) {
        const a = i * 2;
        deckIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
    deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(deckUv, 2));
    deckGeo.setIndex(deckIdx);
    deckGeo.computeVertexNormals();
    const deckMat = new THREE.MeshStandardMaterial({
      map: pathCol,
      color: '#c9baa0',
      roughness: 1,
      // DoubleSide: the ribbon must read from above and from under the banks.
      side: THREE.DoubleSide,
    });

    return { meshes: meshList, vaultMesh: vault, deckGeometry: deckGeo, deckMaterial: deckMat };
  }, [rockCol, rockNrm, pathCol]);

  return (
    <group
      position={[GAPSTOW.x, 0, GAPSTOW.z]}
      rotation={[0, GAPSTOW.yaw, 0]}
      onClick={(event) => identifyLandmark(PARK_LANDMARKS.gapstow, event)}
    >
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
      <primitive object={vaultMesh} />
      <mesh geometry={deckGeometry} material={deckMaterial} receiveShadow />
    </group>
  );
}

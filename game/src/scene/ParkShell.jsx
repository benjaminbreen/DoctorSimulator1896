import { memo, Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  FACES, facadeBrickFinish, facadeEntranceLayout, facadeFaceRole, facadeLayoutForFace, facadeWidth, facadeWindowEntries,
} from '../world/facade.js';
import TreeField from './TreeField.jsx';
import { instanced } from './lib/instances.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { solarRamps } from '../world/solar.js';
import { createFacadeMaterial, FACADE_TEXTURE_URLS, prepareFacadeTextures } from './facadeMaterials.js';
import { prepareStage } from './prepareStage.js';
import { crownGeometry, crownMaterial, roundedTree } from './roundedTrees.js';
import { gameDebug } from '../debug.js';

const box = new THREE.BoxGeometry();
const trunk = new THREE.CylinderGeometry(.34, .55, 1, 7);
const crown = crownGeometry();
const surface = new THREE.MeshStandardMaterial({ roughness: .95 });
// A little sheen at a glancing angle; a full sky reflection reads as paper.
const windows = new THREE.MeshStandardMaterial({ color: '#23252a', roughness: .3, envMapIntensity: .18 });
// A few rooms have the gas on after dark. Colour and night ramp match the
// lit panes in WindowField.jsx; ParkShell sets the intensity each frame.
const litWindows = new THREE.MeshStandardMaterial({ color: '#23252a', roughness: .3, envMapIntensity: .18, emissive: '#c8873e', emissiveIntensity: 0 });
const leaves = crownMaterial();
const bark = new THREE.MeshStandardMaterial({ roughness: 1 });
const facadeColors = ['#958272', '#8a5f4c', '#b5aa96', '#766a60', '#c5b9a1', '#99948d'];
const sillColors = ['#ad9982', '#b79b80', '#c5b69d', '#a08a74', '#d6c8af', '#b2a895'];
// Keep the lightweight portals on the same bays as the full hotel models.
const hotelDoors = {
  'hotel-new-netherland': { face: '-x', along: -1.1, width: 2.4, height: 3.75 },
  'hotel-savoy': { face: '-x', along: -3.216, width: 2.2, height: 3.6 },
};
const paint = new THREE.Color();

function tint(value) {
  paint.set(value);
  return [paint.r, paint.g, paint.b];
}

function addStreetWindow(trim, u, y, width, height, stone, sash) {
  const top = y + height / 2;
  const bottom = y - height / 2;
  trim(u, top + .065, .095, [width + .32, .17, .22], stone);
  trim(u, bottom - .06, .13, [width + .38, .13, .29], stone);
  for (const side of [-1, 1]) {
    trim(u + side * (width / 2 + .038), y, .066, [.11, height, .16], stone);
  }
  trim(u, y, .058, [width, .055, .045], sash);
  trim(u, y, .056, [.043, height, .044], sash);
}

function addStreetDoor(trim, u, base, width, height, stone, door, panel, brass) {
  const y = base + height / 2;
  trim(u, y, .037, [width, height, .065], door);
  trim(u, base + height + .125, .16, [width + .55, .25, .35], stone);
  trim(u, base + height - .32, .08, [width, .055, .045], panel);
  for (const side of [-1, 1]) {
    trim(u + side * (width / 2 + .10), y, .12, [.23, height, .25], stone);
    trim(u + side * width * .24, base + height * .43, .076, [width * .35, height * .53, .026], panel);
  }
  trim(u, y - .12, .093, [.048, .06, .06], brass);
}

// The same pane choice as WindowField.jsx, so a lamp does not move when the
// detailed windows replace the shell.
function windowLit(item, window) {
  const seed = idHash(item.id);
  const style = item.facadeStyle ?? seed % 4;
  const value = Math.sin((seed + window.col * 11.7 + (window.floor ?? 9) * 5.3) * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value) < (style === 1 || style === 2 ? .1 : .05);
}

function idHash(id) {
  let total = 0;
  for (let i = 0; i < id.length; i += 1) total = (total * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(total);
}

// Same grouping and arguments as FacadeBatch in Furniture.jsx, so a far
// building already wears the masonry it will have when its detail arrives.
function facadeKey(item) {
  return `${item.facadeStyle ?? 0}:${Number.isInteger(item.facadeTone) ? item.facadeTone : 'default'}:${facadeBrickFinish(item) ?? 'stone'}`;
}

function shellFacadeMaterial(facades, item) {
  return createFacadeMaterial(facades, item.facadeStyle ?? 0, idHash(item.id), false,
    item.position[1] - item.size[1] / 2, item.facadeTone ?? null, true, facadeBrickFinish(item) ?? 'smooth');
}

// Changing the tree style remounts the canvas, so reading it once is enough.
const roundedTrees = () => gameDebug.tuning?.treeStyle === 'rounded';

function buildShell(items, treeGroups, propGroups, streetDetail, facades) {
  const walls = [], openings = [], litOpenings = [], facadeTrim = [], targets = [];
  const masonry = new Map();
  const sash = tint('#756a51');
  const door = tint('#292821');
  const panel = tint('#403b2e');
  const brass = tint('#a68751');
  const batches = [];
  const batch = (geometry, material, entries, cast = true) => entries.length
    ? instanced(geometry, material, entries, { cast })
    : null;
  const add = (name, meshes) => batches.push([name, meshes.filter(Boolean)]);
  for (const item of items) {
    if (item.render === false || item.dynamic || item.model || item.kind === 'tree') continue;
    if (item.kind === 'backdrop' && facades) {
      const key = facadeKey(item);
      if (!masonry.has(key)) masonry.set(key, []);
      masonry.get(key).push(item);
    } else {
      targets.push(item);
    }
    if (item.kind === 'backdrop') {
      if (!facades) walls.push({ p: item.position, s: item.size, color: tint(facadeColors[item.facadeStyle] ?? '#a49783') });
      const [x, y, z] = item.position;
      const [width, height, depth] = item.size;
      const stone = tint(sillColors[item.facadeStyle] ?? '#b5a48c');
      const base = y - height / 2;
      const hotelDoor = hotelDoors[item.id];
      const entrance = streetDetail && !item.landmarkModel ? facadeEntranceLayout(item) : null;
      for (const token of item.windowFaces ?? []) {
        const { normal, right, yaw } = FACES[token];
        const layout = facadeLayoutForFace(item, token);
        const faceWidth = facadeWidth(item.size, token);
        const wall = (normal[0] ? width : depth) / 2;
        const role = facadeFaceRole(item, token);
        const detail = streetDetail && (item.landmarkModel
          ? token === '-x' || token === '-z'
          : role !== 'rear');
        const hotelBay = detail && hotelDoor?.face === token ? hotelDoor : null;
        const rotation = [0, yaw, 0];
        const part = (u, level, out, size) => ({
          p: [x + (wall + out) * normal[0] + u * right[0], level, z + (wall + out) * normal[2] + u * right[2]],
          r: rotation, s: size,
        });
        const trim = (u, level, out, size, color) => facadeTrim.push({ ...part(u, level, out, size), color });
        for (const window of facadeWindowEntries(layout, streetDetail ? role : 'front')) {
          const u = ((window.x + window.w / 2) / layout.texW - .5) * faceWidth;
          const level = y + (.5 - (window.y + window.h / 2) / layout.texH) * height;
          const w = window.w / layout.texW * faceWidth;
          const h = window.h / layout.texH * height;
          const ground = window.floor === undefined;
          if (ground && hotelBay && Math.abs(u - hotelBay.along) < (w + hotelBay.width) / 2 + .23) continue;
          (windowLit(item, window) ? litOpenings : openings).push(part(u, level, .025, [w, h, .035]));
          if (detail && (ground || window.floor === layout.floors - 2)) {
            addStreetWindow(trim, u, level, w, h, stone, sash);
          }
        }
        if (!detail) continue;
        trim(0, base + .21, .035, [faceWidth - .05, .42, .11], stone);
        const course = y + (.5 - layout.groundBandY / layout.texH) * height;
        trim(0, course + .08, .075, [faceWidth - .05, .16, .19], stone);
        if (hotelBay) {
          addStreetDoor(trim, hotelBay.along, base, hotelBay.width, hotelBay.height, stone, door, panel, brass);
        }
        if (entrance?.token === token) {
          const hasStoop = Boolean(item.frontageFamily);
          addStreetDoor(trim, (entrance.u - .5) * faceWidth, base + (hasStoop ? entrance.rise : 0),
            entrance.doorWidth, entrance.doorHeight, stone, door, panel, brass);
          if (hasStoop) {
            for (const step of [...entrance.steps, ...entrance.stoneCheeks]) {
              facadeTrim.push({ p: step.position, r: rotation, s: step.size, color: stone });
            }
            for (const rail of entrance.rails) {
              facadeTrim.push({ p: rail.position, q: new THREE.Quaternion()
                .setFromEuler(new THREE.Euler(rail.pitch, rail.yaw, 0, 'YXZ')).toArray(), s: rail.size, color: sash });
            }
          }
        }
      }
    } else {
      walls.push({
        p: item.position, s: item.size, r: item.rotation ?? [0, item.yaw ?? 0, 0],
        color: tint(item.color ?? '#706451'),
      });
    }
  }
  // Click targets follow the first mesh's instance order, so the flat walls
  // stay first and each masonry batch carries its own buildings.
  const masonryMeshes = [...masonry.values()].map((group) => {
    const mesh = batch(box, shellFacadeMaterial(facades, group[0]), group.map(item => ({ p: item.position, s: item.size })));
    mesh.userData.targets = group;
    mesh.userData.ownsMaterial = true;
    return mesh;
  });
  add('structure', [
    batch(box, surface, walls), ...masonryMeshes, batch(box, windows, openings, false), batch(box, litWindows, litOpenings, false),
    batch(box, surface, facadeTrim, false),
  ]);
  for (const [species, trees] of Object.entries(treeGroups)) {
    const trunks = [], crowns = [];
    for (const item of trees) {
      const tree = roundedTree(item);
      trunks.push(tree.trunk);
      crowns.push(...tree.crowns);
    }
    add('trees:' + species, [batch(trunk, bark, trunks), batch(crown, leaves, crowns)]);
  }
  for (const [model, placements] of Object.entries(propGroups)) {
    const props = [];
    for (const item of placements) {
      const [x, y, z] = item.position;
      if (model.includes('bench')) {
        const rotation = item.yaw ?? 0;
        const addPart = (dx, dy, dz, s, color) => props.push({
          p: [x + dx * Math.cos(rotation) + dz * Math.sin(rotation), y + dy, z - dx * Math.sin(rotation) + dz * Math.cos(rotation)],
          s, r: [0, rotation, 0], color: tint(color),
        });
        for (let slat = 0; slat < 4; slat += 1) {
          addPart(0, .46, -.15 + slat * .105, [1.65, .055, .09], '#77583a');
          addPart(0, .62 + slat * .09, -.21, [1.65, .074, .05], '#77583a');
        }
        for (const side of [-.59, .59]) {
          addPart(side, .23, .15, [.07, .46, .08], '#383830');
          addPart(side, .44, -.18, [.07, .88, .08], '#383830');
          addPart(side, .64, .015, [.08, .07, .38], '#383830');
        }
      } else if (model.includes('lamp_post')) {
        props.push({ p: [x, y + 1.5, z], s: [.11, 3, .11], color: tint('#292c29') });
      }
    }
    if (props.length) add('props:' + model, [batch(box, surface, props)]);
  }
  return { batches, targets };
}

const DistrictShell = memo(function DistrictShell({ district, ready, facades }) {
  const batches = useMemo(() => {
    const plaza = district.id === 'plaza';
    // The Plaza shows leaf-model previews instead, unless trees stay rounded.
    const core = buildShell(district.structure, plaza && !roundedTrees() ? {} : district.treeGroups, district.propGroups, false, facades);
    const result = core.batches.map(([part, meshes]) => ({ part, meshes, targets: part === 'structure' ? core.targets : null }));
    if (plaza) for (const building of district.buildings) {
      const { batches: [[, meshes]], targets } = buildShell([building], {}, {}, true, facades);
      result.push({ part: 'structure:' + building.id, meshes, targets });
    }
    return result;
  }, [district, facades]);
  useLayoutEffect(() => () => batches.forEach(({ meshes }) => meshes.forEach(mesh => {
    if (mesh.userData.ownsMaterial) mesh.material.dispose();
    mesh.dispose();
  })), [batches]);
  return <>
    {district.id === 'plaza' && !roundedTrees() && !ready.has('plaza:trees') && <TreeField items={district.trees} preview />}
    {batches.map(({ part, meshes, targets }) => (
      <group key={part} visible={!ready.has(district.id + ':' + part)}>
        {meshes.map((mesh, index) => <primitive key={mesh.uuid} object={mesh}
          onClick={mesh.userData.targets || (targets && index === 0) ? (event) => {
            const item = (mesh.userData.targets ?? targets)[event.instanceId];
            if (item?.landmarkLabel) identifyLandmark(item, event);
          } : undefined} />)}
      </group>
    ))}
  </>;
});

// Loads the shared facade maps and compiles both shader shapes off screen,
// so swapping the flat shells for masonry does not stall a frame.
function ShellFacades({ onReady }) {
  const sources = useLoader(THREE.TextureLoader, FACADE_TEXTURE_URLS);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    let cancelled = false;
    const facades = prepareFacadeTextures(sources);
    const probe = new THREE.Group();
    // Style 0 uses normal and roughness maps; smooth brick uses a bump map.
    const materials = [0, 1].map(facadeStyle => shellFacadeMaterial(facades,
      { id: 'probe', facadeStyle, brickFinish: 'smooth', position: [0, 0, 0], size: [1, 1, 1] }));
    for (const material of materials) probe.add(instanced(box, material, [{ p: [0, -500, 0], s: [1, 1, 1] }]));
    prepareStage(gl, probe, camera, scene, () => cancelled, true)
      .catch((error) => console.error('Shell facade preparation failed', error))
      .then(() => {
        for (const material of materials) material.dispose();
        if (!cancelled) onReady(facades);
      });
    return () => { cancelled = true; };
  }, [camera, gl, onReady, scene, sources]);
  return null;
}

export default memo(function ParkShell({ districts, ready, textured, runtime }) {
  const [facades, setFacades] = useState(null);
  useFrame(() => {
    litWindows.emissiveIntensity = solarRamps(runtime.values.timeOfDay, runtime.values.dayOfYear).night * 1.3;
  });
  return <group name="park district shells">
    {textured && <Suspense fallback={null}><ShellFacades onReady={setFacades} /></Suspense>}
    {districts.map(district => <DistrictShell key={district.id} district={district} ready={ready} facades={facades} />)}
  </group>;
});

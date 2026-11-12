import { memo, useLayoutEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FACES, facadeLayoutForFace, facadeWidth, facadeWindowEntries } from '../world/facade.js';
import TreeField from './TreeField.jsx';
import { instanced } from './lib/instances.js';
import { identifyLandmark } from '../world/landmarkInformation.js';
import { solarRamps } from '../world/solar.js';
import { crownGeometry, crownMaterial, roundedTree } from './roundedTrees.js';
import { gameDebug } from '../debug.js';

const box = new THREE.BoxGeometry();
const trunk = new THREE.CylinderGeometry(.34, .55, 1, 7);
const crown = crownGeometry();
const smoothCrown = crownGeometry(3, .14);
const surface = new THREE.MeshStandardMaterial({ roughness: .95 });
// A little sheen at a glancing angle; a full sky reflection reads as paper.
const windows = new THREE.MeshStandardMaterial({ color: '#23252a', roughness: .3, envMapIntensity: .18 });
// A few rooms have the gas on after dark; ParkShell sets the intensity each frame.
const litWindows = new THREE.MeshStandardMaterial({ color: '#23252a', roughness: .3, envMapIntensity: .18, emissive: '#c8873e', emissiveIntensity: 0 });
const leaves = crownMaterial();
const softLeaves = crownMaterial(true);
const bark = new THREE.MeshStandardMaterial({ roughness: 1 });
const paint = new THREE.Color();

function tint(value) {
  paint.set(value);
  return [paint.r, paint.g, paint.b];
}

// The same pane choice as WindowField.jsx.
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

// Changing the tree style remounts the canvas, so reading it once is enough.
const roundedTrees = () => gameDebug.tuning?.treeStyle !== 'detailed';
const clusteredTrees = () => gameDebug.tuning?.treeStyle === 'clustered';

// items: park structures, and any landmark still waiting for its model.
// Ordinary street buildings are not here; StreetBuildings.jsx draws them.
function buildShell(items, treeGroups, propGroups) {
  const walls = [], openings = [], litOpenings = [], targets = [];
  const batches = [];
  const clustered = clusteredTrees();
  const batch = (geometry, material, entries, cast = true) => entries.length
    ? instanced(geometry, material, entries, { cast })
    : null;
  const add = (name, meshes) => batches.push([name, meshes.filter(Boolean)]);
  for (const item of items) {
    if (item.render === false || item.dynamic || item.model || item.kind === 'tree') continue;
    if (item.kind !== 'backdrop') {
      targets.push(item);
      walls.push({
        p: item.position, s: item.size, r: item.rotation ?? [0, item.yaw ?? 0, 0],
        color: tint(item.color ?? '#706451'),
      });
      continue;
    }
    // A landmark's stand-in until its model loads, a few seconds after the
    // reveal: its wall colour (shellColor, set by eye), a roof, flat windows.
    const [x, y, z] = item.position;
    const [width, height, depth] = item.size;
    targets.push(item, item);
    walls.push({ p: item.position, s: item.size, color: tint(item.shellColor ?? '#a49783') });
    walls.push({ p: [x, y + height / 2 + 1.2, z], s: [width * .92, 2.4, depth * .92], color: tint(item.shellRoof ?? '#4a4c50') });
    for (const token of item.windowFaces ?? []) {
      const { normal, right, yaw } = FACES[token];
      const layout = facadeLayoutForFace(item, token);
      const faceWidth = facadeWidth(item.size, token);
      const wall = (normal[0] ? width : depth) / 2 + .025;
      for (const window of facadeWindowEntries(layout, 'front')) {
        const u = ((window.x + window.w / 2) / layout.texW - .5) * faceWidth;
        const level = y + (.5 - (window.y + window.h / 2) / layout.texH) * height;
        (windowLit(item, window) ? litOpenings : openings).push({
          p: [x + wall * normal[0] + u * right[0], level, z + wall * normal[2] + u * right[2]],
          r: [0, yaw, 0], s: [window.w / layout.texW * faceWidth, window.h / layout.texH * height, .035],
        });
      }
    }
  }
  // Click targets follow the wall mesh's instance order, so it stays first.
  add('structure', [
    batch(box, surface, walls), batch(box, windows, openings, false), batch(box, litWindows, litOpenings, false),
  ]);
  for (const [species, trees] of Object.entries(treeGroups)) {
    const trunks = [], crowns = [];
    for (const item of trees) {
      const tree = roundedTree(item, clustered);
      trunks.push(tree.trunk);
      crowns.push(...tree.crowns);
    }
    add('trees:' + species, [batch(trunk, bark, trunks), batch(clustered ? smoothCrown : crown, clustered ? softLeaves : leaves, crowns)]);
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

const DistrictShell = memo(function DistrictShell({ district, ready }) {
  const batches = useMemo(() => {
    const plaza = district.id === 'plaza';
    // The Plaza shows leaf-model previews instead, unless trees stay rounded.
    const core = buildShell(district.structure, plaza && !roundedTrees() ? {} : district.treeGroups, district.propGroups);
    const result = core.batches.map(([part, meshes]) => ({ part, meshes, targets: part === 'structure' ? core.targets : null }));
    for (const landmark of district.landmarks) {
      const { batches: [[, meshes]], targets } = buildShell([landmark], {}, {});
      result.push({ part: 'landmark:' + landmark.id, meshes, targets });
    }
    return result;
  }, [district]);
  useLayoutEffect(() => () => batches.forEach(({ meshes }) => meshes.forEach(mesh => mesh.dispose())), [batches]);
  return <>
    {district.id === 'plaza' && !roundedTrees() && !ready.has('plaza:trees') && <TreeField items={district.trees} preview />}
    {batches.map(({ part, meshes, targets }) => (
      <group key={part} visible={!ready.has(district.id + ':' + part)}>
        {meshes.map((mesh, index) => <primitive key={mesh.uuid} object={mesh}
          onClick={targets && index === 0 ? (event) => {
            const item = targets[event.instanceId];
            if (item?.landmarkLabel) identifyLandmark(item, event);
          } : undefined} />)}
      </group>
    ))}
  </>;
});

export default memo(function ParkShell({ districts, ready, runtime }) {
  useFrame(() => {
    litWindows.emissiveIntensity = solarRamps(runtime.values.timeOfDay, runtime.values.dayOfYear).night * 1.3;
  });
  return <group name="park district shells">
    {districts.map(district => <DistrictShell key={district.id} district={district} ready={ready} />)}
  </group>;
});

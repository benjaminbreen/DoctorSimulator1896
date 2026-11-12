import { memo, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  FACES, facadeEntranceLayout, facadeFaceRole, facadeLayoutForFace, facadeWidth, facadeWindowEntries,
} from '../world/facade.js';
import TreeField from './TreeField.jsx';
import { instanced } from './lib/instances.js';
import { identifyLandmark } from '../world/landmarkInformation.js';

const box = new THREE.BoxGeometry();
const trunk = new THREE.CylinderGeometry(.34, .55, 1, 7);
const crown = new THREE.IcosahedronGeometry(1, 1);
const surface = new THREE.MeshStandardMaterial({ roughness: .95 });
const windows = new THREE.MeshStandardMaterial({ color: '#292926', roughness: .8 });
const leaves = new THREE.MeshStandardMaterial({ color: '#556a3d', roughness: 1 });
const bark = new THREE.MeshStandardMaterial({ color: '#534734', roughness: 1 });
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

function buildShell(items, treeGroups, propGroups, streetDetail) {
  const walls = [], openings = [], facadeTrim = [], targets = [];
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
    targets.push(item);
    if (item.kind === 'backdrop') {
      walls.push({ p: item.position, s: item.size, color: tint(facadeColors[item.facadeStyle] ?? '#a49783') });
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
          openings.push(part(u, level, .025, [w, h, .035]));
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
  add('structure', [
    batch(box, surface, walls), batch(box, windows, openings, false), batch(box, surface, facadeTrim, false),
  ]);
  for (const [species, trees] of Object.entries(treeGroups)) {
    const trunks = [], crowns = [];
    for (const item of trees) {
      const [x, y, z] = item.position;
      const height = item.tree.height;
      const base = y - item.size[1] / 2;
      const radius = Math.min(height * .28, 4.4);
      const color = tint(item.color);
      trunks.push({ p: [x, base + height * .27, z], s: [item.size[0], height * .54, item.size[0]] });
      for (const [ox, oy, oz, scale] of [[0, .73, 0, 1], [.57, .65, -.24, .69], [-.49, .67, .32, .71]]) {
        crowns.push({ p: [x + ox * radius, base + oy * height, z + oz * radius],
          s: [radius * scale, height * .26 * scale, radius * scale], color, r: [0, x + z, 0] });
      }
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

const DistrictShell = memo(function DistrictShell({ district, ready }) {
  const batches = useMemo(() => {
    const plaza = district.id === 'plaza';
    const core = buildShell(district.structure, plaza ? {} : district.treeGroups, district.propGroups, false);
    const result = core.batches.map(([part, meshes]) => ({ part, meshes, targets: part === 'structure' ? core.targets : null }));
    if (plaza) for (const building of district.buildings) {
      const { batches: [[, meshes]], targets } = buildShell([building], {}, {}, true);
      result.push({ part: 'structure:' + building.id, meshes, targets });
    }
    return result;
  }, [district]);
  useLayoutEffect(() => () => batches.forEach(({ meshes }) => meshes.forEach(mesh => mesh.dispose())), [batches]);
  return <>
    {district.id === 'plaza' && !ready.has('plaza:trees') && <TreeField items={district.trees} preview />}
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

export default memo(function ParkShell({ districts, ready }) {
  return <group name="park district shells">
    {districts.map(district => <DistrictShell key={district.id} district={district} ready={ready} />)}
  </group>;
});

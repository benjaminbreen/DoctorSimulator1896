import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundStain } from './lib/groundStain.js';
import { instanced } from './lib/instances.js';
import StaticColliders from './lib/StaticColliders.jsx';
import { ROAD_TOP, WALK_TOP } from '../world/streetGrid.js';
import { streetIronwork } from '../world/streetIronwork.js';

// Draws world/streetIronwork.js: one instanced batch per kind of piece.
// Every piece faces +z in its own frame, toward the street. Iron uses the
// worn black paint maps; stone the dressed granite; UVs are in metres.

const IRON_TILE = 0.45;
const GRANITE_TILE = 0.7;

function part(geometry, position = [0, 0, 0], rotation = [0, 0, 0]) {
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.translate(...position);
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

function merged(parts, uvScale = 1) {
  const geometry = mergeGeometries(parts);
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, uv.getX(index) * uvScale, uv.getY(index) * uvScale);
  return geometry;
}

// Lathe UVs run 0..1 around and along the profile; rescale them to metres.
function lathe(profile, segments, circumference) {
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  let length = 0;
  for (let index = 1; index < profile.length; index += 1) {
    length += Math.hypot(profile[index][0] - profile[index - 1][0], profile[index][1] - profile[index - 1][1]);
  }
  const uv = geometry.attributes.uv;
  for (let index = 0; index < uv.count; index += 1) uv.setXY(index, uv.getX(index) * circumference, uv.getY(index) * length);
  return geometry;
}

// A side profile (forward, up) extruded across the piece and turned so
// forward is +z.
function profileSolid(points, width, bevel) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  shape.splineThru(points.slice(1).map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width, curveSegments: 40, bevelEnabled: true,
    bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 3,
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

const HORSE_HEAD = [
  [-0.04, 0], [-0.046, 0.06], [-0.036, 0.12], [-0.012, 0.172], [0.02, 0.2], [0.056, 0.202],
  [0.095, 0.184], [0.135, 0.15], [0.163, 0.115], [0.18, 0.09], [0.178, 0.068], [0.165, 0.057],
  [0.148, 0.052], [0.115, 0.062], [0.085, 0.076], [0.06, 0.07], [0.046, 0.045], [0.042, 0],
];

function hitchingPostGeometry() {
  const head = profileSolid(HORSE_HEAD, 0.05, 0.017);
  return merged([
    part(lathe([[0, 0], [0.12, 0], [0.12, 0.045], [0.1, 0.07], [0, 0.07]], 8, 0.75)),
    part(lathe([
      [0, 0.07], [0.09, 0.07], [0.075, 0.11], [0.062, 0.15], [0.052, 0.2], [0.047, 0.5], [0.044, 0.78],
      [0.05, 0.79], [0.058, 0.8], [0.058, 0.83], [0.05, 0.84], [0.06, 0.86], [0.06, 0.88], [0.044, 0.9], [0, 0.91],
    ], 20, 0.35)),
    part(head, [0, 0.9, 0]),
    part(new THREE.ConeGeometry(0.014, 0.05, 6), [-0.022, 1.11, 0.035], [-0.3, 0, -0.25]),
    part(new THREE.ConeGeometry(0.014, 0.05, 6), [0.022, 1.11, 0.035], [-0.3, 0, 0.25]),
    part(new THREE.SphereGeometry(0.009, 8, 6), [-0.044, 1.065, 0.1]),
    part(new THREE.SphereGeometry(0.009, 8, 6), [0.044, 1.065, 0.1]),
    part(new THREE.TorusGeometry(0.032, 0.006, 6, 18), [0, 0.94, 0.168], [0, Math.PI / 2, 0]),
  ], 1 / IRON_TILE);
}

// The older plain post: ball finial, and a ring on a staple at the collar.
function ballPostGeometry() {
  return merged([
    part(lathe([[0, 0], [0.11, 0], [0.11, 0.04], [0.095, 0.06], [0, 0.06]], 8, 0.7)),
    part(lathe([
      [0, 0.06], [0.08, 0.06], [0.066, 0.1], [0.052, 0.15], [0.045, 0.2], [0.041, 0.7], [0.05, 0.72],
      [0.056, 0.74], [0.05, 0.76], [0.032, 0.78], [0.028, 0.8], [0, 0.8],
    ], 18, 0.3)),
    part(new THREE.SphereGeometry(0.06, 18, 12), [0, 0.85, 0]),
    part(new THREE.TorusGeometry(0.035, 0.006, 6, 16), [0, 0.7, 0.07], [0, Math.PI / 2, 0]),
  ], 1 / IRON_TILE);
}

// Granite block at the curb with one step on the house side, edges dressed.
function carriageStepGeometry() {
  const shape = new THREE.Shape();
  [[0.45, 0], [-0.21, 0], [-0.21, 0.4], [0.15, 0.4], [0.15, 0.2], [0.45, 0.2]].forEach(([u, v], index) => {
    if (index === 0) shape.moveTo(u, v);
    else shape.lineTo(u, v);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.9, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-0.45, 0, 0);
  return merged([part(geometry)], 1 / GRANITE_TILE);
}

function bootScraperGeometry() {
  const pieces = [
    part(new THREE.BoxGeometry(0.42, 0.025, 0.16), [0, 0.012, 0]),
    part(new THREE.BoxGeometry(0.3, 0.035, 0.012), [0, 0.14, 0]),
  ];
  for (const side of [-1, 1]) {
    pieces.push(part(lathe([[0, 0], [0.022, 0], [0.016, 0.03], [0.012, 0.2], [0, 0.21]], 10, 0.1), [side * 0.17, 0.02, 0]));
    pieces.push(part(new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI * 1.6), [side * 0.17, 0.25, 0], [0, Math.PI / 2, side * 0.6]));
    pieces.push(part(new THREE.SphereGeometry(0.016, 8, 6), [side * 0.17, 0.215, 0]));
  }
  return merged(pieces, 1 / IRON_TILE);
}

// Body with a rounded hood, a raised door, a slot flap, and straps that
// wrap the back of the lamp post.
function letterBoxGeometry() {
  const body = profileSolid([
    [-0.1, -0.22], [0.1, -0.22], [0.1, 0.16], [0.08, 0.205], [0.04, 0.228], [0, 0.234], [-0.06, 0.226], [-0.1, 0.205],
  ], 0.3, 0.012);
  const pieces = [
    part(body),
    part(new THREE.BoxGeometry(0.27, 0.3, 0.014), [0, -0.04, 0.112]),
    part(new THREE.BoxGeometry(0.22, 0.035, 0.03), [0, 0.15, 0.115], [-0.35, 0, 0]),
    part(new THREE.BoxGeometry(0.34, 0.03, 0.23), [0, -0.235, 0]),
  ];
  for (const y of [-0.12, 0.1]) {
    pieces.push(part(new THREE.BoxGeometry(0.06, 0.03, 0.08), [0, y, -0.14]));
    pieces.push(part(new THREE.TorusGeometry(0.068, 0.008, 6, 14, Math.PI), [0, y, -0.17], [-Math.PI / 2, 0, 0]));
  }
  return merged(pieces, 1 / IRON_TILE);
}

// Squat hydrant: bolted flange, banded barrel, domed bonnet with its
// operating nut, and two capped hose nozzles.
function hydrantGeometry() {
  const pieces = [
    part(lathe([
      [0, 0], [0.19, 0], [0.19, 0.035], [0.16, 0.055], [0.14, 0.08], [0.135, 0.1], [0.135, 0.48], [0.15, 0.5],
      [0.15, 0.54], [0.135, 0.56], [0.14, 0.58], [0.128, 0.64], [0.1, 0.69], [0.06, 0.725], [0.035, 0.735], [0, 0.735],
    ], 24, 0.9)),
    part(new THREE.CylinderGeometry(0.03, 0.034, 0.05, 5), [0, 0.76, 0]),
  ];
  for (let bolt = 0; bolt < 8; bolt += 1) {
    const angle = (bolt / 8) * Math.PI * 2;
    pieces.push(part(new THREE.CylinderGeometry(0.012, 0.012, 0.025, 6), [Math.cos(angle) * 0.165, 0.045, Math.sin(angle) * 0.165]));
  }
  for (const side of [-1, 1]) {
    pieces.push(part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 14), [side * 0.17, 0.4, 0], [0, 0, Math.PI / 2]));
    pieces.push(part(new THREE.CylinderGeometry(0.058, 0.058, 0.035, 6), [side * 0.235, 0.4, 0], [0, 0, Math.PI / 2]));
  }
  return merged(pieces, 1 / IRON_TILE);
}

function canvas(size, draw) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  draw(element.getContext('2d'), size);
  return element;
}

// Colour and normal map from one height drawing (white is raised), so
// lettering and studs stand proud of the casting and catch the light.
function embossed(drawHeight, size = 256, strength = 3) {
  const height = canvas(size, (context) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, size, size);
    drawHeight(context, size);
  });
  const source = height.getContext('2d').getImageData(0, 0, size, size).data;
  const at = (x, y) => source[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  const colour = canvas(size, () => {});
  const normal = canvas(size, () => {});
  const colourData = colour.getContext('2d').createImageData(size, size);
  const normalData = normal.getContext('2d').createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const value = at(x, y);
      // Raised faces are worn bright by feet and wheels; hollows hold dirt.
      const shade = 26 + value * 34 + ((x * 7 + y * 13) % 5);
      colourData.data.set([shade + 2, shade, shade - 2, 255], index);
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      normalData.data.set([(-dx / length * 0.5 + 0.5) * 255, (dy / length * 0.5 + 0.5) * 255, (1 / length * 0.5 + 0.5) * 255, 255], index);
    }
  }
  colour.getContext('2d').putImageData(colourData, 0, 0);
  normal.getContext('2d').putImageData(normalData, 0, 0);
  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const normalMap = new THREE.CanvasTexture(normal);
  normalMap.anisotropy = 4;
  return { map, normalMap };
}

function ringText(context, text, middle, radius, size) {
  context.font = `bold ${size}px Georgia, serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const letters = [...text];
  const step = (size * 0.95) / radius;
  letters.forEach((letter, index) => {
    const angle = -Math.PI / 2 + (index - (letters.length - 1) / 2) * step;
    context.save();
    context.translate(middle + Math.cos(angle) * radius, middle + Math.sin(angle) * radius);
    context.rotate(angle + Math.PI / 2);
    context.fillText(letter, 0, 0);
    context.restore();
  });
}

function manholeFace(text, lower) {
  return embossed((context, size) => {
    const middle = size / 2;
    context.strokeStyle = '#fff';
    context.fillStyle = '#fff';
    context.lineWidth = 7;
    for (const radius of [124, 88]) {
      context.beginPath();
      context.arc(middle, middle, radius, 0, Math.PI * 2);
      context.stroke();
    }
    ringText(context, text, middle, 106, 20);
    if (lower) {
      context.save();
      context.translate(middle, middle);
      context.rotate(Math.PI);
      context.translate(-middle, -middle);
      ringText(context, lower, middle, 106, 18);
      context.restore();
    }
    // A waffle of raised squares inside the inner ring, for grip.
    context.save();
    context.beginPath();
    context.arc(middle, middle, 82, 0, Math.PI * 2);
    context.clip();
    for (let x = -84; x <= 84; x += 16) {
      for (let y = -84; y <= 84; y += 16) context.fillRect(middle + x - 5, middle + y - 5, 10, 10);
    }
    context.restore();
    context.beginPath();
    context.arc(middle, middle, 14, 0, Math.PI * 2);
    context.fill();
  });
}

function coalHoleFace() {
  return embossed((context, size) => {
    const middle = size / 2;
    context.strokeStyle = '#fff';
    context.fillStyle = '#fff';
    context.lineWidth = 8;
    context.beginPath();
    context.arc(middle, middle, 122, 0, Math.PI * 2);
    context.stroke();
    // A six-pointed star of ribs over a ring of studs, a common pattern.
    for (let rib = 0; rib < 6; rib += 1) {
      const angle = (rib / 6) * Math.PI * 2;
      context.beginPath();
      context.moveTo(middle, middle);
      context.lineTo(middle + Math.cos(angle) * 110, middle + Math.sin(angle) * 110);
      context.stroke();
    }
    for (let ring = 0; ring < 2; ring += 1) {
      const radius = 50 + ring * 38;
      const count = 12 + ring * 6;
      for (let stud = 0; stud < count; stud += 1) {
        const angle = ((stud + 0.5) / count) * Math.PI * 2;
        context.beginPath();
        context.arc(middle + Math.cos(angle) * radius, middle + Math.sin(angle) * radius, 7, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.beginPath();
    context.arc(middle, middle, 18, 0, Math.PI * 2);
    context.fill();
  });
}

function gratingFace() {
  return embossed((context, size) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, 14);
    context.fillRect(0, size - 14, size, 14);
    context.fillRect(0, 0, 14, size);
    context.fillRect(size - 14, 0, 14, size);
    for (let x = 22; x < size - 14; x += 20) context.fillRect(x, 0, 9, size);
    context.fillRect(0, size / 2 - 5, size, 10);
  }, 256, 4);
}

function letterFace() {
  const face = canvas(256, (context, size) => {
    context.fillStyle = '#26332a';
    context.fillRect(0, 0, size, size);
    context.strokeStyle = '#a99558';
    context.lineWidth = 4;
    context.strokeRect(14, 14, size - 28, size - 28);
    context.fillStyle = '#c4ad68';
    context.textAlign = 'center';
    context.font = 'bold 44px Georgia, serif';
    context.fillText('U.S.', size / 2, 84);
    context.fillText('MAIL', size / 2, 136);
    context.font = 'bold 22px Georgia, serif';
    context.fillText('LETTER BOX', size / 2, 186);
    context.font = 'italic 15px Georgia, serif';
    context.fillText('Collections hourly', size / 2, 216);
  });
  const map = new THREE.CanvasTexture(face);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

function repeatWrap(texture, color = false) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function StreetIronwork() {
  const [ironCol, ironNrm, ironRough, graniteCol, graniteNrm] = useLoader(THREE.TextureLoader, [
    '/textures/street/iron_col.webp',
    '/textures/street/iron_nrm.webp',
    '/textures/street/iron_rough.webp',
    '/textures/street/granite_col.webp',
    '/textures/street/granite_nrm.webp',
  ]);

  const built = useMemo(() => {
    const layout = streetIronwork();
    repeatWrap(ironCol, true);
    repeatWrap(ironNrm);
    repeatWrap(ironRough);
    repeatWrap(graniteCol, true);
    repeatWrap(graniteNrm);
    const iron = new THREE.MeshStandardMaterial({
      map: ironCol, normalMap: ironNrm, roughnessMap: ironRough,
      normalScale: new THREE.Vector2(0.6, 0.6), metalness: 0.3, roughness: 1,
    });
    // Painted pieces keep the wear in the normal and roughness maps only;
    // the black colour map would drown the paint.
    const paint = (color) => new THREE.MeshStandardMaterial({
      color, normalMap: ironNrm, roughnessMap: ironRough,
      normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0.1, roughness: 1,
    });
    const granite = new THREE.MeshStandardMaterial({
      map: graniteCol, normalMap: graniteNrm, color: '#8c8a85',
      normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.9,
    });
    const face = (maps) => new THREE.MeshStandardMaterial({ ...maps, roughness: 0.6, metalness: 0.5, normalScale: new THREE.Vector2(1, 1) });
    // Discs take the casting face on the top cap only: groups are side, top, bottom.
    const capped = (maps) => [iron, face(maps), iron];
    const materials = {
      iron,
      granite,
      letterBody: paint('#2b3a2f'),
      hydrant: paint('#3a4a37'),
      letterFace: new THREE.MeshStandardMaterial({ map: letterFace(), roughness: 0.55, metalness: 0.2 }),
      croton: capped(manholeFace('CROTON AQUEDUCT', 'N.Y.')),
      sewer: capped(manholeFace('SEWER', 'N.Y.')),
      coal: capped(coalHoleFace()),
      grating: face(gratingFace()),
    };
    const geometries = {
      hitch: hitchingPostGeometry(),
      ball: ballPostGeometry(),
      step: carriageStepGeometry(),
      scraper: bootScraperGeometry(),
      letter: letterBoxGeometry(),
      hydrant: hydrantGeometry(),
      letterFace: new THREE.PlaneGeometry(0.24, 0.27),
      manhole: new THREE.CylinderGeometry(0.38, 0.38, 0.03, 40),
      coal: new THREE.CylinderGeometry(0.23, 0.23, 0.03, 32),
      grating: new THREE.BoxGeometry(0.95, 0.03, 0.4),
    };
    const at = (list, y) => list.map((entry) => ({ p: [entry.x, y, entry.z], r: [0, entry.yaw, 0] }));
    const letterFaces = layout.letterBoxes.map((entry) => ({
      p: [entry.x + Math.sin(entry.yaw) * 0.12, WALK_TOP + 1.08, entry.z + Math.cos(entry.yaw) * 0.12],
      r: [0, entry.yaw, 0],
    }));
    // Separate copies for the standing pieces: the shared iron also edges
    // the manhole covers, which sit below the walk and would stain through.
    const standingIron = groundStain(iron.clone(), { ground: WALK_TOP, height: 0.22 });
    materials.standingIron = standingIron;
    groundStain(materials.hydrant, { ground: WALK_TOP, height: 0.2 });
    groundStain(granite, { ground: WALK_TOP, height: 0.14, strength: 0.5 });
    const meshes = [
      instanced(geometries.hitch, standingIron, at(layout.hitchingPosts, WALK_TOP)),
      instanced(geometries.ball, standingIron, at(layout.ballPosts, WALK_TOP)),
      instanced(geometries.hydrant, materials.hydrant, at(layout.hydrants, WALK_TOP)),
      instanced(geometries.step, granite, at(layout.carriageSteps, WALK_TOP)),
      instanced(geometries.scraper, standingIron, at(layout.bootScrapers, WALK_TOP)),
      instanced(geometries.letter, materials.letterBody, at(layout.letterBoxes, WALK_TOP + 1.12)),
      instanced(geometries.letterFace, materials.letterFace, letterFaces, { cast: false }),
      instanced(geometries.manhole, materials.croton, at(layout.manholes.filter((entry) => entry.kind === 'croton'), ROAD_TOP - 0.003), { cast: false }),
      instanced(geometries.manhole, materials.sewer, at(layout.manholes.filter((entry) => entry.kind === 'sewer'), ROAD_TOP - 0.003), { cast: false }),
      instanced(geometries.coal, materials.coal, at(layout.coalHoles, WALK_TOP - 0.006), { cast: false }),
      instanced(geometries.grating, materials.grating, at(layout.gratings, ROAD_TOP - 0.006), { cast: false }),
    ];
    const colliders = [
      ...[...layout.hitchingPosts, ...layout.ballPosts].map((entry) => ({ type: 'cylinder', p: [entry.x, WALK_TOP + 0.55, entry.z], radius: 0.08, height: 1.1 })),
      ...layout.hydrants.map((entry) => ({ type: 'cylinder', p: [entry.x, WALK_TOP + 0.4, entry.z], radius: 0.2, height: 0.8 })),
      ...layout.carriageSteps.map((entry) => ({ type: 'box', p: [entry.x, WALK_TOP + 0.2, entry.z], size: [0.95, 0.4, 0.7], yaw: entry.yaw })),
    ];
    return { meshes, colliders, materials, geometries };
  }, [graniteCol, graniteNrm, ironCol, ironNrm, ironRough]);

  useEffect(() => () => {
    Object.values(built.geometries).forEach((geometry) => geometry.dispose());
    // The loaded maps are shared through the loader cache; only the canvas
    // maps made here are disposed.
    Object.values(built.materials).flat().forEach((material) => {
      if (material.map?.isCanvasTexture) material.map.dispose();
      if (material.normalMap?.isCanvasTexture) material.normalMap.dispose();
      material.dispose();
    });
  }, [built]);

  return (
    <>
      {built.meshes.map((mesh, index) => <primitive key={index} object={mesh} />)}
      <StaticColliders entries={built.colliders} />
    </>
  );
}

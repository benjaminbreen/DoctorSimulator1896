import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  SIGN_ATLAS_ENTRIES,
  streetDressingLayout,
} from '../world/streetDressing.js';

const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 512;
const CELL_GUTTER = 8;
const NO_RAYCAST = () => {};
const scratch = new THREE.Object3D();
const tint = new THREE.Color();

const SIGN_STYLES = Object.freeze({
  hotel: { background: '#2b211e', border: '#b18a50', text: '#dfbd77', borderWidth: 8 },
  'hotel-light': { background: '#3b3027', border: '#d4bb83', text: '#ead8ae', borderWidth: 7 },
  street: { background: '#18353f', border: '#d8d1b5', text: '#eee8d5', borderWidth: 6 },
  paper: { background: '#e7dcc0', border: '#655641', text: '#2d2923', borderWidth: 5 },
  brass: { background: '#745c36', border: '#c8a965', text: '#f0d897', borderWidth: 6 },
  painted: { background: '#342f29', border: '#9b8c6d', text: '#e1d6bb', borderWidth: 5 },
  number: { background: '#262825', border: '#b7a66e', text: '#efe2b9', borderWidth: 5 },
});

function fitFont(context, lines, maxWidth, maxHeight) {
  let size = lines.length > 1 ? maxHeight * 0.31 : maxHeight * 0.48;
  while (size > 18) {
    context.font = `700 ${Math.floor(size)}px Georgia, 'Times New Roman', serif`;
    if (Math.max(...lines.map((line) => context.measureText(line).width)) <= maxWidth) break;
    size -= 2;
  }
  return Math.floor(size);
}

function drawAtlasEntry(context, entry) {
  const [cellX, cellY, cellWidth, cellHeight] = entry.rect;
  const x = cellX + CELL_GUTTER / 2;
  const y = cellY + CELL_GUTTER / 2;
  const width = cellWidth - CELL_GUTTER;
  const height = cellHeight - CELL_GUTTER;
  const style = SIGN_STYLES[entry.style];

  context.fillStyle = style.background;
  context.fillRect(x, y, width, height);
  context.strokeStyle = style.border;
  context.lineWidth = style.borderWidth;
  context.strokeRect(
    x + style.borderWidth / 2 + 3,
    y + style.borderWidth / 2 + 3,
    width - style.borderWidth - 6,
    height - style.borderWidth - 6,
  );

  const fontSize = fitFont(context, entry.lines, width - 32, height - 24);
  const lineHeight = fontSize * 1.05;
  const textBlockHeight = lineHeight * entry.lines.length;
  context.font = `700 ${fontSize}px Georgia, 'Times New Roman', serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = style.text;
  entry.lines.forEach((line, index) => {
    const lineY = y + height / 2 - textBlockHeight / 2 + lineHeight * (index + 0.5) + 1;
    context.fillText(line, x + width / 2, lineY);
  });

  // Two very low-opacity passes keep the plates from reading as freshly
  // printed UI while retaining the close-range legibility they are for.
  context.fillStyle = 'rgba(242, 224, 184, 0.035)';
  context.fillRect(x + 5, y + 4, width - 10, Math.max(1, height * 0.08));
  context.fillStyle = 'rgba(42, 31, 23, 0.045)';
  context.fillRect(x + 4, y + height * 0.73, width - 8, Math.max(1, height * 0.13));
}

function createSignAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  Object.values(SIGN_ATLAS_ENTRIES).forEach((entry) => drawAtlasEntry(context, entry));

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'single 1896 street-sign atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}

function atlasUvRect(entry) {
  const [x, y, width, height] = entry.rect;
  const insetX = x + CELL_GUTTER;
  const insetY = y + CELL_GUTTER;
  const sampleWidth = width - CELL_GUTTER * 2;
  const sampleHeight = height - CELL_GUTTER * 2;
  return [
    insetX / ATLAS_WIDTH,
    1 - (insetY + sampleHeight) / ATLAS_HEIGHT,
    sampleWidth / ATLAS_WIDTH,
    sampleHeight / ATLAS_HEIGHT,
  ];
}

function createSignMaterial(texture) {
  const material = new THREE.MeshStandardMaterial({
    name: 'shared atlas street-sign faces',
    map: texture,
    color: '#ffffff',
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.FrontSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aStreetSignUvRect;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = aStreetSignUvRect.xy + uv * aStreetSignUvRect.zw;
        #endif`,
      );
  };
  material.customProgramCacheKey = () => 'street-sign-atlas-instanced-uv-v1';
  return material;
}

function createSignFaceBatch(signs) {
  const texture = createSignAtlas();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uvRects = new Float32Array(signs.length * 4);
  signs.forEach((sign, index) => {
    const entry = SIGN_ATLAS_ENTRIES[sign.atlasKey];
    uvRects.set(atlasUvRect(entry), index * 4);
  });
  geometry.setAttribute(
    'aStreetSignUvRect',
    new THREE.InstancedBufferAttribute(uvRects, 4),
  );
  const material = createSignMaterial(texture);
  const mesh = new THREE.InstancedMesh(geometry, material, signs.length);
  mesh.name = 'street-dressing-sign-faces';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = NO_RAYCAST;
  signs.forEach((sign, index) => {
    scratch.position.set(...sign.position);
    scratch.rotation.set(0, sign.yaw, 0);
    scratch.scale.set(sign.size[0], sign.size[1], 1);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
    const shade = sign.kind === 'to-let' ? '#eee6d1' : '#f6f1e5';
    mesh.setColorAt(index, tint.set(shade));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return { texture, geometry, material, mesh };
}

function createPostGeometry(height) {
  const shaft = new THREE.CylinderGeometry(0.042, 0.057, height, 8);
  shaft.translate(0, height / 2, 0);
  const collar = new THREE.CylinderGeometry(0.074, 0.074, 0.09, 8);
  collar.translate(0, height - 0.18, 0);
  const finial = new THREE.SphereGeometry(0.086, 8, 6);
  finial.translate(0, height + 0.075, 0);
  const geometry = mergeGeometries([shaft, collar, finial]);
  shaft.dispose();
  collar.dispose();
  finial.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

function createPostBatch(supports) {
  const geometry = createPostGeometry(supports[0]?.height ?? 3.48);
  const material = new THREE.MeshStandardMaterial({
    name: 'shared street-sign iron posts',
    color: '#252a29',
    roughness: 0.5,
    metalness: 0.7,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, supports.length);
  mesh.name = 'street-dressing-signposts';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = NO_RAYCAST;
  supports.forEach((support, index) => {
    scratch.position.set(...support.position);
    scratch.rotation.set(0, 0, 0);
    scratch.scale.setScalar(1);
    scratch.updateMatrix();
    mesh.setMatrixAt(index, scratch.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return { geometry, material, mesh };
}

export default function StreetSigns() {
  const signs = streetDressingLayout.signs;
  const supports = streetDressingLayout.supports;
  const faceBatch = useMemo(() => createSignFaceBatch(signs), [signs]);
  const postBatch = useMemo(() => createPostBatch(supports), [supports]);

  useEffect(() => () => {
    faceBatch.texture.dispose();
    faceBatch.geometry.dispose();
    faceBatch.material.dispose();
    postBatch.geometry.dispose();
    postBatch.material.dispose();
  }, [faceBatch, postBatch]);

  return (
    <group name="selective location-appropriate street signs">
      <primitive object={postBatch.mesh} />
      <primitive object={faceBatch.mesh} />
    </group>
  );
}

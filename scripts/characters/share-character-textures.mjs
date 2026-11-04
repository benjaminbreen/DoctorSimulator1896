#!/usr/bin/env node
// Moves the images out of the modular character GLBs into shared files named
// by content hash. Each patient model repeats the same head and hair textures,
// so a browser that has loaded one patient fetches only the new clothing next.
// Run it after anything that rewrites these GLBs: gltf-transform re-embeds them.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve(new URL('../../game/public/models/characters', import.meta.url).pathname);
const shared = path.join(directory, 'textures');
const extensions = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

function readGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength;
  const bin = binStart < bytes.length ? bytes.subarray(binStart + 8, binStart + 8 + view.getUint32(binStart, true)) : new Uint8Array();
  return { json, bin };
}

function writeGlb(json, bin) {
  const pad = (length) => (4 - (length % 4)) % 4;
  let text = JSON.stringify(json);
  text += ' '.repeat(pad(Buffer.byteLength(text)));
  const jsonBytes = Buffer.from(text);
  const binLength = bin.length + pad(bin.length);
  const out = Buffer.alloc(12 + 8 + jsonBytes.length + 8 + binLength);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonBytes.length, 12); out.writeUInt32LE(0x4e4f534a, 16); jsonBytes.copy(out, 20);
  const binStart = 20 + jsonBytes.length;
  out.writeUInt32LE(binLength, binStart); out.writeUInt32LE(0x004e4942, binStart + 4); out.set(bin, binStart + 8);
  return out;
}

async function share(file) {
  const { json, bin } = readGlb(await readFile(file));
  const images = (json.images || []).filter((image) => image.bufferView !== undefined);
  if (!images.length) return 0;
  await mkdir(shared, { recursive: true });
  const dropped = new Set();
  for (const image of images) {
    const view = json.bufferViews[image.bufferView];
    if (view.buffer !== 0) throw new Error(`${file}: image outside the GLB buffer`);
    const data = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    if (!extensions[image.mimeType]) throw new Error(`${file}: unknown image type ${image.mimeType}`);
    const name = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}.${extensions[image.mimeType]}`;
    if (!existsSync(path.join(shared, name))) await writeFile(path.join(shared, name), data);
    dropped.add(image.bufferView);
    delete image.bufferView;
    image.uri = `textures/${name}`;
  }

  // Repack what is left of the binary chunk. Meshopt views keep their real
  // bytes in the extension and point the view itself at an empty fallback buffer.
  const remap = new Map(), views = [], parts = [];
  let length = 0;
  json.bufferViews.forEach((view, index) => {
    if (dropped.has(index)) return;
    remap.set(index, views.length);
    views.push(view);
    const meshopt = view.extensions?.EXT_meshopt_compression;
    const owner = meshopt && meshopt.buffer === 0 ? meshopt : view.buffer === 0 ? view : null;
    if (!owner) return;
    const start = owner.byteOffset || 0;
    length = Math.ceil(length / 16) * 16;
    parts.push([length, bin.subarray(start, start + owner.byteLength)]);
    owner.byteOffset = length;
    length += owner.byteLength;
  });
  const packed = new Uint8Array(length);
  for (const [offset, data] of parts) packed.set(data, offset);
  json.bufferViews = views;
  json.buffers[0].byteLength = length;
  for (const accessor of json.accessors || []) {
    if (accessor.bufferView !== undefined) accessor.bufferView = remap.get(accessor.bufferView);
    if (accessor.sparse) {
      accessor.sparse.indices.bufferView = remap.get(accessor.sparse.indices.bufferView);
      accessor.sparse.values.bufferView = remap.get(accessor.sparse.values.bufferView);
    }
  }
  await writeFile(file, writeGlb(json, packed));
  return images.length;
}

// Only the modular figures share textures; the older cast GLBs stay whole.
const files = [];
for (const name of await readdir(directory)) {
  if (!name.endsWith('.glb')) continue;
  const file = path.join(directory, name);
  if (readGlb(await readFile(file)).json.nodes?.some((node) => node.name === 'Carmela_Face')) files.push(file);
}
for (const file of files) {
  const moved = await share(file);
  if (moved) console.log(`${path.basename(file)}: moved ${moved} images`);
}

const used = new Set();
for (const file of files) for (const image of readGlb(await readFile(file)).json.images || []) if (image.uri) used.add(path.basename(image.uri));
if (existsSync(shared)) for (const name of await readdir(shared)) if (!used.has(name)) { await unlink(path.join(shared, name)); console.log(`removed unused ${name}`); }
console.log(`${files.length} models share ${used.size} texture files`);

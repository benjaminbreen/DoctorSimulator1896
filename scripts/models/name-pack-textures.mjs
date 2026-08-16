// Stamp every embedded pack image with a content-hash name.
//
// Pack pieces from one kit each embed their own copy of the kit's shared
// materials — 27 of the Victorian walls carry the same plaster texture, and
// three uploads each copy to the GPU separately. The runtime collapses them
// (see game/src/scene/packTextures.js), but it needs a key that means "these
// are the same image", and the park pack ships its images unnamed.
//
// Only images[].name changes. The JSON chunk is rewritten in place and the BIN
// chunk copied verbatim, so meshopt payloads and bufferView offsets are
// untouched — this cannot alter geometry.
//
//   node scripts/models/name-pack-textures.mjs

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const PACKS = ['park', 'victorian', 'props'];

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function readChunks(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const chunks = [];
  for (let offset = 12; offset < buffer.length;) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 8 + length;
  }
  return chunks;
}

function writeGlb(chunks) {
  const parts = [];
  let total = 12;
  for (const { type, data } of chunks) {
    // JSON pads with spaces and BIN with zeroes, both to a 4-byte boundary.
    const padding = (4 - (data.length % 4)) % 4;
    const padded = padding
      ? Buffer.concat([data, Buffer.alloc(padding, type === JSON_CHUNK ? 0x20 : 0x00)])
      : data;
    const header = Buffer.alloc(8);
    header.writeUInt32LE(padded.length, 0);
    header.writeUInt32LE(type, 4);
    parts.push(header, padded);
    total += 8 + padded.length;
  }
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  return Buffer.concat([header, ...parts]);
}

async function glbFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.glb')) found.push(path.join(entry.parentPath, entry.name));
  }
  return found.sort();
}

for (const pack of PACKS) {
  const dir = path.join(ROOT, 'game/public/models', pack);
  const unique = new Set();
  let images = 0;
  let renamed = 0;

  for (const file of await glbFiles(dir)) {
    const buffer = await readFile(file);
    const chunks = readChunks(buffer);
    const jsonChunk = chunks.find((chunk) => chunk.type === JSON_CHUNK);
    const binChunk = chunks.find((chunk) => chunk.type === BIN_CHUNK);
    const gltf = JSON.parse(jsonChunk.data.toString('utf8'));
    if (!gltf.images?.length) continue;

    let changed = false;
    for (const image of gltf.images) {
      const view = gltf.bufferViews[image.bufferView];
      if (!view) throw new Error(`${file}: image has no bufferView`);
      const start = view.byteOffset ?? 0;
      const bytes = binChunk.data.subarray(start, start + view.byteLength);
      const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
      // Keep the authored name readable; the hash is what makes it an identity.
      const base = image.name?.replace(/-[0-9a-f]{8}$/, '') || 'texture';
      const name = `${base}-${hash}`;
      images += 1;
      unique.add(hash);
      if (image.name !== name) {
        image.name = name;
        renamed += 1;
        changed = true;
      }
    }

    if (!changed) continue;
    jsonChunk.data = Buffer.from(JSON.stringify(gltf), 'utf8');
    const rebuilt = writeGlb(chunks);
    // The BIN chunk must survive byte-for-byte; a mismatch means geometry moved.
    const after = readChunks(rebuilt).find((chunk) => chunk.type === BIN_CHUNK);
    if (!after.data.equals(binChunk.data)) throw new Error(`${file}: binary chunk changed`);
    await writeFile(file, rebuilt);
  }

  console.log(
    `${pack}: ${images} embedded images, ${unique.size} unique, ${renamed} renamed`
    + ` (${images - unique.size} duplicate uploads collapsible)`,
  );
}

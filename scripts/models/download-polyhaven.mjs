// Download a Poly Haven model at 1K and package its glTF files as one GLB.
//
//   node scripts/models/download-polyhaven.mjs props vintage_microscope
//
// Poly Haven publishes every asset under CC0. The generated source GLB keeps
// the title, author, licence and source page in asset metadata so the normal
// model-pack conversion preserves provenance in the shipped manifest.

import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const API = 'https://api.polyhaven.com';
const CC0 = 'CC0-1.0 (https://creativecommons.org/publicdomain/zero/1.0/)';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function download(file, destination) {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`${response.status} ${file.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('md5').update(bytes).digest('hex');
  if (digest !== file.md5) throw new Error(`${file.url}: expected ${file.md5}, got ${digest}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

async function acquire(pack, id) {
  const [info, files] = await Promise.all([
    json(`${API}/info/${id}`),
    json(`${API}/files/${id}`),
  ]);
  const gltf = files.gltf?.['1k']?.gltf;
  if (!gltf) throw new Error(`${id}: Poly Haven has no 1K glTF`);

  const temporary = await mkdtemp(path.join(os.tmpdir(), `gotma-${id}-`));
  try {
    const main = path.join(temporary, path.basename(new URL(gltf.url).pathname));
    await download(gltf, main);
    for (const [relative, included] of Object.entries(gltf.include ?? {})) {
      await download(included, path.join(temporary, relative));
    }

    const document = await io.read(main);
    const asset = document.getRoot().getAsset();
    asset.extras = {
      ...(asset.extras ?? {}),
      title: info.name,
      author: Object.keys(info.authors ?? {}).join(', ') || 'Poly Haven',
      license: CC0,
      source: `https://polyhaven.com/a/${id}`,
    };

    const output = path.join(ROOT, 'assets-src', pack, `${id}.glb`);
    await mkdir(path.dirname(output), { recursive: true });
    await io.write(output, document);
    console.log(`${id}: ${info.name} -> ${path.relative(ROOT, output)}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const [pack, ...ids] = process.argv.slice(2);
if (!pack || ids.length === 0) {
  throw new Error('usage: download-polyhaven.mjs <pack> <asset-id> [asset-id ...]');
}
for (const id of ids) await acquire(pack, id);

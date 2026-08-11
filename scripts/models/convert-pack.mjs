// Convert downloaded GLBs into web-ready model packs.
//
//   node scripts/models/convert-pack.mjs park
//   node scripts/models/convert-pack.mjs props
//
// Sources live in assets-src/<pack>/ (gitignored) and land in
// game/public/models/<pack>/ with a manifest of measured sizes and credits.
// Each piece comes out upright, centred on its footprint, base at y=0, so a
// placement position is the model's ground-contact point.
//
// Adding a piece:
//   1. node scripts/models/inspect-glb.mjs assets-src/<pack>/<file>.glb
//   2. Pick `scale` from a real feature it reports, never from the bounding
//      box: a seat belongs at 0.42m, a table top at 0.75m, a step at 0.18m.
//   3. Add it to TRANSFORMS, convert, and look at it on the metre grid at
//      game/model-check.html.
//   4. Add its credit to docs/credits.md.

import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join,
  metalRough,
  prune,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

// Per piece: `scale` to metres, `yaw` to put the long axis on x (so a
// placement yaw of 0 faces +z), `tris` a triangle budget for pieces that
// arrive far over it, `texture` a pixel cap when the default is more than the
// piece earns on screen, and `origin` to move the ground-contact point off the
// footprint centre for a piece that hangs to one side. `foliage` marks a piece
// built from leaf cards, which need both faces and an alpha cutout.
//
// `presence` is the one place a piece is allowed to lie about its size. Set
// `scale` from a real measurement and leave it alone; when a piece reads too
// small at the distance a room actually plays at, bump `presence` and say why.
// The manifest keeps both, so the true size is never lost and the exaggeration
// is always visible. Default 1 — a piece with no note is honestly sized.
const TRANSFORMS = {
  park: {
    // Seat 24.2 units up -> 0.40m. A long bench: 3.4m, tall back.
    large_park_bench: { scale: 0.0165, yaw: 0 },
    // Seat 1.26 units up -> 0.40m.
    small_park_bench: { scale: 0.318, yaw: Math.PI / 2 },
    // 3.6m to the finial, lantern at about 2.9m — the height of the
    // placeholder gas lamps it replaces. Its lantern hangs off an arm, so
    // centring the footprint would leave the post half a metre off its
    // placement; `origin` puts the post itself on the origin instead.
    'low-poly_lamp_post': { scale: 0.0077, yaw: 0, origin: [0.284, 0] },
    // Already in metres: a 19.5m run, 1.4m high.
    metal_and_concrete_guardrail_8_MB: { scale: 1, yaw: 0, tris: 4000 },
    // Park planting, carried over from Young Darwin's Post Office Bay. These
    // are photo-derived rather than faceted, which is the register the ground
    // texture and the brownstones are already in.
    //
    // 3.47 units across -> a 0.9m clump of blades. The heaviest piece here by
    // far, and the one placed most, so it takes a hard triangle budget.
    meadow_grass: { scale: 0.26, yaw: 0, tris: 900, texture: 512 },
    // One kit holding the park's whole planting: three tree species in four
    // variants each, a hedge, five bushes, ground clover, grass, and flowers.
    // Authored in metres, so the split pieces need no scaling — the park
    // sizes each placement instead. Splitting is what makes them separately
    // placeable, and keeps each output's textures pruned to its own piece.
    shapespark_plants: { scale: 1, yaw: 0, texture: 512, split: 30, foliage: true },
  },
  props: {
    // A 0.22m desk trinket in the source; the game wants a floor globe on its
    // stand, so it is scaled up to 1.15m and simplified hard.
    explorers_globe: { scale: 5.3, yaw: 0, tris: 3500, texture: 512 },
    // 1.6m on its tripod.
    medieval_telescope: { scale: 0.01, yaw: 0, tris: 6000 },
    // Seat 0.25 units up -> 0.42m: a true 2.5m chaise. Enlarged because a
    // consulting room's one soft furnishing should hold the corner it is in.
    victorian_style_sofa: { scale: 1.68, presence: 1.161, yaw: 0, tris: 9000 },
    // A pedestal desk, three times real size in the source. Top 1.94 units up
    // -> a correct 0.76m. Enlarged to read as a physician's desk rather than a
    // small writing table; the cost is a top that sits high to sit at.
    vintage_wooden_workdesk: { scale: 0.39, presence: 1.205, yaw: Math.PI / 2 },
    // One pack file holding two dozen books. Split gives one model per book,
    // which is what lets them be shelved individually.
    elegan_old_book_pack: { scale: 1, yaw: 0, texture: 256, split: 10 },
    // 1.69m across in the source: a hearth rug. Scaled to 4.2m, which is a
    // room-sized carpet — what a consulting room or parlor floor actually
    // carried. Ten triangles and one texture, so the pattern is the whole
    // piece and the map keeps its full size.
    game_ready_carpet: { scale: 2.49, yaw: 0, texture: 1024 },
    // Poly Haven sources are authored in metres and arrive upright. These
    // small office and medical props use 1K textures from the source API.
    ArmChair_01: { scale: 1, yaw: 0, texture: 1024 },
    chemistry_set: { scale: 1, yaw: 0, tris: 20000, texture: 1024 },
    round_spectacles: { scale: 1, yaw: 0, tris: 7000, texture: 512 },
    vintage_crutches_01: { scale: 1, yaw: 0, tris: 7000, texture: 1024 },
    vintage_microscope: { scale: 1, yaw: 0, tris: 12000, texture: 1024 },
    // The scan includes micro-displacement geometry that is invisible at its
    // 22 cm game size, so reduce it from 213K triangles to a prop-scale mesh.
    wooden_candlestick: { scale: 1, yaw: 0, tris: 6000, texture: 512 },
    // Second-pass period dressing. Poly Haven sources are in metres; budgets
    // preserve the silhouettes while removing detail too small for play view.
    vintage_pocket_watch: { scale: 1, yaw: 0, tris: 4200, texture: 512 },
    tea_set_01: { scale: 1, yaw: 0, tris: 20000, texture: 1024 },
    mantel_clock_01: { scale: 1, yaw: 0, tris: 12000, texture: 1024 },
    old_bed_frame: { scale: 1, yaw: 0, tris: 15000, texture: 1024 },
    vintage_day_bed: { scale: 1, yaw: 0, texture: 1024 },
    book_encyclopedia_set_01: { scale: 1, yaw: 0, tris: 18000, texture: 1024 },
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// World-space bounds of every mesh in the document.
function bounds(document) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const element = [0, 0, 0];
      for (let i = 0; i < position.getCount(); i += 1) {
        position.getElement(i, element);
        const [x, y, z] = element;
        const world = [
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ];
        for (let axis = 0; axis < 3; axis += 1) {
          min[axis] = Math.min(min[axis], world[axis]);
          max[axis] = Math.max(max[axis], world[axis]);
        }
      }
    }
  }
  return { min, max };
}

function triangleCount(document) {
  let tris = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      tris += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return Math.round(tris);
}

const round = (value) => Math.round(value * 1e4) / 1e4;

// Reparent the whole scene under one node carrying the transform. Cheaper to
// reason about than baking vertices, and `flatten` leaves the nodes it moved
// holding their own TRS, which a bake would have to compose with.
function wrap(document, { scale = 1, yaw = 0, move = [0, 0, 0] }) {
  for (const scene of document.getRoot().listScenes()) {
    const parent = document
      .createNode('normalize')
      .setScale([scale, scale, scale])
      .setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)])
      .setTranslation(move);
    for (const child of scene.listChildren()) parent.addChild(child);
    scene.addChild(parent);
  }
}

// The pieces a multi-object source holds. Exporters wrap everything in a chain
// of single-child nodes (Sketchfab_model > *.fbx > RootNode); the groups are
// the children of the last link in that chain.
function groupNames(document) {
  let node = document.getRoot().listScenes()[0]?.listChildren()[0];
  while (node && !node.getMesh() && node.listChildren().length === 1) {
    node = node.listChildren()[0];
  }
  return (node?.listChildren() ?? []).map((child) => child.getName()).filter(Boolean);
}

// Drop every group but one, so the standard pipeline can normalize it alone.
function keepOnly(document, group) {
  let node = document.getRoot().listScenes()[0]?.listChildren()[0];
  while (node && !node.getMesh() && node.listChildren().length === 1) {
    node = node.listChildren()[0];
  }
  for (const child of node?.listChildren() ?? []) {
    if (child.getName() !== group) child.dispose();
  }
}

async function convert(pack, file, group = null) {
  const source = path.basename(file, '.glb');
  const name = group ? `${source}__${group}` : source;
  const spec = TRANSFORMS[pack]?.[source];
  if (!spec) throw new Error(`${pack}/${source}: add it to TRANSFORMS first`);
  const document = await io.read(path.join(ROOT, 'assets-src', pack, file));
  if (group) keepOnly(document, group);
  const before = triangleCount(document);

  await document.transform(
    // Older Sketchfab exports carry their colour in the spec-gloss extension,
    // which three ignores — the piece renders flat grey without this.
    metalRough(),
    flatten(),
    join(),
    weld(),
    dedup(),
    resample(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [spec.texture ?? 1024, spec.texture ?? 1024],
    }),
  );

  // Simplify after welding, or the seams keep the decimator from collapsing
  // anything. Ratio, not absolute count, is what the transform takes.
  if (spec.tris && before > spec.tris) {
    await MeshoptSimplifier.ready;
    await document.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: spec.tris / before, error: 0.005 }),
    );
  }

  const presence = spec.presence ?? 1;
  wrap(document, { scale: spec.scale * presence, yaw: spec.yaw });

  // Recentre: base on the ground, origin under the middle of the footprint,
  // then shift to a named ground-contact point if the piece has one.
  const box = bounds(document);
  const [ox, oz] = spec.origin ?? [0, 0];
  wrap(document, {
    move: [
      -(box.min[0] + box.max[0]) / 2 - ox,
      -box.min[1],
      -(box.min[2] + box.max[2]) / 2 - oz,
    ],
  });

  // Backfaces cost fill rate and break shadows on flat slats. Foliage is the
  // exception: leaves are single quads, so culling backfaces empties half the
  // canopy. Those also arrive alpha-blended, which sorts wrong against itself
  // and casts no shadow; a cutout does both correctly.
  for (const material of document.getRoot().listMaterials()) {
    if (!spec.foliage) {
      material.setDoubleSided(false);
      continue;
    }
    material.setDoubleSided(true);
    if (material.getAlphaMode() === 'BLEND') material.setAlphaMode('MASK').setAlphaCutoff(0.4);
  }

  const out = path.join(ROOT, 'game', 'public', 'models', pack);
  const after = bounds(document);
  await io.write(path.join(out, `${name}.glb`), document);
  // Sketchfab CC-BY sources carry their credit in the asset extras. Keep it in
  // the manifest: the licence requires attribution wherever they ship.
  const extras = document.getRoot().getAsset().extras ?? {};
  const size = after.max.map((value, axis) => value - after.min[axis]);
  return {
    name,
    tris: triangleCount(document),
    before,
    presence,
    entry: {
      file: `${name}.glb`,
      min: after.min.map(round),
      // `size` is what ships and what the game builds colliders from;
      // `measured` is the real thing, kept so the exaggeration stays legible.
      size: size.map(round),
      measured: presence === 1 ? undefined : size.map((value) => round(value / presence)),
      presence: presence === 1 ? undefined : round(presence),
      credit: extras.author
        ? { title: extras.title, author: extras.author, license: extras.license, source: extras.source }
        : spec.credit,
    },
  };
}

const pack = process.argv[2];
if (!pack || !TRANSFORMS[pack]) {
  throw new Error(`usage: convert-pack.mjs <${Object.keys(TRANSFORMS).join('|')}>`);
}
const src = path.join(ROOT, 'assets-src', pack);
const out = path.join(ROOT, 'game', 'public', 'models', pack);
await mkdir(out, { recursive: true });
const files = (await readdir(src)).filter((file) => file.toLowerCase().endsWith('.glb')).sort();
const manifest = {};
const report = ({ name, entry, tris, before, presence }) => {
  manifest[name] = entry;
  const decimated = tris < before ? ` (from ${before.toLocaleString()})` : '';
  const inflated = presence === 1 ? '' : `, presence x${presence} (true ${entry.measured.join(' x ')})`;
  console.log(`${name}: ${entry.size.join(' x ')} m, ${tris.toLocaleString()} tris${decimated}${inflated}`);
};
for (const file of files) {
  const spec = TRANSFORMS[pack][path.basename(file, '.glb')];
  if (!spec?.split) {
    report(await convert(pack, file));
    continue;
  }
  // A pack file: one model per group, up to the limit. Reading the source per
  // group keeps each output's textures pruned to what that piece uses.
  const groups = groupNames(await io.read(path.join(src, file))).slice(0, spec.split);
  for (const group of groups) report(await convert(pack, file, group));
  console.log(`  split ${path.basename(file, '.glb')} into ${groups.length} pieces`);
}
await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`wrote ${files.length} pieces to ${path.relative(ROOT, out)}`);

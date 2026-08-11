import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  activeWardrobeId, RENDERER_C_SOURCE_GARMENTS, RENDERER_C_WARDROBE,
  wardrobeFor, wardrobePatch,
} from '../character-lab/src/wardrobe.js';
import {
  rendererCFabricMaterialSettings, rendererCWomenPalette, RENDERER_C_DRESS_DETAIL_PATTERNS,
  RENDERER_C_FABRICS, RENDERER_C_WOMEN_WARDROBE_IDS,
} from '../shared/characters/rendererCWardrobeSurface.js';

test('wardrobe ids are unique and every cohort has ready choices', () => {
  for (const [cohort, entries] of Object.entries(RENDERER_C_WARDROBE)) {
    assert.ok(entries.length >= 5, `${cohort} has a useful wardrobe`);
    assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  }
});

test('wardrobe choices cannot cross the sex-specific outfit sets', () => {
  for (const item of wardrobeFor('women')) {
    assert.ok(!item.values.outfitStyle.startsWith('mens-'), item.id);
  }
  for (const item of wardrobeFor('men')) {
    assert.ok(item.values.outfitStyle.startsWith('mens-'), item.id);
  }
});

test('wardrobe patches are copies and active selection follows current values', () => {
  const patch = wardrobePatch('men', 'formal-frock');
  assert.equal(patch.formalCoatCut, 'frock-coat');
  patch.formalCoatCut = 'changed';
  assert.equal(wardrobePatch('men', 'formal-frock').formalCoatCut, 'frock-coat');
  assert.equal(activeWardrobeId('men', wardrobePatch('men', 'formal-frock')), 'formal-frock');
  assert.equal(wardrobePatch('women', 'does-not-exist'), null);
});

test('the golden dress is the first women wardrobe prototype', () => {
  assert.equal(wardrobeFor('women')[0].id, 'golden-dress');
  assert.equal(wardrobePatch('women', 'golden-dress').womenGarmentMode, 'golden-dress');
});

test('downloaded source garments declare a valid target cohort', () => {
  assert.ok(RENDERER_C_SOURCE_GARMENTS.length >= 4);
  for (const source of RENDERER_C_SOURCE_GARMENTS) {
    assert.ok(['women', 'men', 'all'].includes(source.cohort));
    assert.ok(source.id && source.label && source.source && source.preview);
  }
});

test('every source-only examination mesh ships with Character Lab', async () => {
  const publicRoot = path.resolve(import.meta.dirname, '../character-lab/public');
  for (const source of RENDERER_C_SOURCE_GARMENTS) {
    await access(path.join(publicRoot, source.preview.replace(/^\//, '')));
  }
});

test('women wardrobe exposes bounded fabric, palette, and detail controls', () => {
  assert.deepEqual(Object.keys(RENDERER_C_FABRICS), ['cotton', 'wool', 'silk', 'velvet', 'brocade']);
  assert.deepEqual(rendererCWomenPalette('navy-burgundy'), {
    primary: '#202d43', secondary: '#65313a', accent: '#b49b72',
  });
  for (const id of [
    'fabricType', 'fabricScale', 'fabricRelief', 'fabricSheen', 'secondaryColor',
    'necklineHeight', 'cuffWidth', 'trimWidth', 'placketWidth',
    'dressDetailPattern', 'dressDetailAmount', 'dressDetailScale', 'collarThickness', 'cuffThickness',
  ]) assert.ok(RENDERER_C_WOMEN_WARDROBE_IDS.has(id), id);
  assert.deepEqual(Object.keys(RENDERER_C_DRESS_DETAIL_PATTERNS), [
    'plain', 'double-stitch', 'chevron', 'diamond', 'braid', 'vine',
  ]);
});

test('each generated fabric has independent 1024px PBR maps in both apps', async () => {
  const roots = [
    path.resolve(import.meta.dirname, '../character-lab/public/textures/renderer-c/fabrics'),
    path.resolve(import.meta.dirname, '../game/public/textures/renderer-c/fabrics'),
  ];
  for (const root of roots) {
    for (const fabric of Object.keys(RENDERER_C_FABRICS)) {
      for (const channel of ['albedo', 'roughness', 'normal']) {
        const file = path.join(root, `${fabric}-${channel}.png`);
        await access(file);
        const png = await readFile(file);
        assert.equal(png.readUInt32BE(16), 1024, file);
        assert.equal(png.readUInt32BE(20), 1024, file);
      }
    }
  }
});

test('fabric presets remain cloth-like across the full sheen range', () => {
  for (const fabric of Object.keys(RENDERER_C_FABRICS)) {
    const normal = rendererCFabricMaterialSettings(fabric, {
      fabricRoughness: 1, fabricRelief: 0.72, fabricSheen: 0.72,
    });
    const strongestSheen = rendererCFabricMaterialSettings(fabric, {
      fabricRoughness: 0.35, fabricRelief: 1.5, fabricSheen: 1.5,
    });
    assert.ok(normal.roughness >= 0.72, `${fabric} default roughness`);
    assert.ok(strongestSheen.roughness >= 0.72, `${fabric} minimum roughness`);
    assert.ok(strongestSheen.sheen <= 0.18, `${fabric} sheen ceiling`);
    assert.ok(strongestSheen.anisotropy <= 0.27, `${fabric} anisotropy ceiling`);
    assert.ok(normal.specularIntensity <= 0.22, `${fabric} specular intensity`);
    assert.ok(normal.envMapIntensity <= 0.21, `${fabric} environment intensity`);
    assert.equal(normal.clearcoat, 0, `${fabric} clearcoat`);
  }
});

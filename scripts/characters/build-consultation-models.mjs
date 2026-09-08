// Keep the configurable masters for the lab; each consultation loads only
// its selected facial accessories and identity anchor.
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { fitConsultationDress } from './fit-consultation-dress.mjs';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { prune } from '@gltf-transform/functions';
import { createIO, compressAccessors } from '../lib/glb-pipeline.mjs';
const directory = new URL('../../game/public/models/characters/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('renderer-c-cohorts.json', directory), 'utf8'));
const io = await createIO();
await mkdir(new URL('consultation/', directory), { recursive: true });
const slots = { brows: 'browSlot', lashes: 'lashSlot', hair: 'hairSlot', eyes: 'eyeSlot', teeth: 'teethSlot' };
for (const [cohort, definition] of Object.entries(manifest.cohorts)) {
  definition.consultationPaths = [];
  const master = await io.read(fileURLToPath(new URL(`renderer-c-${cohort}.glb`, directory)));
  const lab = await io.read(fileURLToPath(new URL(`../../../../character-lab/public/models/renderer-c-${cohort}.glb`, directory)));
  const cachedTextures = new Map();
  if (process.argv.includes('--reuse-textures')) {
    for (let i=0; i<8; i++) {
      const cached = await io.read(fileURLToPath(new URL(`consultation/${cohort}-${i}.glb`, directory)));
      for (const texture of cached.getRoot().listTextures()) cachedTextures.set(texture.getName(), texture);
    }
  }
  const sources = new Map(lab.getRoot().listTextures().map(texture => [texture.getName(), texture]));
  const dataTextures = new Set(master.getRoot().listMaterials().flatMap(material =>
    [material.getNormalTexture(), material.getMetallicRoughnessTexture(), material.getOcclusionTexture()].filter(Boolean)));
  for (const texture of master.getRoot().listTextures()) {
    const source = sources.get(texture.getName());
    if (!source) throw new Error(`Missing uncompressed source texture: ${texture.getName()}`);
    const size = /lightskinned/.test(texture.getName()) ? 2048
      : /hair|short0/i.test(texture.getName()) ? 1024 : /teeth|_eye$/.test(texture.getName()) ? 256 : 512;
    if (source.getSize().every(value => value <= size) && !/_eye$/.test(texture.getName())) continue;
    const cached = cachedTextures.get(texture.getName());
    if (cached && !dataTextures.has(texture)) { texture.setImage(cached.getImage()); texture.setMimeType(cached.getMimeType()); continue; }
    texture.setImage(await sharp(source.getImage()).resize(size, size, { fit: 'inside', withoutEnlargement: true }).png().toBuffer());
    texture.setMimeType('image/png');
  }
  const eyes = master.getRoot().listTextures().filter(texture => /_eye$/.test(texture.getName()));
  for (const texture of eyes) {
    texture.setImage(await sharp(texture.getImage()).webp({ quality: 90 }).toBuffer());
    texture.setMimeType('image/webp-keep');
  }
  const imageDecoder = async buffer => {
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  };
  const encoding = { isUASTC: true, needSupercompression: true, uastcLDRQualityLevel: 2, imageDecoder };
  await master.transform(
    ktx2({ ...encoding, slots: /^(baseColorTexture|emissiveTexture)$/ }),
    ktx2({ ...encoding, slots: /^(?!(?:baseColorTexture|emissiveTexture)$).+/,
      isInputSRGB: false, isSetKTX2SRGBTransferFunc: false, isPerceptual: false }),
  );
  for (const texture of eyes) texture.setMimeType('image/webp');
  if (cohort === 'women') fitConsultationDress(master);
  const masterBytes = await io.writeBinary(master);
  for (let index = 0; index < definition.anchors.length; index++) {
    const anchor = definition.anchors[index];
    const doc = await io.readBinary(masterBytes);
    const root = doc.getRoot();
    for (const animation of root.listAnimations()) {
      if (animation.listChannels().some(channel => channel.getTargetPath() === 'weights')) {
        throw new Error('Morph animation channels need remapping before splitting this asset');
      }
    }
    for (const node of root.listNodes()) {
      const extras = node.getExtras();
      const slot = slots[extras.renderer_c_variant_role];
      if (slot && Number(extras.renderer_c_variant_slot) !== (anchor[slot] ?? 0)) node.setMesh(null);
      // Generic women wear the Golden dress. Authored/custom assets retain
      // their original paths and can still request other outfits.
      if (cohort === 'men' && /^RendererC_(EliteMorningSuit|VictorianGarment)/.test(node.getName())) node.setMesh(null);
      if (cohort === 'women' && /^RendererC_(BaseGarment|VictorianDress|VictorianDetails)/.test(node.getName())) node.setMesh(null);
    }
    for (const mesh of root.listMeshes()) {
      const names = mesh.getExtras().targetNames;
      if (!names) continue;
      const keep = names.map((name, i) => !name.startsWith('rc_anchor_') || name === anchor.morph ? i : -1).filter(i => i >= 0);
      for (const primitive of mesh.listPrimitives()) {
        const targets = primitive.listTargets();
        for (let i = 0; i < targets.length; i++) if (!keep.includes(i)) primitive.removeTarget(targets[i]);
      }
      mesh.setExtras({ ...mesh.getExtras(), targetNames: keep.map(i => names[i]) });
      if (mesh.getWeights().length) mesh.setWeights(keep.map(i => mesh.getWeights()[i] ?? 0));
      for (const node of root.listNodes()) {
        if (node.getMesh() === mesh && node.getWeights().length) node.setWeights(keep.map(i => node.getWeights()[i] ?? 0));
      }
    }
    await doc.transform(prune({ keepAttributes: true, keepLeaves: true, keepSolidTextures: true }));
    await compressAccessors(doc, null);
    const name = `consultation/${cohort}-${index}.glb`;
    const target = new URL(name, directory);
    await io.write(fileURLToPath(target), doc);
    definition.consultationPaths.push(`/models/characters/${name}?v=1`);
    console.log(name, ((await stat(target)).size / 1048576).toFixed(2), 'MiB');
  }
}
await writeFile(new URL('renderer-c-cohorts.json', directory), JSON.stringify(manifest, null, 2) + '\n');

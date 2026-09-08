// Far trees keep their silhouette, UVs and material names; the renderer shares
// the full trees' textures. Run from the repository root with Node.
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { simplify, prune, quantize, reorder } from '@gltf-transform/functions';
import { createIO, contract } from '../lib/glb-pipeline.mjs';
import { TREE_MODEL_URLS } from '../../game/src/world/treeModels.js';
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = await createIO();
for (const url of TREE_MODEL_URLS) {
  const path = `game/public${url}`;
  const document = await io.read(path);
  const before = contract(document).triangles;
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  await document.transform(
    simplify({ simplifier: MeshoptSimplifier, ratio: .45, error: .025 }),
    prune({ keepAttributes: true }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
  );
  const extension = document.getRoot().listExtensionsUsed().find((e) => e.extensionName === EXTMeshoptCompression.EXTENSION_NAME)
    ?? document.createExtension(EXTMeshoptCompression);
  extension.setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const after = contract(document).triangles;
  await io.write(path.replace('.glb', '-lod.glb'), document);
  console.log(`${url}: ${before} -> ${after} triangles`);
}

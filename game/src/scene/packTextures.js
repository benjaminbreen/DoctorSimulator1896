// Collapse the duplicate texture uploads the model packs would otherwise cause.
//
// Each pack piece is its own GLB and embeds its own copy of the kit's shared
// materials: 27 of the Victorian wall pieces carry the same plaster image, and
// the park plants repeat six between them. GLTFLoader's texture cache lives on
// the parser, so it only spans one file — a second piece re-decodes the same
// bytes into a new Texture with a new Source, and three keys GPU textures by
// Source, so the image is uploaded again. Measured on a Central Park boot that
// was 922MB of texture memory, ~310MB of it these repeats.
//
// Pointing the later copies at the first Source we saw makes three reuse the
// one upload. Sampler settings stay per-Texture, and the WebGL texture is
// refcounted per source, so disposing one piece cannot pull the image out from
// under another.
//
// The key is the image name, which scripts/models/name-pack-textures.mjs
// stamps with a content hash. Sharing a Source between two different images
// would show the wrong art, so an unnamed or unhashed texture is left alone.

const HASHED_NAME = /-[0-9a-f]{8}$/;

const SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'specularMap',
];

const sources = new Map();

export function sharePackTextures(gltf) {
  gltf.scene.traverse((node) => {
    for (const material of [].concat(node.material ?? [])) {
      if (!material) continue;
      for (const slot of SLOTS) {
        const texture = material[slot];
        if (!texture?.name || !HASHED_NAME.test(texture.name)) continue;
        const shared = sources.get(texture.name);
        if (shared === undefined) {
          sources.set(texture.name, texture.source);
        } else if (shared !== texture.source) {
          texture.source = shared;
          texture.needsUpdate = true;
        }
      }
    }
  });
  return gltf;
}

export function sharedPackTextureCount() {
  return sources.size;
}

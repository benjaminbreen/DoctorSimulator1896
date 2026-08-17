// One KTX2 loader for the whole app.
//
// KTX2 textures stay compressed on the GPU instead of being expanded to raw
// RGBA, which is where the video memory goes: a 1024x1024 texture costs ~5.3MB
// as RGBA with mipmaps and about a quarter of that as KTX2/UASTC.
//
// The transcoder has to be told which compressed formats this GPU accepts, so
// detectSupport needs the live renderer. It is cheap to call again on the same
// renderer and must be called before the first load, so callers pass the gl
// they already have.

import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

let loader = null;
let detectedFor = null;

export function getKTX2Loader(renderer) {
  loader ??= new KTX2Loader().setTranscoderPath('/basis/');
  if (renderer && detectedFor !== renderer) {
    loader.detectSupport(renderer);
    detectedFor = renderer;
  }
  return loader;
}

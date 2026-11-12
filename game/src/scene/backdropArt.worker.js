import { paintBackdrop } from './backdropArt.js';

self.onmessage = async ({ data: sizes }) => {
  const images = [];
  try {
    for (const [width, height, seed, style] of sizes) {
      const canvas = new OffscreenCanvas(width * 2, height * 2);
      paintBackdrop(canvas, width, height, seed, style);
      images.push(await createImageBitmap(canvas, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }));
    }
    self.postMessage(images, images);
  } catch {
    images.forEach(image => image.close());
    self.postMessage(null);
  }
};

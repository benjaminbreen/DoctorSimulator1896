import { samplePondDepth } from './pondDepth.js';

self.onmessage = ({ data: { outline, level } }) => {
  const bake = samplePondDepth(outline, level);
  self.postMessage(bake, [bake.data.buffer, bake.depths.buffer]);
};

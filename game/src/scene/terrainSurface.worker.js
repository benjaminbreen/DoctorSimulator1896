import { buildTerrainSurface } from './terrainSurface.js';

const { geometry, heights } = buildTerrainSurface();
const attributes = Object.fromEntries(Object.entries(geometry.attributes).map(
  ([name, attribute]) => [name, { array: attribute.array, size: attribute.itemSize }],
));
const indices = geometry.index.array;
self.postMessage({ attributes, indices, heights }, [
  heights.buffer, indices.buffer, ...Object.values(attributes).map(attribute => attribute.array.buffer),
]);

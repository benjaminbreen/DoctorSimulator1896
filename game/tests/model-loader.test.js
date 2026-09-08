import test from 'node:test';
import assert from 'node:assert/strict';
import { GLTFLoader } from '../src/scene/modelLoader.js';

test('separate consumers share one parsed GLB', async () => {
  // A valid empty glTF needs no browser image decoder or network access.
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify({ asset: { version: '2.0' }, scenes: [{}], scene: 0 }))}`;
  // Three's FileLoader reports progress even for an in-memory response.
  globalThis.ProgressEvent ??= class { constructor(type, values) { this.type = type; Object.assign(this, values); } };
  const first = new GLTFLoader();
  const second = new GLTFLoader();
  const [a, b] = await Promise.all([first.loadAsync(url), second.loadAsync(url)]);
  assert.equal(a, b);
  assert.equal(await first.loadAsync(url), a);
});

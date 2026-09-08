import { GLTFLoader as ThreeGLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// R3F caches an entire URL array as one request. Sharing the per-file promise
// avoids decoding the same model again in another array or during preloading.
const models = new Map();
const queue = [];
let active = 0;
function pump() {
  while (active < 4 && queue.length) {
    active++;
    queue.shift()();
  }
}
export class GLTFLoader extends ThreeGLTFLoader {
  load(url, onLoad, onProgress, onError) {
    const key = this.manager.resolveURL((this.path ?? '') + url);
    let record = models.get(key);
    if (record && !this.background && record.start) {
      const index = queue.indexOf(record.start);
      if (index >= 0) { queue.splice(index, 1); queue.unshift(record.start); }
      record.signal = null;
    }
    let pending = record?.promise;
    if (!pending) {
      record = { signal: this.signal, start: null, promise: null };
      pending = new Promise((resolve, reject) => {
        const finish = (callback) => (result) => {
          active--;
          callback(result);
          pump();
        };
        const start = () => {
          record.start = null;
          if (record.signal?.aborted) {
            finish(reject)(new Error('Background model load cancelled'));
            return;
          }
          try { super.load(url, finish(resolve), onProgress, finish(reject)); }
          catch (error) { finish(reject)(error); }
        };
        record.start = start;
        if (this.background) queue.push(start);
        else queue.unshift(start);
        pump();
      });
      record.promise = pending;
      models.set(key, record);
      pending.catch(() => { if (models.get(key) === record) models.delete(key); });
    }
    pending.then(onLoad, onError);
  }
}

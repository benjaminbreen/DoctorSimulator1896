// One random seed per playthrough. Crowd identities reroll between sessions
// but stay fixed within one, because every roll mixes this in.

export function runSeedFromSearch(search) {
  const params = new URLSearchParams(search);
  const value = params.get('seed');
  if (!params.has('playtest') || !/^\d+$/.test(value ?? '')) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed <= 0xffffffff ? seed : null;
}

let runSeed = runSeedFromSearch(globalThis.location?.search ?? '')
  ?? ((Math.random() * 0xffffffff) >>> 0);

export function getRunSeed() {
  return runSeed;
}

export function setRunSeedForTests(value) {
  runSeed = value >>> 0;
}

// One random seed per playthrough. Crowd identities reroll between sessions
// but stay fixed within one, because every roll mixes this in.

let runSeed = (Math.random() * 0xffffffff) >>> 0;

export function getRunSeed() {
  return runSeed;
}

export function setRunSeedForTests(value) {
  runSeed = value >>> 0;
}

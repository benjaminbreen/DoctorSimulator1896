/** Deterministic random streams for procedural patients.
 *
 * Each subsystem receives a stream derived from the patient seed and a stable
 * label. Adding a new clothing draw therefore cannot change a patient's name,
 * complaint, or household. This is deliberately independent of Three.js.
 */

function hashLabel(label) {
  let hash = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed) {
  const numeric = Number(seed);
  if (!Number.isFinite(numeric)) return 1;
  return (Math.abs(Math.trunc(numeric)) >>> 0) || 1;
}

export function nextSeed(seed) {
  const next = Math.imul(normalizeSeed(seed), 48271) % 2147483647;
  return (Math.abs(next) % 9999) + 1;
}

/** A fresh UI roll, as opposed to the reproducible next step in a seed stream. */
export function randomSeed(excluded = []) {
  const blocked = new Set((Array.isArray(excluded) ? excluded : [excluded]).map(normalizeSeed));
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let value;
    if (globalThis.crypto?.getRandomValues) {
      value = (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % 9999) + 1;
    } else {
      // Only used by older/non-browser runtimes. The patient remains reproducible
      // after this one-time seed has been written into the preset.
      value = ((Date.now() + Math.imul(attempt + 1, 2654435761)) >>> 0) % 9999 + 1;
    }
    if (!blocked.has(value)) return value;
  }
  return (Math.max(0, ...blocked) % 9999) + 1;
}

export function createRandom(seed, label = 'root') {
  let state = (normalizeSeed(seed) ^ hashLabel(label)) >>> 0;
  const float = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    float,
    between: (minimum, maximum) => minimum + float() * (maximum - minimum),
    integer: (minimum, maximum) => Math.floor(minimum + float() * (maximum - minimum + 1)),
    chance: (probability) => float() < probability,
    pick(items) {
      if (!items.length) throw new Error(`Cannot pick from an empty ${label} collection`);
      return items[Math.floor(float() * items.length)];
    },
    weighted(items, weight = (item) => item.weight ?? 1) {
      if (!items.length) throw new Error(`Cannot weight an empty ${label} collection`);
      const weights = items.map((item) => Math.max(0, Number(weight(item)) || 0));
      const total = weights.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return items[Math.floor(float() * items.length)];
      let roll = float() * total;
      for (let index = 0; index < items.length; index += 1) {
        roll -= weights[index];
        if (roll <= 0) return items[index];
      }
      return items.at(-1);
    },
    /** A bounded bell-shaped value centered at zero, approximately -1..1. */
    bell() {
      let sum = 0;
      for (let index = 0; index < 6; index += 1) sum += float();
      return (sum - 3) / 3;
    },
  };
}

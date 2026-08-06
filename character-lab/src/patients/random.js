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


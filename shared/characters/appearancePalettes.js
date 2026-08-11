export const SKIN_TONES = Object.freeze([
  Object.freeze({ id: 'tone-1', label: '1 · Porcelain', value: '#f2cdb5' }),
  Object.freeze({ id: 'tone-2', label: '2 · Light', value: '#ddb095' }),
  Object.freeze({ id: 'tone-3', label: '3 · Tan', value: '#c58a6b' }),
  Object.freeze({ id: 'tone-4', label: '4 · Brown', value: '#a87355' }),
  Object.freeze({ id: 'tone-5', label: '5 · Deep brown', value: '#885a45' }),
  Object.freeze({ id: 'tone-6', label: '6 · Dark brown', value: '#6d4738' }),
]);

export const EYE_COLORS = Object.freeze([
  Object.freeze({ id: 'light-blue', label: 'Light blue', value: '#52666c' }),
  Object.freeze({ id: 'blue-grey', label: 'Blue-grey', value: '#555f60' }),
  Object.freeze({ id: 'green', label: 'Green', value: '#4d5b45' }),
  Object.freeze({ id: 'hazel', label: 'Hazel', value: '#5c5137' }),
  Object.freeze({ id: 'brown', label: 'Brown', value: '#49372a' }),
  Object.freeze({ id: 'dark-brown', label: 'Dark brown', value: '#2d2420' }),
]);

export const SKIN_TONE_VALUES = Object.freeze(SKIN_TONES.map(({ value }) => value));
export const EYE_COLOR_VALUES = Object.freeze(EYE_COLORS.map(({ value }) => value));

const PALETTE_INDEXES = Object.freeze({
  european: Object.freeze({ skin: [0, 1, 2], eyes: [0, 1, 2, 3, 4, 5] }),
  'european-african': Object.freeze({ skin: [1, 2, 3, 4], eyes: [1, 2, 3, 4, 5] }),
  'european-asian': Object.freeze({ skin: [0, 1, 2, 3], eyes: [1, 2, 3, 4, 5] }),
  african: Object.freeze({ skin: [3, 4, 5], eyes: [1, 2, 3, 4, 5] }),
  asian: Object.freeze({ skin: [1, 2, 3], eyes: [3, 4, 5] }),
});

function paletteValues(entries, indexes) {
  return Object.freeze(indexes.map((index) => entries[index].value));
}

export function appearancePaletteForAncestry(ancestry = 'european') {
  const indexes = PALETTE_INDEXES[ancestry] || PALETTE_INDEXES.european;
  return Object.freeze({
    skinTones: paletteValues(SKIN_TONES, indexes.skin),
    eyeColors: paletteValues(EYE_COLORS, indexes.eyes),
  });
}

function colorDistance(left, right) {
  const channels = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const a = channels(left);
  const b = channels(right);
  return a.reduce((total, channel, index) => total + (channel - b[index]) ** 2, 0);
}

export function closestPaletteColor(value, entries) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return entries[0].value;
  return entries.reduce((closest, entry) => (
    colorDistance(value, entry.value) < colorDistance(value, closest.value) ? entry : closest
  ), entries[0]).value;
}

export function closestSkinTone(value) {
  return closestPaletteColor(value, SKIN_TONES);
}

export function closestEyeColor(value) {
  return closestPaletteColor(value, EYE_COLORS);
}

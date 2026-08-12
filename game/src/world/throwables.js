// One registry defines how a carried object looks, flies, collides, and reads
// in the HUD. A new throwable needs a definition here and a `throwable` tag
// on a world piece; the pickup and throwing systems stay unchanged.

export const THROWABLE_TYPES = Object.freeze({
  cabbage: Object.freeze({
    id: 'cabbage',
    label: 'Cabbage',
    icon: 'cabbage',
    visual: 'cabbage',
    color: '#91a95e',
    visualScale: 0.25,
    handOffset: [0, -0.025, 0],
    colliderRadius: 0.12,
    density: 220,
    friction: 0.74,
    restitution: 0.24,
    throwMin: 7.5,
    throwMax: 18,
    aimColor: '#d8e89a',
    impactColor: '#9fb864',
    carriagePower: 1,
  }),
  apple: Object.freeze({
    id: 'apple',
    label: 'Apple',
    icon: 'apple',
    visual: 'apple',
    color: '#963f2e',
    visualScale: 0.1,
    handOffset: [0, 0, 0],
    colliderRadius: 0.052,
    density: 450,
    friction: 0.62,
    restitution: 0.38,
    throwMin: 9,
    throwMax: 21,
    aimColor: '#efc477',
    impactColor: '#a94c35',
    carriagePower: 0.32,
  }),
});

export function throwableDefinition(type) {
  return THROWABLE_TYPES[type] ?? null;
}

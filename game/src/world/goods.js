// One row per thing the player can own. A good's first verb is what the E key
// does while it is in hand; the rest are offered in the items drawer.
//
// Anything that can be held needs a `throwable` type, because the hand slot
// lives in throwablePlay.js and that registry owns the grip and the visual. A
// good that should never be thrown just leaves 'throw' out of its verbs, and
// the ballistic fields on its throwables row are never read.

export const GOODS = Object.freeze({
  apple: Object.freeze({
    id: 'apple',
    label: 'an apple',
    short: 'Apple',
    icon: 'apple',
    color: '#963f2e',
    throwable: 'apple',
    verbs: Object.freeze([
      Object.freeze({ id: 'throw', label: 'Throw the apple' }),
      Object.freeze({
        id: 'eat',
        label: 'Eat the apple',
        done: 'You ate an apple.',
        changes: Object.freeze({ neurasthenia: -2 }),
      }),
    ]),
  }),
  cabbage: Object.freeze({
    id: 'cabbage',
    label: 'a cabbage',
    short: 'Cabbage',
    icon: 'cabbage',
    color: '#91a95e',
    throwable: 'cabbage',
    verbs: Object.freeze([
      Object.freeze({ id: 'throw', label: 'Throw the cabbage' }),
    ]),
  }),
  newspaper: Object.freeze({
    id: 'newspaper',
    label: 'a copy of The Sun',
    short: 'The Sun',
    icon: 'newspaper',
    color: '#cfc4a6',
    throwable: 'newspaper',
    verbs: Object.freeze([
      // `keep` because reading a paper does not use it up, and `reads` names
      // the edition the reader opens (world/newspapers.js).
      Object.freeze({
        id: 'read', label: 'Read the paper', keep: true, reads: 'sun-1896-06-15',
      }),
      Object.freeze({ id: 'throw', label: 'Throw the paper' }),
    ]),
  }),
  journal: Object.freeze({
    id: 'journal',
    label: 'a copy of The Journal',
    short: 'The Journal',
    icon: 'newspaper',
    color: '#cfc4a6',
    // Its own throwable type, or a Journal taken off the stack would come up
    // in hand as a Sun: the hand slot is keyed by throwable, not by good.
    throwable: 'journal',
    verbs: Object.freeze([
      Object.freeze({
        id: 'read', label: 'Read the paper', keep: true, reads: 'journal-1896-06-15',
      }),
      Object.freeze({ id: 'throw', label: 'Throw the paper' }),
    ]),
  }),
  herring: Object.freeze({
    id: 'herring',
    label: 'a smoked herring',
    short: 'Smoked herring',
    icon: 'herring',
    color: '#a8853f',
    // No `throwable`: it lives in the pocket and is eaten where it is.
    verbs: Object.freeze([
      Object.freeze({
        id: 'eat',
        label: 'Eat the herring',
        done: 'You ate a smoked herring.',
        changes: Object.freeze({ health: 1, neurasthenia: -3 }),
      }),
    ]),
  }),
});

const BY_THROWABLE = new Map(
  Object.values(GOODS)
    .filter((item) => item.throwable)
    .map((item) => [item.throwable, item.id]),
);

export function good(id) {
  return GOODS[id] ?? null;
}

export function goodOfThrowable(type) {
  return good(BY_THROWABLE.get(type) ?? null);
}

export function goodVerb(id, verbId) {
  return good(id)?.verbs.find((verb) => verb.id === verbId) ?? null;
}

// The verb the E key runs while the good is in hand.
export function handVerb(id) {
  return good(id)?.verbs[0] ?? null;
}

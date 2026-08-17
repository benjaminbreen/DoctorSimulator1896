// What the player is carrying, as counts of goods. One thing at a time can be
// in hand — that slot belongs to throwablePlay.js — and everything else sits
// here. Counts, not instances: two apples are a number, not two objects.

import { GOODS, good, goodOfThrowable, handVerb } from './goods.js';
import { applyPlayerEvent } from './player.js';
import { readEdition } from './reading.js';
import {
  getThrowablePlay, grantThrowable, stowThrowable, subscribeThrowablePlay,
} from './throwablePlay.js';

const listeners = new Set();
let holdings = {};

function publish() {
  const snapshot = getPocket();
  for (const listener of listeners) listener(snapshot);
}

// The pocket as a list, in registry order, for the items drawer.
export function getPocket() {
  return Object.values(GOODS)
    .filter((item) => (holdings[item.id] ?? 0) > 0)
    .map((item) => ({ ...item, count: holdings[item.id] }));
}

export function getGoodCount(id) {
  return holdings[id] ?? 0;
}

export function subscribePocket(listener) {
  listeners.add(listener);
  listener(getPocket());
  return () => listeners.delete(listener);
}

// Whether the player has anything at all, in hand or in pocket. The items
// button stays hidden until the first thing is acquired.
export function isCarrying() {
  return Boolean(heldGood()) || Object.keys(holdings).length > 0;
}

export function subscribeCarrying(listener) {
  const offPocket = subscribePocket(listener);
  const offHand = subscribeThrowablePlay(listener);
  return () => { offPocket(); offHand(); };
}

export function addGood(id, count = 1) {
  if (!good(id) || count <= 0) return false;
  holdings[id] = (holdings[id] ?? 0) + Math.trunc(count);
  publish();
  return true;
}

export function removeGood(id, count = 1) {
  if ((holdings[id] ?? 0) < count) return false;
  holdings[id] -= Math.trunc(count);
  if (holdings[id] <= 0) delete holdings[id];
  publish();
  return true;
}

// The good in hand, if the thing being carried is one.
export function heldGood() {
  return goodOfThrowable(getThrowablePlay().heldType);
}

// Every way of acquiring something comes through here: bought, given, found.
// Returns where it went, or null if there is no such good.
export function receiveGood(id) {
  const item = good(id);
  if (!item) return null;
  if (item.throwable && grantThrowable(item.throwable)) return 'hand';
  addGood(id);
  return 'pocket';
}

export function equipGood(id) {
  const item = good(id);
  if (!item?.throwable || getGoodCount(id) < 1) return false;
  if (!grantThrowable(item.throwable)) return false;
  removeGood(id);
  return true;
}

export function stowHeld() {
  const held = heldGood();
  if (!held || !stowThrowable()) return false;
  addGood(held.id);
  return true;
}

// Take one away wherever it is. Something in hand is spent from the hand, so
// eating the apple you are holding does not first require pocketing it.
function takeOne(id) {
  if (heldGood()?.id === id) return Boolean(stowThrowable());
  return removeGood(id);
}

export function runVerb(id, verbId) {
  const verb = good(id)?.verbs.find((entry) => entry.id === verbId);
  if (!verb) return false;
  // Throwing happens in the world, not in a menu: the verb only arms the hand.
  if (verb.id === 'throw') return heldGood()?.id === id || equipGood(id);
  // A `keep` verb leaves the thing where it is: a paper survives being read.
  if (verb.keep) {
    if (verb.reads) readEdition(verb.reads);
    return true;
  }
  if (!takeOne(id)) return false;
  if (verb.changes) {
    applyPlayerEvent({
      source: `${verb.id}:${id}`,
      label: verb.done ?? verb.label,
      changes: verb.changes,
    });
  }
  return true;
}

// What the E key does with whatever is in hand.
export function runHeldVerb() {
  const held = heldGood();
  const verb = held && handVerb(held.id);
  return verb ? runVerb(held.id, verb.id) : false;
}

export function resetPocketForTests(next = {}) {
  holdings = { ...next };
  publish();
}

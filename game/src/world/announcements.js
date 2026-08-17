// One sentence somebody says out loud when something important happens: a cry
// for a doctor, an officer challenging the player, Roosevelt from his soapbox.
//
// Framework-free and subscribable, like notices.js, because the systems that
// raise one run inside the frame loop. It is not a notice: a notice is what
// the player noticed, an announcement is somebody speaking, so it carries a
// speaker and a place on the ground to point at.

// How far a line carries. Louder cuts in; quieter waits its turn. `inspect` is
// the player looking somebody over: a plate above a head, no words, and it
// yields to anything anyone actually says.
export const CARRY = Object.freeze({
  inspect: 0,
  street: 1,
  oration: 2,
  alarm: 3,
  law: 4,
});

// Nothing follows the last cry inside this window unless it is louder — a
// four-cart pile-up should read as one shout, not a chorus.
const MIN_GAP_MS = 3500;
// The same key again inside this window is not news.
const REPEAT_MS = 20000;
const MAX_KEYS = 32;

const listeners = new Set();
let current = null;
let nextId = 1;
let lastAt = -Infinity;
let lastCarry = 0;
const spoken = new Map();

// Where the speaker's badge sits on screen. The canvas writes it every frame
// and the HUD reads it from an animation frame, so it deliberately does not
// notify: sixty React renders a second to move a plate would be the whole cost
// of the feature.
const screen = { x: 0, y: 0, visible: false };

function notify() {
  for (const listener of listeners) listener(current);
}

export function subscribeAnnouncement(listener) {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function getAnnouncement() {
  return current;
}

/**
 * Somebody says one thing.
 *
 * `carry` decides who gets interrupted. `key` collapses repeats. `anchorId` is
 * an agent id whose live position the badge follows; `position` is the fallback
 * for a speaker who does not report as an agent. Returns the entry, or null
 * when the moment was already spoken for.
 */
export function announce({
  line,
  speaker = 'Someone',
  station = null,
  carry = CARRY.street,
  key = null,
  seconds = 6,
  anchorId = null,
  position = null,
  headY = null,
  now = Date.now(),
} = {}) {
  const spokenAloud = carry > CARRY.inspect;
  if (!line && spokenAloud) return null;
  if (key && now - (spoken.get(key) ?? -Infinity) < REPEAT_MS) return null;
  const live = current && now < current.until ? current : null;
  if (live && carry < live.carry) return null;
  // The rate budget is for the simulation's own chatter, not for the player
  // pointing at people.
  if (spokenAloud && carry <= lastCarry && now - lastAt < MIN_GAP_MS) return null;

  current = {
    id: nextId++,
    line,
    speaker,
    station,
    carry,
    key,
    seconds,
    anchorId,
    position,
    headY,
    until: now + seconds * 1000,
  };
  if (spokenAloud) {
    lastAt = now;
    lastCarry = carry;
  }
  if (key) {
    if (spoken.size >= MAX_KEYS) spoken.delete(spoken.keys().next().value);
    spoken.set(key, now);
  }
  screen.visible = false;
  notify();
  return current;
}

export function dismissAnnouncement(id) {
  if (!current || current.id !== id) return;
  current = null;
  screen.visible = false;
  notify();
}

export function clearAnnouncements() {
  if (!current) return;
  current = null;
  screen.visible = false;
  notify();
}

export function announcementScreen() {
  return screen;
}

export function setAnnouncementScreen(x, y, visible) {
  screen.x = x;
  screen.y = y;
  screen.visible = visible;
}

export function resetAnnouncementsForTests() {
  current = null;
  lastAt = -Infinity;
  lastCarry = 0;
  spoken.clear();
  screen.visible = false;
}

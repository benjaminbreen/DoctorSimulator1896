// Things the game tells the player, briefly.
//
// Framework-free and subscribable, like the interaction store, because the
// things that raise a notice are simulations running inside the frame loop and
// they should not have to know React exists.
//
// A notice is not a log line. It is what the player would have noticed —
// "your hand closes on the handle and will not open" — so the text is written
// from inside the moment, and it goes away on its own.

const listeners = new Set();
let notices = [];
let nextId = 1;

function notify() {
  for (const listener of listeners) listener(notices);
}

export function subscribeNotices(listener) {
  listeners.add(listener);
  listener(notices);
  return () => listeners.delete(listener);
}

export function getNotices() {
  return notices;
}

/**
 * Raise a notice.
 *
 * `tone` is how loud it should look: 'plain' for an observation, 'warn' for a
 * caution, 'hurt' for something that just happened to the player's body.
 * `key` collapses repeats — the same key raised again replaces the old one
 * rather than stacking, so holding a control that fires every frame does not
 * bury the screen.
 */
export function notice(
  text,
  { tone = 'plain', key = null, seconds = 5, detail = null, landmark = null } = {},
) {
  const entry = { id: nextId++, text, tone, key, detail, landmark, until: 0, seconds };
  notices = key ? notices.filter((item) => item.key !== key) : notices.slice();
  // Newest last: the list renders bottom-up, so the new one appears nearest
  // the player's hands.
  notices = [...notices, entry].slice(-4);
  notify();
  return entry.id;
}

export function dismissNotice(id) {
  const next = notices.filter((item) => item.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  notify();
}

export function clearNotices() {
  if (notices.length === 0) return;
  notices = [];
  notify();
}

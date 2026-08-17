// What the player knows about a stranger, and how the plate over their head
// should read because of it.
//
// The identity is rolled by the simulation whether or not the player ever
// learns it. This only records that the name was said out loud, and it is
// matched against the rolled name — nothing the model invents gets in.

const known = new Map();
const MAX_KNOWN = 64;

const DECADES = Object.freeze({
  20: 'twenties', 30: 'thirties', 40: 'forties', 50: 'fifties',
  60: 'sixties', 70: 'seventies', 80: 'eighties',
});

export function noteNameSpoken(dialogueId, identityName, text) {
  if (!dialogueId || !identityName || !text || known.has(dialogueId)) return null;
  const said = String(text).toLocaleLowerCase('en-US');
  const parts = String(identityName).split(/\s+/).filter((part) => part.length > 2);
  if (!parts.some((part) => said.includes(part.toLocaleLowerCase('en-US')))) return null;
  if (known.size >= MAX_KNOWN) known.delete(known.keys().next().value);
  known.set(dialogueId, identityName);
  return identityName;
}

export function knownName(dialogueId) {
  return known.get(dialogueId) ?? null;
}

export function agePhrase({ age, sex } = {}) {
  if (!Number.isFinite(age)) return null;
  if (age < 20) return `${Math.trunc(age)} years old`;
  const decade = DECADES[Math.min(80, Math.floor(age / 10) * 10)];
  if (!decade) return `${Math.trunc(age)} years old`;
  const digit = age % 10;
  const band = digit <= 3 ? 'early ' : digit <= 6 ? 'mid-' : 'late ';
  return `In ${sex === 'female' ? 'her' : 'his'} ${band}${decade}`;
}

/**
 * The two lines of the plate: who they are, and the smaller line beneath.
 * A stranger is their appearance and their age; once named, the name leads and
 * the appearance becomes the caption.
 */
export function badgeFor(dialogueId, definition, fallbackName = 'A stranger') {
  const appearance = definition?.name ?? fallbackName;
  const name = knownName(dialogueId);
  if (name) return { speaker: name, station: appearance };
  return { speaker: appearance, station: agePhrase(definition?.identity) };
}

export function resetAcquaintanceForTests() {
  known.clear();
}

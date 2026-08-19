// A promised patient: the matron's daughter, booked for tomorrow's list.
// Recorded when the street event resolves, taken once at the day change.

let pending = null;

export function recordReferral(identity) {
  const name = String(identity?.name || '').trim();
  if (!name) return;
  pending = { matronName: name, familyName: name.split(' ').pop() };
}

export function takeReferral() {
  const out = pending;
  pending = null;
  return out;
}

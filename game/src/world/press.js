// What the morning papers picked up from yesterday's streets. Events record
// items when a choice earns one; the morning card takes them once at waking.

let items = [];

export function recordPressItem(text) {
  if (text) items.push(String(text));
}

export function takePressItems() {
  const out = items;
  items = [];
  return out;
}

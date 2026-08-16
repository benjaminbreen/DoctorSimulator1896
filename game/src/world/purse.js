// The player's money as actual pieces, not a running total. A purse that
// knows it holds three quarters and a dime can be tipped out on screen, and
// "I haven't got change" becomes a real answer.
//
// DRAFT CONTENT: the denominations below are the 1896 circulating set as far
// as I can establish; they need Ben's verification before they are settled
// (docs/decisions.md, historical content).

// Ordered largest first: change-making walks this list.
export const DENOMINATIONS = Object.freeze([
  Object.freeze({
    id: 'note-10', kind: 'note', cents: 1000, label: 'ten-dollar silver certificate', short: '$10', words: 'TEN DOLLARS',
    image: '/ui/currency/note-10.webp',
  }),
  Object.freeze({
    id: 'note-5', kind: 'note', cents: 500, label: 'five-dollar silver certificate', short: '$5', words: 'FIVE DOLLARS',
    image: '/ui/currency/note-5.webp',
  }),
  Object.freeze({
    id: 'gold-5', kind: 'coin', cents: 500, label: 'five-dollar gold piece', short: '$5', metal: 'gold', mm: 21,
    image: '/ui/currency/coin-gold.webp',
  }),
  Object.freeze({
    id: 'note-2', kind: 'note', cents: 200, label: 'two-dollar silver certificate', short: '$2', words: 'TWO DOLLARS',
    image: '/ui/currency/note-2.webp',
  }),
  Object.freeze({
    id: 'note-1', kind: 'note', cents: 100, label: 'one-dollar silver certificate', short: '$1', words: 'ONE DOLLAR',
    image: '/ui/currency/note-1.webp',
  }),
  Object.freeze({
    id: 'dollar', kind: 'coin', cents: 100, label: 'silver dollar', short: '$1', metal: 'silver', mm: 38,
    image: '/ui/currency/coin-silver.webp',
  }),
  Object.freeze({
    id: 'half', kind: 'coin', cents: 50, label: 'half dollar', short: '50¢', metal: 'silver', mm: 30,
    image: '/ui/currency/coin-half.webp',
  }),
  Object.freeze({
    id: 'quarter', kind: 'coin', cents: 25, label: 'quarter dollar', short: '25¢', metal: 'silver', mm: 24,
    image: '/ui/currency/coin-quarter.webp',
  }),
  Object.freeze({
    id: 'dime', kind: 'coin', cents: 10, label: 'dime', short: '10¢', metal: 'silver', mm: 18,
    image: '/ui/currency/coin-dime.webp',
  }),
  Object.freeze({
    id: 'nickel', kind: 'coin', cents: 5, label: 'five-cent piece', short: '5¢', metal: 'nickel', mm: 21,
    image: '/ui/currency/coin-nickel.webp',
  }),
  Object.freeze({
    id: 'cent', kind: 'coin', cents: 1, label: 'cent', short: '1¢', metal: 'copper', mm: 19,
    image: '/ui/currency/coin-cent.webp',
  }),
]);

const BY_ID = new Map(DENOMINATIONS.map((piece) => [piece.id, piece]));

// Notes and coins are interchangeable as value, but a purse should not be
// all notes: change-making prefers coins so the player keeps small money.
const CHANGE_ORDER = Object.freeze(
  [...DENOMINATIONS].sort((a, b) => (b.cents - a.cents) || (a.kind === 'coin' ? -1 : 1)),
);

// What the doctor starts the day with. A mix rather than a round sum: enough
// paper to look respectable, and enough small coin to pay a penny for an
// apple without breaking a note. Adjust here to change starting wealth.
const START_HOLDINGS = Object.freeze({
  'note-10': 1,
  'note-1': 1,
  'gold-5': 1,
  half: 1,
  quarter: 2,
  dime: 3,
  nickel: 2,
  cent: 7,
});

const listeners = new Set();
let holdings = { ...START_HOLDINGS };

function publish() {
  const snapshot = getPurse();
  for (const listener of listeners) listener(snapshot);
}

export function denomination(id) {
  return BY_ID.get(id) ?? null;
}

export function getPurseCents() {
  let total = 0;
  for (const [id, count] of Object.entries(holdings)) {
    total += (BY_ID.get(id)?.cents ?? 0) * count;
  }
  return total;
}

// The purse as a list of stacks, largest first, for the wallet drawer.
export function getPurse() {
  return DENOMINATIONS
    .filter((piece) => (holdings[piece.id] ?? 0) > 0)
    .map((piece) => ({ ...piece, count: holdings[piece.id] }));
}

export function subscribePurse(listener) {
  listeners.add(listener);
  listener(getPurse());
  return () => listeners.delete(listener);
}

export function canAfford(amount) {
  return Number.isFinite(amount) && amount >= 0 && amount <= getPurseCents();
}

// Greedy change: hand over the fewest pieces that cover the price, then take
// change back in the smallest pieces. The counterparty's till is not
// simulated, so change simply arrives — the friction worth keeping is the
// player's own small money running out, not a vendor failing to break a note.
export function planPayment(amount) {
  if (!canAfford(amount)) return null;
  const given = {};
  let remaining = Math.trunc(amount);
  // Exact small pieces first, so a penny price spends a penny.
  for (const piece of [...CHANGE_ORDER].reverse()) {
    if (remaining <= 0) break;
    const available = holdings[piece.id] ?? 0;
    const wanted = Math.min(available, Math.floor(remaining / piece.cents));
    if (wanted > 0) {
      given[piece.id] = wanted;
      remaining -= wanted * piece.cents;
    }
  }
  // Still short: overpay with the smallest piece that covers the rest.
  if (remaining > 0) {
    for (const piece of [...CHANGE_ORDER].reverse()) {
      if ((holdings[piece.id] ?? 0) - (given[piece.id] ?? 0) <= 0) continue;
      if (piece.cents < remaining) continue;
      given[piece.id] = (given[piece.id] ?? 0) + 1;
      remaining -= piece.cents;
      break;
    }
  }
  if (remaining > 0) return null;
  const paid = Object.entries(given)
    .reduce((sum, [id, count]) => sum + BY_ID.get(id).cents * count, 0);
  const change = {};
  let owed = paid - Math.trunc(amount);
  for (const piece of CHANGE_ORDER) {
    if (owed <= 0) break;
    // Change never comes back as paper; a vendor breaks a note into coin.
    if (piece.kind === 'note') continue;
    const count = Math.floor(owed / piece.cents);
    if (count > 0) {
      change[piece.id] = count;
      owed -= count * piece.cents;
    }
  }
  return owed === 0 ? { given, change, paid } : null;
}

export function spendCents(amount) {
  const plan = planPayment(amount);
  if (!plan) return false;
  for (const [id, count] of Object.entries(plan.given)) {
    holdings[id] -= count;
    if (holdings[id] <= 0) delete holdings[id];
  }
  for (const [id, count] of Object.entries(plan.change)) {
    holdings[id] = (holdings[id] ?? 0) + count;
  }
  publish();
  return true;
}

export function addPiece(id, count = 1) {
  if (!BY_ID.has(id) || count <= 0) return false;
  holdings[id] = (holdings[id] ?? 0) + Math.trunc(count);
  publish();
  return true;
}

export function removePiece(id, count = 1) {
  if ((holdings[id] ?? 0) < count) return false;
  holdings[id] -= Math.trunc(count);
  if (holdings[id] <= 0) delete holdings[id];
  publish();
  return true;
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety'];

function words(value) {
  if (value < 20) return ONES[value];
  const tens = TENS[Math.floor(value / 10)];
  const ones = value % 10;
  return ones ? `${tens}-${ONES[ones]}` : tens;
}

export function formatPrice(amount) {
  return amount >= 100 ? `$${(amount / 100).toFixed(2)}` : `${amount}¢`;
}

export function describePurse(amount = getPurseCents()) {
  const dollars = Math.floor(amount / 100);
  const remainder = amount % 100;
  const parts = [];
  if (dollars > 0) parts.push(`${words(dollars)} dollar${dollars === 1 ? '' : 's'}`);
  if (remainder > 0 || dollars === 0) {
    parts.push(`${words(remainder)} cent${remainder === 1 ? '' : 's'}`);
  }
  const spoken = parts.join(' and ');
  return `${spoken[0].toUpperCase()}${spoken.slice(1)}`;
}

export function resetPurseForTests(next = START_HOLDINGS) {
  holdings = { ...next };
  publish();
}

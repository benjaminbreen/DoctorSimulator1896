// The casebook's ground truth: entries and the unsaved draft. Framework-free
// and subscribable like notices.js, because entries will eventually be penned
// by simulation events (observations, consultations), not only by the player.
//
// The draft lives here rather than in component state so closing the book
// never loses a half-written note — the Darwin journal's one best decision.
//
// PLACEHOLDER FIXTURES below: demo entries so the book opens with pages in
// it. Wording needs Ben's review before any of it ships as content.

const listeners = new Set();

let entries = [
  {
    id: 'cb-1',
    type: 'note',
    title: 'The consulting room, made ready',
    text: 'Arranged the room for tomorrow’s list. The draught from the airshaft still finds the examination couch.',
    date: { year: 1896, month: 5, date: 13 },
    hours: 20.5,
  },
  {
    id: 'cb-2',
    type: 'patient',
    title: 'Mr. James H. Alden — referred',
    text: 'Roosevelt Hospital sends a clerk of twenty-eight with nervous exhaustion: insomnia, palpitation, general debility of nervous origin. To be seen this week.',
    date: { year: 1896, month: 5, date: 14 },
    hours: 9.1,
  },
  {
    id: 'cb-3',
    type: 'observation',
    title: 'Central Park, by the carousel',
    text: 'A fine morning. The carousel draws a mixed crowd; two nursemaids with charges from the avenue houses, and a boy who has ridden four times on one ticket.',
    date: { year: 1896, month: 5, date: 14 },
    hours: 10.25,
  },
];

let draft = '';
let nextId = entries.length + 1;

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeCasebook(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCasebookEntries() {
  return entries;
}

export function getCasebookDraft() {
  return draft;
}

export function setCasebookDraft(text) {
  draft = String(text);
  notify();
}

// Pen the draft into the book. Entries keep arrival order, oldest first.
export function saveCasebookEntry({ date, hours, type = 'note', title = '' }) {
  const text = draft.trim();
  if (!text) return null;
  const entry = {
    id: `cb-${nextId++}`,
    type,
    title: title.trim(),
    text,
    date,
    hours,
  };
  entries = [...entries, entry];
  draft = '';
  notify();
  return entry;
}

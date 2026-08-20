// The working day: appointments assigned to seeded slots at day start, kept
// or forfeited as the clock runs. Deterministic ground truth for the day
// loop; the HUD and prompts read it, they never decide it.

export const APPOINTMENT_SLOTS = Object.freeze([9.75, 11.5, 14.25, 16.5]);
const WARN_MINUTES = 10;
const LATE_GRACE_MINUTES = 6;

function seededShuffle(items, seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function formatHour(hours) {
  const total = Math.round(hours * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const twelve = ((hour + 11) % 12) + 1;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'in the morning' : hour < 18 ? 'in the afternoon' : 'in the evening'}`;
}

export function createDaySchedule({ seed = 1, patientIds = [] } = {}) {
  const order = seededShuffle(patientIds, seed);
  const appointments = order.map((patientId, index) => ({
    patientId,
    hours: APPOINTMENT_SLOTS[index] ?? APPOINTMENT_SLOTS.at(-1),
    status: 'pending',
    warned: false,
  }));
  const listeners = new Set();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  const find = (patientId) => appointments.find((item) => item.patientId === patientId);

  return {
    list: () => appointments.map((item) => ({ ...item })),

    // The next unresolved appointment, including one held during a crisis.
    next: () => appointments.find((item) => item.status === 'pending' || item.status === 'held') || null,

    // The first patient whose appointment time has arrived.
    due(hours) {
      const appointment = appointments.find((item) => item.status === 'pending' && hours >= item.hours);
      return appointment ? { ...appointment } : null;
    },

    // A pending appointment wanting its five-minute warning. Marks it warned.
    takeWarning(hours) {
      const due = appointments.find((item) => item.status === 'pending'
        && !item.warned
        && item.hours - hours > 0
        && (item.hours - hours) * 60 <= WARN_MINUTES);
      if (!due) return null;
      due.warned = true;
      notify();
      return { ...due };
    },

    // The pending appointment the player is now late for, if any.
    overdue(hours) {
      const due = appointments.find((item) => item.status === 'pending'
        && (hours - item.hours) * 60 >= LATE_GRACE_MINUTES);
      return due ? { ...due } : null;
    },

    markKept(patientId) {
      const item = find(patientId);
      if (!item || (item.status !== 'pending' && item.status !== 'held')) return false;
      item.status = 'kept';
      notify();
      return true;
    },

    hold(patientId) {
      const item = find(patientId);
      if (!item || item.status !== 'pending') return false;
      item.status = 'held';
      notify();
      return true;
    },

    resumeHeld() {
      let changed = false;
      for (const item of appointments) {
        if (item.status !== 'held') continue;
        item.status = 'pending';
        changed = true;
      }
      if (changed) notify();
      return changed;
    },

    markForfeited(patientId) {
      const item = find(patientId);
      if (!item || item.status !== 'pending') return false;
      item.status = 'forfeited';
      notify();
      return true;
    },

    allResolved: () => appointments.every((item) => item.status !== 'pending' && item.status !== 'held'),

    stats: () => ({
      kept: appointments.filter((item) => item.status === 'kept').length,
      forfeited: appointments.filter((item) => item.status === 'forfeited').length,
      pending: appointments.filter((item) => item.status === 'pending' || item.status === 'held').length,
    }),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

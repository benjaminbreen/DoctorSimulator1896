// Civil time for the game. This is deterministic session state: renderers
// read its visual time, while consultations and rest advance its logical time.

const SECONDS_PER_DAY = 24 * 60 * 60;
const SECONDS_PER_MINUTE = 60;

export const DEFAULT_CLOCK_RATE = 4;
export const GAME_START = Object.freeze({
  year: 1896,
  month: 8,
  date: 3,
  dayOfYear: 216,
  hour: 9,
  minute: 30,
});

export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function dayOfYear({ year, month, date }) {
  let total = date;
  for (let current = 1; current < month; current += 1) {
    total += daysInMonth(year, current);
  }
  return total;
}

function dateAfter(start, days) {
  let year = start.year;
  let month = start.month;
  let date = start.date;
  for (let remaining = Math.max(0, Math.floor(days)); remaining > 0; remaining -= 1) {
    date += 1;
    if (date <= daysInMonth(year, month)) continue;
    date = 1;
    month += 1;
    if (month <= 12) continue;
    month = 1;
    year += 1;
  }
  return { year, month, date, dayOfYear: dayOfYear({ year, month, date }) };
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function smoothstep(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function timeParts(totalSeconds, startDate) {
  const dayOffset = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const seconds = positiveModulo(totalSeconds, SECONDS_PER_DAY);
  const hours = seconds / 3600;
  const wholeHour = Math.floor(hours);
  const minute = Math.floor((seconds - wholeHour * 3600) / SECONDS_PER_MINUTE);
  return {
    date: dateAfter(startDate, dayOffset),
    hours,
    hour: wholeHour,
    minute,
    totalMinutes: totalSeconds / SECONDS_PER_MINUTE,
  };
}

function transitionDuration(minutes) {
  return Math.min(2.5, Math.max(0.75, Math.abs(minutes) / 20));
}

export function createWorldClock({
  start = GAME_START,
  rate = DEFAULT_CLOCK_RATE,
} = {}) {
  const startDate = { year: start.year, month: start.month, date: start.date };
  const startSeconds = ((start.hour ?? 0) * 60 + (start.minute ?? 0)) * SECONDS_PER_MINUTE;
  let logicalSeconds = startSeconds;
  let visualSeconds = startSeconds;
  let clockRate = Math.max(0, Number(rate) || 0);
  let paused = false;
  let transition = null;
  let lastVisualMinute = Math.floor(visualSeconds / SECONDS_PER_MINUTE);
  let snapshot = null;
  const listeners = new Set();

  function buildSnapshot() {
    const logical = timeParts(logicalSeconds, startDate);
    const visual = timeParts(visualSeconds, startDate);
    return {
      logical,
      visual,
      // The HUD and existing renderer bridge use the visual reading.
      date: visual.date,
      hours: visual.hours,
      dayOfYear: visual.date.dayOfYear,
      rate: clockRate,
      paused,
      transitioning: Boolean(transition),
    };
  }

  function publish() {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function tick(realSeconds) {
    const elapsed = Math.max(0, Number(realSeconds) || 0);
    if (paused || elapsed === 0) return 0;
    const gameSeconds = elapsed * clockRate;
    logicalSeconds += gameSeconds;

    if (transition) {
      transition.elapsed += elapsed;
      const progress = smoothstep(transition.elapsed / transition.duration);
      const ambientSinceStart = logicalSeconds - transition.startLogical;
      visualSeconds = transition.startVisual + transition.jumpSeconds * progress + ambientSinceStart;
      if (progress >= 1) {
        visualSeconds = logicalSeconds;
        transition = null;
      }
    } else {
      visualSeconds += gameSeconds;
    }

    const visualMinute = Math.floor(visualSeconds / SECONDS_PER_MINUTE);
    if (visualMinute !== lastVisualMinute) {
      lastVisualMinute = visualMinute;
      publish();
    }
    return gameSeconds;
  }

  function advanceMinutes(minutes, options = {}) {
    const amount = Math.max(0, Number(minutes) || 0);
    if (amount === 0) return 0;
    const jumpSeconds = amount * SECONDS_PER_MINUTE;
    logicalSeconds += jumpSeconds;
    if (options.animate === false) {
      visualSeconds = logicalSeconds;
      transition = null;
      lastVisualMinute = Math.floor(visualSeconds / SECONDS_PER_MINUTE);
    } else {
      transition = {
        startVisual: visualSeconds,
        startLogical: logicalSeconds,
        jumpSeconds: logicalSeconds - visualSeconds,
        elapsed: 0,
        duration: options.duration ?? transitionDuration(amount),
        reason: options.reason ?? 'action',
      };
    }
    publish();
    return amount;
  }

  function advanceToHour(hour, options = {}) {
    const target = Math.min(24, Math.max(0, Number(hour) || 0)) * 3600;
    const current = positiveModulo(logicalSeconds, SECONDS_PER_DAY);
    let seconds = target - current;
    if (seconds <= 0) seconds += SECONDS_PER_DAY;
    return advanceMinutes(seconds / SECONDS_PER_MINUTE, options);
  }

  // Development lighting and shot tools may set the dial directly. This does
  // not change the date and deliberately skips the passage animation.
  function setTimeOfDay(hours) {
    const target = Math.min(24, Math.max(0, Number(hours) || 0)) * 3600;
    const dayStart = Math.floor(logicalSeconds / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    logicalSeconds = dayStart + target;
    visualSeconds = logicalSeconds;
    transition = null;
    lastVisualMinute = Math.floor(visualSeconds / SECONDS_PER_MINUTE);
    publish();
  }

  function setPaused(value) {
    const next = Boolean(value);
    if (paused === next) return;
    paused = next;
    publish();
  }

  function setRate(value) {
    const next = Math.max(0, Number(value) || 0);
    if (clockRate === next) return;
    clockRate = next;
    publish();
  }

  snapshot = buildSnapshot();
  return {
    getSnapshot: () => snapshot,
    getLogicalHours: () => timeParts(logicalSeconds, startDate).hours,
    getVisualHours: () => timeParts(visualSeconds, startDate).hours,
    getVisualDate: () => timeParts(visualSeconds, startDate).date,
    tick,
    advanceMinutes,
    advanceToHour,
    setTimeOfDay,
    setPaused,
    setRate,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
  };
}

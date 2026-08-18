// One visual vocabulary for every player-meter event. The simulation supplies
// signed changes; the scene and HUD both read the same deterministic style.

const STYLES = Object.freeze({
  'health-gain': Object.freeze({
    kind: 'health-gain', metric: 'health', label: 'Health', aura: '#7fa96d',
    colors: Object.freeze(['#95c27f', '#d6bd72', '#c8e5a4']),
  }),
  'health-loss': Object.freeze({
    kind: 'health-loss', metric: 'health', label: 'Health', aura: '#8e342d',
    colors: Object.freeze(['#b74a3a', '#d47a5b', '#7b2828']),
  }),
  'neurasthenia-gain': Object.freeze({
    kind: 'neurasthenia-gain', metric: 'neurasthenia', label: 'Neurasthenia', aura: '#7650a0',
    colors: Object.freeze(['#8855b5', '#b276d0', '#d0a5df']),
  }),
  'neurasthenia-loss': Object.freeze({
    kind: 'neurasthenia-loss', metric: 'neurasthenia', label: 'Neurasthenia', aura: '#a891c7',
    colors: Object.freeze(['#b9a6d5', '#e2d5e9', '#d6c481']),
  }),
});

export function meterFeedbackStyle(metric, delta) {
  if (metric !== 'health' && metric !== 'neurasthenia') return null;
  const amount = Number(delta) || 0;
  if (amount === 0) return null;
  return STYLES[`${metric}-${amount > 0 ? 'gain' : 'loss'}`];
}

export function meterFeedbackStrength(delta) {
  return Math.min(1, 0.35 + Math.abs(Number(delta) || 0) * 0.065);
}

function changesCanMerge(previous = {}, next = {}) {
  for (const metric of ['health', 'neurasthenia']) {
    const a = Number(previous[metric]) || 0;
    const b = Number(next[metric]) || 0;
    if (a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b)) return false;
  }
  return true;
}

// Closely grouped changes share one shoulder readout. The player log remains
// unmerged, so its hover history still records every individual cause.
export function mergeMeterFeedback(previous, event, receivedAt, id, windowMs = 300) {
  const recent = previous && receivedAt - previous.receivedAt <= windowMs;
  if (!recent || !changesCanMerge(previous.event.changes, event.changes)) {
    return { id, event, receivedAt };
  }
  const changes = {
    health: (Number(previous.event.changes?.health) || 0) + (Number(event.changes?.health) || 0),
    neurasthenia:
      (Number(previous.event.changes?.neurasthenia) || 0)
      + (Number(event.changes?.neurasthenia) || 0),
  };
  return {
    id,
    receivedAt,
    event: {
      ...event,
      source: `${previous.event.source}+${event.source}`,
      label: previous.event.label === event.label
        ? event.label
        : `${previous.event.label} ${event.label}`,
      changes,
    },
  };
}

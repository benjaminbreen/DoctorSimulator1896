// The game's visual language, in one place.
//
// The reference is not a modern game HUD and not a dev panel. It is the
// instrument itself: lacquered brass on japanned iron, ivory dials, engraved
// scales. So the chrome is dark, warm rather than blue, and its one accent is
// brass. Numbers are the loudest thing on screen, because in this game the
// number is the point — the exposure, the reaction time, the reading.
//
// Rules that hold everywhere:
//   - Nothing is pure white or pure black. Ivory and iron.
//   - One accent, brass. Amber only for a live value.
//   - Type scales with the viewport, so a readout stays readable small.
//   - Panels float over the scene and never box it in: no full-height rails
//     during play. Chrome sits at the edges the eye is not using.

export const ink = {
  // Surfaces, darkest first.
  well: 'rgba(14, 13, 12, 0.92)',
  panel: 'rgba(24, 22, 20, 0.88)',
  raised: 'rgba(38, 35, 31, 0.9)',
  // Lines.
  hair: 'rgba(168, 134, 63, 0.22)',
  edge: 'rgba(168, 134, 63, 0.45)',
  // Type.
  ivory: '#e8e3d4',
  muted: 'rgba(232, 227, 212, 0.55)',
  faint: 'rgba(232, 227, 212, 0.32)',
  brass: '#c79a44',
  live: '#f0c46a',
};

// A floating panel: glass over the scene, hairline brass edge, never square
// to the pixel grid of a browser chrome.
export const surface =
  'rounded-lg border backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.55)]';

export const surfaceStyle = {
  background: ink.panel,
  borderColor: ink.hair,
};

// Small caps label, the engraved-scale voice.
export const label =
  'text-[10px] font-medium uppercase tracking-[0.18em]';

// A key cap. Same shape everywhere so the player learns it once.
export const keycap =
  'inline-flex min-w-[1.5rem] items-center justify-center rounded border px-1.5 py-0.5 font-mono text-[11px]';

export const keycapStyle = {
  borderColor: ink.edge,
  color: ink.brass,
  background: 'rgba(168, 134, 63, 0.08)',
};

// Readouts: tabular so a changing number does not jitter its neighbours.
export const readout = 'font-mono tabular-nums';

// The du Bois-Reymond sledge coil, as a simulation.
//
// A primary coil sits fixed on a slide. A secondary coil, wound with far more
// turns, rides a carriage that runs up to it and away from it along a scale.
// Grove cells drive the primary through a Wagner hammer — a sprung armature
// the primary's own magnetism pulls off its contact, breaking the circuit,
// which lets the spring snap it back, sixty-odd times a second. Every break
// collapses the field and throws a pulse into the secondary.
//
// Why it is built this way: the shock cannot be measured directly, but the
// *distance between the coils can*. "The shock at 12 cm, three cells" is a
// stimulus another laboratory can reproduce exactly, and that is what made
// this the standard stimulator in every physiological and psychological
// laboratory of the period. The number on the slide is the experiment.
//
// It is also genuinely dangerous, and this simulates that rather than
// pretending otherwise. Run in close with three cells and take hold of the
// electrodes and you get a shock past the let-go threshold: the flexors win,
// your hand closes on the handle, and you cannot drop it.
//
// Historical note for Ben: the apparatus, the Wagner interrupter and the
// distance-as-dose convention are all solid. The specific voltages below are
// plausible for a sledge coil on Grove cells but are my numbers, not a figure
// from a catalogue — worth checking before any of it becomes teaching content.

// Grove cell, nominal. Two zinc-platinum cells was the usual bench supply and
// three was as far as anyone sensible went.
const CELL_VOLTS = 1.9;

// How fast coupling dies off along the slide. At the coil's face the pulse is
// at full strength; a hand's breadth away it is a third of it; at the end of
// the scale it is a prickle.
const FALLOFF = 0.065;

// The secondary's own impedance. It is what keeps a four-kilovolt pulse from
// being a fatal one: the coil can push the voltage but cannot supply the
// current behind it.
const COIL_OHMS = 48000;

// Hands on brass handles, damp. Dry skin is many times this, which is why the
// electrodes were wetted before a run — and why the shock is so much worse
// than people expect.
const BODY_OHMS = 2200;

// Air breaks down at about three kilovolts per millimetre at bench pressure.
const BREAKDOWN_PER_MM = 3000;

export const LIMITS = {
  // Centimetres between the coils, read off the slide.
  distance: [0, 20],
  cells: [1, 3],
  // Millimetres across the spark gap. Short, because a sledge coil is a
  // stimulator and not a spark machine: at three cells run right in it will
  // reach about a millimetre and a half, and that is the top of the scale.
  gap: [0.1, 2],
};

const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

/** Peak volts across the secondary terminals at a given setting. */
export function secondaryVolts(distance, cells) {
  const coupling = Math.exp(-clamp(distance, LIMITS.distance) / (FALLOFF * 100));
  return 1550 * clamp(cells, LIMITS.cells) * coupling * (CELL_VOLTS / 1.9);
}

/** Peak milliamps through a person holding both electrodes. */
export function shockCurrent(volts) {
  return (volts / (COIL_OHMS + BODY_OHMS)) * 1000;
}

/** How far a spark will jump at these volts, in millimetres. */
export function sparkReach(volts) {
  return volts / BREAKDOWN_PER_MM;
}

// What a shock of a given peak current does. The thresholds are the real
// ones: perception around a milliamp, the let-go threshold — where the
// flexors overpower the extensors and the hand shuts on whatever it is
// holding — around ten, and serious trouble past thirty.
export const SHOCK_BANDS = [
  { at: 0.4, tone: 'plain', text: 'Nothing you can feel. The slide is too far out, or the cells are flat.' },
  { at: 1.2, tone: 'plain', text: 'A faint prickling in both palms, like a limb waking up.' },
  { at: 4, tone: 'warn', text: 'A hard buzzing in the wrists. Unpleasant, and you would not hold it long.' },
  { at: 10, tone: 'warn', text: 'The muscles of your forearms jump with every break of the hammer.' },
  {
    at: 30,
    tone: 'hurt',
    text: 'Your hands close on the handles and will not open. You get free by throwing your shoulder back and tearing them off.',
  },
  {
    at: Infinity,
    tone: 'hurt',
    text: 'The shock takes your whole chest. You are off the stool and on the floor before you know you have moved, and your arms will not stop shaking.',
  },
];

export function bandFor(milliamps) {
  return SHOCK_BANDS.find((band) => milliamps < band.at) ?? SHOCK_BANDS[SHOCK_BANDS.length - 1];
}

// Gameplay consequences stay beside the current calculation that decides the
// shock. The scene reports the result; it does not invent damage numbers.
export function effectForShock(milliamps) {
  if (milliamps < 1.2) return { health: 0, neurasthenia: 0, down: 0, label: 'Tested the induction coil' };
  if (milliamps < 4) return { health: 0, neurasthenia: 2, down: 0, label: 'Felt a galvanic prickle' };
  if (milliamps < 10) return { health: 1, neurasthenia: 4, down: 0, label: 'Received a galvanic shock' };
  if (milliamps < 30) return { health: 8, neurasthenia: 9, down: 0, label: 'Suffered a hard galvanic shock' };
  return { health: 20, neurasthenia: 15, down: 6, label: 'Suffered a severe galvanic shock' };
}

export function createInductionCoil(options = {}) {
  const state = {
    // 'idle' with the key open, 'running' with it closed.
    phase: 'idle',
    distance: options.distance ?? 14,
    cells: options.cells ?? 2,
    gap: options.gap ?? 0.4,
    // The Wagner hammer's position, 0 to 1 through its cycle, and how many
    // breaks it has made. The breaks are what the secondary sees.
    hammer: 0,
    breaks: 0,
    running: false,
    // Set on the frame a break happens, so the renderer can strike a spark.
    struck: false,
    sparking: false,
    volts: 0,
    // Whether the player has hold of the electrodes.
    holding: false,
    lastShock: null,
    shocks: 0,
    worst: 0,
  };
  return {
    id: 'induction-coil',
    label: 'Induction coil',
    // Low and square to the bed. It has to stand back far enough for the whole
    // slide to be in shot, because the reading on the slide is the experiment,
    // and far enough that a narrow window does not crop the spark gap off the
    // right-hand end.
    framing: { offset: [0.06, 0.30, 1.9], target: [0.03, 0.13, 0], fov: 36 },
    // Breaks per second. A Wagner hammer on a stiff spring runs about here,
    // and it is where the buzz comes from.
    hammerRate: options.hammerRate ?? 62,
    state,
  };
}

export function step(instrument, dt, input = {}) {
  const s = instrument.state;

  if (input.setDistance != null) s.distance = clamp(input.setDistance, LIMITS.distance);
  if (input.setCells != null) s.cells = Math.round(clamp(input.setCells, LIMITS.cells));
  if (input.setGap != null) s.gap = clamp(input.setGap, LIMITS.gap);
  if (input.key != null) {
    s.running = Boolean(input.key);
    s.phase = s.running ? 'running' : 'idle';
    if (!s.running) {
      s.struck = false;
      s.sparking = false;
      s.volts = 0;
    }
  }

  s.volts = s.running ? secondaryVolts(s.distance, s.cells) : 0;
  s.sparking = s.running && sparkReach(s.volts) >= s.gap;

  s.struck = false;
  if (s.running) {
    const before = s.hammer;
    s.hammer = (s.hammer + instrument.hammerRate * dt) % 1;
    // A break per cycle, and the renderer wants to know which frame it was on.
    if (s.hammer < before) {
      s.breaks += 1;
      s.struck = true;
    }
  } else {
    s.hammer = 0;
  }

  // Taking hold is a deliberate act and it is resolved at once: the shock is
  // not something you stand in, it is something that happens to you.
  if (input.grasp) {
    const milliamps = s.running ? shockCurrent(s.volts) : 0;
    const band = bandFor(milliamps);
    const effect = effectForShock(milliamps);
    s.lastShock = { milliamps, tone: band.tone, text: band.text, volts: s.volts, effect };
    s.shocks += 1;
    s.worst = Math.max(s.worst, milliamps);
    // Past the let-go threshold you do not choose when to stop, and the
    // simulation should not let you pretend otherwise: the key opens because
    // you fall off the stool, not because you reached for it.
    if (milliamps >= 30) {
      s.running = false;
      s.phase = 'idle';
      s.volts = 0;
      s.sparking = false;
    }
  }

  return s;
}

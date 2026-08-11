// The colour wheel, as a simulation.
//
// Discs of coloured paper are slit to the centre and slid into one another, so
// each shows a sector of the face. Spin them and the eye is shown each paper
// in turn; past about fifty flashes a second it stops resolving them and
// reports one colour, which is the weighted average of what it was shown. The
// apparatus mixes nothing. The observer does, and that was the point — it is
// how the century measured colour without a spectrophotometer.
//
// Two things fall out of that and are simulated here rather than faked:
//
//   fusion  is a function of flicker rate, not of speed. Three sectors fuse at
//           a third the revolutions six sectors need.
//   the mix is an average in *linear* light, because the retina integrates
//           energy. Averaging sRGB values gives the wrong colour, and visibly
//           so — the classic muddy result.
//
// Historical note for Ben: the mixing apparatus is Ogden Rood's, who was
// Columbia's professor of physics from 1863 and published Modern Chromatics in
// 1879. Cattell's own Test 7 was naming colours, not matching them; treating
// the wheel as a Cattell test would be wrong, and it is in the room as
// departmental apparatus.

// Flicker rates, in flashes per second, between which fusion comes on. Below
// the first the sectors are separately visible; above the second they are one
// colour and no amount of staring separates them.
const FLICKER_START = 16;
const FLICKER_FULL = 46;

// The crank: how hard it drives, and what the bearings take back.
const DRIVE = 9.5;
const FRICTION = 3.4;
const MAX_SPEED = 26;

export const LIMITS = { speed: [0, MAX_SPEED] };

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function toLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toSrgb(linear) {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(clamp01(c) * 255);
}

export function parseHex(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The colour the sectors fuse to: the average in linear light, weighted by how
 * much of the turn each paper is in front of the eye.
 */
export function fuse(colours, fractions) {
  const total = fractions.reduce((sum, f) => sum + f, 0) || 1;
  const linear = [0, 0, 0];
  colours.forEach((hex, index) => {
    const weight = fractions[index] / total;
    const rgb = parseHex(hex);
    for (let c = 0; c < 3; c += 1) linear[c] += toLinear(rgb[c]) * weight;
  });
  return toHex(linear.map(toSrgb));
}

/** 0 below the flicker threshold, 1 once the sectors are gone. */
export function fusionAt(speed, sectors) {
  const flicker = speed * sectors;
  const t = clamp01((flicker - FLICKER_START) / (FLICKER_FULL - FLICKER_START));
  // Smoothstep: fusion does not arrive on a straight line, and a linear ramp
  // makes the disc look like it is cross-fading rather than blurring.
  return t * t * (3 - 2 * t);
}

/**
 * How close two colours are, 0 to 1, compared in linear light for the same
 * reason the mix is averaged there.
 */
export function agreement(a, b) {
  const one = parseHex(a).map(toLinear);
  const two = parseHex(b).map(toLinear);
  const distance = Math.sqrt(one.reduce((sum, v, i) => sum + (v - two[i]) ** 2, 0) / 3);
  return clamp01(1 - distance);
}

// A setting to match, drawn deterministically from a seed so a trial can be
// replayed. Always achievable, because it is made the same way the answer is.
export function targetFor(seed, colours) {
  let state = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  const next = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  // Never a pure paper: matching one of the three by sliding a control to the
  // end is not a judgement of colour.
  const raw = colours.map(() => 0.15 + next() * 0.7);
  const total = raw.reduce((sum, value) => sum + value, 0);
  const fractions = raw.map((value) => value / total);
  return { fractions, colour: fuse(colours, fractions) };
}

export function createColourWheel(options = {}) {
  // Three papers on the spindle. Vermilion, emerald and white is the set that
  // gets you the widest range of matchable colours from three slit discs.
  const colours = options.colours ?? ['#8f2a20', '#215a3b', '#cfc9ba'];
  const names = options.names ?? ['Vermilion', 'Emerald', 'White'];
  return {
    id: 'colour-wheel',
    label: 'Colour wheel',
    // Square to the disc, but aimed low: the console takes the bottom of the
    // screen, and the crank has to stay above it because it is the control.
    framing: { offset: [0.05, 0.3, 1.5], target: [0, 0.28, 0], fov: 38 },
    colours,
    names,
    state: {
      phase: 'set',
      fractions: options.fractions ?? [0.34, 0.33, 0.33],
      // Revolutions per second of the disc itself, not of the crank.
      speed: 0,
      cranking: false,
      angle: 0,
      fusion: 0,
      mix: fuse(colours, options.fractions ?? [0.34, 0.33, 0.33]),
      target: targetFor(options.seed ?? 1, colours),
      match: null,
      trials: 0,
      best: 0,
    },
  };
}

export function step(instrument, dt, input = {}) {
  const s = instrument.state;
  const colours = instrument.colours;

  if (input.cranking != null) s.cranking = Boolean(input.cranking);

  if (input.setFraction) {
    const { slot, value } = input.setFraction;
    const want = clamp01(value);
    const rest = s.fractions.reduce((sum, f, i) => (i === slot ? sum : sum + f), 0);
    // The other two keep their ratio to each other and share what is left. A
    // slit disc pushed round takes its width from its neighbours, not from
    // nowhere.
    s.fractions = s.fractions.map((f, i) => {
      if (i === slot) return want;
      return rest > 0 ? (f / rest) * (1 - want) : (1 - want) / (s.fractions.length - 1);
    });
    s.match = null;
  }

  if (input.newTarget) {
    s.target = targetFor(input.seed ?? s.trials + 2, colours);
    s.match = null;
    s.phase = 'set';
  }

  s.speed = Math.max(
    0,
    Math.min(MAX_SPEED, s.speed + (s.cranking ? DRIVE : 0) * dt - FRICTION * dt * (0.3 + s.speed / MAX_SPEED)),
  );
  s.angle = (s.angle + s.speed * dt) % 1;
  s.fusion = fusionAt(s.speed, s.fractions.filter((f) => f > 0.001).length);
  s.mix = fuse(colours, s.fractions);

  if (input.record) {
    // Only a fused disc can be judged. Reading a colour off a flickering one
    // is the mistake the instrument exists to prevent.
    if (s.fusion > 0.9) {
      const score = agreement(s.mix, s.target.colour);
      s.match = { agreement: score, mix: s.mix, target: s.target.colour };
      s.trials += 1;
      s.best = Math.max(s.best, score);
      s.phase = 'matched';
    } else {
      s.match = { tooSlow: true };
    }
  }

  return s;
}

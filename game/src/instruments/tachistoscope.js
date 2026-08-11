// The fall-screen tachistoscope, as a simulation.
//
// A card sits behind a screen. The screen is a shutter with a slot cut in it,
// held up by a catch; release the catch and it falls under gravity, and the
// card is visible for exactly as long as the slot takes to pass the aperture.
// That is the whole instrument, and it means the exposure is not a number
// somebody chose — it falls out of the drop height and the slot width:
//
//   v = sqrt(2 * g * drop)        speed of the slot as it reaches the aperture
//   exposure = (slot + aperture) / v
//
// A 0.30m drop and a 30mm slot on a 20mm aperture gives about 20ms, which is
// the range these were used at. Raise the shutter higher and the exposure
// shortens; widen the slot and it lengthens. Both are wrong in interesting
// ways, which is why they are controls and not constants.
//
// No renderer here on purpose: this file is the ground truth and is tested
// without one.

const G = 9.81;

// The letters a card can carry. I, O and Q are left out: at 20ms they are
// read as 1, 0 and O, and the test becomes about the typeface.
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

// The frame is a metre tall, and the shutter has to start above the aperture
// and finish below it without going through the plinth. That, not taste, is
// what sets the drop range — and it happens to land the exposures between
// about 13 and 100 ms, which is where these were used.
export const LIMITS = {
  drop: [0.04, 0.25],
  slot: [0.01, 0.08],
  letters: [3, 7],
};

const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

// Deterministic card from a seed, so a run can be replayed and a test can
// assert on it.
export function cardFor(seed, letters = 5) {
  let state = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  let out = '';
  for (let i = 0; i < letters; i += 1) {
    state = (state * 48271) % 2147483647;
    out += LETTERS[state % LETTERS.length];
  }
  return out;
}

// How long the card is uncovered, in seconds, for a given setting.
export function exposureFor(drop, slot, aperture = 0.02) {
  const speed = Math.sqrt(2 * G * clamp(drop, LIMITS.drop));
  return (clamp(slot, LIMITS.slot) + aperture) / speed;
}

export function createTachistoscope(options = {}) {
  const aperture = options.aperture ?? 0.02;
  const drop = options.drop ?? 0.15;
  const slot = options.slot ?? 0.03;
  const letters = options.letters ?? 5;

  return {
    id: 'tachistoscope',
    label: 'Tachistoscope',
    // Where the camera stands to use it. The stage draws the working copy at
    // 1.6x, so the aperture is 0.72m above the foot: eye level with it, and
    // far enough back that the head and the catch are in shot too. Framing
    // only the aperture reads as a wall, not as an instrument.
    framing: { offset: [0, 0.72, 2.3], target: [0, 0.74, 0], fov: 36 },
    aperture,
    state: {
      // 'set' cocked and ready, 'falling' released, 'read' waiting on an
      // answer, 'scored' showing the result.
      phase: 'set',
      drop,
      slot,
      letters,
      // Shutter position measured down from cocked, in metres.
      fallen: 0,
      // How far this fall runs before the buffer catches the shutter. Set at
      // release, because it depends on the setting: far enough for the slot to
      // clear the aperture and no further.
      travel: drop + slot + aperture + 0.02,
      shutterPosition: 0,
      scrubbing: false,
      speed: 0,
      elapsed: 0,
      exposed: false,
      exposedFor: 0,
      cardSeed: 1,
      card: cardFor(1, letters),
      answer: '',
      score: null,
      trials: 0,
      correct: 0,
    },
  };
}

// One tick. `input` carries the player's controls for this frame.
export function step(instrument, dt, input = {}) {
  const s = instrument.state;

  if (input.setDrop != null) s.drop = clamp(input.setDrop, LIMITS.drop);
  if (input.setSlot != null) s.slot = clamp(input.setSlot, LIMITS.slot);
  if (input.setLetters != null) {
    s.letters = Math.round(clamp(input.setLetters, LIMITS.letters));
    if (s.scrubbing) s.card = cardFor(s.cardSeed, s.letters);
  }

  if (input.setShutter != null && s.phase !== 'falling') {
    s.phase = 'set';
    s.scrubbing = true;
    s.travel = s.drop + s.slot + instrument.aperture + 0.02;
    s.shutterPosition = clamp(input.setShutter, [0, 1]);
    s.fallen = s.travel * s.shutterPosition;
    s.speed = 0;
    const leading = s.fallen - s.drop;
    s.exposed = leading > 0 && leading < s.slot + instrument.aperture;
  }

  if (input.cock && s.phase !== 'falling') {
    s.phase = 'set';
    s.fallen = 0;
    s.shutterPosition = 0;
    s.scrubbing = false;
    s.speed = 0;
    s.elapsed = 0;
    s.exposed = false;
    s.exposedFor = 0;
    s.answer = '';
    s.score = null;
  }

  if (input.release && s.phase === 'set') {
    s.phase = 'falling';
    s.cardSeed = input.seed ?? Date.now();
    s.card = cardFor(s.cardSeed, s.letters);
    s.travel = s.drop + s.slot + instrument.aperture + 0.02;
    s.fallen = 0;
    s.shutterPosition = 0;
    s.scrubbing = false;
    s.speed = 0;
    s.elapsed = 0;
    s.exposedFor = 0;
  }

  if (s.phase === 'falling') {
    s.speed += G * dt;
    s.fallen = Math.min(s.travel, s.fallen + s.speed * dt);
    s.shutterPosition = s.travel > 0 ? s.fallen / s.travel : 0;
    s.elapsed += dt;

    // The slot's leading edge starts `drop` above the aperture; the card is
    // uncovered from when the leading edge passes the aperture's top until
    // the trailing edge passes its bottom.
    const leading = s.fallen - s.drop;
    s.exposed = leading > 0 && leading < s.slot + instrument.aperture;
    if (s.exposed) s.exposedFor += dt;

    if (s.fallen >= s.travel) {
      s.phase = 'read';
      s.exposed = false;
    }
  }

  if (input.answer != null && s.phase === 'read') {
    s.answer = String(input.answer).toUpperCase().replace(/[^A-Z]/g, '');
  }

  if (input.submit && s.phase === 'read') {
    s.score = scoreAnswer(s.card, s.answer);
    s.trials += 1;
    s.correct += s.score.right;
    s.phase = 'scored';
  }

  return s;
}

// Letters right in the right place, which is how the number-of-letters test
// was counted: position mattered, not just presence.
export function scoreAnswer(card, answer) {
  let right = 0;
  for (let i = 0; i < card.length; i += 1) {
    if (answer[i] === card[i]) right += 1;
  }
  return { right, of: card.length, answer, card };
}

// The exposure the current setting will give, for the readout.
export function predictedExposure(instrument) {
  return exposureFor(instrument.state.drop, instrument.state.slot, instrument.aperture);
}

import { useEffect, useRef, useState } from 'react';
import { getInteraction, subscribe, stopUsing } from '../world/interaction.js';
import { instrumentBus } from '../instruments/bus.js';
import { exposureFor, LIMITS } from '../instruments/tachistoscope.js';
import { agreement } from '../instruments/colourWheel.js';
import {
  LIMITS as COIL_LIMITS,
  bandFor,
  secondaryVolts,
  shockCurrent,
  sparkReach,
} from '../instruments/inductionCoil.js';
import { TARGET_SECONDS } from '../instruments/secondsPendulum.js';
import { ink, surface, surfaceStyle, label, keycap, keycapStyle, readout } from './theme.js';

// The chrome for instrument mode: a console along the foot of the screen, the
// way an instrument's own controls sit under your hands. It does not take a
// side of the screen, because the thing you are looking at is in the middle.
//
// Deliberately thin. The state lives in the simulation and this only shows it
// and pushes input back, so nothing here can disagree with the apparatus.

// One control: engraved label, a value in brass, and the slider under both.
function Dial({ name, value, display, min, max, step, onChange }) {
  return (
    <label className="flex min-w-[8.5rem] flex-1 flex-col gap-1">
      <span className="flex items-baseline justify-between gap-3">
        <span className={label} style={{ color: ink.muted }}>
          {name}
        </span>
        <span className={`${readout} text-[13px]`} style={{ color: ink.ivory }}>
          {display}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full outline-none
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-black/40"
        style={{
          background: `linear-gradient(to right, ${ink.brass} 0%, ${ink.brass} ${
            ((value - min) / (max - min)) * 100
          }%, rgba(232,227,212,0.14) ${((value - min) / (max - min)) * 100}%, rgba(232,227,212,0.14) 100%)`,
          accentColor: ink.brass,
        }}
      />
    </label>
  );
}

function Hint({ children, keys }) {
  return (
    <span className="instrument-key-hint flex items-center gap-1.5 text-[11px]" style={{ color: ink.faint }}>
      <span className={keycap} style={keycapStyle}>
        {keys}
      </span>
      {children}
    </span>
  );
}

// The one loud number on the console, because it is what the instrument is for.
function Reading({ name, value, unit, under }) {
  return (
    <div
      className="flex min-w-[7.5rem] flex-col items-end justify-end border-l pl-5"
      style={{ borderColor: ink.hair }}
    >
      <span className={label} style={{ color: ink.muted }}>
        {name}
      </span>
      <span className={`${readout} leading-none`} style={{ color: ink.live, fontSize: 'clamp(1.35rem, 2.4vw, 1.9rem)' }}>
        {value}
        {unit && (
          <span className="ml-1 text-[0.5em]" style={{ color: ink.muted }}>
            {unit}
          </span>
        )}
      </span>
      {under && (
        <span className={`${readout} text-[11px]`} style={{ color: ink.faint }}>
          {under}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tachistoscope({ state, answerRef }) {
  const exposure = exposureFor(state.drop, state.slot, 0.02);
  return (
    <>
      {(state.phase === 'read' || state.phase === 'scored') && (
        <div className="mb-3 flex flex-wrap items-end justify-center gap-4">
          <label className="flex flex-col items-center gap-1">
            <span className={label} style={{ color: ink.muted }}>
              {state.phase === 'scored' ? 'You read' : 'What did you see?'}
            </span>
            <input
              ref={answerRef}
              value={state.answer ?? ''}
              disabled={state.phase === 'scored'}
              maxLength={state.letters}
              onChange={(event) => instrumentBus.push({ answer: event.target.value })}
              className={`${readout} w-56 rounded border bg-transparent px-3 py-1.5 text-center text-2xl uppercase tracking-[0.5em] outline-none`}
              style={{ borderColor: ink.edge, color: ink.ivory }}
            />
          </label>
          {state.phase === 'scored' && state.score && (
            <div className="flex flex-col items-center gap-1">
              <span className={label} style={{ color: ink.muted }}>
                On the card
              </span>
              <span
                className={`${readout} px-3 py-1.5 text-2xl uppercase tracking-[0.5em]`}
                style={{ color: ink.live }}
              >
                {state.score.card}
              </span>
            </div>
          )}
          {state.phase === 'read' && (
            <button
              type="button"
              onClick={() => instrumentBus.push({ submit: true })}
              className="rounded border px-4 py-2 text-[11px] uppercase tracking-[0.18em]"
              style={{ borderColor: ink.edge, color: ink.brass, background: 'rgba(168,134,63,0.08)' }}
            >
              Record
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <Dial
          name="Drop height"
          value={state.drop}
          display={`${state.drop.toFixed(2)} m`}
          min={LIMITS.drop[0]}
          max={LIMITS.drop[1]}
          step={0.01}
          onChange={(value) => instrumentBus.push({ setDrop: value })}
        />
        <Dial
          name="Slot width"
          value={state.slot}
          display={`${Math.round(state.slot * 1000)} mm`}
          min={LIMITS.slot[0]}
          max={LIMITS.slot[1]}
          step={0.005}
          onChange={(value) => instrumentBus.push({ setSlot: value })}
        />
        <Dial
          name="Letters"
          value={state.letters}
          display={String(state.letters)}
          min={LIMITS.letters[0]}
          max={LIMITS.letters[1]}
          step={1}
          onChange={(value) => instrumentBus.push({ setLetters: value })}
        />
        <Dial
          name="Inspect shutter"
          value={state.shutterPosition ?? 0}
          display={`${Math.round((state.shutterPosition ?? 0) * 100)}%`}
          min={0}
          max={1}
          step={0.002}
          onChange={(value) => instrumentBus.push({ setShutter: value })}
        />
        <Reading
          name="Exposure"
          value={(exposure * 1000).toFixed(1)}
          unit="ms"
          under={`1/${Math.round(1 / exposure)} s`}
        />
      </div>
    </>
  );
}

function tachistoscopeNote(state) {
  if (state.phase === 'falling') return 'Falling…';
  if (state.scrubbing) {
    return state.exposed
      ? 'Inspection: the slot is held over the card. Drag the shutter control to inspect the whole passage.'
      : 'Inspection: drag the shutter control until the slot crosses the card. Space still runs a timed trial.';
  }
  if (state.phase === 'scored' && state.score) {
    return `${state.score.right} of ${state.score.of} in place, seen for ${(state.exposedFor * 1000).toFixed(1)} ms · ${state.correct}/${state.trials * state.score.of} across ${state.trials} ${state.trials === 1 ? 'trial' : 'trials'}`;
  }
  return 'The card is uncovered for as long as the slot takes to pass the aperture. Raise the shutter and it falls faster, so you see less.';
}

// ---------------------------------------------------------------------------

// Two squares side by side: what the disc is fusing to, and what it has to
// match. Held against each other, because that is the judgement being asked
// for and no number replaces it.
function Swatches({ mix, target, fused }) {
  return (
    <div className="flex items-end gap-3">
      <div className="flex flex-col items-center gap-1">
        <span className={label} style={{ color: ink.muted }}>
          Wheel
        </span>
        <span
          className="block h-12 w-16 rounded-sm border transition-opacity"
          style={{ background: mix, borderColor: ink.edge, opacity: fused ? 1 : 0.25 }}
        />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className={label} style={{ color: ink.muted }}>
          Chip
        </span>
        <span className="block h-12 w-16 rounded-sm border" style={{ background: target, borderColor: ink.edge }} />
      </div>
    </div>
  );
}

function ColourWheel({ state, names }) {
  const flicker = state.speed * state.fractions.filter((f) => f > 0.001).length;
  const close = state.mix && state.target ? agreement(state.mix, state.target.colour) : 0;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-center gap-6">
        <Swatches mix={state.mix} target={state.target.colour} fused={state.fusion > 0.9} />
        {state.phase === 'matched' && state.match?.agreement != null && (
          <div className="flex flex-col items-center gap-1">
            <span className={label} style={{ color: ink.muted }}>
              Recorded
            </span>
            <span className={`${readout} text-3xl`} style={{ color: ink.live }}>
              {(state.match.agreement * 100).toFixed(1)}%
            </span>
          </div>
        )}
        {state.phase === 'matched' && (
          <button
            type="button"
            onClick={() => instrumentBus.push({ newTarget: true })}
            className="rounded border px-4 py-2 text-[11px] uppercase tracking-[0.18em]"
            style={{ borderColor: ink.edge, color: ink.brass, background: 'rgba(168,134,63,0.08)' }}
          >
            New chip
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        {state.fractions.map((fraction, slot) => (
          <Dial
            key={names[slot]}
            name={names[slot]}
            value={fraction}
            display={`${Math.round(fraction * 360)}°`}
            min={0}
            max={1}
            step={0.005}
            onChange={(value) => instrumentBus.push({ setFraction: { slot, value } })}
          />
        ))}
        <Reading
          name={state.fusion > 0.9 ? 'Fused' : 'Flicker'}
          value={flicker.toFixed(0)}
          unit="Hz"
          under={`${state.speed.toFixed(1)} rev/s`}
        />
      </div>
      {/* How far off the fused colour is, but only once it has actually
          fused — a bar that moves while the disc is flickering would let you
          match by watching the number instead of by looking. */}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full" style={{ background: 'rgba(232,227,212,0.1)' }}>
        <div
          className="h-full transition-[width]"
          style={{
            width: `${(state.fusion > 0.9 ? close : 0) * 100}%`,
            background: ink.brass,
          }}
        />
      </div>
    </>
  );
}

function colourWheelNote(state) {
  if (state.match?.tooSlow) return 'Too slow to read. The sectors are still separately visible — crank it up until they fuse.';
  if (state.phase === 'matched') {
    return `Best of ${state.trials} ${state.trials === 1 ? 'reading' : 'readings'}: ${(state.best * 100).toFixed(1)}%`;
  }
  if (state.fusion > 0.9) return 'Fused. The eye is averaging the papers in proportion to their sectors — read the colour off and record it.';
  if (state.speed > 1) return 'Still flickering. The eye resolves each paper separately below about fifty flashes a second.';
  return 'Set the sectors, then crank until the papers fuse into one colour and match it against the chip.';
}

// ---------------------------------------------------------------------------

// The sledge coil. Three settings and a key, and the only honest way to know
// what it is about to do to you is to read them — which is exactly the
// position the people who used it were in.
function InductionCoil({ state }) {
  const availableVolts = secondaryVolts(state.distance, state.cells);
  const availableMilliamps = shockCurrent(availableVolts);
  const milliamps = state.energized ? shockCurrent(state.volts) : availableMilliamps;
  const reach = sparkReach(state.running ? state.volts : availableVolts);
  const band = bandFor(milliamps);
  const hurts = milliamps >= 10;
  const meter = Math.min(100, (milliamps / 60) * 100);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-center gap-5">
        <div className="flex flex-col items-center gap-1">
          <span className={label} style={{ color: ink.muted }}>
            Secondary
          </span>
          <span className={`${readout} text-2xl`} style={{ color: state.running ? ink.live : ink.faint }}>
            {Math.round(state.running ? state.volts : availableVolts)}
            <span className="ml-1 text-[0.5em]" style={{ color: ink.muted }}>
              V
            </span>
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={label} style={{ color: ink.muted }}>
            Spark reaches
          </span>
          <span className={`${readout} text-2xl`} style={{ color: state.sparking ? '#bcd8ff' : ink.faint }}>
            {reach.toFixed(2)}
            <span className="ml-1 text-[0.5em]" style={{ color: ink.muted }}>
              mm
            </span>
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={label} style={{ color: hurts ? '#e08a6a' : ink.muted }}>
            {state.energized ? 'Through you' : 'Expected current'}
          </span>
          <span className={`${readout} text-2xl`} style={{ color: hurts ? '#e08a6a' : ink.faint }}>
            {milliamps.toFixed(1)}
            <span className="ml-1 text-[0.5em]" style={{ color: ink.muted }}>
              mA
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => instrumentBus.push({ grasp: true })}
          className="rounded border px-4 py-2 text-[11px] uppercase tracking-[0.18em]"
          style={{
            borderColor: hurts ? 'rgba(200,78,54,0.7)' : ink.edge,
            color: hurts ? '#e08a6a' : ink.brass,
            background: hurts ? 'rgba(200,78,54,0.1)' : 'rgba(168,134,63,0.08)',
          }}
        >
          {state.holding ? 'Put down the electrodes' : 'Take the electrodes'}
        </button>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className={label} style={{ color: ink.muted }}>Predicted sensation</span>
          <span className={`${readout} text-[12px] uppercase`} style={{ color: hurts ? '#e08a6a' : ink.brass }}>
            {band.name}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(232,227,212,0.1)' }}>
          <div
            className="h-full transition-[width] duration-150"
            style={{
              width: `${meter}%`,
              background: 'linear-gradient(90deg, #bda965 0%, #d79a4d 42%, #db684e 72%, #f1e7d3 100%)',
              boxShadow: state.energized ? '0 0 10px rgba(189,216,255,0.9)' : 'none',
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.13em]" style={{ color: ink.faint }}>
          <span>Barely felt</span><span>Painful</span><span>Loss of control</span><span>Severe</span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        {/* Inverted: the slider runs the way the carriage does, so pushing it
            right runs the secondary away and weakens the shock. */}
        <Dial
          name="Coils apart"
          value={state.distance}
          display={`${state.distance.toFixed(0)} cm`}
          min={COIL_LIMITS.distance[0]}
          max={COIL_LIMITS.distance[1]}
          step={0.5}
          onChange={(value) => instrumentBus.push({ setDistance: value })}
        />
        <Dial
          name="Cells"
          value={state.cells}
          display={`${state.cells} Grove`}
          min={COIL_LIMITS.cells[0]}
          max={COIL_LIMITS.cells[1]}
          step={1}
          onChange={(value) => instrumentBus.push({ setCells: value })}
        />
        <Dial
          name="Spark gap"
          value={state.gap}
          display={`${state.gap.toFixed(2)} mm`}
          min={COIL_LIMITS.gap[0]}
          max={COIL_LIMITS.gap[1]}
          step={0.05}
          onChange={(value) => instrumentBus.push({ setGap: value })}
        />
        <Reading
          name={state.running ? 'Hammer' : 'Key open'}
          value={state.running ? String(state.breaks % 1000) : '—'}
          unit={state.running ? 'breaks' : ''}
          under={state.running ? 'circuit closed' : 'nothing is live'}
        />
      </div>
    </>
  );
}

function inductionCoilNote(state) {
  if (state.energized && state.lastShock) {
    return `${state.lastShock.text} Exposure: ${state.exposureSeconds.toFixed(1)} s. Release Space to open the key.`;
  }
  if (state.holding && !state.running) {
    return 'The electrodes are in your hands. Hold Space to close the key; release it immediately to stop the current.';
  }
  if (state.running && !state.holding) {
    return 'The hammer is running, but the human circuit is open. Take the electrodes to feel the selected dose.';
  }
  if (!state.running) {
    return 'Set the cells and coil distance, take the electrodes, then hold Space. Moving the secondary toward the primary increases the current continuously.';
  }
  if (state.sparking) {
    return 'The balls are snapping over. Air breaks down at about three kilovolts a millimetre, so the gap it jumps tells you the voltage.';
  }
  return 'Running, but not hard enough to jump the gap. Run the coils together, or put more cells in.';
}

// ---------------------------------------------------------------------------

function SecondsPendulum({ state }) {
  const result = state.result;
  const resultLabel = result?.error < 0 ? 'early' : 'late';
  const mean = state.trials > 0 ? state.totalAbsoluteError / state.trials : null;

  return (
    <>
      <div className="mb-4 flex flex-col items-center gap-1 text-center">
        <span className={label} style={{ color: ink.muted }}>
          {state.phase === 'reference' ? 'Reference swing' : state.phase === 'timing' ? 'Pendulum caught' : 'Judgment recorded'}
        </span>
        <span
          className={`${readout} text-2xl sm:text-3xl`}
          style={{ color: state.phase === 'timing' ? ink.ivory : ink.live }}
        >
          {state.phase === 'reference' && 'ONE SECOND · ONE SECOND'}
          {state.phase === 'timing' && 'JUDGE TEN SECONDS IN SILENCE'}
          {state.phase === 'result' && `${result.elapsed.toFixed(2)} SECONDS`}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-center gap-x-7 gap-y-4">
        <Reading name="Half-swing" value="1.000" unit="s" under="reference interval" />
        <Reading
          name={state.phase === 'result' ? 'Error' : 'Target'}
          value={state.phase === 'result' ? result.absoluteError.toFixed(2) : TARGET_SECONDS.toFixed(2)}
          unit="s"
          under={state.phase === 'result' ? resultLabel : 'no clock shown'}
        />
        <Reading
          name="Trials"
          value={String(state.trials)}
          under={mean == null ? 'first judgment ahead' : `${mean.toFixed(2)} s mean error`}
        />
        {state.bestAbsoluteError != null && (
          <Reading name="Best" value={state.bestAbsoluteError.toFixed(2)} unit="s" under="absolute error" />
        )}
      </div>
    </>
  );
}

function secondsPendulumNote(state) {
  if (state.phase === 'timing') {
    return 'The pendulum is caught and the clock is hidden. Press Space when ten seconds seems to have passed.';
  }
  if (state.phase === 'result' && state.result) {
    const direction = state.result.error < 0 ? 'early' : 'late';
    return `You marked ten seconds ${state.result.absoluteError.toFixed(2)} seconds ${direction}. Swing it again for another trial.`;
  }
  return 'Watch the reference: each passage from one side to the other takes one second. Space catches it and begins the silent interval.';
}

// ---------------------------------------------------------------------------

const TITLES = {
  tachistoscope: ['Tachistoscope', 'Fall-screen exposure apparatus'],
  'colour-wheel': ['Colour wheel', 'Rotating disc colour mixer'],
  'induction-coil': ['Induction coil', 'du Bois-Reymond sledge coil'],
  'seconds-pendulum': ['Seconds pendulum', 'Judgment of ten seconds'],
};

export default function InstrumentPanel() {
  const [using, setUsing] = useState(() => getInteraction().using);
  const [state, setState] = useState(null);
  const answerRef = useRef(null);

  useEffect(() => subscribe((next) => setUsing(next.using)), []);
  useEffect(() => {
    if (!using) {
      setState(null);
      return undefined;
    }
    // The sim ticks every frame; sample it on an interval so the console is
    // not re-rendering sixty times a second for a number that reads the same.
    const id = setInterval(() => {
      const live = using.runtime?.state;
      if (live) setState({ ...live });
    }, 60);
    return () => clearInterval(id);
  }, [using]);

  const kind = using?.instrument ?? null;

  // The listeners key on the *kind*, not on the entry. `using` gets a fresh
  // identity whenever the stage writes its framing back, and re-running this
  // effect on that tore the listeners down and put the held key back up —
  // which reads as a control that silently does nothing.
  const usingRef = useRef(using);
  usingRef.current = using;

  useEffect(() => {
    if (!kind) return undefined;
    const typing = () => document.activeElement === answerRef.current;
    const onKey = (event) => {
      if (!usingRef.current) return;
      if (event.key === 'Escape') {
        stopUsing();
        return;
      }
      if (kind === 'colour-wheel' && event.code === 'Enter' && !typing()) {
        event.preventDefault();
        instrumentBus.push({ record: true });
        return;
      }
      if (kind === 'induction-coil' && (event.code === 'KeyF' || event.code === 'Enter') && !typing()) {
        event.preventDefault();
        if (!event.repeat) instrumentBus.push({ grasp: true });
        return;
      }
      if (event.code !== 'Space' || typing()) return;
      event.preventDefault();
      if (event.repeat) return;
      if (kind === 'colour-wheel') {
        instrumentBus.push({ cranking: true });
        return;
      }
      // The key is held down, not latched: a sledge coil is only live while
      // your finger is on it, and that is most of what kept people alive.
      if (kind === 'induction-coil') {
        instrumentBus.push({ key: true });
        return;
      }
      if (kind === 'seconds-pendulum') {
        instrumentBus.push({ toggle: true });
        return;
      }
      instrumentBus.push(
        usingRef.current.runtime?.state.phase === 'set'
          ? { release: true, seed: Math.floor(Math.random() * 1e9) }
          : { cock: true },
      );
    };
    // Cranking is a held key, not a press: the wheel has to be worked up to
    // speed, and letting go has to let it die away.
    const onUp = (event) => {
      if (!usingRef.current || event.code !== 'Space') return;
      if (kind === 'colour-wheel') instrumentBus.push({ cranking: false });
      if (kind === 'induction-coil') instrumentBus.push({ key: false });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, [kind]);

  // Nothing needs releasing on the way out: stepping away discards the
  // running instrument, and the next visit builds a fresh one with the key
  // open. Pushing a release here is what broke the held controls before.

  useEffect(() => {
    if (state?.phase === 'read') answerRef.current?.focus();
  }, [state?.phase]);

  if (!using || !state?.phase) return null;
  const [title, subtitle] = TITLES[kind] ?? [using.runtime?.label ?? '', ''];
  const wheel = kind === 'colour-wheel';
  const coil = kind === 'induction-coil';

  const releaseHeldControl = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (wheel) instrumentBus.push({ cranking: false });
    if (coil) instrumentBus.push({ key: false });
  };

  const pressInstrumentControl = () => {
    if (wheel) instrumentBus.push({ cranking: true });
    else if (coil) instrumentBus.push({ key: true });
    else if (pendulum) instrumentBus.push({ toggle: true });
    else {
      instrumentBus.push(
        state.phase === 'set'
          ? { release: true, seed: Math.floor(Math.random() * 1e9) }
          : { cock: true },
      );
    }
  };
  const pendulum = kind === 'seconds-pendulum';

  return (
    <>
      <button
        type="button"
        onClick={stopUsing}
        aria-label="Close instrument"
        className="absolute right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border text-2xl leading-none transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 sm:right-6 sm:top-6"
        style={{
          borderColor: ink.edge,
          color: ink.ivory,
          background: 'rgba(25, 20, 17, 0.88)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
        }}
      >
        <span aria-hidden="true">×</span>
      </button>

      {/* Title, top centre, out of the way of the apparatus. */}
      <div className="instrument-title pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-center">
        <p className={label} style={{ color: ink.brass }}>
          {title}
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: ink.faint }}>
          {subtitle}
        </p>
      </div>

      {/* The console. Bottom-anchored, centred, and it wraps rather than
          shrinking its type when the window is narrow. */}
      <div className="instrument-console-shell pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center p-4 sm:p-6">
        <div className={`${surface} instrument-console pointer-events-auto w-full max-w-3xl px-4 py-3 sm:px-5`} style={surfaceStyle}>
          {coil && <InductionCoil state={state} />}
          {wheel && <ColourWheel state={state} names={using.runtime?.names ?? []} />}
          {pendulum && <SecondsPendulum state={state} />}
          {!coil && !wheel && !pendulum && <Tachistoscope state={state} answerRef={answerRef} />}

          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-2.5"
            style={{ borderColor: ink.hair }}
          >
            <p className="max-w-lg text-[11px] leading-relaxed" style={{ color: ink.muted }}>
              {coil
                ? inductionCoilNote(state)
                : wheel
                  ? colourWheelNote(state)
                  : pendulum
                    ? secondsPendulumNote(state)
                    : tachistoscopeNote(state)}
            </p>
            <div className="flex items-center gap-4">
              {coil && (
                <>
                  <Hint keys="Space">hold the key down</Hint>
                  <Hint keys="F">{state.holding ? 'put electrodes down' : 'take the electrodes'}</Hint>
                </>
              )}
              {wheel && (
                <>
                  <Hint keys="Space">hold to crank</Hint>
                  <Hint keys="Enter">record</Hint>
                </>
              )}
              {pendulum && (
                <Hint keys="Space">
                  {state.phase === 'reference' ? 'catch and begin' : state.phase === 'timing' ? 'mark ten seconds' : 'swing again'}
                </Hint>
              )}
              {!coil && !wheel && !pendulum && (
                <Hint keys="Space">{state.phase === 'set' ? 'release shutter' : 'set again'}</Hint>
              )}
              <Hint keys="Drag">look</Hint>
              <Hint keys="Wheel">zoom</Hint>
              <Hint keys="Esc">step away</Hint>
            </div>
          </div>

          <div className="instrument-mobile-actions" aria-label="Instrument touch controls">
            <button type="button" onClick={stopUsing}>Step away</button>
            {wheel && (
              <button type="button" onClick={() => instrumentBus.push({ record: true })}>Record</button>
            )}
            <button
              type="button"
              disabled={!wheel && !coil && state.phase === 'falling'}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture?.(event.pointerId);
                pressInstrumentControl();
              }}
              onPointerUp={releaseHeldControl}
              onPointerCancel={releaseHeldControl}
              onLostPointerCapture={() => {
                if (wheel) instrumentBus.push({ cranking: false });
                if (coil) instrumentBus.push({ key: false });
              }}
            >
              {wheel
                ? 'Hold to crank'
                : coil
                  ? 'Hold the key'
                  : pendulum
                    ? state.phase === 'reference'
                      ? 'Catch and begin'
                      : state.phase === 'timing'
                        ? 'Mark ten seconds'
                        : 'Swing again'
                    : state.phase === 'set'
                      ? 'Release shutter'
                      : 'Set shutter'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

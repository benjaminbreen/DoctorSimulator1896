// Player-facing settings: picture, sound, controls, and the hour. Writes go
// straight to the tuning runtime and the sound service, which persist on
// their own. The dev tuning rail (Shift+`) remains the place for the rest.

import { useEffect, useReducer, useState } from 'react';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import { EyebrowArrow } from './chrome.jsx';
import {
  getSoundState, subscribeSound, setSoundMuted, setMasterVolume, setSfxVolume,
} from '../audio/sound.js';
import './settings.css';

// The tuning parameters this panel owns. Restore Defaults resets these and
// nothing else, so a player cannot wreck the dev tuning from here.
const TUNING_IDS = ['exposure', 'contrast', 'vignetteAmount', 'fov', 'shadowsEnabled', 'lookSensitivity', 'invertY'];

const HOURS = [
  { label: 'Dawn', hour: 5.5 },
  { label: 'Morning', hour: 9.5 },
  { label: 'Midday', hour: 12 },
  { label: 'Afternoon', hour: 15 },
  { label: 'Evening', hour: 18.5 },
  { label: 'Night', hour: 22 },
];

function spoken(hours) {
  const h24 = Math.floor(hours);
  const minutes = Math.floor((hours - h24) * 60);
  const h12 = ((h24 + 11) % 12) + 1;
  const period = h24 < 12 ? 'in the morning' : h24 < 17 ? 'in the afternoon' : 'in the evening';
  return minutes === 0 ? `${h12} o'clock ${period}` : `${h12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function SliderRow({ label, min, max, step, value, onChange, format }) {
  return (
    <label className="ghud-set-row">
      <span className="ghud-set-label">{label}</span>
      <input
        type="range"
        className="ghud-set-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="ghud-set-value">{format(value)}</span>
    </label>
  );
}

function ToggleRow({ label, on, onToggle }) {
  return (
    <div className="ghud-set-row">
      <span className="ghud-set-label">{label}</span>
      <span className="ghud-set-toggle-seat">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={`ghud-set-chip${on ? ' ghud-set-chip--on' : ''}`}
          onClick={onToggle}
        >
          {on ? 'On' : 'Off'}
        </button>
      </span>
    </div>
  );
}

export default function SettingsPanel({ open, onClose, runtime, worldClock }) {
  const containerRef = useDismissableOverlay(open, onClose);
  // Sliders write into the runtime, which nothing re-renders on; this bump is
  // the panel's own refresh.
  const [, bump] = useReducer((count) => count + 1, 0);
  const [sound, setSound] = useState(getSoundState);
  const [hours, setHours] = useState(() => worldClock.getSnapshot().hours);

  useEffect(() => {
    if (!open) return undefined;
    return subscribeSound(setSound);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    return worldClock.subscribe((snapshot) => setHours(snapshot.hours));
  }, [open, worldClock]);

  if (!open) return null;

  const values = runtime.values;
  const tune = (id) => (value) => {
    runtime.set(id, value);
    bump();
  };
  const percentOf = (base) => (value) => `${Math.round((value / base) * 100)}%`;

  const restore = () => {
    for (const definition of runtime.definitions) {
      if (TUNING_IDS.includes(definition.id)) runtime.set(definition.id, definition.default);
    }
    // Matches the defaults in audio/sound.js.
    setSoundMuted(false);
    setMasterVolume(0.8);
    setSfxVolume(0.85);
    bump();
  };

  return (
    <div className="ghud-scrim" onPointerDown={onClose}>
      <section
        ref={containerRef}
        className="ghud-settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="ghud-set-head">
          <h3 className="ghud-set-title">Settings</h3>
          <button type="button" className="ghud-letters-close" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>

        <div className="ghud-set-grid">
          <section className="ghud-set-box ghud-set-box--picture" aria-label="Picture">
            <div className="ghud-eyebrow ghud-day-eyebrow">
              <EyebrowArrow size={22} />
              <span>Picture</span>
              <EyebrowArrow flip size={22} />
            </div>
            <SliderRow
              label="Brightness"
              min={0.4}
              max={2}
              step={0.05}
              value={values.exposure}
              onChange={tune('exposure')}
              format={percentOf(1.05)}
            />
            <SliderRow
              label="Contrast"
              min={0.7}
              max={1.4}
              step={0.02}
              value={values.contrast}
              onChange={tune('contrast')}
              format={percentOf(1)}
            />
            <SliderRow
              label="Vignette"
              min={0}
              max={2}
              step={0.05}
              value={values.vignetteAmount}
              onChange={tune('vignetteAmount')}
              format={percentOf(1)}
            />
            <SliderRow
              label="Field of view"
              min={45}
              max={85}
              step={1}
              value={values.fov}
              onChange={tune('fov')}
              format={(value) => `${Math.round(value)}°`}
            />
            <ToggleRow
              label="Shadows"
              on={values.shadowsEnabled}
              onToggle={() => tune('shadowsEnabled')(!values.shadowsEnabled)}
            />
          </section>

          <section className="ghud-set-box ghud-set-box--sound" aria-label="Sound">
            <div className="ghud-eyebrow ghud-day-eyebrow">
              <EyebrowArrow size={22} />
              <span>Sound</span>
              <EyebrowArrow flip size={22} />
            </div>
            <SliderRow
              label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={sound.masterVolume}
              onChange={setMasterVolume}
              format={percentOf(1)}
            />
            <SliderRow
              label="Effects"
              min={0}
              max={1}
              step={0.05}
              value={sound.sfxVolume}
              onChange={setSfxVolume}
              format={percentOf(1)}
            />
            <ToggleRow
              label="Mute all"
              on={sound.muted}
              onToggle={() => setSoundMuted(!sound.muted)}
            />
          </section>

          <section className="ghud-set-box ghud-set-box--controls" aria-label="Controls">
            <div className="ghud-eyebrow ghud-day-eyebrow">
              <EyebrowArrow size={22} />
              <span>Controls</span>
              <EyebrowArrow flip size={22} />
            </div>
            <SliderRow
              label="Look speed"
              min={0.0005}
              max={0.008}
              step={0.0001}
              value={values.lookSensitivity}
              onChange={tune('lookSensitivity')}
              format={(value) => `${(value / 0.0021).toFixed(1)}×`}
            />
            <ToggleRow
              label="Invert look"
              on={values.invertY}
              onToggle={() => tune('invertY')(!values.invertY)}
            />
          </section>

          <section className="ghud-set-box ghud-set-box--time" aria-label="Time of day">
            <div className="ghud-eyebrow ghud-day-eyebrow">
              <EyebrowArrow size={22} />
              <span>Time of Day</span>
              <EyebrowArrow flip size={22} />
            </div>
            <div className="ghud-set-hours" role="group" aria-label="Set the hour">
              {HOURS.map(({ label, hour }) => (
                <button
                  key={label}
                  type="button"
                  className={`ghud-set-chip${Math.abs(hours - hour) < 0.3 ? ' ghud-set-chip--on' : ''}`}
                  onClick={() => tune('timeOfDay')(hour)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="ghud-set-row ghud-set-row--time">
              <span className="ghud-set-label">The hour</span>
              <input
                type="range"
                className="ghud-set-slider"
                min={0}
                max={24}
                step={0.25}
                value={hours}
                onChange={(event) => tune('timeOfDay')(Number(event.target.value))}
                aria-label="Time of day"
              />
              <span className="ghud-set-value ghud-set-value--time">{spoken(hours)}</span>
            </label>
            <p className="ghud-day-caption">Sets the clock to that hour today; the date does not change.</p>
          </section>
        </div>

        <footer className="ghud-set-foot">
          <p className="ghud-day-caption">Settings are remembered between visits.</p>
          <button type="button" className="ghud-letter-verb" onClick={restore}>
            Restore Defaults
          </button>
        </footer>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { requestHudOverlay } from './overlayRequests.js';
import {
  hasUsedFastTravel,
  subscribeOnboardingProgress,
} from './onboardingProgress.js';
import './ControlHelper.css';

const WALK_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
]);
const FORM_TAGS = new Set(['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA']);

function KeyGroup({ keys, label }) {
  return (
    <span className="control-helper__keys" aria-label={label}>
      {keys.map((key) => <kbd key={key}>{key}</kbd>)}
    </span>
  );
}

const SETTLE_MS = 60000;
let learnedControls = false;

export default function ControlHelper({ hidden = false, zone }) {
  const [walked, setWalked] = useState(false);
  const [fastTravelUsed, setFastTravelUsed] = useState(hasUsedFastTravel);
  const [open, setOpen] = useState(() => !learnedControls);

  useEffect(() => subscribeOnboardingProgress(setFastTravelUsed), []);

  const [looked, setLooked] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    if (!walked || !looked || manual || !open) return undefined;
    learnedControls = true;
    const timer = setTimeout(() => setOpen(false), 5000);
    return () => clearTimeout(timer);
  }, [walked, looked, manual, open]);

  useEffect(() => {
    const onLook = (event) => {
      if (event.target?.tagName === 'CANVAS'
        && (event.type === 'wheel' || event.buttons === 1)) setLooked(true);
    };
    const onViewKey = (event) => {
      if (event.code === 'KeyM' && !FORM_TAGS.has(event.target?.tagName)
        && !event.target?.isContentEditable) setLooked(true);
    };
    window.addEventListener('keydown', onViewKey);
    window.addEventListener('pointermove', onLook);
    window.addEventListener('wheel', onLook, { passive: true });
    return () => {
      window.removeEventListener('keydown', onViewKey);
      window.removeEventListener('pointermove', onLook);
      window.removeEventListener('wheel', onLook);
    };
  }, []);

  // zone is a dependency so arriving somewhere restarts the clock even when
  // the card was already open.
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => setOpen(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [open, zone]);

  useEffect(() => {
    if (walked) return undefined;
    const onKeyDown = (event) => {
      if (!WALK_KEYS.has(event.code)) return;
      if (FORM_TAGS.has(event.target?.tagName) || event.target?.isContentEditable) return;
      setWalked(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [walked]);

  if (hidden) return null;
  if (!open) {
    return (
      <button
        type="button"
        className="control-helper__tab"
        onClick={() => { setManual(true); setOpen(true); }}
        aria-label="Show controls"
      >
        ?
      </button>
    );
  }
  return (
    <aside
      className={`control-helper control-helper--${walked ? 'settled' : 'new'}`}
      aria-label="Game controls"
    >
      <span className="control-helper__cap" aria-hidden="true">Controls</span>
      <button
        type="button"
        className="control-helper__close"
        onClick={() => setOpen(false)}
        aria-label="Hide controls"
      >
        ×
      </button>
      {!walked && (
        <p className="control-helper__walk">
          <KeyGroup keys={['W', 'A', 'S', 'D']} label="W A S D keys" />
          <span className="control-helper__or">or</span>
          <KeyGroup keys={['↑', '←', '↓', '→']} label="arrow keys" />
          {' to walk'}
        </p>
      )}

      <p className="control-helper__directions">
        <b>Drag</b> to turn the camera
        <span className="control-helper__sep">·</span>
        <b>Scroll</b> to zoom
        <span className="control-helper__sep">·</span>
        <kbd>M</kbd> changes view
      </p>

      {!fastTravelUsed && (
        <p className="control-helper__travel">
          <button type="button" onClick={() => requestHudOverlay('travel')}>Fast Travel</button>
          {' '}reaches the waiting room, consulting room, or Columbia lab.
        </p>
      )}

      <p className="control-helper__shortcuts">
        <span><kbd>Shift</kbd> run</span>
        <span><kbd>Space</kbd> jump</span>
        <span><kbd>E</kbd> use</span>
        <span><kbd>P</kbd> pause</span>
      </p>
    </aside>
  );
}

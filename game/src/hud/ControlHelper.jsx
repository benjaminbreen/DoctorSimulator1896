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

export default function ControlHelper({ hidden = false }) {
  const [walked, setWalked] = useState(false);
  const [fastTravelUsed, setFastTravelUsed] = useState(hasUsedFastTravel);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => subscribeOnboardingProgress(setFastTravelUsed), []);

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

  if (hidden || dismissed) return null;
  return (
    <aside
      className={`control-helper control-helper--${walked ? 'settled' : 'new'}`}
      aria-label="Game controls"
    >
      <span className="control-helper__cap" aria-hidden="true">Controls</span>
      <button
        type="button"
        className="control-helper__close"
        onClick={() => setDismissed(true)}
        aria-label="Close controls"
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

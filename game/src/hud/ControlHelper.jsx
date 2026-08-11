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
      <button
        type="button"
        className="control-helper__close"
        onClick={() => setDismissed(true)}
        aria-label="Close controls"
      >
        ×
      </button>
      {!walked && (
        <div className="control-helper__movement">
          <p>Move through the world</p>
          <div className="control-helper__walk-keys">
            <KeyGroup keys={['W', 'A', 'S', 'D']} label="W A S D keys" />
            <span className="control-helper__or">or</span>
            <KeyGroup keys={['↑', '←', '↓', '→']} label="arrow keys" />
            <strong>to walk</strong>
          </div>
        </div>
      )}

      <div className="control-helper__directions">
        <span><b>Drag</b> to turn the camera</span>
        <span><b>Scroll</b> to zoom</span>
        <span><kbd>M</kbd> changes the camera view</span>
      </div>

      {!fastTravelUsed && (
        <p className="control-helper__travel">
          Click{' '}
          <button type="button" onClick={() => requestHudOverlay('travel')}>Fast Travel</button>
          {' '}to return to your <strong>waiting room</strong>, see a <strong>patient</strong>, or
          visit your old mentor at Columbia’s <strong>psychology lab</strong> uptown.
        </p>
      )}

      <p className="control-helper__shortcuts">
        <span><kbd>Shift</kbd> run</span>
        <span><kbd>Space</kbd> jump</span>
        <span><kbd>E</kbd> use</span>
        <span><kbd>Shift</kbd>+<kbd>1</kbd> props</span>
        <span><kbd>Shift</kbd>+<kbd>`</kbd> panel</span>
      </p>
    </aside>
  );
}

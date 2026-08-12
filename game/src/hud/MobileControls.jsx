import { useEffect, useRef, useState } from 'react';
import { gameDebug } from '../debug.js';
import './MobileControls.css';

const DEAD_ZONE = 0.1;
const RUN_EDGE = 0.86;

function ViewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
      <path d="M7 12c2.8-3.8 7.2-3.8 10 0-2.8 3.8-7.2 3.8-10 0Z" />
      <circle cx="12" cy="12" r="1.8" />
    </svg>
  );
}

function JumpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 11 5-5 5 5M12 6v11" />
      <path d="M6 20h12" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 11V6.5a1.5 1.5 0 0 1 3 0V10 5.5a1.5 1.5 0 0 1 3 0V10 7a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v4.5c0 4-2.8 6.5-6.5 6.5h-1c-2.2 0-3.5-1.1-4.8-2.8L4.8 14a1.7 1.7 0 0 1 2.6-2.1l1.1.9V11Z" />
    </svg>
  );
}

function ActionButton({ action, keyboard, label, children, disabled = false }) {
  const release = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    keyboard.setVirtualAction(action, false);
  };

  return (
    <button
      type="button"
      className={`mctl-action mctl-action--${action}`}
      aria-label={label}
      disabled={disabled}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        keyboard.setVirtualAction(action, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => keyboard.setVirtualAction(action, false)}
    >
      {children}
    </button>
  );
}

export default function MobileControls({ keyboard, hidden = false }) {
  const stick = useRef(null);
  const activePointer = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [moved, setMoved] = useState(false);
  const [prompt, setPrompt] = useState(null);

  const releaseStick = (event = null) => {
    if (event && stick.current?.hasPointerCapture?.(event.pointerId)) {
      stick.current.releasePointerCapture(event.pointerId);
    }
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    keyboard.setVirtualMove(0, 0, false);
  };

  const moveStick = (event) => {
    if (activePointer.current !== event.pointerId || !stick.current) return;
    const rect = stick.current.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2 - 25);
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(x, y);
    if (distance > radius) {
      x = (x / distance) * radius;
      y = (y / distance) * radius;
    }
    const nx = x / radius;
    const ny = y / radius;
    const magnitude = Math.hypot(nx, ny);
    const active = magnitude >= DEAD_ZONE;
    setKnob({ x, y });
    keyboard.setVirtualMove(active ? nx : 0, active ? -ny : 0, magnitude >= RUN_EDGE);
    if (active) setMoved(true);
  };

  useEffect(() => {
    const id = setInterval(() => setPrompt(gameDebug.prompt), 160);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (hidden) keyboard.clearVirtualInput();
  }, [hidden, keyboard]);

  useEffect(() => {
    const clear = () => {
      activePointer.current = null;
      keyboard.clearVirtualInput();
      setKnob({ x: 0, y: 0 });
    };
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
      clear();
    };
  }, [keyboard]);

  useEffect(() => {
    // The controls only mount in development after the same debug handle is
    // installed, but exposing the polled input there gives the existing
    // headless harness a deterministic way to exercise touch movement.
    gameDebug.mobileInput = {
      move: (x, z, run = false) => keyboard.setVirtualMove(x, z, run),
      action: (action, pressed) => keyboard.setVirtualAction(action, pressed),
      clear: () => keyboard.clearVirtualInput(),
    };
    return () => {
      gameDebug.mobileInput = null;
    };
  }, [keyboard]);

  if (hidden) return null;
  return (
    <div className="mctl" aria-label="Touch controls">
      <div className="mctl-left">
        {!moved && (
          <p className="mctl-tip">Drag to move · swipe the scene to look</p>
        )}
        <div
          ref={stick}
          className="mctl-stick"
          role="group"
          aria-label="Movement joystick. Push farther to run."
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.preventDefault();
            activePointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            moveStick(event);
          }}
          onPointerMove={moveStick}
          onPointerUp={releaseStick}
          onPointerCancel={releaseStick}
          onLostPointerCapture={() => {
            if (activePointer.current !== null) releaseStick();
          }}
        >
          <span className="mctl-stick-runes" aria-hidden="true">N</span>
          <span
            className="mctl-knob"
            aria-hidden="true"
            style={{ transform: `translate3d(${knob.x}px, ${knob.y}px, 0)` }}
          />
        </div>
      </div>

      <div className="mctl-right">
        {prompt && <span className="mctl-use-label">{prompt}</span>}
        <ActionButton action="interact" keyboard={keyboard} label={prompt ? `Use: ${prompt}` : 'Nothing within reach'} disabled={!prompt}>
          <HandIcon />
          <span>Use</span>
        </ActionButton>
        <div className="mctl-secondary-actions">
          <ActionButton action="jump" keyboard={keyboard} label="Jump">
            <JumpIcon />
            <span>Jump</span>
          </ActionButton>
          <ActionButton action="cycleCamera" keyboard={keyboard} label="Change camera view">
            <ViewIcon />
            <span>View</span>
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

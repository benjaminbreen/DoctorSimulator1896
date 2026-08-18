// The armed eye: a reticle on the cursor and one line telling the player what
// the next click will do. Nothing else — the point of the mode is to look at
// the world, so the chrome gets out of the way of it.

import { useEffect, useState } from 'react';
import { cancelPicking, getInteraction, subscribe } from '../world/interaction.js';
import { ink, label } from './theme.js';

export default function ExamineReticle() {
  const [picking, setPicking] = useState(() => getInteraction().picking);
  const [at, setAt] = useState(null);

  useEffect(() => subscribe((state) => setPicking(state.picking)), []);

  useEffect(() => {
    if (!picking) {
      setAt(null);
      return undefined;
    }
    const onMove = (event) => setAt({ x: event.clientX, y: event.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [picking]);

  if (!picking) return null;

  return (
    <>
      {at && (
        <svg
          aria-hidden="true"
          className="pointer-events-none fixed z-40"
          width="72"
          height="72"
          viewBox="0 0 72 72"
          style={{ left: at.x - 36, top: at.y - 36, color: ink.live }}
        >
          <circle cx="36" cy="36" r="27" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.75" />
          <circle cx="36" cy="36" r="2.4" fill="currentColor" />
          {/* Four ticks breaking the ring, so it reads as an instrument and
              not as a target. */}
          <g stroke="currentColor" strokeWidth="1.2" opacity="0.9">
            <line x1="36" y1="2" x2="36" y2="16" />
            <line x1="36" y1="56" x2="36" y2="70" />
            <line x1="2" y1="36" x2="16" y2="36" />
            <line x1="56" y1="36" x2="70" y2="36" />
          </g>
        </svg>
      )}
      <button
        type="button"
        onClick={cancelPicking}
        className={`${label} fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded border px-5 py-2.5`}
        style={{
          borderColor: ink.hair,
          color: ink.ivory,
          background: 'rgba(20, 18, 16, 0.9)',
          backdropFilter: 'blur(6px)',
        }}
      >
        Click a subject to examine · Esc cancels
      </button>
    </>
  );
}

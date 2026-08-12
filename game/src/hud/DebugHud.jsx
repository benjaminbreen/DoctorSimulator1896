import { useEffect, useState } from 'react';
import { gameDebug } from '../debug.js';

// Corner readout and travel prompt, refreshed on an interval, never per frame.
// The prompt remains game-facing; the stats block follows the tuning panel.
export default function DebugHud({ showStats = false }) {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const id = setInterval(() => {
      const { position, grounded } = gameDebug.player;
      setSnapshot({
        fps: Math.round(gameDebug.stats.fps),
        zone: gameDebug.zoneLabel ?? '',
        x: position[0].toFixed(2),
        y: position[1].toFixed(2),
        z: position[2].toFixed(2),
        grounded,
        camera: gameDebug.stats.cameraDistance.toFixed(2),
        prompt: gameDebug.prompt,
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  if (!snapshot) return null;
  return (
    <>
      {showStats && (
        /* Below the game chrome's top bar, clear of the clock overhang. */
        <div className="pointer-events-none absolute left-3 top-28 rounded bg-black/55 px-3 py-2 font-mono text-[11px] leading-relaxed text-neutral-300">
          <div className="text-amber-200">{snapshot.zone}</div>
          <div>{snapshot.fps} fps</div>
          <div>
            pos {snapshot.x}, {snapshot.y}, {snapshot.z}
          </div>
          <div>
            {snapshot.grounded ? 'grounded' : 'airborne'} · cam {snapshot.camera}m
          </div>
        </div>
      )}
      {snapshot.prompt && (
        <div className="debug-prompt pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 rounded border border-amber-300/40 bg-black/70 px-4 py-2 text-sm text-amber-100">
          <span className="debug-prompt-key mr-2 rounded border border-amber-300/60 px-1.5 font-mono text-xs">E</span>
          {snapshot.prompt}
        </div>
      )}
    </>
  );
}

// Loads a shot file from the Hopper search back into the running game, so a
// found frame can be walked into, adjusted by hand, and exported again.

import { useEffect, useRef, useState } from 'react';

const BUTTON = 'rounded border border-neutral-700 bg-neutral-900/80 px-2 py-1 hover:bg-neutral-800';

export default function ShotBar({ runtime }) {
  const fileRef = useRef(null);
  const [loaded, setLoaded] = useState(null);
  const [held, setHeld] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => () => window.__shot?.clear(), []);

  async function load(file) {
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setNote('not a shot file');
      return;
    }
    // Search output wraps the shot alongside its score; both forms load.
    const shot = payload.shot ?? payload;
    if (!shot?.camera) {
      setNote('not a shot file');
      return;
    }
    const zone = payload.zone ?? shot.zone;
    if (zone && zone !== runtime.values.zone) {
      // A zone change remounts the canvas, so the shot has to wait for it.
      runtime.set('zone', zone);
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    window.__shot.apply(shot);
    setLoaded(file.name);
    setHeld(true);
    setNote(payload.total ? `score ${payload.total.toFixed(3)}` : '');
  }

  function release() {
    window.__shot.clear();
    setHeld(false);
    setNote('camera released — walk around');
  }

  async function copy() {
    const shot = window.__shot.capture();
    await navigator.clipboard.writeText(JSON.stringify(shot, null, 2));
    setNote('shot copied to clipboard');
  }

  return (
    // Above the game chrome's observation pill, which owns the corner.
    <div className="pointer-events-auto absolute bottom-16 left-3 flex items-center gap-2 rounded bg-black/60 px-2 py-1.5 text-xs text-neutral-300">
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => load(event.target.files?.[0])}
      />
      <button type="button" className={BUTTON} onClick={() => fileRef.current?.click()}>
        Load shot
      </button>
      {held && (
        <button type="button" className={BUTTON} onClick={release}>
          Release camera
        </button>
      )}
      <button type="button" className={BUTTON} onClick={copy}>
        Copy shot
      </button>
      {loaded && <span className="text-neutral-500">{loaded}</span>}
      {note && <span className="text-neutral-400">{note}</span>}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import GameCanvas from './scene/GameCanvas.jsx';
import TuningPanel from './panel/TuningPanel.jsx';
import DebugHud from './hud/DebugHud.jsx';
import { settingsSchema } from './tuning/settingsSchema.js';
import { createTuningRuntime } from './tuning/runtime.js';
import { createKeyboard } from './input/keyboard.js';
import { createLook } from './input/pointerLook.js';
import { gameDebug, installDebugHandle } from './debug.js';
import { preservePose } from './world/travel.js';

export default function App() {
  const runtime = useMemo(() => createTuningRuntime(settingsSchema), []);
  const keyboard = useMemo(() => createKeyboard(), []);
  const look = useMemo(() => createLook(runtime), [runtime]);
  // Rebuild-mode params remount the whole canvas via this key.
  const [rebuildVersion, setRebuildVersion] = useState(0);

  useEffect(() => {
    installDebugHandle(runtime);
    gameDebug.look = look.look;
    gameDebug.setLook = look.set;
    keyboard.attach();
    let lastZone = runtime.values.zone;
    const offRebuild = runtime.onRebuild(() => {
      if (runtime.values.zone === lastZone) {
        preservePose(lastZone, gameDebug.player.position, gameDebug.player.yaw);
      }
      lastZone = runtime.values.zone;
      setRebuildVersion((version) => version + 1);
    });
    return () => {
      keyboard.detach();
      offRebuild();
    };
  }, [runtime, keyboard, look]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
      <main className="relative min-w-0 flex-1">
        <GameCanvas key={rebuildVersion} runtime={runtime} keyboard={keyboard} look={look} />
        <DebugHud />
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-xs text-neutral-300">
          Click the scene to look · WASD to walk · Shift to run · Space to jump · E at doors · M for camera
        </p>
      </main>
      <TuningPanel runtime={runtime} />
    </div>
  );
}

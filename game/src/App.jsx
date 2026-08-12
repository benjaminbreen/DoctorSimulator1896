import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import GameCanvas from './scene/GameCanvas.jsx';
import Toasts from './hud/Toasts.jsx';
import InstrumentPanel from './hud/InstrumentPanel.jsx';
import DebugHud from './hud/DebugHud.jsx';
import GameHud from './hud/GameHud.jsx';
import ParkIntro from './hud/ParkIntro.jsx';
import ControlHelper from './hud/ControlHelper.jsx';
import MobileControls from './hud/MobileControls.jsx';
import { settingsSchema } from './tuning/settingsSchema.js';
import { applyGameStart, createTuningRuntime } from './tuning/runtime.js';
import { createKeyboard } from './input/keyboard.js';
import { createLook } from './input/pointerLook.js';
import { gameDebug, installDebugHandle } from './debug.js';
import { installShotHarness } from './shots/harness.js';
import { preservePose } from './world/travel.js';
import { isFocusedInteraction, subscribe } from './world/interaction.js';
import { createActorRuntime } from './world/characters/actors.js';
import { phase1Cast } from './content/clinic1896/phase1Cast.js';
import { actorCueForConsultation, createConsultationRuntime } from './consultation/engine.js';
import { renderOfflineDialogue } from './consultation/offlineRenderer.js';
import { setConsultationMode, setGamePaused } from './input/uiMode.js';
import { seatFramingForPatient, setConsultationSeat } from './consultation/seatFraming.js';
import {
  createTechnicalPatients,
  DEFAULT_TECHNICAL_PATIENT_SEEDS,
} from './consultation/technicalPatients.js';
import { nextSeed } from '../../shared/patients/index.js';
import { createWorldClock } from './world/clock.js';
import { notice } from './world/notices.js';

const TuningPanel = lazy(() => import('./panel/TuningPanel.jsx'));
const PropsPanel = lazy(() => import('./panel/PropsPanel.jsx'));
const NpcPanel = lazy(() => import('./panel/NpcPanel.jsx'));
const ShotBar = lazy(() => import('./shots/ShotBar.jsx'));
const ConsultationDevPanel = lazy(() => import('./consultation/ConsultationDevPanel.jsx'));
const ConsultationView = lazy(() => import('./consultation/ConsultationView.jsx'));

// ?shot=1 strips the panel and HUD so the canvas fills the window: the shot
// search screenshots whatever is on screen.
const shotMode =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('shot');
// ?devconsult=1 keeps the raw engine fixture panel for testing.
const devConsult =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('devconsult');

export default function App() {
  const worldClock = useMemo(() => createWorldClock(), []);
  const runtime = useMemo(() => {
    const next = applyGameStart(createTuningRuntime(settingsSchema));
    const time = worldClock.getSnapshot();
    next.values.timeOfDay = time.hours;
    next.values.dayOfYear = time.dayOfYear;
    return next;
  }, [worldClock]);
  const keyboard = useMemo(() => createKeyboard(), []);
  const look = useMemo(() => createLook(runtime), [runtime]);
  const [patientSeeds, setPatientSeeds] = useState(() => [...DEFAULT_TECHNICAL_PATIENT_SEEDS]);
  const technicalPatients = useMemo(() => createTechnicalPatients(patientSeeds), [patientSeeds]);
  const actorRuntime = useMemo(() => createActorRuntime([technicalPatients[0].actor]), []);
  const consultationRuntime = useMemo(
    () => createConsultationRuntime(technicalPatients, renderOfflineDialogue, {
      onAdvanceMinutes: (minutes) => worldClock.advanceMinutes(minutes, {
        reason: 'consultation',
      }),
    }),
    [technicalPatients, worldClock],
  );
  const [actors, setActors] = useState(() => actorRuntime.get());
  const [zone, setZone] = useState(runtime.values.zone);
  const [parkReady, setParkReady] = useState(false);
  const [showParkIntro] = useState(() => !shotMode && runtime.values.zone === 'central-park');
  // Rebuild-mode params remount the whole canvas via this key.
  const [rebuildVersion, setRebuildVersion] = useState(0);
  // `?prop=tachistoscope` opens the workbench straight onto a piece. This is
  // the prop-polish loop: change the builder, reload the URL, look at it.
  const [propsOpen, setPropsOpen] = useState(
    () => new URLSearchParams(window.location.search).has('prop'),
  );
  const [npcOpen, setNpcOpen] = useState(false);
  // The tuning rail is a development tool, not part of the game. Keep it out
  // of the default presentation; Shift+` opens it and its performance readout.
  const [tuningOpen, setTuningOpen] = useState(false);
  // Focused interactions hide the ordinary HUD. Seats are kept separate from
  // instruments so the touch Use control remains available to stand again.
  const [usingInstrument, setUsingInstrument] = useState(false);
  // A live consultation owns the foot of the screen; the HUD verbs yield it.
  const [consultActive, setConsultActive] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => subscribe((state) => setUsingInstrument(isFocusedInteraction(state.using))), []);
  useEffect(() => actorRuntime.subscribe(setActors), [actorRuntime]);
  useEffect(() => actorRuntime.setSingle(technicalPatients[0].actor), [actorRuntime, technicalPatients]);
  useEffect(() => runtime.onChange((id, value) => {
    if (id === 'zone') setZone(value);
    if (id === 'timeOfDay') worldClock.setTimeOfDay(value);
  }), [runtime, worldClock]);

  const togglePause = useCallback(() => {
    setPaused((current) => {
      const next = !current;
      setGamePaused(next);
      worldClock.setPaused(next);
      notice(next ? 'Paused.' : 'Time resumes.', { key: 'pause' });
      return next;
    });
  }, [worldClock]);
  useEffect(() => consultationRuntime.subscribe((state) => {
    setConsultActive(Boolean(state));
    if (!state) return;
    const patient = technicalPatients.find((candidate) => candidate.id === state.patientId);
    if (!patient) return;
    if (actorRuntime.get()[0]?.id !== patient.actor.id) actorRuntime.setSingle(patient.actor);
    actorRuntime.cue(patient.actor.id, actorCueForConsultation(state));
  }), [actorRuntime, consultationRuntime, technicalPatients]);

  // Receiving a patient seats the doctor: the camera eases to the chair and
  // gameplay keys rest until the consultation lets go (or the zone changes).
  useEffect(() => {
    const seated = consultActive && zone === 'consulting-office';
    setConsultationMode(seated);
    if (!seated) {
      setConsultationSeat(null);
      return undefined;
    }
    const state = consultationRuntime.get();
    const patient = technicalPatients.find((candidate) => candidate.id === state?.patientId);
    setConsultationSeat(seatFramingForPatient(patient?.actor.recipe.placement?.position));
    return () => {
      setConsultationMode(false);
      setConsultationSeat(null);
    };
  }, [consultActive, zone, consultationRuntime, technicalPatients]);

  useEffect(() => {
    installDebugHandle(runtime);
    installShotHarness(runtime);
    gameDebug.look = look.look;
    gameDebug.setLook = look.set;
    keyboard.attach();
    gameDebug.showActor = (id) => {
      const actor = phase1Cast.find((candidate) => candidate.id === id);
      if (actor) actorRuntime.setSingle(actor);
      return Boolean(actor);
    };
    gameDebug.cueActor = (id, cue) => actorRuntime.cue(id, cue);
    // Shift+1 opens the props workbench. Matched on `code`, so it works
    // whatever the layout puts on that key.
    const onKey = (event) => {
      if (event.shiftKey && event.code === 'Digit1') {
        event.preventDefault();
        setNpcOpen(false);
        setPropsOpen((open) => !open);
      }
      if (event.shiftKey && event.code === 'Digit2') {
        event.preventDefault();
        setPropsOpen(false);
        setNpcOpen((open) => !open);
      }
      if (event.shiftKey && event.code === 'Backquote') {
        event.preventDefault();
        setTuningOpen((open) => !open);
      }
      if (
        event.code === 'KeyP'
        && !event.repeat
        && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(event.target?.tagName)
        && !event.target?.isContentEditable
      ) {
        event.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    let lastZone = runtime.values.zone;
    const offRebuild = runtime.onRebuild(() => {
      if (runtime.values.zone === lastZone) {
        preservePose(lastZone, gameDebug.player.position, gameDebug.player.yaw);
      }
      lastZone = runtime.values.zone;
      setRebuildVersion((version) => version + 1);
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      keyboard.detach();
      setGamePaused(false);
      offRebuild();
    };
  }, [runtime, keyboard, look, togglePause]);

  return (
    <>
      <Analytics />
      <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
      <main className="relative min-w-0 flex-1">
        <GameCanvas
          rebuildVersion={rebuildVersion}
          runtime={runtime}
          worldClock={worldClock}
          keyboard={keyboard}
          look={look}
          actors={actors}
          onReadyForReveal={setParkReady}
        />
        {!shotMode && (
          <>
            {!usingInstrument && (
              <GameHud
                runtime={runtime}
                worldClock={worldClock}
                quiet={!devConsult && zone === 'consulting-office' && consultActive}
              />
            )}
            {!usingInstrument && zone === 'consulting-office' && (
              <Suspense fallback={null}>
                {devConsult ? (
                  <ConsultationDevPanel
                    runtime={consultationRuntime}
                    onRegenerate={() => setPatientSeeds((current) => current.map(nextSeed))}
                  />
                ) : (
                  <ConsultationView
                    runtime={consultationRuntime}
                    onRegenerate={() => setPatientSeeds((current) => current.map(nextSeed))}
                    onDismissPatient={() => actorRuntime.setSingle(null)}
                  />
                )}
              </Suspense>
            )}
            {!usingInstrument && <DebugHud showStats={tuningOpen} />}
            <InstrumentPanel />
            {/* Above everything, instrument mode included: the thing most
                worth saying is that the machine has just hurt you. */}
            <Toasts />
            {tuningOpen && !usingInstrument && (
              <Suspense fallback={null}>
                <ShotBar runtime={runtime} />
              </Suspense>
            )}
            <ControlHelper hidden={usingInstrument || consultActive} />
            <MobileControls keyboard={keyboard} hidden={usingInstrument || consultActive} />
            {paused && (
              <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center bg-black/20">
                <div className="border border-amber-100/40 bg-neutral-950/90 px-8 py-4 font-serif text-2xl tracking-[0.22em] text-amber-50 shadow-2xl">
                  PAUSED
                </div>
              </div>
            )}
          </>
        )}
        {showParkIntro && <ParkIntro ready={parkReady} />}
      </main>
      {!shotMode && tuningOpen && !usingInstrument && (
        <Suspense fallback={null}>
          <TuningPanel runtime={runtime} />
        </Suspense>
      )}
      {propsOpen && (
        <Suspense fallback={null}>
          <PropsPanel onClose={() => setPropsOpen(false)} />
        </Suspense>
      )}
      {!shotMode && npcOpen && (
        <Suspense fallback={null}>
          <NpcPanel patients={technicalPatients} onClose={() => setNpcOpen(false)} />
        </Suspense>
      )}
      </div>
    </>
  );
}

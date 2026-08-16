import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import GameCanvas from './scene/GameCanvas.jsx';
import Toasts from './hud/Toasts.jsx';
import InstrumentPanel from './hud/InstrumentPanel.jsx';
import DebugHud from './hud/DebugHud.jsx';
import GameHud from './hud/GameHud.jsx';
import NpcDialogueRibbon from './hud/NpcDialogueRibbon.jsx';
import ParkIntro from './hud/ParkIntro.jsx';
import ControlHelper from './hud/ControlHelper.jsx';
import MobileControls from './hud/MobileControls.jsx';
import { settingsSchema } from './tuning/settingsSchema.js';
import { applyGameStart, createTuningRuntime } from './tuning/runtime.js';
import { createKeyboard } from './input/keyboard.js';
import { createLook } from './input/pointerLook.js';
import { gameDebug, installDebugHandle } from './debug.js';
import { installShotHarness } from './shots/harness.js';
import { preservePose, requestFastTravel, travelMinutesBetween } from './world/travel.js';
import { isFocusedInteraction, subscribe } from './world/interaction.js';
import { createActorRuntime } from './world/characters/actors.js';
import { phase1Cast } from './content/clinic1896/phase1Cast.js';
import { actorCueForConsultation, createConsultationRuntime } from './consultation/engine.js';
import { renderLunaDialogue } from './consultation/lunaRenderer.js';
import { setConsultationMode, setGamePaused } from './input/uiMode.js';
import { seatFramingForPatient, setConsultationSeat } from './consultation/seatFraming.js';
import {
  createConsultationPatients,
  DEFAULT_TECHNICAL_PATIENT_SEEDS,
} from './consultation/patients.js';
import { nextSeed } from '../../shared/patients/index.js';
import { createWorldClock } from './world/clock.js';
import { installCrowdDialogue } from './world/crowdDialogue.js';
import { notice } from './world/notices.js';
import { attachSoundUnlock } from './audio/sound.js';
import { syncConsultationRecord } from './hud/casebookState.js';

const TuningPanel = lazy(() => import('./panel/TuningPanel.jsx'));
const PropsPanel = lazy(() => import('./panel/PropsPanel.jsx'));
const NpcPanel = lazy(() => import('./panel/NpcPanel.jsx'));
const PatientPortraitPanel = lazy(() => import('./panel/PatientPortraitPanel.jsx'));
const ShotBar = lazy(() => import('./shots/ShotBar.jsx'));
const ConsultationDevPanel = lazy(() => import('./consultation/ConsultationDevPanel.jsx'));
const ConsultationView = lazy(() => import('./consultation/ConsultationView.jsx'));

const pageParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
// ?shot=1 strips the panel and HUD so the canvas fills the window: the shot
// search screenshots whatever is on screen.
// ?hotelReview=1 uses the same clean canvas plus a fixed full-building camera
// for the New Netherland Hotel massing loop.
const hotelReviewMode = Boolean(pageParams?.has('hotelReview'));
// ?gerryReview=1 provides the same deterministic art-review framing for the
// Elbridge T. Gerry Mansion at Fifth Avenue and East 61st Street.
const gerryReviewMode = pageParams?.get('gerryReview') ?? false;
const shotMode = Boolean(pageParams?.has('shot') || hotelReviewMode || gerryReviewMode);
// ?devconsult=1 keeps the raw engine fixture panel for testing.
const devConsult = Boolean(pageParams?.has('devconsult'));
// A test or art-review URL can boot one zone directly. Normal play still opens
// in Central Park.
const bootZone = pageParams?.get('zone');
const patientPortraitReview = Boolean(pageParams?.has('patientPortraits'));

export default function App() {
  const worldClock = useMemo(() => createWorldClock(), []);
  // Any speaking NPC (the park keeper included) resolves through this
  // provider, so it must not wait for the pedestrian models to load.
  useEffect(() => {
    installCrowdDialogue();
  }, []);
  const runtime = useMemo(() => {
    const next = applyGameStart(createTuningRuntime(settingsSchema));
    const zoneDefinition = next.definitions.find((item) => item.id === 'zone');
    if (bootZone && zoneDefinition?.options?.includes(bootZone)) next.set('zone', bootZone);
    if (hotelReviewMode || gerryReviewMode) {
      next.values.fov = gerryReviewMode === 'detail' ? 60 : (gerryReviewMode === 'close' ? 50 : (gerryReviewMode ? 42 : 40));
      next.values.showAvatarGlb = false;
      next.values.timeOfDay = 10.25;
    }
    const time = worldClock.getSnapshot();
    next.values.timeOfDay = time.hours;
    next.values.dayOfYear = time.dayOfYear;
    return next;
  }, [worldClock]);
  const keyboard = useMemo(() => createKeyboard(), []);
  const look = useMemo(() => createLook(runtime), [runtime]);
  const [patientSeeds, setPatientSeeds] = useState(() => [...DEFAULT_TECHNICAL_PATIENT_SEEDS]);
  const consultationPatients = useMemo(() => createConsultationPatients(patientSeeds), [patientSeeds]);
  const actorRuntime = useMemo(() => createActorRuntime([consultationPatients[0].actor]), []);
  const consultationRuntime = useMemo(
    () => createConsultationRuntime(consultationPatients, renderLunaDialogue, {
      onAdvanceMinutes: (minutes) => worldClock.advanceMinutes(minutes, {
        reason: 'consultation',
      }),
    }),
    [consultationPatients, worldClock],
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
  // Direct review URLs make asset QA reproducible without synthesizing the
  // Shift+2 shortcut in a screenshot runner.
  const [npcOpen, setNpcOpen] = useState(() => Boolean(pageParams?.has('npcReview')));
  // The tuning rail is a development tool, not part of the game. Keep it out
  // of the default presentation; Shift+` opens it and its performance readout.
  const [tuningOpen, setTuningOpen] = useState(false);
  // Focused interactions hide the ordinary HUD. Seats are kept separate from
  // instruments so the touch Use control remains available to stand again.
  const [focusedInteraction, setFocusedInteraction] = useState(null);
  const conversation = focusedInteraction?.kind === 'conversation' ? focusedInteraction : null;
  const usingInstrument = isFocusedInteraction(focusedInteraction) && !conversation;
  // A live consultation owns the foot of the screen; the HUD verbs yield it.
  const [consultActive, setConsultActive] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => subscribe((state) => setFocusedInteraction(state.using)), []);
  useEffect(() => actorRuntime.subscribe(setActors), [actorRuntime]);
  useEffect(() => actorRuntime.setSingle(consultationPatients[0].actor), [actorRuntime, consultationPatients]);
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
    const patient = consultationPatients.find((candidate) => candidate.id === state.patientId);
    if (!patient) return;
    const time = worldClock.getSnapshot().logical;
    syncConsultationRecord(patient, state, { date: time.date, hours: time.hours });
    if (actorRuntime.get()[0]?.id !== patient.actor.id) actorRuntime.setSingle(patient.actor);
    actorRuntime.cue(patient.actor.id, actorCueForConsultation(state));
  }), [actorRuntime, consultationRuntime, consultationPatients, worldClock]);

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
    const patient = consultationPatients.find((candidate) => candidate.id === state?.patientId);
    setConsultationSeat(seatFramingForPatient(patient?.actor.recipe.placement?.position));
    return () => {
      setConsultationMode(false);
      setConsultationSeat(null);
    };
  }, [consultActive, zone, consultationRuntime, consultationPatients]);

  useEffect(() => {
    installDebugHandle(runtime);
    installShotHarness(runtime);
    if (hotelReviewMode) {
      gameDebug.freeCamera = {
        position: [54, 6.5, 103],
        yaw: -1.135,
        pitch: 0.17,
      };
      gameDebug.player.visible = false;
    } else if (gerryReviewMode) {
      gameDebug.freeCamera = gerryReviewMode === 'detail'
        ? { position: [102, 2, 27.5], yaw: -1.49776, pitch: 0.30628 }
        : (gerryReviewMode === 'close'
          ? { position: [100, 2, -2], yaw: -2.41861, pitch: 0.23104 }
          : { position: [88, 3, -13], yaw: -2.38436, pitch: 0.13457 });
      gameDebug.player.visible = false;
    }
    gameDebug.look = look.look;
    gameDebug.setLook = look.set;
    keyboard.attach();
    const detachSound = attachSoundUnlock();
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
      detachSound();
      if (hotelReviewMode || gerryReviewMode) gameDebug.freeCamera = null;
      setGamePaused(false);
      offRebuild();
    };
  }, [runtime, keyboard, look, togglePause]);

  const clearConsultation = useCallback(() => {
    consultationRuntime.reset();
    actorRuntime.setSingle(null);
  }, [actorRuntime, consultationRuntime]);

  // Called from the casebook: walk to the consulting room and show the patient
  // in, so a waiting case can be started without hunting for the door.
  const seePatient = useCallback((patient) => {
    if (!patient) return;
    const originId = runtime.values.zone;
    if (originId !== 'consulting-office') {
      if (!requestFastTravel(runtime, 'consulting-office')) return;
      worldClock.advanceMinutes(travelMinutesBetween(originId, 'consulting-office'), {
        reason: 'travel',
      });
    }
    consultationRuntime.start(patient.id);
    const { givenName, familyName } = patient.profile.identity;
    notice(`You show ${givenName} ${familyName} into your consulting room.`, {
      key: 'consultation',
    });
  }, [consultationRuntime, runtime, worldClock]);

  const leaveConsultation = useCallback((destination) => {
    clearConsultation();
    const zoneId = destination === 'street' ? 'central-park' : 'waiting-room';
    const arrival = requestFastTravel(runtime, zoneId);
    if (!arrival) return;
    worldClock.advanceMinutes(2, { reason: 'leaving consultation' });
    notice(
      destination === 'street'
        ? 'You leave the practice and step out into the street.'
        : 'You return to the waiting room.',
      { key: 'consultation-exit' },
    );
  }, [clearConsultation, runtime, worldClock]);

  return (
    <>
      <Analytics />
      <div className="game-shell flex overflow-hidden bg-neutral-950 text-neutral-200">
      <main className="relative min-w-0 flex-1">
        <GameCanvas
          rebuildVersion={rebuildVersion}
          runtime={runtime}
          worldClock={worldClock}
          keyboard={keyboard}
          look={look}
          actors={actors}
          consultationActive={consultActive}
          shotMode={shotMode}
          onReadyForReveal={setParkReady}
        />
        {!shotMode && (
          <>
            {!usingInstrument && (
              <GameHud
                runtime={runtime}
                worldClock={worldClock}
                patients={consultationPatients}
                onSeePatient={seePatient}
                quiet={Boolean(conversation) || (!devConsult && zone === 'consulting-office' && consultActive)}
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
                    onNextPatient={clearConsultation}
                    onLeaveConsultation={leaveConsultation}
                  />
                )}
              </Suspense>
            )}
            {!usingInstrument && <DebugHud showStats={tuningOpen} />}
            <InstrumentPanel />
            <NpcDialogueRibbon conversation={conversation} worldClock={worldClock} />
            {/* Above everything, instrument mode included: the thing most
                worth saying is that the machine has just hurt you. */}
            <Toasts />
            {tuningOpen && !usingInstrument && (
              <Suspense fallback={null}>
                <ShotBar runtime={runtime} />
              </Suspense>
            )}
            <ControlHelper hidden={usingInstrument || consultActive || Boolean(conversation)} />
            <MobileControls keyboard={keyboard} hidden={usingInstrument || consultActive || Boolean(conversation)} />
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
          <NpcPanel patients={consultationPatients} onClose={() => setNpcOpen(false)} />
        </Suspense>
      )}
      {patientPortraitReview && (
        <Suspense fallback={null}>
          <PatientPortraitPanel patients={consultationPatients} />
        </Suspense>
      )}
      </div>
    </>
  );
}

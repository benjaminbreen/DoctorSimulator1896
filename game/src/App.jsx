import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import GameCanvas from './scene/GameCanvas.jsx';
import Toasts from './hud/Toasts.jsx';
import NewspaperReader from './hud/NewspaperReader.jsx';
import InstrumentPanel from './hud/InstrumentPanel.jsx';
import ExaminePanel from './hud/ExaminePanel.jsx';
import ExamineReticle from './hud/ExamineReticle.jsx';
import DebugHud from './hud/DebugHud.jsx';
import GameHud from './hud/GameHud.jsx';
import NpcDialogueRibbon from './hud/NpcDialogueRibbon.jsx';
import EventDialogue from './hud/EventDialogue.jsx';
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
import { setExaminationPresentation } from './consultation/examPresentation.js';
import { seatFramingForPatient, setConsultationSeat } from './consultation/seatFraming.js';
import { createConsultationPatients } from './consultation/patients.js';
import { createWorldClock } from './world/clock.js';
import { createDaySchedule } from './world/daySchedule.js';
import { createCallerDay } from './world/callers.js';
import { createEventDay } from './world/streetEvents.js';
import { adjustStanding } from './world/standing.js';
import { addCents } from './world/purse.js';
import { takePressItems } from './world/press.js';
import { takeReferral } from './world/referrals.js';
import { beginErrand } from './world/errand.js';
import { getRunSeed } from './world/runSeed.js';
import DayFlow from './hud/DayFlow.jsx';
import { installCrowdDialogue } from './world/crowdDialogue.js';
import { notice } from './world/notices.js';
import { clearAnnouncements } from './world/announcements.js';
import { attachSoundUnlock } from './audio/sound.js';
import { syncConsultationRecord } from './hud/casebookState.js';
import {
  applyPlayerEvent,
  consultationStrainEffect,
  getPlayer,
  isNeurastheniaCrisis,
  subscribePlayer,
} from './world/player.js';
import NeurastheniaCrisis from './hud/NeurastheniaCrisis.jsx';

const TuningPanel = lazy(() => import('./panel/TuningPanel.jsx'));
const PropsPanel = lazy(() => import('./panel/PropsPanel.jsx'));
const NpcPanel = lazy(() => import('./panel/NpcPanel.jsx'));
const PatientPortraitPanel = lazy(() => import('./panel/PatientPortraitPanel.jsx'));
const ShotBar = lazy(() => import('./shots/ShotBar.jsx'));
const ConsultationDevPanel = lazy(() => import('./consultation/ConsultationDevPanel.jsx'));
const EventDevPanel = lazy(() => import('./hud/EventDevPanel.jsx'));
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
// ?devevents=1 opens the street-event and caller test panel.
const devEvents = Boolean(pageParams?.has('devevents'));
// ?nerves=95 opens the crisis presentation for deterministic visual review.
const nervesReviewParam = pageParams?.get('nerves');
const nervesReview = nervesReviewParam == null ? null : Number(nervesReviewParam);

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
  // Day one is the authored cast; each later day rolls procedural citizens
  // from the day seed. Rerolling the morning list bumps the nonce, which
  // swaps in a fresh procedural cast even on day one.
  const [dayIndex, setDayIndex] = useState(0);
  const [morning, setMorning] = useState(null);
  const [castNonce, setCastNonce] = useState(0);
  // A street-booked referral takes tomorrow's first slot.
  const [referral, setReferral] = useState(null);
  const daySeed = (getRunSeed() ^ Math.imul(dayIndex, 0x85ebca6b) ^ Math.imul(castNonce, 0x27d4eb2f)) >>> 0;
  const consultationPatients = useMemo(
    () => createConsultationPatients(dayIndex > 0 || castNonce > 0
      ? { daySeed, dayIndex: castNonce ? `${dayIndex}r${castNonce}` : dayIndex, count: 4, referral }
      : null),
    [daySeed, dayIndex, castNonce, referral],
  );
  const regenerateCast = useCallback(() => setCastNonce((nonce) => nonce + 1), []);
  // The office opens empty: patients arrive by appointment and walk in.
  const actorRuntime = useMemo(() => createActorRuntime([]), []);
  const consultationRuntime = useMemo(
    () => createConsultationRuntime(consultationPatients, renderLunaDialogue, {
      // Consultations eat double clock time. The engine's own budget stays at
      // its authored scale (patients carry their own minutes), so only the
      // world clock sees the doubling.
      onAdvanceMinutes: (minutes) => worldClock.advanceMinutes(minutes * 2, {
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
  // A close look at an object: the notebook rail replaces the ordinary chrome.
  const objectExamination = focusedInteraction?.kind === 'examine' ? focusedInteraction : null;
  const usingInstrument = isFocusedInteraction(focusedInteraction) && !conversation;
  // A live consultation owns the foot of the screen; the HUD verbs yield it.
  const [consultActive, setConsultActive] = useState(false);
  const [practiceBlocked, setPracticeBlocked] = useState(() => isNeurastheniaCrisis(getPlayer()));
  // True while a DayFlow card (late prompt, caller, summary…) is on screen;
  // the patient queue yields to it rather than stacking beneath.
  const [dayCardOpen, setDayCardOpen] = useState(false);
  // The Examine verb dims the room and strips the chrome to a bare reading.
  const [examining, setExamining] = useState(false);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (nervesReview === null || !Number.isFinite(nervesReview)) return;
    applyPlayerEvent({
      source: 'nerves-review',
      label: 'Set nervous strain for visual review',
      changes: { neurasthenia: nervesReview - getPlayer().neurasthenia },
    });
  }, []);
  useEffect(() => subscribePlayer((player) => {
    setPracticeBlocked(isNeurastheniaCrisis(player));
  }), []);
  useEffect(() => subscribe((state) => setFocusedInteraction(state.using)), []);
  useEffect(() => actorRuntime.subscribe(setActors), [actorRuntime]);
  useEffect(() => runtime.onChange((id, value) => {
    // A cry raised in the park has nothing to do with the room you walk into.
    if (id === 'zone') {
      clearAnnouncements();
      setZone(value);
    }
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
  // The working day: seeded appointment order and walk-in callers. Both are
  // deterministic per run seed; DayFlow presents them. Sleeping advances
  // dayIndex, which reseeds all three and remounts DayFlow.
  const daySchedule = useMemo(
    () => createDaySchedule({ seed: daySeed, patientIds: consultationPatients.map((patient) => patient.id) }),
    [consultationPatients, daySeed],
  );
  const callerDay = useMemo(() => createCallerDay({ seed: (daySeed ^ 0x9e3779b9) >>> 0 }), [daySeed]);
  const eventDay = useMemo(() => createEventDay({ seed: (daySeed ^ 0x51ed2701) >>> 0 }), [daySeed]);

  // Tracks which patient's consultation is live; bumping the token remounts
  // the actor so the walk-in entrance plays when they are summoned.
  const consultEntranceRef = useRef({ patientId: null, token: 0 });
  // Standing settles once per consultation, when its result first appears.
  const settledResultsRef = useRef(new Set());
  // The errand notice waits out the result modal; it shows once the player is
  // back in the room, not on top of the outcome.
  const errandNoticeDueRef = useRef(false);
  useEffect(() => consultationRuntime.subscribe((state) => {
    setConsultActive(Boolean(state));
    setExamining(Boolean(state && state.stage === 'inquiry' && state.mode === 'examination'));
    if (errandNoticeDueRef.current && (!state || state.stage !== 'result')) {
      errandNoticeDueRef.current = false;
      notice('A boy leaves a parcel: a volume to be delivered to Professor Cattell at the laboratory.', {
        key: 'errand', seconds: 9,
      });
    }
    if (!state) {
      consultEntranceRef.current.patientId = null;
      return;
    }
    const patient = consultationPatients.find((candidate) => candidate.id === state.patientId);
    if (!patient) return;
    const time = worldClock.getSnapshot().logical;
    syncConsultationRecord(patient, state, { date: time.date, hours: time.hours });
    daySchedule.markKept(state.patientId);
    if (state.stage === 'result' && state.result && !settledResultsRef.current.has(state.patientId)) {
      settledResultsRef.current.add(state.patientId);
      addCents(Number(state.result.immediate?.paymentCents) || 0);
      const satisfaction = state.result.immediate?.satisfaction ?? 50;
      const reputation = Number(state.result.immediate?.reputation) || 0;
      const delta = reputation !== 0 ? reputation : (satisfaction >= 70 ? 4 : satisfaction >= 43 ? 1 : -3);
      adjustStanding(delta, `the consultation with ${patient.label}`);
      const strain = consultationStrainEffect(state.result, patient.label);
      if (strain) applyPlayerEvent(strain);
      // The first closed consultation brings the morning's other business.
      if (settledResultsRef.current.size === 1 && beginErrand()) {
        errandNoticeDueRef.current = true;
      }
    }
    const entrance = consultEntranceRef.current;
    if (entrance.patientId !== state.patientId) {
      entrance.patientId = state.patientId;
      entrance.token += 1;
      actorRuntime.setSingle({ ...patient.actor, entranceToken: entrance.token });
    }
    actorRuntime.cue(patient.actor.id, actorCueForConsultation(state));
  }), [actorRuntime, consultationRuntime, consultationPatients, worldClock, daySchedule]);

  // The examination reading only exists seated in the office; anywhere else
  // the flag must not dim the room.
  const examPresenting = examining && consultActive && zone === 'consulting-office';
  useEffect(() => {
    if (!examPresenting) {
      setExaminationPresentation(false);
      return undefined;
    }
    const state = consultationRuntime.get();
    const patient = consultationPatients.find((candidate) => candidate.id === state?.patientId);
    const [x, , z] = patient?.actor.recipe.placement?.position ?? [0.45, 0, -1.7];
    // Keep lights and depth of field on the same chest point as the camera.
    setExaminationPresentation(true, [x, 1.01, z]);
    return () => setExaminationPresentation(false);
  }, [examPresenting, consultationRuntime, consultationPatients]);

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

  // Called from the casebook: walk to the consulting room and summon the
  // selected patient, including a fresh return visit for a completed case.
  const seePatient = useCallback((patient) => {
    if (!patient) return;
    if (isNeurastheniaCrisis(getPlayer())) {
      notice('Your nerves will not bear another consultation. Seek relief in Central Park first.', {
        key: 'nervous-crisis', seconds: 8,
      });
      return false;
    }
    const originId = runtime.values.zone;
    if (originId !== 'consulting-office') {
      if (!requestFastTravel(runtime, 'consulting-office')) return;
      worldClock.advanceMinutes(travelMinutesBetween(originId, 'consulting-office'), {
        reason: 'travel',
      });
    }
    // A casebook recall is a fresh visit even when this patient was already
    // seen today, so its result must settle independently.
    settledResultsRef.current.delete(patient.id);
    consultationRuntime.start(patient.id);
    const { givenName, familyName } = patient.profile.identity;
    notice(`You show ${givenName} ${familyName} into your consulting room.`, {
      key: 'consultation',
    });
    return true;
  }, [consultationRuntime, runtime, worldClock]);

  // Sleeping ends the day: the clock jumps to eight the next morning, the
  // day modules reseed, and the morning card carries what the papers took.
  const startNextDay = useCallback(() => {
    clearConsultation();
    settledResultsRef.current.clear();
    worldClock.advanceToHour(8, { animate: false });
    const promised = takeReferral();
    setReferral(promised);
    setDayIndex((day) => day + 1);
    setCastNonce(0);
    setMorning({
      press: takePressItems(),
      referralName: promised ? `Miss ${promised.familyName}` : null,
    });
  }, [clearConsultation, worldClock]);

  // The messenger flow: back to the practice without starting a consultation.
  // Returns false only when travel could not happen at all.
  const goToOffice = useCallback(() => {
    const originId = runtime.values.zone;
    if (originId === 'consulting-office') return true;
    if (!requestFastTravel(runtime, 'consulting-office')) return false;
    worldClock.advanceMinutes(travelMinutesBetween(originId, 'consulting-office'), {
      reason: 'travel',
    });
    return true;
  }, [runtime, worldClock]);

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
          <NeurastheniaCrisis
            runtime={runtime}
            worldClock={worldClock}
            consultationActive={consultActive}
          />
        )}
        {!shotMode && (
          <>
            {!usingInstrument && !examPresenting && (
              <GameHud
                runtime={runtime}
                worldClock={worldClock}
                patients={consultationPatients}
                schedule={daySchedule}
                onSeePatient={seePatient}
                quiet={Boolean(conversation) || (!devConsult && zone === 'consulting-office' && consultActive)}
                hintsReady={zone !== 'central-park' || parkReady}
              />
            )}
            {!usingInstrument && zone === 'consulting-office' && (
              <Suspense fallback={null}>
                {devConsult ? (
                  <ConsultationDevPanel
                    runtime={consultationRuntime}
                    onRegenerate={regenerateCast}
                  />
                ) : (
                  <ConsultationView
                    runtime={consultationRuntime}
                    onDismissPatient={() => actorRuntime.setSingle(null)}
                    onNextPatient={clearConsultation}
                    onLeaveConsultation={leaveConsultation}
                    hidden={dayCardOpen}
                  />
                )}
              </Suspense>
            )}
            <DayFlow
              key={dayIndex}
              worldClock={worldClock}
              schedule={daySchedule}
              callerDay={callerDay}
              eventDay={eventDay}
              runtime={runtime}
              patients={consultationPatients}
              zone={zone}
              consultActive={consultActive}
              suspended={usingInstrument || examPresenting || paused}
              practiceBlocked={practiceBlocked}
              onSeePatient={seePatient}
              onGoToOffice={goToOffice}
              onNextDay={startNextDay}
              morning={morning}
              onMorningDone={() => setMorning(null)}
              onCardOpen={setDayCardOpen}
            />
            {devEvents && (
              <Suspense fallback={null}>
                <EventDevPanel callerDay={callerDay} eventDay={eventDay} worldClock={worldClock} />
              </Suspense>
            )}
            {!usingInstrument && <DebugHud showStats={tuningOpen} />}
            <InstrumentPanel />
            <ExaminePanel examining={objectExamination} worldClock={worldClock} />
            <ExamineReticle />
            <NpcDialogueRibbon conversation={conversation} worldClock={worldClock} zone={zone} />
            {!usingInstrument && !consultActive && (
              <EventDialogue raised={Boolean(conversation)} />
            )}
            {/* Above everything, instrument mode included: the thing most
                worth saying is that the machine has just hurt you. */}
            <Toasts />
            {/* Held up in front of the face: above the toasts, and outside
                the HUD layer, which does not take clicks. */}
            <NewspaperReader />
            {tuningOpen && !usingInstrument && (
              <Suspense fallback={null}>
                <ShotBar runtime={runtime} />
              </Suspense>
            )}
            <ControlHelper
              hidden={usingInstrument || consultActive || Boolean(conversation)}
              zone={zone}
            />
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

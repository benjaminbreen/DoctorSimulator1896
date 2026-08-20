// Nameplate bar across the top, verb plinth at the foot. DOM over the canvas,
// not painted assets. Every value shown comes from the civil clock, the zone
// and landmark tables, or hudState; this component invents nothing.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { gameDebug } from '../debug.js';
import { parkLandmark } from './landmarks.js';
import WalletDrawer from './WalletDrawer.jsx';
import {
  weekdayName, monthName, patientQueue, letters,
} from './hudState.js';
import {
  getPlayer,
  subscribePlayer,
  recentMeterEvents,
  healthCondition,
  neurastheniaCondition,
} from '../world/player.js';
import { mergeMeterFeedback, meterFeedbackStyle } from '../world/meterFeedback.js';
import { subscribeStanding, getStanding, getStandingLog } from '../world/standing.js';
import {
  Cameo, PortraitCameo, PinIcon, HeartIcon, BrainIcon, LaurelIcon, EyeIcon, GearIcon,
} from './chrome.jsx';
import { isGameplayInputBlocked } from '../input/uiMode.js';
import { isCarrying, subscribeCarrying } from '../world/pocket.js';
import PocketClock from './PocketClock.jsx';
import LettersModal from './LettersModal.jsx';
import CasebookModal from './CasebookModal.jsx';
import {
  getCasebookRecords,
  getCasebookRevision,
  subscribeCasebook,
} from './casebookState.js';
import DayPanel from './DayPanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import FastTravelMenu from './FastTravelMenu.jsx';
import { subscribeHudOverlayRequests } from './overlayRequests.js';
import HeldItemHud from './HeldItemHud.jsx';
import ItemsDrawer from './ItemsDrawer.jsx';
import './hud.css';

function formatClock(hours) {
  const h24 = Math.floor(hours);
  const minutes = Math.floor((hours - h24) * 60);
  const h12 = ((h24 + 11) % 12) + 1;
  const period = h24 < 12 ? 'In the Morning' : h24 < 17 ? 'In the Afternoon' : 'In the Evening';
  return { text: `${h12}:${String(minutes).padStart(2, '0')}`, period };
}

// Zone label, with the landmark substituted while the player stands near one:
// "Central Park — Southeast Corner" becomes "Central Park — Carousel".
function placeLine(zoneId, zoneLabel, position) {
  if (zoneId === 'central-park' && position) {
    const landmark = parkLandmark(position[0], position[2]);
    if (landmark) return `${zoneLabel.split(' — ')[0]} — ${landmark}`;
  }
  return zoneLabel;
}

function compactPlaceLine(place) {
  const [zone, detail] = place.split(' — ');
  if (detail && detail.length <= 12) return detail;
  return {
    'Central Park': 'Central Pk.',
    'Cattell’s Psychology Lab': 'Cattell Lab',
    'Your Waiting Room': 'Waiting Room',
    'Consulting Office': 'Consulting Rm.',
    'Your Consulting Room': 'Consulting Rm.',
  }[zone] ?? zone.replace(/^Your /, '');
}

const METERS = {
  health: {
    label: 'Health',
    shortLabel: 'Health',
    explanation: () => 'Your physical condition. Injury lowers health; food, rest, and treatment can restore it.',
    condition: healthCondition,
  },
  neurasthenia: {
    label: 'Neurasthenia level',
    shortLabel: 'Nerves',
    explanation: (value) => {
      if (value >= 80) return 'Your nerves are close to exhaustion. Another fright or hard demand may be too much.';
      if (value >= 60) return 'Your nerves are frazzled. It is too hot, and you could use a smoke.';
      if (value >= 35) return 'Your nerves are strained. Frights and taxing experiences will make them worse.';
      if (value > 0) return 'Your nerves are unsettled, but restorative activities are helping.';
      return 'Your nerves are settled. Frights and taxing experiences can raise this level again.';
    },
    condition: neurastheniaCondition,
  },
};

function helpfulChange(metric, delta) {
  return metric === 'health' ? delta > 0 : delta < 0;
}

function standingTier(value) {
  if (value >= 75) return { label: 'Eminent', id: 'eminent' };
  if (value >= 60) return { label: 'Well regarded', id: 'well-regarded' };
  if (value >= 45) return { label: 'Respectable', id: 'respectable' };
  if (value >= 30) return { label: 'Talked about', id: 'talked-about' };
  return { label: 'Discredited', id: 'discredited' };
}

function standingCondition(value) {
  return standingTier(value).label;
}

// Professional standing sits beside the bodily meters but is its own ledger:
// appointments kept or broken, callers served, errands done.
function StandingSeal() {
  const initialStanding = useRef(getStanding());
  const previousStanding = useRef(initialStanding.current);
  const changeSequence = useRef(0);
  const [standing, setStanding] = useState(initialStanding.current);
  const [change, setChange] = useState(null);

  useEffect(() => {
    let clearChange = null;
    const unsubscribe = subscribeStanding((next) => {
      const previous = previousStanding.current;
      previousStanding.current = next;
      setStanding(next);
      if (next === previous) return;
      changeSequence.current += 1;
      setChange({
        id: changeSequence.current,
        delta: next - previous,
        tierChanged: standingTier(next).id !== standingTier(previous).id,
      });
      if (clearChange) window.clearTimeout(clearChange);
      clearChange = window.setTimeout(() => setChange(null), 3600);
    });
    return () => {
      unsubscribe();
      if (clearChange) window.clearTimeout(clearChange);
    };
  }, []);

  const value = Math.round(standing);
  const tier = standingTier(value);
  const recent = getStandingLog().slice(-3).reverse();
  return (
    <div
      className={`ghud-standing ghud-standing--${tier.id}`}
      role="meter"
      tabIndex={0}
      aria-label="Professional standing"
      aria-describedby="ghud-standing-tooltip"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={value}
      aria-valuetext={`${value} out of 100, ${standingCondition(value)}`}
    >
      <span
        key={`standing-seal-${change?.id ?? 'still'}`}
        className={`ghud-standing-seal${change ? ' ghud-standing-seal--changed' : ''}${change?.tierChanged ? ' ghud-standing-seal--tier' : ''}`}
        aria-hidden="true"
      >
        <span className="ghud-standing-shine" />
        <LaurelIcon size={20} />
      </span>
      <span className="ghud-standing-copy">
        <small>Standing</small>
        <strong>{tier.label}</strong>
      </span>
      <span className="ghud-meter-announcer" aria-live="polite" aria-atomic="true">
        {change ? `Professional standing ${change.delta > 0 ? 'rose' : 'fell'} by ${Math.abs(Math.round(change.delta))}. ${tier.label}.` : ''}
      </span>
      <div id="ghud-standing-tooltip" className="ghud-meter-tooltip ghud-standing-tooltip" role="tooltip">
        <div className="ghud-meter-tooltip-head">
          <span>Professional standing</span>
          <strong>{value}<small> / 100</small></strong>
        </div>
        <p className="ghud-meter-condition">Current state: <strong>{standingCondition(value)}</strong></p>
        <p className="ghud-meter-explanation">
          The neighbourhood’s opinion of your practice. Kept appointments, sound
          advice, and work for colleagues raise it; patients turned away lower it.
        </p>
        <div className="ghud-meter-history">
          <span className="ghud-meter-history-title">Last changes</span>
          {recent.length > 0 ? (
            <ol>
              {recent.map((event, index) => (
                <li key={`${event.reason}-${index}`}>
                  <span>{event.reason}</span>
                  <strong className={event.delta > 0 ? 'is-helpful' : 'is-harmful'}>
                    {event.delta > 0 ? '+' : ''}{Math.round(event.delta)}
                  </strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ghud-meter-empty">No tracked changes yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function signedChange(delta) {
  return `${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta))}`;
}

function MeterBurst({ feedback, entries }) {
  const burstRef = useRef(null);
  const point = useRef(new THREE.Vector3());
  const cameraRight = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!feedback) return undefined;
    let frame = 0;
    const started = globalThis.performance?.now?.() ?? Date.now();
    const update = () => {
      const node = burstRef.current;
      const camera = gameDebug.camera;
      if (!node || !camera || gameDebug.player.visible === false) {
        if (node) node.style.visibility = 'hidden';
      } else {
        camera.updateMatrixWorld();
        cameraRight.current.setFromMatrixColumn(camera.matrixWorld, 0);
        point.current
          .set(...gameDebug.player.position)
          .addScaledVector(cameraRight.current, 0.72);
        point.current.y += 1.38;
        point.current.project(camera);
        const onScreen = point.current.z >= -1 && point.current.z <= 1
          && Math.abs(point.current.x) < 1.18 && Math.abs(point.current.y) < 1.18;
        node.style.visibility = 'visible';
        node.style.left = `${onScreen ? (point.current.x * 0.5 + 0.5) * 100 : 57}%`;
        node.style.top = `${onScreen ? (-point.current.y * 0.5 + 0.5) * 100 : 48}%`;
      }
      const now = globalThis.performance?.now?.() ?? Date.now();
      if (now - started < 3600) frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [feedback]);

  if (!feedback || entries.length === 0) return null;
  return (
    <div ref={burstRef} className="ghud-meter-burst" aria-hidden="true">
      {entries.map(({ metric, delta }) => {
        const visual = meterFeedbackStyle(metric, delta);
        if (!visual) return null;
        return (
          <span key={metric} className={`ghud-meter-burst-value ghud-meter-burst-value--${visual.kind}`}>
            <strong>{signedChange(delta)}</strong>
            <small>{visual.label}</small>
          </span>
        );
      })}
    </div>
  );
}

function MeterTooltip({ metric, player }) {
  const definition = METERS[metric];
  const value = Math.round(player[metric]);
  const events = recentMeterEvents(metric, 3, player);
  const tooltipId = `ghud-${metric}-tooltip`;

  return (
    <div id={tooltipId} className="ghud-meter-tooltip" role="tooltip">
      <div className="ghud-meter-tooltip-head">
        <span>{definition.label}</span>
        <strong>{value}<small> / 100</small></strong>
      </div>
      <p className="ghud-meter-condition">Current state: <strong>{definition.condition(value)}</strong></p>
      <p className="ghud-meter-explanation">{definition.explanation(value)}</p>
      <div className="ghud-meter-history">
        <span className="ghud-meter-history-title">Last changes</span>
        {events.length > 0 ? (
          <ol>
            {events.map((event, index) => {
              const delta = event.changes[metric];
              const helpful = helpfulChange(metric, delta);
              return (
                <li key={`${event.at}-${event.source}-${index}`}>
                  <span>{event.label}</span>
                  <strong className={helpful ? 'is-helpful' : 'is-harmful'}>
                    {delta > 0 ? '+' : ''}{Math.round(delta)}
                  </strong>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="ghud-meter-empty">No tracked changes yet.</p>
        )}
      </div>
    </div>
  );
}

// `quiet` clears the foot of the screen while a consultation panel holds it.
// The band itself needs no variant: on a phone it is already one compact row.
export default function GameHud({
  runtime,
  worldClock,
  patients = [],
  schedule = null,
  onSeePatient,
  quiet = false,
  hintsReady = true,
}) {
  const [time, setTime] = useState(() => worldClock.getSnapshot());
  const [place, setPlace] = useState('');
  // One overlay at a time; this state is the whole registry. Escape and
  // focus restore live in useDismissableOverlay inside each modal.
  const [overlay, setOverlay] = useState(null); // null | 'letters' | 'casebook' | 'day' | 'travel' | 'wallet' | 'items' | 'settings'
  const carrying = useSyncExternalStore(subscribeCarrying, isCarrying, isCarrying);
  // Letters UI state only: which are read/archived. The letter system that
  // delivers them replaces this, not the modal.
  const [readIds, setReadIds] = useState(() => new Set());
  const [archivedIds, setArchivedIds] = useState(() => new Set());
  const [player, setPlayer] = useState(() => getPlayer());
  const [meterFeedback, setMeterFeedback] = useState(null);
  const [showNoteHint, setShowNoteHint] = useState(() => !quiet);
  // Which record the casebook opens on when it is opened from the queue.
  const [casebookPatientId, setCasebookPatientId] = useState(null);
  const [, setScheduleRevision] = useState(0);
  useSyncExternalStore(subscribeCasebook, getCasebookRevision, getCasebookRevision);
  const records = getCasebookRecords();
  const lastPlayerEvent = useRef(getPlayer().log.at(-1) ?? null);
  const feedbackSequence = useRef(0);

  useEffect(() => subscribePlayer((next) => {
    setPlayer(next);
    const event = next.log.at(-1) ?? null;
    if (event === lastPlayerEvent.current) return;
    lastPlayerEvent.current = event;
    if (event) {
      feedbackSequence.current += 1;
      const receivedAt = globalThis.performance?.now?.() ?? Date.now();
      setMeterFeedback((previous) => mergeMeterFeedback(
        previous,
        event,
        receivedAt,
        feedbackSequence.current,
      ));
    }
  }), []);
  useEffect(() => subscribeHudOverlayRequests(setOverlay), []);

  // Escape in the plain world view opens settings. Any open overlay's own
  // capture-phase handler consumes Escape first, so this only fires when
  // nothing else claimed the key.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.repeat) return;
      if (quiet || isGameplayInputBlocked()) return;
      setOverlay((current) => (current === null ? 'settings' : current));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quiet]);

  useEffect(() => worldClock.subscribe(setTime), [worldClock]);
  useEffect(() => schedule?.subscribe?.(() => setScheduleRevision((revision) => revision + 1)), [schedule]);

  // This is an introduction, not permanent chrome. It points to the action
  // that fulfils it, then leaves the world clear once the player has read it.
  useEffect(() => {
    if (quiet || !hintsReady || !showNoteHint) return undefined;
    const id = window.setTimeout(() => setShowNoteHint(false), 24000);
    return () => window.clearTimeout(id);
  }, [hintsReady, quiet, showNoteHint]);

  // Place changes on foot speed, not frame rate: a slow poll is enough.
  useEffect(() => {
    const poll = () => setPlace(
      placeLine(runtime.values.zone, gameDebug.zoneLabel ?? '', gameDebug.player?.position),
    );
    poll();
    const id = setInterval(poll, 400);
    return () => clearInterval(id);
  }, [runtime]);

  const markRead = useCallback((id) => {
    setReadIds((previous) => {
      if (previous.has(id)) return previous;
      const next = new Set(previous);
      next.add(id);
      return next;
    });
  }, []);

  const markArchived = useCallback((id) => {
    setArchivedIds((previous) => {
      const next = new Set(previous);
      next.add(id);
      return next;
    });
  }, []);

  const closeOverlay = useCallback(() => setOverlay(null), []);

  // Eating the last thing you own takes the button away, so the drawer it
  // opened has to go with it.
  useEffect(() => {
    if (!carrying) setOverlay((current) => (current === 'items' ? null : current));
  }, [carrying]);

  const hours = time.hours;
  const day = time.date;
  const clock = formatClock(hours);
  // The schedule supplies both the order and status. The static cameo list is
  // only a fallback for preview states without real patient records.
  const appointments = schedule?.list?.() ?? [];
  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const scheduledPatients = appointments
    .map((appointment) => ({ patient: patientById.get(appointment.patientId), appointment }))
    .filter((entry) => entry.patient);
  const scheduledIds = new Set(scheduledPatients.map((entry) => entry.patient.id));
  const orderedPatients = [
    ...scheduledPatients,
    ...patients.filter((patient) => !scheduledIds.has(patient.id)).map((patient) => ({ patient, appointment: null })),
  ];
  const queue = orderedPatients.length
    ? orderedPatients.map(({ patient, appointment }, index) => ({
      patient,
      appointment,
      seen: appointment?.status === 'kept' || appointment?.status === 'forfeited'
        || records[patient.id]?.status === 'complete' || records[patient.id]?.status === 'closed',
      silhouette: patientQueue[index % patientQueue.length].silhouette,
    }))
    : patientQueue.map((entry) => ({ patient: null, seen: entry.seen, silhouette: entry.silhouette }));
  const nextAppointment = appointments.find((appointment) => (
    appointment.status === 'pending' || appointment.status === 'held'
  )) ?? null;
  const unreadLetters = letters.filter((entry) => !readIds.has(entry.id)).length;
  const feedbackEvent = meterFeedback?.event ?? null;
  const eventDeltas = feedbackEvent
    ? Object.entries(METERS)
      .map(([metric, definition]) => ({
        metric,
        label: definition.shortLabel,
        delta: feedbackEvent.changes?.[metric] ?? 0,
      }))
      .filter((entry) => entry.delta !== 0)
    : [];
  const meterAnnouncement = feedbackEvent
    ? `${feedbackEvent.label}. ${eventDeltas.map(({ label, delta }) => (
      `${label} ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(Math.round(delta))}`
    )).join('. ')}.`
    : '';

  return (
    <div
      className={`ghud${overlay ? ' ghud--overlay-open' : ''}`}
      aria-label="Practice chrome"
    >
      <header className="ghud-bar">
        <div className="ghud-mono-wrap">
          {/* Keep the painted cartouche, then cover its old letter with the DS seal. */}
          <img className="ghud-monogram-img" src="/ui/monogram.png" alt="" draggable={false} />
          <img className="ghud-monogram-mark" src="/icon-512.png" alt="" draggable={false} />
        </div>

        <div className="ghud-plate ghud-plate--name">
          <div className="ghud-name">Doctor Simulator: 1896</div>
        </div>

        <i className="ghud-rule" aria-hidden="true" />

        <div className="ghud-plate ghud-plate--loc">
          <div className="ghud-loc-line" aria-label={place || undefined}>
            <PinIcon />
            <span className="ghud-loc-text ghud-loc-text--full">{place || '—'}</span>
            <span className="ghud-loc-text ghud-loc-text--short" aria-hidden="true">
              {place ? compactPlaceLine(place) : '—'}
            </span>
          </div>
        </div>

        <i className="ghud-rule" aria-hidden="true" />

        <div className="ghud-plate ghud-plate--date">
          <div className="ghud-date-weekday">{weekdayName(day)}</div>
          <div className="ghud-date-full">{`${monthName(day)} ${day.date}, ${day.year}`}</div>
        </div>

        <div className="ghud-clock-wrap">
          <PocketClock hours={hours} label={`${clock.text} ${clock.period.toLowerCase()}`} />
          {/* hit area over the dial: the clock opens the day panel */}
          <button
            type="button"
            className="ghud-clock-hit"
            onClick={() => setOverlay(overlay === 'day' ? null : 'day')}
            aria-haspopup="dialog"
            aria-expanded={overlay === 'day'}
            aria-label="The day: news, travel, and rest"
          />
        </div>

        {/* Also opens the day panel: phones hide the dial, so the numerals
            have to carry the tap target. */}
        <button
          type="button"
          className="ghud-plate ghud-plate--time"
          onClick={() => setOverlay(overlay === 'day' ? null : 'day')}
          aria-haspopup="dialog"
          aria-expanded={overlay === 'day'}
          aria-label="The day: news, travel, and rest"
        >
          <span className="ghud-time-big">{clock.text}</span>
          <span className="ghud-time-period">{clock.period}</span>
          <span className="ghud-time-date">{`${monthName(day)} ${day.date}, ${day.year}`}</span>
        </button>

        <i className="ghud-rule" aria-hidden="true" />

        <div className="ghud-plate ghud-plate--queue">
          <div className="ghud-label">
            Appointments
            {nextAppointment && <span className="ghud-appointment-time">Next {formatClock(nextAppointment.hours).text}</span>}
          </div>
          <div
            className={`ghud-queue-row${queue.length > 3 ? ' ghud-queue-row--stacked' : ''}`}
            style={queue.length > 3
              ? { '--ghud-cameo-overlap': `${Math.min((queue.length - 3) * 6, 16)}px` }
              : undefined}
          >
            {queue.slice(0, 5).map((entry, index) => (entry.patient ? (
              <PortraitCameo
                key={entry.patient.id}
                src={`/ui/patients/${entry.patient.id}.webp`}
                name={`${entry.patient.profile.identity.givenName} ${entry.patient.profile.identity.familyName}`}
                age={entry.patient.profile.identity.age}
                occupation={entry.patient.profile.social.occupation}
                label={`${entry.appointment ? `${formatClock(entry.appointment.hours).text} appointment. ` : ''}Open the casebook for ${entry.patient.profile.identity.givenName} ${entry.patient.profile.identity.familyName}`}
                variant={entry.silhouette}
                seen={entry.seen}
                onClick={() => {
                  setCasebookPatientId(entry.patient.id);
                  setOverlay('casebook');
                }}
              />
            ) : (
              <Cameo key={`slot-${index}`} variant={entry.silhouette} seen={entry.seen} />
            )))}
            {queue.length > 5 && (
              <span className="ghud-queue-more" aria-label={`${queue.length - 5} more waiting`}>
                +{queue.length - 5}
              </span>
            )}
          </div>
        </div>

        <i className="ghud-rule" aria-hidden="true" />

        <button
          type="button"
          className="ghud-plate ghud-plate--letters"
          onClick={() => setOverlay('letters')}
          aria-haspopup="dialog"
          aria-expanded={overlay === 'letters'}
        >
          <span className="ghud-label">Incoming Letters</span>
          <span className="ghud-letters-row">
            <img className="ghud-envelope-img" src="/ui/envelope.png" alt="" draggable={false} />
            <span className="ghud-letters-count">{unreadLetters}</span>
          </span>
        </button>

        <i className="ghud-rule" aria-hidden="true" />

        <div className="ghud-gauges">
          <StandingSeal />
          <div className="ghud-vitals">
            <div
              className={`ghud-gauge${player.health < 20 ? ' ghud-gauge--critical ghud-gauge--critical-health' : ''}`}
              role="meter"
              tabIndex={0}
              aria-label="Health"
              aria-describedby="ghud-health-tooltip"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(player.health)}
              aria-valuetext={`${Math.round(player.health)} out of 100, ${healthCondition(player.health)}`}
            >
              <span className="ghud-gauge-icon ghud-gauge-icon--body"><HeartIcon /></span>
              <span className="ghud-track ghud-track--body">
                <span className="ghud-marker" style={{ left: `${player.health}%` }} />
                {feedbackEvent?.changes?.health ? (
                  <span
                    key={`health-${meterFeedback.id}`}
                    className={`ghud-meter-flash ghud-meter-flash--${meterFeedbackStyle('health', feedbackEvent.changes.health).kind}`}
                    style={{ '--ghud-meter-position': `${player.health}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <MeterTooltip metric="health" player={player} />
            </div>
            <div
              className={`ghud-gauge${player.neurasthenia > 85 ? ' ghud-gauge--critical ghud-gauge--critical-neurasthenia' : ''}`}
              role="meter"
              tabIndex={0}
              aria-label="Neurasthenia level"
              aria-describedby="ghud-neurasthenia-tooltip"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={Math.round(player.neurasthenia)}
              aria-valuetext={`${Math.round(player.neurasthenia)} out of 100, ${neurastheniaCondition(player.neurasthenia)}`}
            >
              <span className="ghud-gauge-icon ghud-gauge-icon--mind"><BrainIcon /></span>
              <span className="ghud-track ghud-track--mind">
                <span className="ghud-marker" style={{ left: `${player.neurasthenia}%` }} />
                {feedbackEvent?.changes?.neurasthenia ? (
                  <span
                    key={`neurasthenia-${meterFeedback.id}`}
                    className={`ghud-meter-flash ghud-meter-flash--${meterFeedbackStyle('neurasthenia', feedbackEvent.changes.neurasthenia).kind}`}
                    style={{ '--ghud-meter-position': `${player.neurasthenia}%` }}
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <MeterTooltip metric="neurasthenia" player={player} />
            </div>
            <span className="ghud-meter-announcer" aria-live="polite" aria-atomic="true">
              {meterAnnouncement}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="ghud-settings-btn"
          title="Settings (Esc)"
          aria-label="Settings"
          aria-haspopup="dialog"
          aria-expanded={overlay === 'settings'}
          onClick={() => setOverlay(overlay === 'settings' ? null : 'settings')}
        >
          <GearIcon />
        </button>
      </header>

      <MeterBurst key={meterFeedback?.id ?? 0} feedback={meterFeedback} entries={eventDeltas} />

      <HeldItemHud />

      <LettersModal
        open={overlay === 'letters'}
        onClose={closeOverlay}
        readIds={readIds}
        onRead={markRead}
        archivedIds={archivedIds}
        onArchive={markArchived}
      />
      <CasebookModal
        open={overlay === 'casebook'}
        onClose={() => {
          setCasebookPatientId(null);
          closeOverlay();
        }}
        patients={patients}
        day={day}
        initialPatientId={casebookPatientId}
        onSeePatient={onSeePatient && ((patient) => {
          closeOverlay();
          onSeePatient(patient);
        })}
      />
      <DayPanel
        open={overlay === 'day'}
        onClose={closeOverlay}
        runtime={runtime}
        worldClock={worldClock}
        day={day}
      />
      <FastTravelMenu
        open={overlay === 'travel'}
        onClose={closeOverlay}
        runtime={runtime}
        worldClock={worldClock}
      />
      <WalletDrawer open={overlay === 'wallet'} onClose={closeOverlay} />
      <ItemsDrawer open={overlay === 'items'} onClose={closeOverlay} />
      <SettingsPanel
        open={overlay === 'settings'}
        onClose={closeOverlay}
        runtime={runtime}
        worldClock={worldClock}
      />

      {!quiet && (
        <nav className="ghud-actions" aria-label="Pocket actions">
          <button
            type="button"
            className="ghud-action ghud-action--travel"
            aria-label="Fast Travel"
            onClick={() => setOverlay(overlay === 'travel' ? null : 'travel')}
            aria-haspopup="dialog"
            aria-expanded={overlay === 'travel'}
          >
            <img className="ghud-action-img" src="/ui/verb-travel.png" alt="" draggable={false} />
            <span className="ghud-action-caption">Travel</span>
          </button>
          <i className="ghud-action-rule" aria-hidden="true" />
          <button
            type="button"
            className="ghud-action"
            aria-label="Check Wallet"
            aria-expanded={overlay === 'wallet'}
            onClick={() => setOverlay(overlay === 'wallet' ? null : 'wallet')}
          >
            <img className="ghud-action-img" src="/ui/verb-wallet.png" alt="" draggable={false} />
            <span className="ghud-action-caption">Wallet</span>
          </button>
          {carrying && (
            <>
              <i className="ghud-action-rule" aria-hidden="true" />
              <button
                type="button"
                className="ghud-action"
                aria-label="Check Items"
                aria-expanded={overlay === 'items'}
                onClick={() => setOverlay(overlay === 'items' ? null : 'items')}
              >
                <img className="ghud-action-img" src="/ui/verb-items.png" alt="" draggable={false} />
                <span className="ghud-action-caption">Items</span>
              </button>
            </>
          )}
          <i className="ghud-action-rule" aria-hidden="true" />
          <span className="ghud-action-wrap">
            {showNoteHint && hintsReady ? (
              <span className="ghud-note" role="status">
                <EyeIcon />
                <span>Record observations as you wander.</span>
              </span>
            ) : null}
            <button
              type="button"
              className="ghud-action ghud-action--notes"
              aria-label="Take Notes"
              onClick={() => {
                setShowNoteHint(false);
                setOverlay('casebook');
              }}
            >
              <img className="ghud-action-img" src="/ui/verb-notebook.png" alt="" draggable={false} />
              <span className="ghud-action-caption">Notes</span>
            </button>
          </span>
        </nav>
      )}
    </div>
  );
}

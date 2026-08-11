// The working chrome: nameplate bar across the top, verb plinth at the foot.
// Pure DOM over the canvas, so it stays crisp at any resolution and swaps to
// painted assets piecemeal if we ever want them.
//
// Everything shown is read from somewhere real: time from the tuning runtime,
// place from the zone label and landmark table, the rest from hudState's
// placeholder ground truth. This component invents nothing.

import { useCallback, useEffect, useState } from 'react';
import { gameDebug } from '../debug.js';
import { parkLandmark } from './landmarks.js';
import {
  day, weekdayName, monthName, patientQueue, demoLetters,
  checkWallet,
} from './hudState.js';
import {
  getPlayer,
  subscribePlayer,
  recentMeterEvents,
  healthCondition,
  neurastheniaCondition,
} from '../world/player.js';
import {
  Cameo, PinIcon, HeartIcon, BrainIcon, EyeIcon,
} from './chrome.jsx';
import PocketClock from './PocketClock.jsx';
import LettersModal from './LettersModal.jsx';
import CasebookModal from './CasebookModal.jsx';
import DayPanel from './DayPanel.jsx';
import FastTravelMenu from './FastTravelMenu.jsx';
import { subscribeHudOverlayRequests } from './overlayRequests.js';
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

const METERS = {
  health: {
    label: 'Health',
    explanation: 'Your physical condition. Injury lowers health; food, rest, and treatment can restore it.',
    condition: healthCondition,
  },
  neurasthenia: {
    label: 'Neurasthenia level',
    explanation: 'Your present nervous strain. Frights and taxing experiences raise it; restorative activities lower it.',
    condition: neurastheniaCondition,
  },
};

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
      <p className="ghud-meter-explanation">{definition.explanation}</p>
      <div className="ghud-meter-history">
        <span className="ghud-meter-history-title">Last changes</span>
        {events.length > 0 ? (
          <ol>
            {events.map((event, index) => {
              const delta = event.changes[metric];
              const helpful = metric === 'health' ? delta > 0 : delta < 0;
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
export default function GameHud({ runtime, quiet = false }) {
  const [hours, setHours] = useState(runtime.values.timeOfDay);
  const [place, setPlace] = useState('');
  // One overlay at a time; this state is the whole registry. Escape and
  // focus restore live in useDismissableOverlay inside each modal.
  const [overlay, setOverlay] = useState(null); // null | 'letters' | 'casebook' | 'day' | 'travel'
  // Letters UI state only: which are read/archived. The letter system that
  // delivers them replaces this, not the modal.
  const [readIds, setReadIds] = useState(() => new Set());
  const [archivedIds, setArchivedIds] = useState(() => new Set());
  const [player, setPlayer] = useState(() => getPlayer());

  useEffect(() => subscribePlayer(setPlayer), []);
  useEffect(() => subscribeHudOverlayRequests(setOverlay), []);

  useEffect(() => runtime.onChange((id, value) => {
    if (id === 'timeOfDay') setHours(value);
  }), [runtime]);

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

  const clock = formatClock(hours);
  const remaining = patientQueue.filter((patient) => !patient.seen).length;
  const unreadLetters = demoLetters.filter((entry) => !readIds.has(entry.id)).length;

  return (
    <div className={`ghud${overlay ? ' ghud--overlay-open' : ''}`} aria-label="Practice chrome">
      <header className="ghud-bar">
        <div className="ghud-mono-wrap">
          {/* Painted cartouche from the ornament sheet; the letter is baked in. */}
          <img className="ghud-monogram-img" src="/ui/monogram.png" alt="" draggable={false} />
        </div>

        <div className="ghud-plate ghud-plate--name">
          <div className="ghud-name">Doctor Simulator: 1896</div>
        </div>

        <i className="ghud-rule" aria-hidden="true" />

        <div className="ghud-plate ghud-plate--loc">
          <div className="ghud-loc-line">
            <PinIcon />
            <span className="ghud-loc-text">{place || '—'}</span>
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

        <div className="ghud-plate ghud-plate--time">
          <div className="ghud-time-big">{clock.text}</div>
          <div className="ghud-time-period">{clock.period}</div>
          <div className="ghud-time-date">{`${monthName(day)} ${day.date}, ${day.year}`}</div>
        </div>

        <i className="ghud-rule" aria-hidden="true" />

        <div className="ghud-plate ghud-plate--queue">
          <div className="ghud-label">Patient Queue</div>
          <div className="ghud-queue-row">
            {patientQueue.map((patient) => (
              <Cameo key={patient.id} variant={patient.silhouette} seen={patient.seen} />
            ))}
            <span className="ghud-count-badge">{remaining}</span>
            <span className="ghud-count-word">Remaining</span>
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
          <div
            className="ghud-gauge"
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
            </span>
            <MeterTooltip metric="health" player={player} />
          </div>
          <div
            className="ghud-gauge"
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
            </span>
            <MeterTooltip metric="neurasthenia" player={player} />
          </div>
        </div>
      </header>

      {!quiet && (
        <p className="ghud-note">
          <EyeIcon />
          <span>Observations may be recorded while wandering.</span>
        </p>
      )}

      <LettersModal
        open={overlay === 'letters'}
        onClose={closeOverlay}
        readIds={readIds}
        onRead={markRead}
        archivedIds={archivedIds}
        onArchive={markArchived}
      />
      <CasebookModal open={overlay === 'casebook'} onClose={closeOverlay} />
      <DayPanel open={overlay === 'day'} onClose={closeOverlay} runtime={runtime} />
      <FastTravelMenu open={overlay === 'travel'} onClose={closeOverlay} runtime={runtime} />

      {!quiet && (
        <nav className="ghud-actions" aria-label="Pocket actions">
          <button
            type="button"
            className="ghud-action"
            onClick={() => setOverlay(overlay === 'travel' ? null : 'travel')}
            aria-haspopup="dialog"
            aria-expanded={overlay === 'travel'}
          >
            <img className="ghud-action-img" src="/ui/verb-travel.png" alt="" draggable={false} />
            <span className="ghud-action-caption">Fast Travel</span>
          </button>
          <i className="ghud-action-rule" aria-hidden="true" />
          <button type="button" className="ghud-action" onClick={checkWallet}>
            <img className="ghud-action-img" src="/ui/verb-wallet.png" alt="" draggable={false} />
            <span className="ghud-action-caption">Check Wallet</span>
          </button>
          <i className="ghud-action-rule" aria-hidden="true" />
          <button type="button" className="ghud-action" onClick={() => setOverlay('casebook')}>
            <img className="ghud-action-img" src="/ui/verb-notebook.png" alt="" draggable={false} />
            <span className="ghud-action-caption">Take Notes</span>
          </button>
        </nav>
      )}
    </div>
  );
}

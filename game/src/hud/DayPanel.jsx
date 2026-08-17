// The day panel, dropped from the clock: today's front page and headlines,
// fast travel, and passing time. The two controls are real — travel drives
// the zone system, rest drives the tuning clock. The news is fixture text
// until the weekly newspaper system exists, and the front page image will be
// a real archive scan at public/newspapers/<year-month-day>.jpg.
//
import { useState } from 'react';
import {
  weekdayName, monthName, dayNews, dayNewsSource, widerWorld,
} from './hudState.js';
import { notice } from '../world/notices.js';
import { recover, restEffect } from '../world/player.js';
import { travelMinutesBetween } from '../world/travel.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import { QuatrefoilIcon, EyebrowArrow } from './chrome.jsx';

const DESTINATIONS = [
  { id: 'central-park', label: 'Central Park — Southeast Corner' },
  { id: 'consulting-office', label: 'Consulting Office' },
  { id: 'waiting-room', label: 'Waiting Room' },
  { id: 'foyer', label: 'Office Lobby' },
  { id: 'cattell-lab', label: 'Cattell’s Laboratory' },
];

const REST_CHOICES = [
  { id: '30m', label: '30 Min', hours: 0.5 },
  { id: '1h', label: '1 Hr', hours: 1 },
  { id: '3h', label: '3 Hrs', hours: 3 },
  { id: 'evening', label: 'Until Evening', until: 18 },
  { id: 'morning', label: 'Until Morning', until: 7 },
];

function spoken(hours) {
  const h24 = Math.floor(hours);
  const minutes = Math.floor((hours - h24) * 60);
  const h12 = ((h24 + 11) % 12) + 1;
  const period = h24 < 12 ? 'in the morning' : h24 < 17 ? 'in the afternoon' : 'in the evening';
  return minutes === 0 ? `${h12} o'clock ${period}` : `${h12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export default function DayPanel({ open, onClose, runtime, worldClock, day }) {
  const [restId, setRestId] = useState('1h');
  const [paperOk, setPaperOk] = useState(true);
  const containerRef = useDismissableOverlay(open, onClose);

  if (!open) return null;

  const dateLine = `${weekdayName(day)}, ${monthName(day)} ${day.date}, ${day.year}`;
  const newspaperSrc = `/newspapers/${day.year}-${String(day.month).padStart(2, '0')}-${String(day.date).padStart(2, '0')}.jpg`;

  const travel = (zoneId) => {
    const destination = DESTINATIONS.find((entry) => entry.id === zoneId);
    if (!destination || runtime.values.zone === zoneId) return;
    worldClock.advanceMinutes(travelMinutesBetween(runtime.values.zone, zoneId), {
      reason: 'travel',
    });
    runtime.set('zone', zoneId);
    onClose();
    notice(`You make your way to the ${destination.label.split(' — ')[0]}.`, { key: 'travel' });
  };

  const passTime = () => {
    const choice = REST_CHOICES.find((entry) => entry.id === restId);
    const elapsedMinutes = choice.until !== undefined
      ? worldClock.advanceToHour(choice.until, { reason: 'rest' })
      : worldClock.advanceMinutes(choice.hours * 60, { reason: 'rest' });
    const target = worldClock.getSnapshot().logical.hours;
    const elapsedHours = elapsedMinutes / 60;
    recover({
      ...restEffect(elapsedHours),
      source: 'rest',
      label: choice.until !== undefined ? `Rested ${choice.label.toLowerCase()}` : `Rested for ${choice.label.toLowerCase()}`,
    });
    onClose();
    notice(`Time passes. It is ${spoken(target)}.`, { key: 'rest' });
  };

  return (
    <div className="ghud-scrim ghud-scrim--clear" onPointerDown={onClose}>
      <section
        ref={containerRef}
        className="ghud-day"
        role="dialog"
        aria-modal="true"
        aria-label="The day"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {['tl', 'tr', 'bl', 'br'].map((pos) => (
          <img
            key={pos}
            className={`ghud-pt-corner ghud-pt-corner--${pos}`}
            src="/ui/corner-line.png"
            alt=""
            draggable={false}
          />
        ))}

        <div className="ghud-day-grid">
          <div className="ghud-day-paper">
            {paperOk ? (
              <img
                src={newspaperSrc}
                alt={`Front page, ${dateLine}`}
                draggable={false}
                onError={() => setPaperOk(false)}
              />
            ) : (
              /* stands in until a real archive scan lands in public/newspapers */
              <div className="ghud-day-paper-placeholder" aria-hidden="true">
                <span className="ghud-day-paper-masthead">The New York Times.</span>
                <span className="ghud-day-paper-dateline">{dateLine.toUpperCase()}</span>
                <span className="ghud-day-paper-columns" />
              </div>
            )}
          </div>

          <div className="ghud-day-main">
            <h3 className="ghud-day-date">{dateLine}</h3>
            <img className="ghud-pt-name-rule" src="/ui/rule-fine.png" alt="" draggable={false} />
            <div className="ghud-day-columns">
              <section className="ghud-day-column">
                <h4 className="ghud-day-column-head">Today’s Headlines</h4>
                <ul className="ghud-day-news">
                  {dayNews.map((item) => (
                    <li key={item.slice(0, 24)}>
                      <QuatrefoilIcon />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="ghud-day-source">
                  Front page of <a href={dayNewsSource.sourceUrl} target="_blank" rel="noreferrer">{dayNewsSource.publication}</a>, {dayNewsSource.date}. Library of Congress.
                </p>
              </section>
              <section className="ghud-day-column">
                <h4 className="ghud-day-column-head">The Wider World</h4>
                <ul className="ghud-day-news ghud-day-news--wider">
                  {widerWorld.map((item) => (
                    <li key={item.text.slice(0, 24)}>
                      <QuatrefoilIcon />
                      <span><em>{item.date}.</em> {item.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          <div className="ghud-day-box ghud-day-box--travel">
            <div className="ghud-eyebrow ghud-day-eyebrow">
              <EyebrowArrow size={22} />
              <span>Fast Travel</span>
              <EyebrowArrow flip size={22} />
            </div>
            <select
              className="ghud-day-select"
              value={runtime.values.zone}
              onChange={(event) => travel(event.target.value)}
              aria-label="Travel to a known location"
            >
              {DESTINATIONS.map(({ id, label }) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
            <p className="ghud-day-caption">Travel quickly to a known location.</p>
          </div>

          <div className="ghud-day-box ghud-day-box--rest">
            <div className="ghud-eyebrow ghud-day-eyebrow">
              <EyebrowArrow size={22} />
              <span>Rest / Pass Time</span>
              <EyebrowArrow flip size={22} />
            </div>
            <div className="ghud-day-durations" role="radiogroup" aria-label="How long to rest">
              {REST_CHOICES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={restId === id}
                  className={`ghud-day-duration${restId === id ? ' ghud-day-duration--on' : ''}`}
                  onClick={() => setRestId(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="ghud-letter-verb ghud-letter-verb--learn ghud-day-pass" onClick={passTime}>
              Pass Time
            </button>
            <p className="ghud-day-caption">Advance time while resting.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

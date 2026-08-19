// Test panel for street events and callers, opened with ?devevents=1.
// Fire any card with any seed; effects apply for real, so the standing log
// and purse can be checked too. Also shows today's rolled schedule.

import { useState } from 'react';
import { EVENT_DECK } from '../world/streetEvents.js';
import { REQUESTS } from '../world/callers.js';
import { formatHour } from '../world/daySchedule.js';
import './eventdev.css';

function fire(kind, id, seed) {
  window.dispatchEvent(new CustomEvent('ghosts:dayflow-trigger', { detail: { kind, id, seed } }));
}

export default function EventDevPanel({ callerDay, eventDay, worldClock }) {
  const [seed, setSeed] = useState(1);
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button type="button" className="eventdev-reopen" onClick={() => setOpen(true)}>
        Events
      </button>
    );
  }

  return (
    <aside className="eventdev">
      <header className="eventdev-head">
        <strong>Event test</strong>
        <button type="button" onClick={() => setOpen(false)}>×</button>
      </header>

      <div className="eventdev-seed">
        <label>
          Seed
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
          />
        </label>
        <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 1e6) + 1)}>
          Reroll
        </button>
        <button type="button" onClick={() => worldClock.advanceMinutes(30, { reason: 'dev' })}>
          +30 min
        </button>
      </div>

      <p className="eventdev-label">Street events</p>
      {EVENT_DECK.map((event) => (
        <button key={event.id} type="button" className="eventdev-item" onClick={() => fire('event', event.id, seed)}>
          {event.heading}
          {event.contentStatus === 'draft' && <small>DRAFT</small>}
          <span>{event.id}</span>
        </button>
      ))}

      <p className="eventdev-label">Callers</p>
      {REQUESTS.map((request) => (
        <button key={request.id} type="button" className="eventdev-item" onClick={() => fire('caller', request.id, seed)}>
          {request.id}
        </button>
      ))}

      <p className="eventdev-label">Today’s roll</p>
      <ul className="eventdev-schedule">
        {eventDay.list().map((item) => (
          <li key={`e${item.hours}`}>{formatHour(item.hours)} — {item.event.id} ({item.status})</li>
        ))}
        {callerDay.list().map((item) => (
          <li key={`c${item.hours}`}>{formatHour(item.hours)} — caller: {item.request.id} ({item.status})</li>
        ))}
      </ul>
      <p className="eventdev-hint">
        Fired cards use the seed above and apply real effects. The roll list is
        this run’s schedule; use +30 min to walk the clock into it.
      </p>
    </aside>
  );
}

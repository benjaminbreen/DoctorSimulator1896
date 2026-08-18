import { useEffect, useMemo, useRef, useState } from 'react';
import { DAY_END_HOUR, formatHour } from '../world/daySchedule.js';
import { adjustStanding, getStanding, standingDelta, subscribeStanding } from '../world/standing.js';
import { getErrand, subscribeErrand, arriveAtLab, noteRead, instrumentTested, CATTELL_NOTE } from '../world/errand.js';
import { getPurseCents, addPiece, DENOMINATIONS, formatPrice } from '../world/purse.js';
import { notice } from '../world/notices.js';
import { subscribe as subscribeInteraction, getInteraction } from '../world/interaction.js';
import { instrumentBus } from '../instruments/bus.js';
import { setGamePaused } from '../input/uiMode.js';
import './dayflow.css';

// Pay a caller's coins into the purse, largest pieces first.
function addCents(amount) {
  let remaining = Math.max(0, Math.round(amount));
  for (const piece of DENOMINATIONS) {
    while (remaining >= piece.cents) {
      addPiece(piece.id, 1);
      remaining -= piece.cents;
    }
  }
}

// Did an instrument session produce a real measurement? The instruments keep
// different ledgers; any of these counts as figures worth leaving.
function instrumentMeasured(state) {
  if (!state) return false;
  return (state.trials ?? 0) > 0
    || (state.shocks?.length ?? 0) > 0
    || (state.samples?.length ?? 0) > 0
    || (state.readings?.length ?? 0) > 0
    || (state.best ?? 0) > 0;
}

// The day's out-of-consultation flow: appointment warnings and the late
// prompt, walk-in callers, the Cattell errand, retirement, and the day's
// end. All decisions come from the deterministic day modules; this
// component only presents them.
export default function DayFlow({
  worldClock,
  schedule,
  callerDay,
  patients,
  zone,
  consultActive,
  suspended = false,
  onSeePatient,
}) {
  const [latePrompt, setLatePrompt] = useState(null);
  const [caller, setCaller] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [errand, setErrand] = useState(getErrand);
  const [, setStandingTick] = useState(0);
  const dayStartCents = useRef(getPurseCents());
  const blocked = useRef(false);
  blocked.current = consultActive || suspended || Boolean(latePrompt || caller || noteOpen || summary);

  const patientById = useMemo(() => {
    const map = new Map();
    for (const patient of patients) map.set(patient.id, patient);
    return map;
  }, [patients]);
  const nameOf = (patientId) => patientById.get(patientId)?.label || 'your patient';

  useEffect(() => subscribeErrand(setErrand), []);
  useEffect(() => subscribeStanding(() => setStandingTick((n) => n + 1)), []);

  // The clock drives duty: warnings, lateness, callers, and the day's end.
  useEffect(() => worldClock.subscribe((snapshot) => {
    const hours = snapshot.logical.hours;
    if (summary) return;

    const warning = schedule.takeWarning(hours);
    if (warning) {
      notice(`${nameOf(warning.patientId)} is expected at ${formatHour(warning.hours)}.`, {
        key: 'appointment', seconds: 8,
      });
    }

    const lapsed = callerDay.takeLapsed(hours);
    if (lapsed) {
      adjustStanding(-1, `${lapsed.identity.name} went away unserved`);
      notice(`${lapsed.identity.name} tired of waiting and went elsewhere.`, { key: 'caller' });
    }

    if (hours >= DAY_END_HOUR) {
      setSummary({ reason: 'day-end' });
      return;
    }
    if (blocked.current) return;

    const overdue = schedule.overdue(hours);
    if (overdue) {
      setLatePrompt(overdue);
      return;
    }

    if (zone === 'consulting-office') {
      const due = callerDay.due(hours);
      if (due) {
        notice('The street bell rings: a caller at the office door.', { key: 'caller', seconds: 6 });
        setCaller(due);
      }
    }
  }), [worldClock, schedule, callerDay, zone, summary]);

  // Walking into the laboratory with the parcel finds Cattell's note.
  useEffect(() => {
    if (zone === 'cattell-lab' && arriveAtLab()) setNoteOpen(true);
  }, [zone]);

  // An instrument session that ends with a measurement counts toward the
  // errand. The bus keeps the live instrument; the interaction store says
  // when the session ends and which apparatus it was.
  useEffect(() => {
    let previous = getInteraction().using;
    return subscribeInteraction((state) => {
      const was = previous;
      previous = state.using;
      if (!was?.instrument || state.using) return;
      if (getErrand().status !== 'testing') return;
      if (instrumentMeasured(instrumentBus.instrument)) {
        const done = instrumentTested(was.instrument);
        notice(done
          ? 'Your figures are on the slate. Cattell will hear of this favourably.'
          : 'One set of figures noted. The note asked for two apparatus.', { key: 'errand', seconds: 7 });
      }
    });
  }, []);

  // The summary holds the night: time and input rest while it is up.
  useEffect(() => {
    if (!summary) return undefined;
    worldClock.setPaused(true);
    setGamePaused(true);
    return () => {
      worldClock.setPaused(false);
      setGamePaused(false);
    };
  }, [summary, worldClock]);

  const keepAppointment = () => {
    const patient = patientById.get(latePrompt.patientId);
    setLatePrompt(null);
    if (patient) onSeePatient(patient);
  };

  const forfeitAppointment = () => {
    const name = nameOf(latePrompt.patientId);
    schedule.markForfeited(latePrompt.patientId);
    adjustStanding(-7, `turned ${name} away unseen`);
    notice(`${name} is sent away. Word of it will travel.`, { key: 'appointment', seconds: 7 });
    setLatePrompt(null);
  };

  const answerCaller = (choice) => {
    const outcome = callerDay.resolve(caller, choice);
    setCaller(null);
    if (!outcome) return;
    if (outcome.price > 0) addCents(outcome.price);
    if (outcome.standing) {
      adjustStanding(outcome.standing, `${caller.identity.name}, at the door`);
    }
    notice(outcome.note, { key: 'caller', seconds: 7 });
  };

  const closeNote = () => {
    setNoteOpen(false);
    noteRead();
  };

  const stats = schedule.stats();
  const canRetire = stats.pending === 0 && !consultActive && !summary && !suspended;
  const income = getPurseCents() - dayStartCents.current;

  return (
    <>
      {latePrompt && (
        <div className="dayflow-scrim">
          <div className="dayflow-panel" role="dialog" aria-label="Appointment due">
            <p className="dayflow-eyebrow">A Patient Is Waiting</p>
            <p className="dayflow-body">
              {zone === 'consulting-office'
                ? `${nameOf(latePrompt.patientId)} is waiting in your consulting room; the appointment was for ${formatHour(latePrompt.hours)}.`
                : `You are late for your appointment. You were to see ${nameOf(latePrompt.patientId)} at ${formatHour(latePrompt.hours)}.`}
            </p>
            <div className="dayflow-actions">
              <button type="button" className="dayflow-button is-primary" onClick={keepAppointment}>
                {zone === 'consulting-office' ? 'See them now' : 'Return to the office'}
              </button>
              <button type="button" className="dayflow-button" onClick={forfeitAppointment}>
                Cancel the appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {caller && !latePrompt && (
        <div className="dayflow-caller" role="dialog" aria-label="A caller at the door">
          <p className="dayflow-eyebrow">A Caller at the Door</p>
          <p className="dayflow-body">{caller.request.text(caller.identity)}</p>
          <div className="dayflow-actions dayflow-actions--column">
            <button type="button" className="dayflow-button is-primary" onClick={() => answerCaller('sell')}>
              {caller.request.sell.label}
              <span className="dayflow-price">{formatPrice(caller.request.sell.price)}</span>
            </button>
            <button type="button" className="dayflow-button" onClick={() => answerCaller('advise')}>
              {caller.request.advise.label}
            </button>
            <button type="button" className="dayflow-button is-quiet" onClick={() => answerCaller('refuse')}>
              {caller.request.refuse.label}
            </button>
          </div>
        </div>
      )}

      {noteOpen && (
        <div className="dayflow-scrim">
          <div className="dayflow-note" role="dialog" aria-label="A note from Professor Cattell">
            <p className="dayflow-note-heading">{CATTELL_NOTE.heading}</p>
            {CATTELL_NOTE.body.map((line) => <p key={line.slice(0, 24)} className="dayflow-note-line">{line}</p>)}
            <p className="dayflow-note-signature">{CATTELL_NOTE.signature}</p>
            <div className="dayflow-actions">
              <button type="button" className="dayflow-button is-primary" onClick={closeNote}>
                Pocket the note
              </button>
            </div>
          </div>
        </div>
      )}

      {canRetire && (
        <button
          type="button"
          className="dayflow-retire"
          onClick={() => setSummary({ reason: 'retired' })}
        >
          Retire for the night
        </button>
      )}

      {summary && (
        <div className="dayflow-scrim dayflow-scrim--night">
          <div className="dayflow-panel dayflow-panel--summary" role="dialog" aria-label="The day's end">
            <p className="dayflow-eyebrow">
              {summary.reason === 'retired' ? 'You Retire for the Night' : 'Ten O’Clock — the Day Is Done'}
            </p>
            <ul className="dayflow-summary-list">
              {schedule.list().map((item) => (
                <li key={item.patientId}>
                  <span>{formatHour(item.hours)} — {nameOf(item.patientId)}</span>
                  <strong className={item.status === 'kept' ? 'is-helpful' : item.status === 'forfeited' ? 'is-harmful' : ''}>
                    {item.status === 'kept' ? 'Seen' : item.status === 'forfeited' ? 'Turned away' : 'Never seen'}
                  </strong>
                </li>
              ))}
              <li>
                <span>The day’s takings</span>
                <strong className={income >= 0 ? 'is-helpful' : 'is-harmful'}>{formatPrice(Math.abs(income))}</strong>
              </li>
              <li>
                <span>Professional standing</span>
                <strong className={standingDelta() >= 0 ? 'is-helpful' : 'is-harmful'}>
                  {Math.round(getStanding())} ({standingDelta() >= 0 ? '+' : ''}{Math.round(standingDelta())})
                </strong>
              </li>
              {errand.status === 'done' && (
                <li><span>Measurements left for Prof. Cattell</span><strong className="is-helpful">Credited</strong></li>
              )}
              {(errand.status === 'deliver' || errand.status === 'note' || errand.status === 'testing') && (
                <li><span>Prof. Cattell’s errand</span><strong>Unfinished</strong></li>
              )}
            </ul>
            <div className="dayflow-actions">
              <button type="button" className="dayflow-button is-primary" onClick={() => window.location.reload()}>
                Begin the next morning
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

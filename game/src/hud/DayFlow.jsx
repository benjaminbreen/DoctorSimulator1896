import { useEffect, useMemo, useRef, useState } from 'react';
import { formatHour } from '../world/daySchedule.js';
import { playSfx } from '../audio/sound.js';
import { adjustStanding, getStanding, subscribeStanding } from '../world/standing.js';
import { getErrand, subscribeErrand, arriveAtLab, noteRead, instrumentTested, CATTELL_NOTE } from '../world/errand.js';
import { getPurseCents, addCents, spendCents, formatPrice } from '../world/purse.js';
import { EVENT_DECK, pickEvent } from '../world/streetEvents.js';
import { REQUESTS as CALLER_REQUESTS } from '../world/callers.js';
import { rollIdentity } from '../world/npcIdentity.js';
import { notice } from '../world/notices.js';
import { recordPressItem } from '../world/press.js';
import { recordReferral } from '../world/referrals.js';
import EventArt, { CallerArt, OutcomeArt } from './eventArt.jsx';
import { subscribe as subscribeInteraction, getInteraction } from '../world/interaction.js';
import { instrumentBus } from '../instruments/bus.js';
import { setGamePaused } from '../input/uiMode.js';
import './dayflow.css';

const SLEEP_LINES = {
  19: 'Seven o’clock. The consulting hours are over for most of the profession.',
  20: 'Eight o’clock. Supper is long past and the streets are quieting.',
  21: 'Nine o’clock. The lamps are lit and the streets are thinning.',
  22: 'Ten o’clock. The day has little left in it.',
  23: 'Eleven. The gas burns low, and so do you.',
};
const SLEEP_FROM_HOUR = 19;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

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
  eventDay,
  runtime,
  patients,
  zone,
  consultActive,
  suspended = false,
  practiceBlocked = false,
  onSeePatient,
  onGoToOffice,
  onNextDay,
  morning = null,
  onMorningDone,
  onCardOpen = () => {},
}) {
  const [latePrompt, setLatePrompt] = useState(null);
  const [caller, setCaller] = useState(null);
  const [messenger, setMessenger] = useState(null);
  const [encounter, setEncounter] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [sleepPrompt, setSleepPrompt] = useState(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [errand, setErrand] = useState(getErrand);
  const [, setStandingTick] = useState(0);
  const dayStartCents = useRef(getPurseCents());
  // Standing changes for THIS day only; the run total lives in the HUD seal.
  const dayStartStanding = useRef(getStanding());
  const testEvents = useRef({ last: -Infinity, count: -1 });
  // Which evening hours have already asked about bed, and which calendar day
  // this DayFlow belongs to (a date change at midnight forces the summary).
  const sleepAsked = useRef(new Set());
  const dayOfYear = useRef(null);
  const blocked = useRef(false);
  blocked.current = consultActive || suspended
    || Boolean(latePrompt || caller || messenger || encounter || outcome || sleepPrompt || noteOpen || summary || morning);

  const patientById = useMemo(() => {
    const map = new Map();
    for (const patient of patients) map.set(patient.id, patient);
    return map;
  }, [patients]);
  const nameOf = (patientId) => patientById.get(patientId)?.label || 'your patient';

  useEffect(() => subscribeErrand(setErrand), []);
  useEffect(() => subscribeStanding(() => setStandingTick((n) => n + 1)), []);
  useEffect(() => {
    if (!practiceBlocked) schedule.resumeHeld();
  }, [practiceBlocked, schedule]);

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
    eventDay.expire(hours);

    // Midnight is not negotiable: when the date turns, the day is over and
    // any open card yields to the summary.
    const today = snapshot.logical.date.dayOfYear;
    if (dayOfYear.current === null) dayOfYear.current = today;
    if (today !== dayOfYear.current) {
      setLatePrompt(null);
      setCaller(null);
      setMessenger(null);
      setEncounter(null);
      setOutcome(null);
      setSleepPrompt(null);
      setSummary({ reason: 'midnight' });
      return;
    }
    if (blocked.current) return;

    if (practiceBlocked) {
      const dueAppointment = schedule.due(hours);
      if (dueAppointment && schedule.hold(dueAppointment.patientId)) {
        notice(`${nameOf(dueAppointment.patientId)} will wait while you recover your composure.`, {
          key: 'appointment', seconds: 7,
        });
      }
      return;
    }

    const dueAppointment = schedule.due(hours);
    if (dueAppointment) {
      setLatePrompt(dueAppointment);
      return;
    }

    // From early evening, each hour asks once about bed.
    if (hours >= SLEEP_FROM_HOUR) {
      const hour = Math.floor(hours);
      if (!sleepAsked.current.has(hour)) {
        sleepAsked.current.add(hour);
        setSleepPrompt(hour);
        return;
      }
    }

    // Anywhere in the practice, the street bell reaches you directly.
    // The values duplicate PRACTICE_ZONES in world/travel.js.
    if (['consulting-office', 'waiting-room', 'foyer'].includes(zone)) {
      const due = callerDay.due(hours);
      if (due) {
        notice('The street bell rings: a caller at the office door.', { key: 'caller', seconds: 6 });
        setCaller(due);
        return;
      }
    } else {
      // The doctor is out: a boy carries word of the caller instead.
      const message = callerDay.takeMessage(hours);
      if (message) {
        setMessenger(message);
        return;
      }
      if (zone === 'central-park') {
        const due = eventDay.due(hours);
        if (due) {
          setEncounter(due);
          return;
        }
      }
    }

    // Test mode (tuning panel): extra events at a fixed gap, drawn with the
    // same weights as real play. Street events stay in the street: like the
    // scheduled ones, they only deal outdoors.
    const gapMinutes = Number(runtime?.values?.eventTestMinutes) || 0;
    if (gapMinutes > 0 && zone === 'central-park' && hours - testEvents.current.last >= gapMinutes / 60) {
      testEvents.current.last = hours;
      const index = (testEvents.current.count += 1);
      const testSeed = ((index + 1) * 2654435761) >>> 0;
      const event = pickEvent((testSeed % 10000) / 10000);
      setEncounter({ event, identity: rollIdentity(event.archetype, testSeed), seed: testSeed, synthetic: true });
    }
  }), [worldClock, schedule, callerDay, eventDay, runtime, zone, summary, practiceBlocked]);

  // Dev panel hook (?devevents=1): trigger any event or caller on demand.
  // Synthetic entries resolve locally; effects apply for real.
  useEffect(() => {
    const onTrigger = (event) => {
      const { kind, id, seed = 1 } = event.detail || {};
      if (kind === 'event') {
        const entry = EVENT_DECK.find((item) => item.id === id);
        if (entry) setEncounter({ event: entry, identity: rollIdentity(entry.archetype, seed), seed, synthetic: true });
      }
      if (kind === 'caller') {
        const request = CALLER_REQUESTS.find((item) => item.id === id);
        const archetype = ['m', 'w', 'f'][Math.trunc(seed) % 3];
        if (request) setCaller({ request, identity: rollIdentity(archetype, seed), synthetic: true });
      }
    };
    window.addEventListener('ghosts:dayflow-trigger', onTrigger);
    return () => window.removeEventListener('ghosts:dayflow-trigger', onTrigger);
  }, []);

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

  // Any open card holds the world: at eight game-seconds per real second,
  // a modal left running would eat the day behind the player's back.
  const cardOpen = Boolean(latePrompt || caller || messenger || encounter || outcome
    || sleepPrompt !== null || noteOpen || summary || morning);
  useEffect(() => {
    if (!cardOpen) return undefined;
    worldClock.setPaused(true);
    setGamePaused(true);
    // The card claims the screen: the patient queue hides beneath it.
    onCardOpen(true);
    return () => {
      worldClock.setPaused(false);
      setGamePaused(false);
      onCardOpen(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardOpen, worldClock]);

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
    const result = caller.synthetic
      ? caller.request[choice]
      : callerDay.resolve(caller, choice);
    const request = caller.request;
    const name = caller.identity.name;
    setCaller(null);
    if (!result) return;
    if (result.price > 0) addCents(result.price);
    if (result.standing) adjustStanding(result.standing, `${name}, at the door`);
    setOutcome({
      kind: 'caller',
      heading: 'A Caller at the Door',
      artId: request.art ?? request.id,
      variant: choice,
      note: result.note,
      effects: { cents: result.price, standing: result.standing },
    });
  };

  // The boy's message: go now (the caller is held through the trip), tip him
  // and go, or let the caller take their chances with the clock.
  const goToCaller = (tip) => {
    const held = messenger;
    setMessenger(null);
    if (tip) spendCents(5);
    callerDay.holdForArrival(held);
    if (onGoToOffice?.() === false) return;
    setCaller(held);
  };

  const dismissMessenger = () => {
    setMessenger(null);
    notice('The boy shrugs and is off. The caller can wait, or not.', { key: 'caller', seconds: 6 });
  };

  const answerEncounter = (choiceId) => {
    const choice = encounter.synthetic
      ? encounter.event.choices.find((option) => option.id === choiceId)
      : eventDay.resolve(encounter, choiceId);
    const { event, identity } = encounter;
    setEncounter(null);
    if (!choice) return;
    const { cents = 0, standing = 0, minutes = 0 } = choice.effects || {};
    if (minutes) worldClock.advanceMinutes(minutes, { reason: 'street event' });
    if (cents > 0) addCents(cents);
    if (cents < 0) spendCents(-cents);
    if (standing) adjustStanding(standing, `${identity.name}, in the street`);
    if (choice.press) recordPressItem(choice.press(identity));
    if (choice.referral) recordReferral(identity);
    setOutcome({
      kind: 'event',
      heading: event.heading,
      artId: event.art ?? event.id,
      variant: choiceId,
      note: choice.note,
      effects: choice.effects || {},
    });
  };

  // What a decision cost or earned, said once beneath the outcome.
  const effectsLine = (effects = {}) => {
    const parts = [];
    if (effects.cents > 0) parts.push(`${formatPrice(effects.cents)} received`);
    if (effects.cents < 0) parts.push(`${formatPrice(-effects.cents)} paid`);
    if (effects.standing > 0) parts.push('your standing rises');
    if (effects.standing < 0) parts.push('your standing suffers');
    if (effects.minutes) parts.push(`${effects.minutes} minutes given`);
    return parts.join('  ·  ');
  };

  const closeNote = () => {
    setNoteOpen(false);
    noteRead();
  };

  // A card set down on the table announces itself once, on arrival only.
  const chimed = useRef(false);
  useEffect(() => {
    if (cardOpen && !chimed.current) playSfx('event-card');
    chimed.current = cardOpen;
  }, [cardOpen]);

  const morningDate = () => {
    const date = worldClock.getSnapshot().logical.date;
    const weekday = WEEKDAYS[new Date(date.year, date.month - 1, date.date).getDay()];
    return `${weekday}, ${MONTHS[date.month - 1]} ${date.date}`;
  };

  const stats = schedule.stats();
  const canRetire = stats.pending === 0 && !consultActive && !summary && !suspended;
  const income = getPurseCents() - dayStartCents.current;

  return (
    <>
      {latePrompt && (
        <div className="dayflow-scrim">
          <div className="dayflow-panel" role="dialog" aria-label="Appointment due">
            <p className="dayflow-eyebrow">Appointment Due</p>
            <p className="dayflow-body">
              {zone === 'consulting-office'
                ? `${nameOf(latePrompt.patientId)} has arrived for the ${formatHour(latePrompt.hours)} appointment.`
                : `${nameOf(latePrompt.patientId)} is waiting at your office for the ${formatHour(latePrompt.hours)} appointment.`}
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

      {messenger && !latePrompt && (
        <div className="dayflow-scrim dayflow-scrim--event">
          <div className="dayflow-event-card" role="dialog" aria-label="A boy with a message">
            <EventArt eventId="messenger-boy" />
            <p className="dayflow-event-eyebrow">A Boy Runs Up</p>
            <p className="dayflow-event-body">
              “You the doctor? There’s a caller at your door — {messenger.identity.name}, {messenger.request.gist}.
              Said I’d find you quick.”
            </p>
            <div className="dayflow-event-choices">
              <button type="button" className="dayflow-event-choice" style={{ '--i': 0 }} onClick={() => goToCaller(false)}>
                Go at once
              </button>
              <button type="button" className="dayflow-event-choice" style={{ '--i': 1 }} onClick={() => goToCaller(true)}>
                Tip the boy a nickel and go
                <span className="dayflow-event-price">5¢</span>
              </button>
              <button type="button" className="dayflow-event-choice" style={{ '--i': 2 }} onClick={dismissMessenger}>
                Let them wait
              </button>
            </div>
          </div>
        </div>
      )}

      {sleepPrompt !== null && !latePrompt && (
        <div className="dayflow-scrim dayflow-scrim--event">
          <div className="dayflow-event-card" role="dialog" aria-label="The evening ends">
            <EventArt eventId="retiring" />
            <p className="dayflow-event-eyebrow">The Evening Ends</p>
            <p className="dayflow-event-body">{SLEEP_LINES[sleepPrompt] ?? 'The night is far gone.'}</p>
            <div className="dayflow-event-choices">
              <button
                type="button"
                className="dayflow-event-choice"
                style={{ '--i': 0 }}
                onClick={() => { setSleepPrompt(null); setSummary({ reason: 'retired' }); }}
              >
                Retire for the night
              </button>
              <button
                type="button"
                className="dayflow-event-choice"
                style={{ '--i': 1 }}
                onClick={() => setSleepPrompt(null)}
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}

      {morning && (
        <div className="dayflow-scrim dayflow-scrim--event">
          <div className="dayflow-event-card" role="dialog" aria-label="The morning's list">
            <EventArt eventId="morning-schedule" />
            <p className="dayflow-event-eyebrow">{morningDate()}</p>
            <p className="dayflow-event-body">
              You wake at eight, rested. Coffee, the post, and the day’s list:
            </p>
            <ul className="dayflow-morning-list">
              {schedule.list().map((item) => (
                <li key={item.patientId}>
                  <span>{formatHour(item.hours)}</span>
                  <strong>{nameOf(item.patientId)}</strong>
                </li>
              ))}
            </ul>
            {morning.referralName && (
              <p className="dayflow-morning-press-item">
                By her mother’s arrangement, {morning.referralName} heads the list.
              </p>
            )}
            {morning.press?.length > 0 && (
              <div className="dayflow-morning-press">
                <p className="dayflow-morning-press-head">In the morning papers</p>
                {morning.press.map((item) => (
                  <p key={item.slice(0, 24)} className="dayflow-morning-press-item">{item}</p>
                ))}
              </div>
            )}
            <div className="dayflow-event-choices">
              <button type="button" className="dayflow-event-choice" style={{ '--i': 0 }} onClick={onMorningDone}>
                Begin the day
              </button>
            </div>
          </div>
        </div>
      )}

      {encounter && !latePrompt && (
        <div className="dayflow-scrim dayflow-scrim--event">
          <div className="dayflow-event-card" role="dialog" aria-label={encounter.event.heading}>
            <EventArt
              eventId={encounter.event.art ?? encounter.event.id}
              variant={encounter.event.artVariant}
            />
            <p className="dayflow-event-eyebrow">{encounter.event.heading}</p>
            <p className="dayflow-event-body">{encounter.event.text(encounter.identity)}</p>
            <div className="dayflow-event-choices">
              {encounter.event.choices.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  className="dayflow-event-choice"
                  style={{ '--i': index }}
                  onClick={() => answerEncounter(option.id)}
                >
                  {option.label}
                  {option.effects?.cents ? (
                    <span className="dayflow-event-price">
                      {option.effects.cents > 0 ? '+' : '−'}{formatPrice(Math.abs(option.effects.cents))}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {outcome && !latePrompt && (
        <div className="dayflow-scrim dayflow-scrim--event">
          <div className="dayflow-event-card" role="dialog" aria-label="What came of it">
            <OutcomeArt kind={outcome.kind} artId={outcome.artId} variant={outcome.variant} />
            <p className="dayflow-event-eyebrow">{outcome.heading}</p>
            <p className="dayflow-event-body">{outcome.note}</p>
            {effectsLine(outcome.effects) && (
              <p className="dayflow-outcome-effects">{effectsLine(outcome.effects)}</p>
            )}
            <div className="dayflow-event-choices">
              <button
                type="button"
                className="dayflow-event-choice"
                style={{ '--i': 0 }}
                onClick={() => setOutcome(null)}
              >
                Carry on
              </button>
            </div>
          </div>
        </div>
      )}

      {caller && !latePrompt && (
        <div className="dayflow-caller" role="dialog" aria-label="A caller at the door">
          <CallerArt
            requestId={caller.request.art ?? caller.request.id}
            variant={caller.request.artVariant}
          />
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
              {summary.reason === 'midnight' ? 'Midnight — You Can Stand No More' : 'You Retire for the Night'}
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
                <strong className={getStanding() >= dayStartStanding.current ? 'is-helpful' : 'is-harmful'}>
                  {Math.round(getStanding())} ({getStanding() >= dayStartStanding.current ? '+' : ''}{Math.round(getStanding() - dayStartStanding.current)})
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
              <button
                type="button"
                className="dayflow-button is-primary"
                onClick={() => { setSummary(null); onNextDay?.(); }}
              >
                Sleep until morning
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

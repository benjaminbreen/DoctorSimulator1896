// The practice day played as text: appointments, callers, street events,
// travel, money, standing, nerves, the Cattell errand, and sleep.
//
// The schedule, callers, events, purse, standing, and consultations are the
// game's own modules. The glue between them repeats what App.jsx and
// DayFlow.jsx do in React; if a day rule changes there, change it here.
// Walking is not simulated, so park rest and laboratory measurements are
// single actions with a fixed time cost (ACTIVITIES, MEASURE_MINUTES).
//
// The world modules keep one shared state, so run one day session per process.

import { DEFAULT_CLOCK_RATE, createWorldClock } from '../../src/world/clock.js';
import { createDaySchedule, formatHour } from '../../src/world/daySchedule.js';
import { createCallerDay } from '../../src/world/callers.js';
import { createEventDay } from '../../src/world/streetEvents.js';
import { createConsultationPatients } from '../../src/consultation/patients.js';
import { FAST_TRAVEL_DESTINATIONS, travelMinutesBetween } from '../../src/world/travel.js';
import {
  addCents, formatPrice, getPurseCents, resetPurseForTests, spendCents,
} from '../../src/world/purse.js';
import { adjustStanding, getStanding, resetStandingForTests } from '../../src/world/standing.js';
import {
  CAROUSEL_RECOVERY, CHECKERS_RECOVERY, PARK_BENCH_RECOVERY, SUNNY_STROLL_RECOVERY,
  applyPlayerEvent, consultationStrainEffect, getPlayer, isNeurastheniaCrisis,
  neurastheniaCondition, recoverFromActivity, resetPlayer, tickPlayer,
} from '../../src/world/player.js';
import {
  CATTELL_NOTE, arriveAtLab, beginErrand, getErrand, instrumentTested, noteRead, resetErrandForTests,
} from '../../src/world/errand.js';
import { recordPressItem, takePressItems } from '../../src/world/press.js';
import { recordReferral, takeReferral } from '../../src/world/referrals.js';
import { setRunSeedForTests } from '../../src/world/runSeed.js';
import { createConsultSession } from './consultSession.js';

const PRACTICE_ZONES = ['consulting-office', 'waiting-room', 'foyer'];
const SLEEP_FROM_HOUR = 19;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// Recovery amounts are the game's. The minutes are stand-ins for the walk
// and the activity, which the 3D game spends in real time.
const ACTIVITIES = [
  { id: 'bench', label: 'Sit on a park bench', minutes: 10, neurasthenia: PARK_BENCH_RECOVERY },
  { id: 'stroll', label: 'Stroll in the sun', minutes: 20, neurasthenia: SUNNY_STROLL_RECOVERY },
  { id: 'carousel', label: 'Ride the carousel', minutes: 15, neurasthenia: CAROUSEL_RECOVERY },
  { id: 'checkers', label: 'Play checkers', minutes: 20, neurasthenia: CHECKERS_RECOVERY },
];
const INSTRUMENTS = ['reaction-chronoscope', 'induction-coil', 'tachistoscope', 'colour-wheel', 'seconds-pendulum'];
const MEASURE_MINUTES = 15;

const zoneLabel = (zone) => FAST_TRAVEL_DESTINATIONS.find((item) => item.id === zone)?.label || zone;

export function createDaySession({
  seed = 4, authored = false, hints = 'shortlist', renderDialogue, renderLetter = null,
} = {}) {
  setRunSeedForTests(seed);
  resetPurseForTests();
  resetStandingForTests();
  resetPlayer();
  resetErrandForTests();
  takePressItems();
  takeReferral();

  const clock = createWorldClock({ rate: 0 });
  let zone = 'central-park';
  let dayIndex = 0;
  let patients, schedule, callerDay, eventDay;
  let dayStartCents, dayStartStanding, dayOfYear;
  let sleepAsked = new Set();
  let card = null;
  let consult = null;
  let consultPatient = null;
  let consultSettled = false;
  let news = [];
  const steps = [];
  const days = [];
  const consultations = [];

  const hours = () => clock.getLogicalHours();
  const date = () => clock.getSnapshot().logical.date;
  const nameOf = (patientId) => patients.find((item) => item.id === patientId)?.label || 'your patient';
  const tell = (text) => news.push(text);

  function dateLine() {
    const { year, month, date: dayOfMonth } = date();
    return `${WEEKDAYS[new Date(year, month - 1, dayOfMonth).getDay()]}, ${MONTHS[month - 1]} ${dayOfMonth}, ${year}`;
  }

  // Same seeds as App.jsx, so a text day and a browser day with one seed
  // share their patients, schedule, callers, and street events.
  function beginDay(referral = null) {
    const daySeed = (seed ^ Math.imul(dayIndex, 0x85ebca6b)) >>> 0;
    patients = createConsultationPatients(dayIndex === 0
      ? { daySeed, dayIndex: 0, count: 3, authored }
      : { daySeed, dayIndex, count: 4, referral });
    schedule = createDaySchedule({ seed: daySeed, patientIds: patients.map((patient) => patient.id) });
    callerDay = createCallerDay({ seed: (daySeed ^ 0x9e3779b9) >>> 0 });
    eventDay = createEventDay({ seed: (daySeed ^ 0x51ed2701) >>> 0 });
    dayStartCents = getPurseCents();
    dayStartStanding = getStanding();
    dayOfYear = date().dayOfYear;
    sleepAsked = new Set();
  }
  beginDay();

  // What the clock asks of the doctor now. Mirrors the clock subscriber in
  // DayFlow.jsx, in the same order.
  function duty() {
    const now = hours();
    if (card?.kind === 'summary') return;
    const warning = schedule.takeWarning(now);
    if (warning) tell(`${nameOf(warning.patientId)} is expected at ${formatHour(warning.hours)}.`);
    for (let lapsed = callerDay.takeLapsed(now); lapsed; lapsed = callerDay.takeLapsed(now)) {
      adjustStanding(-1, `${lapsed.identity.name} went away unserved`);
      tell(`${lapsed.identity.name} tired of waiting and went elsewhere.`);
    }
    eventDay.expire(now);

    if (date().dayOfYear !== dayOfYear) {
      // A visit in progress is finished first; the summary follows it.
      if (!consult) card = { kind: 'summary', reason: 'midnight' };
      return;
    }
    if (card || consult) return;

    if (isNeurastheniaCrisis(getPlayer())) {
      const due = schedule.due(now);
      if (due && schedule.hold(due.patientId)) tell(`${nameOf(due.patientId)} will wait while you recover your composure.`);
      return;
    }
    schedule.resumeHeld();

    const appointment = schedule.due(now);
    if (appointment) { card = { kind: 'appointment', appointment }; return; }

    if (now >= SLEEP_FROM_HOUR && !sleepAsked.has(Math.floor(now))) {
      sleepAsked.add(Math.floor(now));
      card = { kind: 'sleep' };
      return;
    }
    if (PRACTICE_ZONES.includes(zone)) {
      const caller = callerDay.due(now);
      if (caller) card = { kind: 'caller', caller };
      return;
    }
    const message = callerDay.takeMessage(now);
    if (message) { card = { kind: 'messenger', caller: message }; return; }
    if (zone === 'central-park') {
      const entry = eventDay.due(now);
      if (entry) card = { kind: 'event', entry };
    }
  }

  // One jump, as the game does for travel and consultation minutes.
  function jump(minutes) {
    if (!(minutes > 0)) return;
    clock.advanceMinutes(minutes, { animate: false });
    tickPlayer(minutes * 60 / DEFAULT_CLOCK_RATE);
    duty();
  }

  // Minute by minute, so a card can interrupt the wait.
  function pass(minutes) {
    for (let minute = 0; minute < minutes && !card; minute += 1) jump(1);
  }

  function moveTo(destination) {
    const minutes = travelMinutesBetween(zone, destination);
    zone = destination;
    if (zone === 'cattell-lab' && arriveAtLab()) {
      tell(`A note on the desk. ${CATTELL_NOTE.body.join(' ')} ${CATTELL_NOTE.signature}`);
      noteRead();
    }
    jump(minutes);
  }

  function seePatient(patient) {
    if (isNeurastheniaCrisis(getPlayer())) {
      return 'Your nerves will not bear another consultation. Seek relief in Central Park first.';
    }
    if (zone !== 'consulting-office') moveTo('consulting-office');
    card = null;
    consultPatient = patient;
    consultSettled = false;
    schedule.markKept(patient.id);
    consult = createConsultSession({
      patient, hints, renderDialogue, renderLetter,
      // Consultation minutes cost the day double, as in App.jsx.
      onAdvanceMinutes: (minutes) => jump(minutes * 2),
    });
    tell(`You show ${patient.label} into your consulting room.`);
    return null;
  }

  // Standing, nerves, and the errand settle once, when the result appears.
  function settleResult() {
    const state = consult.state();
    if (consultSettled || state.stage !== 'result' || !state.result) return;
    consultSettled = true;
    const satisfaction = state.result.immediate?.satisfaction ?? 50;
    const reputation = Number(state.result.immediate?.reputation) || 0;
    const delta = reputation !== 0 ? reputation : (satisfaction >= 70 ? 4 : satisfaction >= 43 ? 1 : -3);
    adjustStanding(delta, `the consultation with ${consultPatient.label}`);
    const strain = consultationStrainEffect(state.result, consultPatient.label);
    if (strain) { applyPlayerEvent(strain); tell(strain.note); }
    if (beginErrand()) {
      tell('A boy leaves a parcel: a volume to be delivered to Professor Cattell at the laboratory.');
    }
  }

  function closeConsultation(to) {
    const state = consult.state();
    if (state.result?.immediate) {
      // Leaving without settling takes the offered fee in cash, as the UI does.
      const settlement = consult.settlement()
        || { cents: Number(state.result.immediate.paymentCents) || 0, standing: 0 };
      if (settlement.cents > 0) addCents(settlement.cents);
      if (settlement.standing) adjustStanding(settlement.standing, `the fee from ${consultPatient.label}`);
    }
    consultations.push({ day: dayIndex + 1, ...consult.log() });
    consult = null;
    consultPatient = null;
    if (to === 'street' || to === 'waiting-room') {
      zone = to === 'street' ? 'central-park' : 'waiting-room';
      tell(to === 'street' ? 'You leave the practice and step out into the street.' : 'You return to the waiting room.');
      jump(2);
    } else {
      duty();
    }
  }

  function daySummary() {
    const errand = getErrand().status;
    return {
      day: dayIndex + 1,
      date: dateLine(),
      appointments: schedule.list().map((item) => ({
        time: formatHour(item.hours),
        patient: nameOf(item.patientId),
        outcome: item.status === 'kept' ? 'Seen' : item.status === 'forfeited' ? 'Turned away' : 'Never seen',
      })),
      takingsCents: getPurseCents() - dayStartCents,
      standing: Math.round(getStanding()),
      standingChange: Math.round(getStanding() - dayStartStanding),
      ...(errand === 'done' ? { errand: 'Measurements left for Prof. Cattell' }
        : errand !== 'idle' ? { errand: 'Prof. Cattell’s errand unfinished' } : {}),
    };
  }

  function sleep() {
    days.push(daySummary());
    clock.advanceToHour(8, { animate: false });
    const referral = takeReferral();
    const press = takePressItems();
    dayIndex += 1;
    card = null;
    beginDay(referral);
    tell(`You wake at eight, rested. ${dateLine()}.`);
    if (referral) tell(`By her mother’s arrangement, Miss ${referral.familyName} heads the list.`);
    for (const item of press) tell(`In the morning papers: ${item}`);
    duty();
  }

  function cardView() {
    if (!card) return null;
    switch (card.kind) {
      case 'appointment': return {
        kind: 'appointment',
        text: `${nameOf(card.appointment.patientId)} ${zone === 'consulting-office' ? 'has arrived for' : 'is waiting at your office for'} the ${formatHour(card.appointment.hours)} appointment.`,
        actions: [
          { type: 'choose', id: 'keep', label: zone === 'consulting-office' ? 'See them now' : 'Return to the office', minutes: travelMinutesBetween(zone, 'consulting-office') },
          { type: 'choose', id: 'cancel', label: 'Cancel the appointment' },
        ],
      };
      case 'caller': return {
        kind: 'caller',
        text: card.caller.request.text(card.caller.identity),
        actions: ['sell', 'advise', 'refuse'].map((id) => ({
          type: 'choose', id, label: card.caller.request[id].label,
          ...(card.caller.request[id].price ? { priceCents: card.caller.request[id].price } : {}),
        })),
      };
      case 'messenger': return {
        kind: 'messenger',
        text: `A boy runs up: “You the doctor? There’s a caller at your door — ${card.caller.identity.name}, ${card.caller.request.gist}.”`,
        actions: [
          { type: 'choose', id: 'go', label: 'Go at once', minutes: travelMinutesBetween(zone, 'consulting-office') },
          { type: 'choose', id: 'tip', label: 'Tip the boy a nickel and go', priceCents: -5 },
          { type: 'choose', id: 'wait', label: 'Let them wait' },
        ],
      };
      case 'event': return {
        kind: 'street-event',
        heading: card.entry.event.heading,
        text: card.entry.event.text(card.entry.identity),
        actions: card.entry.event.choices.map((choice) => ({
          type: 'choose', id: choice.id, label: choice.label,
          ...(choice.effects?.cents ? { priceCents: choice.effects.cents } : {}),
        })),
      };
      case 'sleep': return {
        kind: 'evening',
        text: `${formatHour(Math.floor(hours()))}. The day has little left in it.`,
        actions: [
          { type: 'choose', id: 'retire', label: 'Retire for the night' },
          { type: 'choose', id: 'stay', label: 'Not yet' },
        ],
      };
      case 'summary': return {
        kind: 'day-summary',
        text: card.reason === 'midnight' ? 'Midnight. You can stand no more.' : 'You retire for the night.',
        summary: daySummary(),
        actions: [{ type: 'sleep' }],
      };
      default: return null;
    }
  }

  function effectsLine({ cents = 0, standing = 0, minutes = 0 } = {}) {
    const parts = [];
    if (cents > 0) parts.push(`${formatPrice(cents)} received`);
    if (cents < 0) parts.push(`${formatPrice(-cents)} paid`);
    if (standing > 0) parts.push('your standing rises');
    if (standing < 0) parts.push('your standing suffers');
    if (minutes) parts.push(`${minutes} minutes given`);
    return parts.length ? ` (${parts.join('; ')})` : '';
  }

  function choose(id) {
    switch (card.kind) {
      case 'appointment': {
        const { patientId } = card.appointment;
        if (id === 'keep') return seePatient(patients.find((item) => item.id === patientId));
        if (id !== 'cancel') return 'choose keep or cancel';
        schedule.markForfeited(patientId);
        adjustStanding(-7, `turned ${nameOf(patientId)} away unseen`);
        tell(`${nameOf(patientId)} is sent away. Word of it will travel.`);
        card = null;
        return null;
      }
      case 'caller': {
        const { caller } = card;
        if (!['sell', 'advise', 'refuse'].includes(id)) return 'choose sell, advise, or refuse';
        const result = callerDay.resolve(caller, id);
        card = null;
        if (!result) return null;
        if (result.price > 0) addCents(result.price);
        if (result.standing) adjustStanding(result.standing, `${caller.identity.name}, at the door`);
        tell(`${result.note}${effectsLine({ cents: result.price, standing: result.standing })}`);
        return null;
      }
      case 'messenger': {
        const { caller } = card;
        if (id === 'wait') {
          card = null;
          tell('The boy shrugs and is off. The caller can wait, or not.');
          return null;
        }
        if (!['go', 'tip'].includes(id)) return 'choose go, tip, or wait';
        if (id === 'tip') spendCents(5);
        callerDay.holdForArrival(caller);
        card = null;
        moveTo('consulting-office');
        // Something more pressing may have claimed the doctor on the way.
        if (!card) card = { kind: 'caller', caller };
        return null;
      }
      case 'event': {
        const { entry } = card;
        const choice = eventDay.resolve(entry, id);
        if (!choice) return 'no such choice on this card';
        card = null;
        const { cents = 0, standing = 0, minutes = 0 } = choice.effects || {};
        if (cents > 0) addCents(cents);
        if (cents < 0) spendCents(-cents);
        if (standing) adjustStanding(standing, `${entry.identity.name}, in the street`);
        if (choice.press) recordPressItem(choice.press(entry.identity));
        if (choice.referral) recordReferral(entry.identity);
        tell(`${choice.note}${effectsLine(choice.effects)}`);
        jump(minutes);
        return null;
      }
      case 'sleep':
        if (!['retire', 'stay'].includes(id)) return 'choose retire or stay';
        card = id === 'retire' ? { kind: 'summary', reason: 'retired' } : null;
        return null;
      default: return 'nothing to choose';
    }
  }

  function freeActions() {
    const actions = [];
    const now = hours();
    schedule.list().filter((item) => ['pending', 'held'].includes(item.status)).forEach((item) => {
      actions.push({
        type: 'see-patient', id: item.patientId, patient: nameOf(item.patientId),
        appointment: formatHour(item.hours),
        minutes: travelMinutesBetween(zone, 'consulting-office'),
      });
    });
    for (const destination of FAST_TRAVEL_DESTINATIONS) {
      if (destination.id === zone) continue;
      actions.push({
        type: 'travel', to: destination.id, label: destination.label,
        minutes: travelMinutesBetween(zone, destination.id),
      });
    }
    if (zone === 'central-park') {
      for (const activity of ACTIVITIES) {
        actions.push({ type: 'park', id: activity.id, label: activity.label, minutes: activity.minutes });
      }
    }
    if (zone === 'cattell-lab' && getErrand().status === 'testing') {
      for (const instrument of INSTRUMENTS.filter((id) => !getErrand().tested.includes(id))) {
        actions.push({ type: 'measure', instrument, minutes: MEASURE_MINUTES });
      }
    }
    actions.push({ type: 'wait', minutes: '<1 to 120>' });
    if (schedule.stats().pending === 0 || now >= SLEEP_FROM_HOUR) actions.push({ type: 'retire' });
    return actions;
  }

  function header() {
    const player = getPlayer();
    return {
      day: dayIndex + 1,
      date: dateLine(),
      time: formatHour(hours()),
      place: zoneLabel(zone),
      purse: formatPrice(getPurseCents()),
      standing: Math.round(getStanding()),
      nerves: `${neurastheniaCondition(player.neurasthenia)} (strain ${Math.round(player.neurasthenia)} of 100)`,
    };
  }

  // `inner` is the consultation's own observation when an action just ran
  // there; asking it again would drop one-time content such as a shelf listing.
  function observe(error = null, inner = null) {
    const said = news;
    news = [];
    if (consult) {
      inner ??= consult.observe();
      return {
        ...inner,
        mode: 'day-consultation',
        day: header(),
        ...(said.length ? { news: said } : {}),
        actions: inner.stage === 'finished' || !inner.actions.length
          ? [{ type: 'finish' }, { type: 'finish', to: 'waiting-room', minutes: 2 }, { type: 'finish', to: 'street', minutes: 2 }]
          : inner.actions.map((action) => (action.type === 'finish'
            ? [action, { type: 'finish', to: 'waiting-room', minutes: 2 }, { type: 'finish', to: 'street', minutes: 2 }]
            : [action])).flat(),
        ...(error ? { error } : {}),
      };
    }
    const view = cardView();
    const errand = getErrand();
    return {
      mode: 'day',
      ...header(),
      schedule: schedule.list().map((item) => ({
        time: formatHour(item.hours), patient: nameOf(item.patientId), status: item.status,
      })),
      ...(errand.status === 'deliver' ? { errand: 'A parcel to deliver to Professor Cattell’s laboratory.' }
        : errand.status === 'testing' ? { errand: `Take a measurement at two instruments in the laboratory (${errand.tested.length} done).` } : {}),
      ...(said.length ? { news: said } : {}),
      ...(view ? { card: { kind: view.kind, heading: view.heading, text: view.text, summary: view.summary } } : {}),
      actions: view ? view.actions : freeActions(),
      ...(error ? { error } : {}),
    };
  }

  async function act(action) {
    if (!action || typeof action.type !== 'string') return observe('an action is an object with a type');
    if (action.type === 'observe') return observe();
    const record = { day: dayIndex + 1, time: formatHour(hours()), action };
    steps.push(record);
    let error = null;
    let inner = null;

    if (consult) {
      if (action.type === 'finish') {
        if (!consult.done()) await consult.act({ type: 'finish' });
        if (consult.done()) closeConsultation(action.to);
        else error = 'the visit is not over';
      } else {
        inner = await consult.act(action);
        error = inner.error || null;
        settleResult();
      }
    } else if (card) {
      if (card.kind === 'summary') {
        if (action.type === 'sleep') sleep();
        else error = 'the day is over; sleep';
      } else if (action.type === 'choose') error = choose(action.id);
      else error = 'answer the card in front of you first';
    } else {
      switch (action.type) {
        case 'see-patient': {
          const patient = patients.find((item) => item.id === action.id);
          const appointment = schedule.list().find((item) => item.patientId === action.id);
          if (!patient || !['pending', 'held'].includes(appointment?.status)) error = 'no such patient waiting';
          else error = seePatient(patient);
          break;
        }
        case 'travel':
          if (!FAST_TRAVEL_DESTINATIONS.some((item) => item.id === action.to) || action.to === zone) error = 'no such destination';
          else moveTo(action.to);
          break;
        case 'wait': {
          const minutes = Math.trunc(Number(action.minutes));
          if (!(minutes >= 1 && minutes <= 120)) error = 'wait 1 to 120 minutes';
          else pass(minutes);
          break;
        }
        case 'park': {
          const activity = ACTIVITIES.find((item) => item.id === action.id);
          if (zone !== 'central-park' || !activity) { error = 'no such activity here'; break; }
          const outcome = recoverFromActivity({
            activityId: activity.id, neurasthenia: activity.neurasthenia, label: activity.label,
          });
          tell(outcome.event ? `${activity.label}: your nerves ease.`
            : outcome.reason === 'cooldown' ? `${activity.label}: too soon to help again.` : `${activity.label}: no change.`);
          pass(activity.minutes);
          break;
        }
        case 'measure':
          if (zone !== 'cattell-lab' || getErrand().status !== 'testing' || !INSTRUMENTS.includes(action.instrument)) {
            error = 'no measurement to take here';
            break;
          }
          tell(instrumentTested(action.instrument)
            ? 'Your figures are on the slate. Cattell will hear of this favourably.'
            : 'One set of figures noted. The note asked for two apparatus.');
          pass(MEASURE_MINUTES);
          break;
        case 'retire':
          if (schedule.stats().pending !== 0 && hours() < SLEEP_FROM_HOUR) error = 'patients are still expected';
          else card = { kind: 'summary', reason: 'retired' };
          break;
        default: error = `unknown action ${action.type}`;
      }
    }
    if (error) record.error = error;
    return observe(error, consult ? inner : null);
  }

  return {
    observe: () => observe(),
    act,
    // A day run has no natural end; the driver decides how many days to play.
    done: () => false,
    daysCompleted: () => days.length,
    log: () => ({
      seed,
      authored,
      hints,
      days: [...days, { ...daySummary(), unfinished: true }],
      final: header(),
      steps,
      consultations: [...consultations, ...(consult ? [{ day: dayIndex + 1, unfinished: true, ...consult.log() }] : [])],
    }),
  };
}

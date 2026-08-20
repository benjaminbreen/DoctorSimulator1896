// The consultation proper, built to the introspection mockups: the patient's
// words sit in a framed stage at the foot of the screen, thought cards weigh
// them, speech cards answer them, and a consultation rail waits on the right.
// The engine still decides everything; this component only asks and shows.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildCaseNotebook } from './caseNotebook.js';
import { consultationTiming } from './engine.js';
import { renderJamesLetter } from './lunaRenderer.js';
import TreatmentShelf from './TreatmentShelf.jsx';
import {
  availableDiagnoses,
  availableDialoguePrompts,
  availableExaminations,
  classifyCustomThought,
} from './patientLogic.js';
import {
  addPatientNote,
  deletePatientNote,
  editPatientNote,
  loadPatientNotes,
  savePatientNotes,
} from './patientNotes.js';
import { notice } from '../world/notices.js';
import { Vector3 } from 'three';
import { gameDebug } from '../debug.js';
import { getExamAnchors } from './examAnchors.js';
import notebookBackgroundUrl from './assets/case-notebook-background.webp';
import './consultation.css';

/* ---------------- icons ---------------- */

function SpeechIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h14a1.6 1.6 0 0 1 1.6 1.6v7.2a1.6 1.6 0 0 1-1.6 1.6h-7.3L7 18.6v-3.2H4a1.6 1.6 0 0 1-1.6-1.6V6.6A1.6 1.6 0 0 1 4 5Z" />
      <circle cx="7.4" cy="10.2" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="11" cy="10.2" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10.2" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StethoscopeIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 3v5.2a3.6 3.6 0 0 0 7.2 0V3" />
      <path d="M8.6 12v2.6a4.4 4.4 0 0 0 8.8 0v-1.5" />
      <circle cx="17.4" cy="10.6" r="2" />
    </svg>
  );
}

function RuminateIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.7 11c3.5-5 13.1-5 16.6 0-3.5 5-13.1 5-16.6 0Z" />
      <circle cx="11" cy="11" r="3.1" />
      <path d="M11 3V1.8M5.8 4.6 4.9 3.5M16.2 4.6l.9-1.1" />
    </svg>
  );
}

function BottleIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2.6h4M9.6 2.6v3.1L7.6 8.2a2 2 0 0 0-.4 1.2v8.2a1.6 1.6 0 0 0 1.6 1.6h4.4a1.6 1.6 0 0 0 1.6-1.6V9.4a2 2 0 0 0-.4-1.2l-2-2.5V2.6" />
      <path d="M7.2 12.4h7.6" />
    </svg>
  );
}

function PencilIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 14.8.7-3.4L13 3.1a1.7 1.7 0 0 1 2.4 0l1.5 1.5a1.7 1.7 0 0 1 0 2.4l-8.3 8.3-3.4.7Z" />
      <path d="m12 4.1 3.9 3.9M4.7 11.4l3.9 3.9" />
    </svg>
  );
}

function TrashIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 5.4h13M7.3 5.4V3.1h5.4v2.3M5.5 5.4l.7 11.1h7.6l.7-11.1" />
      <path d="M8.2 8.2v5.5M11.8 8.2v5.5" />
    </svg>
  );
}

// The ringed eye that hangs beneath a weighed thought: a circle with three
// rays at the crown, the eye itself in gold within.
function EyeEmblem() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
      <g className="gcon-eye-ring" fill="none" strokeWidth="1.3" strokeLinecap="round">
        <circle cx="26" cy="29" r="17" />
        <path d="M26 10V5M15.1 13.4 12.2 9.3M36.9 13.4 39.8 9.3" />
      </g>
      <g className="gcon-eye-iris" fill="none" strokeWidth="1.3" strokeLinejoin="round">
        <path d="M14.5 29c4.4-6.2 18.6-6.2 23 0-4.4 6.2-18.6 6.2-23 0Z" />
        <circle cx="26" cy="29" r="4" />
      </g>
      <circle className="gcon-eye-spark" cx="24.4" cy="27.6" r="1.2" stroke="none" />
    </svg>
  );
}

// Two leaves meeting at a diamond: the knot that sits on every divider.
function Knot() {
  return (
    <svg width="38" height="12" viewBox="0 0 38 12" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        <path d="M1 6c5.5-3.8 9.5-3.8 13 0-3.5 3.8-7.5 3.8-13 0Z" opacity="0.7" />
        <path d="M37 6c-5.5-3.8-9.5-3.8-13 0 3.5 3.8 7.5 3.8 13 0Z" opacity="0.7" />
      </g>
      <path d="M19 2.6 21.9 6 19 9.4 16.1 6Z" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Ornament() {
  return (
    <div className="gcon-ornament" aria-hidden="true">
      <Knot />
    </div>
  );
}

/* ---------------- examination reading ---------------- */

// Card rows per side, in viewport percent from the top.
const EXAM_SLOT_TOPS = { left: [14, 46], right: [18, 50] };

// Which published bone anchor a finding points at. Handedness is read from
// the fact itself, so a left-hand sign points at her actual left hand.
function examRegion(fact) {
  const text = `${fact.id} ${fact.label}`.toLowerCase();
  if (/thyroid|neck/.test(text)) return 'neck';
  if (/pupil|eye|head|face|tongue|throat|gaze|gum|mouth|gingiv/.test(text)) return 'head';
  if (/abdomen|abdominal|navel|stomach/.test(text)) return 'abdomen';
  if (/left/.test(text) && /hand|sensation|touch|grip|wrist/.test(text)) return 'leftHand';
  if (/tremor|hand|grip|writ|sensation|touch|reflex|strength|nail|wrist/.test(text)) return 'rightHand';
  return 'chest';
}

// From the doctor's chair her left hand reads on screen right.
const REGION_SIDE = {
  leftHand: 'right', rightHand: 'left', head: 'left', neck: 'left', chest: 'right', abdomen: 'right',
};

function markedMeasurement(text) {
  return String(text).split(/(\b\d+(?:[–-]\d+)?\b)/g).map((part, index) => (
    /^\d/.test(part) ? <strong key={`${part}-${index}`}>{part}</strong> : part
  ));
}

// Observed findings arrayed around the patient. The anchors are real bone
// positions published by the actor, projected each frame, so the lines stay
// on the body while the camera orbits and zooms.
function ExamAnnotations({ facts }) {
  const pathRefs = useRef([]);
  const dotRefs = useRef([]);
  const scratch = useRef(new Vector3());

  const cards = useMemo(() => {
    const used = { left: 0, right: 0 };
    return facts.map((fact) => {
      const region = examRegion(fact);
      let side = REGION_SIDE[region];
      if (used[side] >= EXAM_SLOT_TOPS[side].length) {
        side = side === 'left' ? 'right' : 'left';
      }
      const slotIndex = Math.min(used[side], EXAM_SLOT_TOPS[side].length - 1);
      used[side] += 1;
      return { fact, region, side, top: EXAM_SLOT_TOPS[side][slotIndex] };
    });
  }, [facts]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      const camera = gameDebug.camera;
      const anchors = getExamAnchors();
      cards.forEach((card, index) => {
        const path = pathRefs.current[index];
        const dot = dotRefs.current[index];
        if (!path || !dot) return;
        const world = anchors?.[card.region];
        if (!camera || !world) {
          path.style.visibility = 'hidden';
          dot.style.visibility = 'hidden';
          return;
        }
        const point = scratch.current.set(world[0], world[1], world[2]).project(camera);
        const hidden = point.z > 1 || point.z < -1;
        path.style.visibility = hidden ? 'hidden' : '';
        dot.style.visibility = hidden ? 'hidden' : '';
        if (hidden) return;
        const x = (point.x * 0.5 + 0.5) * 100;
        const y = (-point.y * 0.5 + 0.5) * 100;
        const startX = card.side === 'left' ? 27 : 73;
        const startY = card.top + 7;
        const bendX = startX + (x - startX) * 0.56;
        path.setAttribute('d', `M ${startX} ${startY} C ${bendX} ${startY}, ${bendX} ${y}, ${x} ${y}`);
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
      });
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [cards]);

  return (
    <div className="gcon-exam-layer" aria-label="Observed findings">
      <svg className="gcon-exam-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {cards.map((card, index) => {
          const latest = index === cards.length - 1;
          return (
          <g key={card.fact.id} className={latest ? 'is-latest' : ''}>
            <path
              ref={(node) => { pathRefs.current[index] = node; }}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${0.25 + index * 0.2}s` }}
            />
            <circle
              ref={(node) => { dotRefs.current[index] = node; }}
              r="0.45"
              style={{ animationDelay: `${0.75 + index * 0.2}s` }}
            />
          </g>
          );
        })}
      </svg>
      {cards.map((card, index) => (
        <article
          key={card.fact.id}
          className={`gcon-exam-card gcon-exam-card--${card.side}${index === cards.length - 1 ? ' is-latest' : ''}`}
          style={{ top: `${card.top}%`, animationDelay: `${index * 0.2}s` }}
        >
          <h3>{card.fact.label}</h3>
          <p>{markedMeasurement(card.fact.value)}</p>
        </article>
      ))}
    </div>
  );
}

/* ---------------- small helpers ---------------- */

function latestUtterance(history) {
  for (let i = (history?.length ?? 0) - 1; i >= 0; i -= 1) {
    const event = history[i];
    if (event.kind === 'opening' || event.kind === 'speech') {
      return { text: event.dialogue, observation: false };
    }
    if (event.kind === 'examination') return { text: event.reply, observation: true };
  }
  return null;
}

// Words that would unlock a withheld fact glow gold, like the mockup's
// emphasized "weight": the clue words are the ones worth pursuing.
function markedQuote(text, tokens) {
  if (!tokens.length) return text;
  return String(text).split(/(\s+)/).map((chunk, index) => {
    const word = chunk.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    const marked = word.length > 2 && tokens.some((token) => word.includes(token));
    return marked ? <em key={index} className="gcon-mark">{chunk}</em> : chunk;
  });
}

function possessive(profile) {
  const sex = profile?.identity?.sex;
  return sex === 'female' ? 'her' : sex === 'male' ? 'his' : 'their';
}

function money(cents) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

// The patient holds an opinion, not a score. The number stays in the aria
// label and the dev panel; the words go in the panel title.
function leavesPhrase(value) {
  if (value >= 8.5) return 'leaves grateful';
  if (value >= 7) return 'leaves satisfied';
  if (value >= 5.5) return 'leaves fairly content';
  if (value >= 4.5) return 'leaves with reservations';
  if (value >= 3) return 'leaves unconvinced';
  return 'leaves feeling ill-used';
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

// The fee is the payoff of the visit, so it counts up as its row arrives
// rather than sitting there pre-decided.
function useCountUp(target, delayMs, durationMs = 640) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      return undefined;
    }
    let raf = 0;
    let start = 0;
    const step = (now) => {
      if (!start) start = now;
      const t = Math.min(1, Math.max(0, (now - start - delayMs) / durationMs));
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, delayMs, durationMs, reduced]);
  return value;
}

// The letter arrives as one signed text; the signature is set apart so it can
// be drawn in a hand rather than the body face.
function splitSignature(text) {
  const match = String(text || '').match(/^([\s\S]*?)[\s,–—]*((?:Yours[^.]*,\s*)?W(?:m|illiam)\.?\s+James\.?)\s*$/);
  return match ? { body: match[1].trim(), signature: match[2] } : { body: text, signature: '' };
}

function ResultModal({
  result,
  patient,
  consultState,
  patientLabel,
  view,
  setView,
  onNextPatient,
  onWaitingRoom,
  onStreet,
}) {
  const immediate = result?.immediate || {};
  const summary = result?.summary || {};
  const satisfaction = Math.max(0, Math.min(10, immediate.satisfactionOutOfTen ?? (immediate.satisfaction || 0) / 10));
  const satisfactionBand = satisfaction >= 7 ? 'high' : satisfaction >= 4.5 ? 'mid' : 'low';
  const month = result?.oneMonth || {};
  const fee = useCountUp(Number(immediate.paymentCents) || 0, 420);
  // The month report is a look ahead, so it costs a deliberate click rather
  // than sitting in the header as an equal tab. A real time gate belongs at
  // end of run, once the game advances a month.
  const [seal, setSeal] = useState('sealed');
  const primaryRef = useRef(null);
  const breakTimer = useRef(null);

  // James writes while the player reads the immediate view; by the time the
  // month is unsealed the letter has usually arrived. The templated letter in
  // the result is the fallback when the route is down.
  const [james, setJames] = useState({ status: 'writing', text: '' });
  useEffect(() => {
    let live = true;
    renderJamesLetter(patient, consultState, result).then((letter) => {
      if (!live) return;
      setJames({ status: 'ready', text: letter || result?.james?.letter || '' });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const openMonth = () => {
    if (seal === 'open') return setView('month');
    if (seal === 'breaking') return undefined;
    setSeal('breaking');
    breakTimer.current = setTimeout(() => {
      setSeal('open');
      setView('month');
    }, 380);
    return undefined;
  };
  useEffect(() => () => clearTimeout(breakTimer.current), []);

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Enter on a focused button is that button's own business.
      if (event.key === 'Enter' && event.target?.tagName === 'BUTTON') return;
      const exit = { 1: onNextPatient, 2: onWaitingRoom, 3: onStreet, Enter: onNextPatient }[event.key];
      if (!exit) return;
      event.preventDefault();
      exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNextPatient, onWaitingRoom, onStreet]);

  if (!result) return null;
  const outcomeLabel = {
    improved: 'Improved',
    'little-change': 'Little change',
    worse: 'Worsened',
    harmed: 'Harmed',
  }[month.band] || 'Outcome recorded';
  return (
    <div className="gcon-result-backdrop" role="presentation">
      <section className="gcon-result-modal gcon-frame gcon-paper" role="dialog" aria-modal="true" aria-labelledby="gcon-result-title">
        <header className="gcon-result-header">
          <p className="gcon-eyebrow">{view === 'immediate' ? 'Consultation Complete' : 'One Month Later'}</p>
          <h2 id="gcon-result-title">{view === 'immediate' ? `${patientLabel} ${leavesPhrase(satisfaction)}` : 'What Followed'}</h2>
          <div className="gcon-result-tabs" role="tablist" aria-label="Consultation outcome views">
            <button type="button" role="tab" aria-selected={view === 'immediate'} className={view === 'immediate' ? 'is-active' : ''} onClick={() => setView('immediate')}>
              Patient reaction
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'month'}
              className={`${view === 'month' ? 'is-active' : ''} ${seal === 'open' ? '' : `is-sealed is-${seal}`}`}
              title={seal === 'open' ? undefined : 'Sealed. Opening it reads a month ahead.'}
              onClick={openMonth}
            >
              {seal === 'open' ? null : <i className="gcon-seal" aria-hidden="true" />}
              One month later
            </button>
          </div>
        </header>
        <Ornament />
        <div className="gcon-result-body">
          {view === 'immediate' ? (
            <div className="gcon-reveal" key="immediate">
              <blockquote className="gcon-result-departure" style={{ '--step': 0 }}>{immediate.departureLine}</blockquote>
              <p className="gcon-result-narrative" style={{ '--step': 1 }}>{immediate.narrative}</p>
              <div className="gcon-result-payment" style={{ '--step': 2 }}>
                <span>Fee received</span>
                <strong>{money(fee)}</strong>
                <small>{immediate.paymentLabel}</small>
              </div>
              <div className="gcon-result-satisfaction" style={{ '--step': 3 }}>
                <div className="gcon-result-verdict">
                  <span>How the visit was received</span>
                </div>
                <div
                  className={`gcon-result-bar is-${satisfactionBand}`}
                  role="img"
                  aria-label={`Patient satisfaction ${satisfaction.toFixed(1)} out of 10`}
                >
                  <i style={{ width: `${satisfaction * 10}%` }} />
                </div>
              </div>
              <div className="gcon-result-stats" style={{ '--step': 4 }}>
                <div><strong>{summary.questionsAsked ?? 0}</strong><span>Questions asked</span></div>
                <div><strong>{summary.examinationsPerformed ?? 0}</strong><span>Examinations</span></div>
                <div><strong>{summary.minutesUsed ?? 0}</strong><span>Minutes used</span></div>
              </div>
              <div className="gcon-result-feedback" style={{ '--step': 5 }}>
                {result.feedback?.strengths?.[0] && <p><strong>What went well</strong>{result.feedback.strengths[0]}</p>}
                {result.feedback?.improvements?.[0] && <p><strong>What fell short</strong>{result.feedback.improvements[0]}</p>}
              </div>
            </div>
          ) : (
            <div className="gcon-reveal" key="month">
              <div className={`gcon-outcome-stamp is-${month.band || 'neutral'}`} style={{ '--step': 0 }}>{outcomeLabel}</div>
              <p className="gcon-result-narrative" style={{ '--step': 1 }}>{month.narrative}</p>
              <article className="gcon-james" style={{ '--step': 2 }}>
                <header className="gcon-james-head">
                  <span>By the morning post · Cambridge, Mass.</span>
                  <h3>A letter from William James</h3>
                </header>
                {james.status === 'writing' ? (
                  <p className="gcon-james-waiting">The envelope is still sealed<i className="gcon-james-dots" aria-hidden="true" /></p>
                ) : (
                  <div className="gcon-james-page">
                    <p className="gcon-james-body">{splitSignature(james.text).body}</p>
                    {splitSignature(james.text).signature && (
                      <p className="gcon-james-signature">{splitSignature(james.text).signature}</p>
                    )}
                  </div>
                )}
                <small className="gcon-james-note">{result.james?.disclaimer}</small>
              </article>
              <details className="gcon-debrief" style={{ '--step': 3 }}>
                <summary>Modern debrief</summary>
                <p>{result.modernDebrief}</p>
              </details>
            </div>
          )}
        </div>
        <footer className="gcon-result-footer">
          <p>Where will you go now?</p>
          <div className="gcon-result-actions">
            <button type="button" className="is-primary" ref={primaryRef} onClick={onNextPatient}>
              <kbd>⏎</kbd><strong>Receive next patient</strong><span>Remain in the consulting room</span>
            </button>
            <button type="button" onClick={onWaitingRoom}>
              <kbd>2</kbd><strong>Go to waiting room</strong><span>Leave consultation mode</span>
            </button>
            <button type="button" onClick={onStreet}>
              <kbd>3</kbd><strong>Go out to the street</strong><span>Leave the practice</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

// Fallback prompts when a patient record carries none: one plain question per
// withheld fact (its label doubles as a release token), plus a reassurance.
function fallbackPrompts(patient) {
  const asks = patient.facts
    .filter((fact) => fact.disclosure === 'withheld')
    .slice(0, 3)
    .map((fact) => ({
      id: `ask-${fact.id}`,
      text: `May we speak of the ${fact.label.toLowerCase()}?`,
      stance: 'question',
    }));
  return [...asks, {
    id: 'reassure-plain',
    text: 'You may speak plainly here; nothing leaves this room.',
    stance: 'reassure',
  }];
}

/* ---------------- component ---------------- */

const RAIL_ICONS = { interview: SpeechIcon, examine: StethoscopeIcon, ruminate: RuminateIcon, treatment: BottleIcon };

export default function ConsultationView({
  runtime,
  onRegenerate,
  onDismissPatient,
  onNextPatient = () => runtime.reset(),
  onLeaveConsultation = () => runtime.reset(),
}) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.get, runtime.get);
  const patients = runtime.patients();
  const patient = patients.find((candidate) => candidate.id === state?.patientId) || null;

  // The opening rumination is required once. After that, Interview and
  // Examination continue until the player opens Ruminate deliberately.
  const [phase, setPhase] = useState('thought');
  const [cursor, setCursor] = useState(-1);
  const [bookOpen, setBookOpen] = useState(false);
  const [playerNotes, setPlayerNotes] = useState([]);
  const [noteEditor, setNoteEditor] = useState(null);
  const [errorNote, setErrorNote] = useState('');
  const [queueDismissed, setQueueDismissed] = useState(false);
  const [customSpeech, setCustomSpeech] = useState('');
  const [customThought, setCustomThought] = useState('');
  const [customThoughtOpen, setCustomThoughtOpen] = useState(false);
  const [resultView, setResultView] = useState('immediate');
  // The decision is two pages of one panel: name the diagnosis, then treat it.
  const [decisionStep, setDecisionStep] = useState('diagnosis');
  const [speechPending, setSpeechPending] = useState(false);
  const [previewMinutes, setPreviewMinutes] = useState(0);
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [freshNotebookEntryId, setFreshNotebookEntryId] = useState(null);
  const errorTimer = useRef(null);
  const noteInput = useRef(null);
  const notebookAutoRef = useRef({ patientId: null, entryId: null });

  const stage = state?.stage ?? null;
  const history = state?.history ?? [];
  const inquiryCount = useMemo(
    () => history.filter((event) => event.kind === 'speech' || event.kind === 'examination').length,
    [history],
  );

  // The Examine verb presents as a reading: room dimmed, chrome away,
  // findings annotated around the figure. Same engine state underneath.
  const examPresenting = stage === 'inquiry' && phase === 'exam';
  const examFacts = useMemo(() => {
    if (!examPresenting) return [];
    const byId = new Map();
    for (const event of history) {
      if (event.kind !== 'examination') continue;
      const list = event.facts?.length ? event.facts : (event.fact ? [event.fact] : []);
      for (const fact of list) byId.set(fact.id, fact);
    }
    return [...byId.values()].slice(-4);
  }, [history, examPresenting]);

  useEffect(() => {
    setPhase('thought');
    setBookOpen(false);
    setPlayerNotes(patient ? loadPatientNotes(patient) : []);
    setNoteEditor(null);
    setCustomSpeech('');
    setCustomThought('');
    setCustomThoughtOpen(false);
    setResultView('immediate');
    setDecisionStep('diagnosis');
    setSpeechPending(false);
    setPreviewMinutes(0);
    setShowAllDecisions(false);
  }, [state?.patientId, patient?.profile?.seed]);

  useEffect(() => {
    if (!noteEditor) return;
    noteInput.current?.focus();
    noteInput.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [noteEditor]);

  useEffect(() => setCursor(-1), [phase, stage, state?.mode, state?.patientId, decisionStep]);

  // Surface an engine rejection briefly, then let it go.
  const seenErrors = useRef(0);
  useEffect(() => {
    const count = state?.errors?.length ?? 0;
    if (count > seenErrors.current) {
      setErrorNote(state.errors[count - 1]);
      clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => setErrorNote(''), 4000);
    }
    seenErrors.current = count;
  }, [state?.errors]);
  useEffect(() => () => clearTimeout(errorTimer.current), []);

  /* ------- choice lists for the current view ------- */

  const interpretations = patient?.interpretations ?? [];
  const noted = new Set(state?.interpretationIds ?? []);
  const prompts = useMemo(
    () => (patient && state
      ? (patient.prompts?.length ? availableDialoguePrompts(patient, state) : fallbackPrompts(patient))
      : []),
    [patient, state],
  );
  const asked = useMemo(
    () => new Set(history.filter((event) => event.kind === 'speech').map((event) => event.promptId || event.input)),
    [history],
  );
  const examined = new Set(state?.observedFactIds ?? []);
  const examinations = useMemo(() => (patient && state ? availableExaminations(patient, state) : []), [patient, state]);
  const diagnoses = useMemo(() => (patient && state && !showAllDecisions ? availableDiagnoses(patient, state) : patient?.diagnoses || []), [patient, state, showAllDecisions]);
  const recordFacts = useMemo(
    () => (patient && state && stage === 'case-note'
      ? patient.facts.filter((fact) => state.disclosedFactIds.includes(fact.id))
      : []),
    [patient, state, stage],
  );
  const timing = patient && state ? consultationTiming(patient, state, previewMinutes) : null;
  const currentTiming = patient && state ? consultationTiming(patient, state) : null;
  const hasRuminated = noted.size > 0 || (state?.customInterpretations?.length ?? 0) > 0;
  const clueTokens = useMemo(() => {
    if (!patient || !state) return [];
    const known = new Set(state.disclosedFactIds);
    return patient.facts
      .filter((fact) => fact.disclosure === 'withheld' && !known.has(fact.id))
      .flatMap((fact) => fact.releaseOn || [])
      .map((token) => String(token).toLowerCase());
  }, [patient, state]);

  const speakPrompt = async (prompt) => {
    if (speechPending) return;
    setSpeechPending(true);
    try {
      await runtime.speak({
        text: prompt.text, stance: prompt.stance, promptId: prompt.id,
        responseTo: prompt.resolvesPendingResponseId || null,
      });
      const after = runtime.get();
      if (after?.stage === 'inquiry') setPhase('speech');
    } finally {
      setSpeechPending(false);
      setPreviewMinutes(0);
    }
  };

  const speakCustom = async () => {
    const text = customSpeech.trim();
    if (!text || speechPending) return;
    setSpeechPending(true);
    try {
      await runtime.speak({ text, stance: 'question', custom: true });
      setCustomSpeech('');
      const after = runtime.get();
      if (after?.stage === 'inquiry') setPhase('speech');
    } finally {
      setSpeechPending(false);
    }
  };

  const chooseThought = (item) => {
    runtime.dispatch({ type: 'interpret', id: item.id });
    if (item.nextMode === 'examination') toExamination();
    else toInterview();
  };

  const chooseCustomThought = () => {
    const text = customThought.trim();
    if (!text) return;
    runtime.dispatch({
      type: 'interpret-custom', text,
      classification: classifyCustomThought(patient, text),
    });
    setCustomThought('');
    setCustomThoughtOpen(false);
    setPhase('speech');
  };

  const runExam = (exam) => {
    runtime.dispatch({ type: 'examine', id: exam.id });
    setPreviewMinutes(0);
  };

  const toInterview = () => {
    if (stage === 'inquiry' && state.mode !== 'patient') runtime.dispatch({ type: 'set-mode', mode: 'patient' });
    setPhase('speech');
  };

  const toExamination = () => {
    if (stage === 'inquiry' && state.mode !== 'examination') runtime.dispatch({ type: 'set-mode', mode: 'examination' });
    setPhase('exam');
  };

  const toRumination = () => {
    if (stage !== 'inquiry') return;
    setCustomThoughtOpen(false);
    setPhase('thought');
  };

  const beginInquiry = () => {
    if (stage !== 'opening') return;
    runtime.dispatch({ type: 'begin-inquiry' });
    setPhase('thought');
  };

  const toDecision = () => {
    if (stage === 'inquiry') {
      runtime.dispatch({ type: 'begin-decision' });
      setDecisionStep(state.diagnosisId ? 'treatment' : 'diagnosis');
    }
  };

  const beginNote = (note = null) => {
    setNoteEditor({ id: note?.id ?? null, text: note?.text ?? '' });
  };

  const persistNotes = (notes) => {
    setPlayerNotes(notes);
    if (patient) savePatientNotes(patient, notes);
  };

  const commitNote = () => {
    if (!noteEditor || !noteEditor.text.trim()) return;
    const notes = noteEditor.id
      ? editPatientNote(playerNotes, noteEditor.id, noteEditor.text)
      : addPatientNote(playerNotes, noteEditor.text);
    persistNotes(notes);
    setNoteEditor(null);
  };

  const removeNote = (id) => {
    persistNotes(deletePatientNote(playerNotes, id));
    if (noteEditor?.id === id) setNoteEditor(null);
  };

  const noteKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setNoteEditor(null);
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitNote();
    }
  };

  const queueVisible = (!state || !patient) && !queueDismissed;

  const dismissQueue = () => {
    setQueueDismissed(true);
    onDismissPatient?.();
  };

  // Whether the consultation can still be broken off by the doctor.
  const canEnd = Boolean(patient) && (stage === 'opening' || stage === 'inquiry' || stage === 'decision' || stage === 'case-note');

  const endEarly = () => {
    if (!canEnd) return;
    const name = patient.label;
    // Publish the closed state before clearing the runtime so the casebook can
    // finish the open visit rather than leaving it in progress.
    runtime.dispatch({ type: 'end-early' });
    runtime.reset();
    setQueueDismissed(true);
    onDismissPatient?.();
    notice('You press a hand to your brow and beg pardon; feeling indisposed, you bring the consultation to an early close.', {
      tone: 'plain',
      seconds: 7,
      detail: `${name} is invited to return another day.`,
    });
  };

  /* ------- the one keyboard map: arrows rove, return commits ------- */

  const nav = { count: 0, cols: 1, select: () => {} };
  if (queueVisible) {
    nav.count = patients.length;
    nav.cols = patients.length || 1;
    nav.select = (index) => runtime.start(patients[index].id);
  } else if (stage === 'opening') {
    nav.count = 1;
    nav.select = beginInquiry;
  } else if (stage === 'inquiry' && phase === 'thought') {
    nav.count = interpretations.length;
    nav.cols = interpretations.length || 1;
    nav.select = (index) => chooseThought(interpretations[index]);
  } else if (stage === 'inquiry' && phase === 'speech') {
    nav.count = prompts.length;
    nav.cols = 2;
    nav.select = (index) => speakPrompt(prompts[index]);
  } else if (stage === 'inquiry' && phase === 'exam') {
    nav.count = examinations.length;
    nav.cols = 2;
    nav.select = (index) => runExam(examinations[index]);
  } else if (stage === 'decision' && decisionStep === 'diagnosis') {
    const pool = diagnoses;
    nav.count = pool.length;
    nav.cols = pool.length || 1;
    nav.select = (index) => {
      runtime.dispatch({ type: 'select-diagnosis', id: diagnoses[index].id });
      setDecisionStep('treatment');
    };
    nav.commit = () => { if (state.diagnosisId) setDecisionStep('treatment'); };
  } else if (stage === 'decision') {
    nav.commit = () => {
      if (state.diagnosisId && state.treatmentIds?.length > 0) runtime.dispatch({ type: 'begin-case-note' });
    };
  } else if (stage === 'case-note') {
    nav.count = recordFacts.length;
    nav.cols = 3;
    nav.select = (index) => runtime.dispatch({ type: 'select-record-fact', id: recordFacts[index].id });
    // Enter always signs here — a hovered card must not swallow it. The roved
    // card toggles with Space instead.
    nav.enterCommits = true;
    nav.commit = () => {
      const minimum = patient.caseNote?.minimumEvidenceSelections ?? 0;
      if ((state.caseRecordFactIds || []).length >= minimum) runtime.dispatch({ type: 'submit-case-note' });
    };
  }

  const navRef = useRef(nav);
  navRef.current = {
    ...nav, cursor, bookOpen, canEnd, endEarly, queueVisible, dismissQueue,
    examPresenting, exitExam: toInterview,
  };

  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      const current = navRef.current;

      if (event.code === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        setBookOpen((open) => !open);
        return;
      }
      if (event.code === 'Escape') {
        if (current.bookOpen) {
          event.preventDefault();
          setBookOpen(false);
          return;
        }
        if (current.examPresenting) {
          // In the reading, Escape steps back to the interview rather than
          // ending the consultation.
          event.preventDefault();
          event.stopPropagation();
          current.exitExam();
          return;
        }
        if (current.canEnd) {
          event.preventDefault();
          event.stopPropagation();
          current.endEarly();
          return;
        }
        if (current.queueVisible) {
          event.preventDefault();
          event.stopPropagation();
          current.dismissQueue();
          return;
        }
      }
      if (current.bookOpen) return;
      // Enter commits the stage (sign, advance) even when nothing is roved;
      // a focused button keeps its own Enter.
      const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
      if (isEnter && event.target?.tagName !== 'BUTTON') {
        const commits = current.commit && (current.enterCommits || current.cursor < 0);
        if (commits) {
          event.preventDefault();
          event.stopPropagation();
          current.commit();
          return;
        }
      }
      if (!current.count) return;

      const step = (delta) => {
        event.preventDefault();
        event.stopPropagation();
        setCursor((previous) => {
          if (previous < 0) return delta > 0 ? 0 : current.count - 1;
          return ((previous + delta) % current.count + current.count) % current.count;
        });
      };

      if (event.code === 'ArrowRight') step(1);
      else if (event.code === 'ArrowLeft') step(-1);
      else if (event.code === 'ArrowDown' && current.count > current.cols) step(current.cols);
      else if (event.code === 'ArrowUp' && current.count > current.cols) step(-current.cols);
      else if (isEnter && current.cursor >= 0) {
        event.preventDefault();
        event.stopPropagation();
        current.select(current.cursor);
      } else if (event.code === 'Space' && current.enterCommits && current.cursor >= 0) {
        event.preventDefault();
        event.stopPropagation();
        current.select(current.cursor);
      }
    };
    // Capture phase, so a roving arrow key never doubles as a movement key.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  /* ------- pieces ------- */

  const utterance = latestUtterance(history);
  const notebook = patient && state ? buildCaseNotebook(patient, state) : null;

  // New clinical entries mark the notebook without interrupting play.
  useEffect(() => {
    const patientId = patient?.id || null;
    const entryId = notebook?.latestEntryId || null;
    const previous = notebookAutoRef.current;
    if (previous.patientId !== patientId) {
      notebookAutoRef.current = { patientId, entryId };
      setFreshNotebookEntryId(null);
      return;
    }
    if (entryId && entryId !== previous.entryId) {
      setFreshNotebookEntryId(entryId);
    }
    notebookAutoRef.current = { patientId, entryId };
  }, [patient?.id, notebook?.latestEntryId]);

  const railItems = patient && state ? [
    {
      id: 'interview',
      title: 'Interview',
      sub: `Ask about ${possessive(patient.profile)} symptoms`,
      active: stage === 'inquiry' && phase === 'speech' && state.mode === 'patient',
      disabled: stage !== 'inquiry' || !hasRuminated,
      act: toInterview,
    },
    {
      id: 'examine',
      title: 'Examine',
      sub: 'Physical assessment',
      active: stage === 'inquiry' && phase === 'exam',
      disabled: stage !== 'inquiry' || !hasRuminated || Boolean(state.pendingResponseId),
      act: toExamination,
    },
    {
      id: 'ruminate',
      title: 'Ruminate',
      sub: 'Consider what the evidence means',
      active: stage === 'inquiry' && phase === 'thought',
      disabled: stage !== 'inquiry' || Boolean(state.pendingResponseId),
      act: toRumination,
    },
    {
      id: 'treatment',
      title: 'Consider Treatment',
      sub: stage === 'inquiry' && inquiryCount === 0 ? 'Speak with the patient first' : 'Plan next steps',
      active: stage === 'decision' || stage === 'case-note',
      disabled: stage !== 'inquiry' || inquiryCount === 0 || Boolean(state.pendingResponseId),
      act: toDecision,
    },
  ] : [];

  const cardMouse = (index) => ({ onMouseEnter: () => setCursor(index) });

  const renderStage = () => {
    // No consultation running: the morning list.
    if (!state || !patient) {
      return (
        <>
          <p className="gcon-eyebrow">Patient Queue</p>
          <blockquote className="gcon-quote gcon-quote--observation">Whom will you receive?</blockquote>
          <Ornament />
          <div className="gcon-options gcon-options--queue">
            {patients.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                className={`gcon-card gcon-card--thought${cursor === index ? ' is-hot' : ''}`}
                {...cardMouse(index)}
                onClick={() => runtime.start(candidate.id)}
              >
                {candidate.label}
                <span className="gcon-card-sub">
                  Aged {candidate.profile.identity.age} · {candidate.profile.social.occupation || candidate.profile.social.householdPosition}
                </span>
                <span className="gcon-eye" aria-hidden="true"><EyeEmblem /></span>
              </button>
            ))}
          </div>
          <footer className="gcon-hint">
            <span>
              <button type="button" className="gcon-hint-link" onClick={onRegenerate}>Prepare a different morning list</button>
              {' or '}
              <button type="button" className="gcon-hint-link" onClick={dismissQueue}>refuse to see patients</button>
            </span>
          </footer>
        </>
      );
    }

    if (stage === 'opening') {
      return (
        <div className="gcon-arrival">
          <p className="gcon-eyebrow">{patient.label}</p>
          <p className="gcon-arrival-description">{patient.opening.behavior}</p>
          <blockquote className="gcon-quote">{patient.opening.dialogue}</blockquote>
          <Ornament />
          <footer className="gcon-hint gcon-hint--arrival">
            <button type="button" className="gcon-continue" onClick={beginInquiry}>Continue</button>
          </footer>
        </div>
      );
    }

    if (stage === 'inquiry' && currentTiming?.deadlineReached && !state.pendingResponseId) {
      return (
        <div className="gcon-deadline">
          <p className="gcon-eyebrow">The Appointment Has Ended</p>
          <h2>The next patient is waiting.</h2>
          <p>You have enough time for a conclusion, or you may deliberately accept the cost of delay.</p>
          <div className="gcon-deadline-actions">
            <button type="button" onClick={() => runtime.dispatch({ type: 'begin-decision' })}>Make a diagnosis</button>
            {currentTiming.canExtendOvertime && <button type="button" onClick={() => runtime.dispatch({ type: 'continue-overtime' })}>Take 5 minutes overtime</button>}
            <button type="button" onClick={() => runtime.dispatch({ type: 'schedule-follow-up' })}>Arrange a follow-up</button>
          </div>
        </div>
      );
    }

    if (stage === 'inquiry' && phase === 'thought') {
      return (
        <>
          {utterance && (
            <blockquote className={`gcon-quote${utterance.observation ? ' gcon-quote--observation' : ''}`}>
              {markedQuote(utterance.text, clueTokens)}
            </blockquote>
          )}
          <Ornament />
          <div className="gcon-options gcon-options--thoughts">
            {interpretations.map((item, index) => {
              const active = state.workingHypothesisId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`gcon-card gcon-card--thought${cursor === index ? ' is-hot' : ''}${active ? ' is-chosen' : ''}`}
                  {...cardMouse(index)}
                  onClick={() => chooseThought(item)}
                >
                  {item.text}
                  {active ? <span className="gcon-check" aria-hidden="true">Current</span> : <span className="gcon-dots" aria-hidden="true">···</span>}
                  <span className="gcon-eye" aria-hidden="true"><EyeEmblem /></span>
                </button>
              );
            })}
          </div>
          <footer className="gcon-hint">
            {customThoughtOpen ? (
              <form className="gcon-custom-thought" onSubmit={(event) => { event.preventDefault(); chooseCustomThought(); }}>
                <input
                  aria-label="Suggest your own interpretation"
                  placeholder="Suggest your own interpretation…"
                  maxLength={600}
                  value={customThought}
                  onChange={(event) => setCustomThought(event.target.value)}
                  autoFocus
                />
                <button type="submit" disabled={!customThought.trim()}>Record</button>
                <button type="button" onClick={() => setCustomThoughtOpen(false)}>Cancel</button>
              </form>
            ) : (
              <span>
                Choose an approach,{' '}
                <button type="button" className="gcon-hint-link" onClick={() => setCustomThoughtOpen(true)}>suggest your own</button>
                {hasRuminated && (
                  <>{', or '}<button type="button" className="gcon-hint-link" onClick={toInterview}>return to the consultation</button></>
                )}
              </span>
            )}
          </footer>
        </>
      );
    }

    if (stage === 'inquiry' && phase === 'speech') {
      return (
        <>
          {utterance && (
            <blockquote className={`gcon-quote${utterance.observation ? ' gcon-quote--observation' : ''}`}>
              {markedQuote(utterance.text, clueTokens)}
            </blockquote>
          )}
          <Ornament />
          <div className="gcon-options gcon-options--speech">
            {prompts.map((prompt, index) => (
              <button
                key={prompt.id}
                type="button"
                className={`gcon-card gcon-card--speech${cursor === index ? ' is-hot' : ''}${asked.has(prompt.id) ? ' is-done' : ''}`}
                disabled={speechPending}
                onMouseEnter={() => { setCursor(index); setPreviewMinutes(prompt.minutes ?? 5); }}
                onMouseLeave={() => setPreviewMinutes(0)}
                onFocus={() => setPreviewMinutes(prompt.minutes ?? 5)}
                onBlur={() => setPreviewMinutes(0)}
                onClick={() => speakPrompt(prompt)}
              >
                <span className="gcon-roundel" aria-hidden="true"><SpeechIcon size={24} /></span>
                {prompt.text}
                <span className="gcon-action-cost">{prompt.minutes ?? 5} min</span>
              </button>
            ))}
            <form className="gcon-card gcon-card--custom-speech" onSubmit={(event) => { event.preventDefault(); speakCustom(); }}>
              <textarea
                aria-label="Ask in your own words"
                placeholder="Ask in your own words…"
                maxLength={600}
                rows={2}
                value={customSpeech}
                disabled={speechPending}
                onChange={(event) => setCustomSpeech(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    speakCustom();
                  }
                }}
              />
              <button type="submit" disabled={!customSpeech.trim() || speechPending} aria-label="Ask custom question">
                {speechPending ? '…' : 'Ask'}
              </button>
            </form>
          </div>
        </>
      );
    }

    if (stage === 'inquiry' && phase === 'exam') {
      // The reading's chrome is one slim band: the examinations still to
      // perform, and the way back. Findings live in the annotation layer.
      return (
        <div className="gcon-exam-band">
          <div className="gcon-exam-choices">
            {examinations.map((exam, index) => (
              <button
                key={exam.id}
                type="button"
                className={`gcon-exam-chip${cursor === index ? ' is-hot' : ''}`}
                onMouseEnter={() => { setCursor(index); setPreviewMinutes(exam.minutes ?? 3); }}
                onMouseLeave={() => setPreviewMinutes(0)}
                onFocus={() => setPreviewMinutes(exam.minutes ?? 3)}
                onBlur={() => setPreviewMinutes(0)}
                onClick={() => runExam(exam)}
              >
                <span className="gcon-exam-chip-icon" aria-hidden="true"><StethoscopeIcon size={18} /></span>
                {exam.label}
                <span className="gcon-exam-chip-cost">{exam.minutes ?? 3} min</span>
              </button>
            ))}
            {!examinations.length && (
              <p className="gcon-empty-state">The focused examinations are complete.</p>
            )}
          </div>
          <div className="gcon-exam-keys">
            <span><b>TAB</b> Case Notebook</span>
            <button type="button" className="gcon-hint-link gcon-exam-return" onClick={toInterview}>
              <b>ESC</b> Return to Consultation
            </button>
          </div>
        </div>
      );
    }

    if (stage === 'decision' && decisionStep === 'diagnosis') {
      return (
        <>
          <p className="gcon-eyebrow">Working Diagnosis</p>
          <p className="gcon-record-instruction">Choose a diagnosis. Treatment comes next.</p>
          <div className="gcon-options gcon-options--row gcon-options--decisions">
            {diagnoses.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`gcon-card gcon-card--speech${cursor === index ? ' is-hot' : ''}${state.diagnosisId === item.id ? ' is-chosen' : ''}`}
                {...cardMouse(index)}
                onClick={() => {
                  runtime.dispatch({ type: 'select-diagnosis', id: item.id });
                  setDecisionStep('treatment');
                }}
              >
                {item.label}
                {item.description && <span className="gcon-card-sub">{item.description}</span>}
              </button>
            ))}
          </div>
          <footer className="gcon-hint">
            <button type="button" className="gcon-hint-link" onClick={() => setShowAllDecisions((value) => !value)}>
              {showAllDecisions ? 'Show likely diagnoses' : 'Consider other diagnoses'}
            </button>
            {state.diagnosisId && (
              <button type="button" className="gcon-hint-link" onClick={() => setDecisionStep('treatment')}>
                Continue with {patient.diagnoses.find((item) => item.id === state.diagnosisId)?.label}
              </button>
            )}
          </footer>
        </>
      );
    }

    if (stage === 'decision') {
      const chosenDiagnosis = patient.diagnoses.find((item) => item.id === state.diagnosisId);
      return (
        <>
          <p className="gcon-eyebrow">Prescribe Treatment</p>
          <div className="gcon-decision-chosen">
            <span>For</span>
            <strong>{chosenDiagnosis?.label}</strong>
            <button type="button" className="gcon-hint-link" onClick={() => setDecisionStep('diagnosis')}>
              Change diagnosis
            </button>
          </div>
          <TreatmentShelf patient={patient} state={state} runtime={runtime} />
          <footer className="gcon-record-signoff">
            <span className="gcon-record-count">
              {state.treatmentIds?.length > 0
                ? state.treatmentIds.length === 1 ? 'One remedy prescribed' : `${state.treatmentIds.length} remedies prescribed`
                : 'Nothing prescribed yet'}
            </span>
            <button
              type="button"
              className="gcon-sign"
              disabled={!state.diagnosisId || !(state.treatmentIds?.length > 0)}
              onClick={() => runtime.dispatch({ type: 'begin-case-note' })}
            >
              <strong>Write the case note</strong>
              <kbd aria-hidden="true">⏎</kbd>
            </button>
          </footer>
        </>
      );
    }

    if (stage === 'case-note') {
      const minimumEvidence = patient.caseNote.minimumEvidenceSelections ?? 0;
      const maximumEvidence = patient.caseNote.maximumEvidenceSelections ?? 3;
      const selectedEvidence = state.caseRecordFactIds || [];
      const canSign = selectedEvidence.length >= minimumEvidence;
      const cited = selectedEvidence.length === 0
        ? 'No findings selected'
        : selectedEvidence.length === 1 ? '1 finding selected' : `${selectedEvidence.length} findings selected`;
      return (
        <>
          <p className="gcon-eyebrow">Sign the Case Record</p>
          <p className="gcon-record-instruction">
            {minimumEvidence > 0
              ? `Select up to ${maximumEvidence} findings that support your diagnosis, then sign. A written note is optional.`
              : `You can select up to ${maximumEvidence} findings and add a note. Both are optional.`}
          </p>
          <div className="gcon-record-facts">
            {recordFacts.map((fact, index) => (
              <button
                key={fact.id}
                type="button"
                className={`${selectedEvidence.includes(fact.id) ? 'is-selected' : ''}${cursor === index ? ' is-hot' : ''}`}
                aria-pressed={selectedEvidence.includes(fact.id)}
                {...cardMouse(index)}
                onClick={() => runtime.dispatch({ type: 'select-record-fact', id: fact.id })}
              >
                <strong>{fact.label}</strong><span>{fact.value}</span>
              </button>
            ))}
          </div>
          <textarea
            className="gcon-notefield"
            placeholder="Optional note…"
            value={state.caseNote}
            onChange={(event) => runtime.dispatch({ type: 'write-case-note', text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && canSign) {
                event.preventDefault();
                runtime.dispatch({ type: 'submit-case-note' });
              }
            }}
          />
          <footer className="gcon-record-signoff">
            <span className="gcon-record-count">{cited}</span>
            <button
              type="button"
              className="gcon-sign"
              disabled={!canSign}
              onClick={() => runtime.dispatch({ type: 'submit-case-note' })}
            >
              <strong>Sign and close the case</strong>
              <kbd aria-hidden="true">⏎</kbd>
            </button>
          </footer>
        </>
      );
    }

    if (stage === 'result') {
      return <p className="gcon-eyebrow">The Consultation Concludes</p>;
    }

    if (stage === 'terminated') {
      return (
        <>
          <blockquote className="gcon-quote gcon-quote--observation">
            The patient rises and ends the consultation.
          </blockquote>
          <footer className="gcon-hint">
            <button type="button" className="gcon-hint-link" onClick={() => runtime.start(patient.id)}>Begin the consultation again</button>
            <button type="button" className="gcon-hint-link" onClick={() => runtime.reset()}>Receive another patient</button>
          </footer>
        </>
      );
    }

    return null;
  };

  const stageKey = `${state ? stage : 'queue'}-${phase}-${state?.mode ?? ''}${stage === 'decision' ? `-${decisionStep}` : ''}`;

  // The interview's question grid runs wider than the interpretation row,
  // matching the two mockups' panel widths.
  const wideStage = (stage === 'inquiry' && (phase === 'speech' || phase === 'exam'))
    || stage === 'decision' || stage === 'case-note' || stage === 'result';

  if (!patient && queueDismissed) return null;

  return (
    <div
      className={`gcon${bookOpen ? ' gcon--book' : ''}${patient && state ? ' gcon--active' : ''}${examPresenting ? ' gcon--exam' : ''}`}
      aria-label="Consultation"
    >
      {examPresenting && <ExamAnnotations facts={examFacts} />}
      {patient && state && (
        <aside
          className={`gcon-rail gcon-frame${stage === 'decision' || stage === 'case-note' ? ' is-receded' : ''}`}
          aria-label="Consultation actions"
        >
          <h2 className="gcon-rail-title">Consultation</h2>
          <Ornament />
          {timing && stage !== 'result' && (
            <div className={`gcon-time is-${timing.status}${previewMinutes ? ' is-preview' : ''}`}>
              <div className="gcon-time-label">
                <strong>{previewMinutes ? `${timing.authorizedRemaining} min after action` : timing.deadlineReached ? 'Time expired' : `${timing.authorizedRemaining} min remaining`}</strong>
                <span>{timing.usedMinutes} of {timing.scheduledMinutes} min{previewMinutes ? ' after action' : ''}</span>
              </div>
              <div className="gcon-time-track" aria-label={`${timing.authorizedRemaining} consultation minutes remaining`}>
                <i style={{ width: `${Math.min(100, (timing.usedMinutes / timing.scheduledMinutes) * 100)}%` }} />
              </div>
            </div>
          )}
          {railItems.map((item) => {
            const Icon = RAIL_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`gcon-rail-item${item.active ? ' is-active' : ''}`}
                aria-label={`${item.title}. ${item.sub}`}
                disabled={item.disabled}
                onClick={item.act}
              >
                <span className="gcon-rail-icon"><Icon size={28} /></span>
                <span className="gcon-rail-text">
                  <strong>
                    <span className="gcon-desktop-label">{item.title}</span>
                    <span className="gcon-mobile-label">
                      {{ interview: 'Talk', examine: 'Examine', ruminate: 'Think', treatment: 'Treat' }[item.id]}
                    </span>
                  </strong>
                  <small>{item.sub}</small>
                </span>
              </button>
            );
          })}
          <div className="gcon-rail-divider"><Ornament /></div>
          <button type="button" className={`gcon-rail-book${freshNotebookEntryId ? ' has-update' : ''}`} aria-label="Case Notebook" onClick={() => { setBookOpen((open) => !open); setFreshNotebookEntryId(null); }}>
            <span className="gcon-desktop-label">Case Notebook</span>
            <span className="gcon-mobile-label">Casebook</span>
            {freshNotebookEntryId && <span className="gcon-book-update">Updated</span>}
            <span className="gcon-key">TAB</span>
          </button>
          <p className="gcon-rail-followup">
            <span>{patient.outcomeModel ? 'One-Month Follow-Up' : 'Follow-Up Unavailable'}</span>
          </p>
        </aside>
      )}

      <section
        className={`gcon-stage gcon-frame${wideStage ? ' gcon-stage--wide' : ''}${stage === 'decision' || stage === 'case-note' ? ' gcon-stage--paper' : ''}`}
        aria-label="The patient before you"
      >
        {(canEnd || queueVisible) && (
          <button
            type="button"
            className="gcon-close"
            aria-label={canEnd ? 'End the consultation early' : 'Close patient queue'}
            title={canEnd ? 'End the consultation (Esc)' : 'Close patient queue (Esc)'}
            onClick={canEnd ? endEarly : dismissQueue}
          >
            ×
          </button>
        )}
        <div key={stageKey} className="gcon-swap">
          {renderStage()}
          {errorNote && <p className="gcon-error">{errorNote}</p>}
        </div>
      </section>

      {bookOpen && notebook && (
        <div className="gcon-book-layer">
          <aside
            className="gcon-book"
            aria-label={`Case notebook for ${notebook.patient.name}`}
            style={{ '--gcon-book-image': `url("${notebookBackgroundUrl}")` }}
          >
            <button
              type="button"
              className="gcon-book-close"
              aria-label="Close case notebook"
              onClick={() => setBookOpen(false)}
            >
              ×
            </button>
            <div
              className="gcon-book-paper"
              onClick={(event) => {
                if (event.target === event.currentTarget && !noteEditor) beginNote();
              }}
            >
              <header className="gcon-book-head">
                <p>Case Notebook</p>
                <h2>{notebook.patient.name}</h2>
                <span>Aged {notebook.patient.age} · {notebook.patient.residence}</span>
              </header>

              {notebook.observations.length > 0 && (
                <section className="gcon-book-section">
                  <h3>Recent Observations</h3>
                  <div className="gcon-book-observations" aria-live="polite">
                    {notebook.observations.map((entry) => (
                      <article
                        key={entry.id}
                        className={`gcon-book-entry${entry.id === freshNotebookEntryId ? ' is-new' : ''}`}
                      >
                        <strong>{entry.kind}</strong>
                        <p>{entry.text}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {notebook.clues.length > 0 && (
                <section className="gcon-book-section">
                  <h3>Clues</h3>
                  <ul className="gcon-book-clues">
                    {notebook.clues.map((clue) => (
                      <li key={clue.id} className="gcon-book-entry">
                        <strong>{clue.label}:</strong> {clue.text}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(playerNotes.length > 0 || noteEditor) && (
                <section className="gcon-book-section gcon-book-section--player-notes">
                  <div className="gcon-book-section-title">
                    <h3>Your Notes</h3>
                    {!noteEditor && (
                      <button type="button" className="gcon-book-add-note" onClick={() => beginNote()}>
                        <PencilIcon />
                        <span>Add note</span>
                      </button>
                    )}
                  </div>
                  <div className="gcon-book-player-notes">
                    {playerNotes.map((note) => (
                      <article key={note.id} className="gcon-book-player-note">
                        <p>{note.text}</p>
                        <div className="gcon-book-note-actions">
                          <button type="button" aria-label="Edit note" title="Edit note" onClick={() => beginNote(note)}>
                            <PencilIcon />
                          </button>
                          <button type="button" aria-label="Delete note" title="Delete note" onClick={() => removeNote(note.id)}>
                            <TrashIcon />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {noteEditor && (
                    <div className="gcon-book-note-editor">
                      <textarea
                        ref={noteInput}
                        aria-label={noteEditor.id ? 'Edit casebook note' : 'New casebook note'}
                        placeholder="Write in your own hand…"
                        maxLength={2000}
                        value={noteEditor.text}
                        onChange={(event) => setNoteEditor({ ...noteEditor, text: event.target.value })}
                        onKeyDown={noteKeyDown}
                      />
                      <div className="gcon-book-note-editor-actions">
                        <button type="button" onClick={() => setNoteEditor(null)}>Cancel</button>
                        <button type="button" className="is-primary" disabled={!noteEditor.text.trim()} onClick={commitNote}>Save note</button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {notebook.diagnosesAvailable && (
                <section className="gcon-book-section gcon-book-section--diagnoses">
                  <h3>Possible Diagnoses</h3>
                  <div className="gcon-book-diagnoses">
                    {notebook.diagnoses.map((diagnosis) => (
                      <button
                        key={diagnosis.id}
                        type="button"
                        className={diagnosis.selected ? 'is-selected' : ''}
                        aria-pressed={diagnosis.selected}
                        onClick={() => runtime.dispatch({ type: 'select-diagnosis', id: diagnosis.id })}
                      >
                        <span>{diagnosis.label}</span>
                        {diagnosis.selected && <b aria-hidden="true">★</b>}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {!noteEditor && (
                <button type="button" className="gcon-book-paper-add" onClick={() => beginNote()}>
                  <PencilIcon />
                  <span>Add your own note</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
      {stage === 'result' && state?.result && (
        <ResultModal
          result={state.result}
          patient={patient}
          consultState={state}
          patientLabel={patient.label}
          view={resultView}
          setView={setResultView}
          onNextPatient={onNextPatient}
          onWaitingRoom={() => onLeaveConsultation('waiting-room')}
          onStreet={() => onLeaveConsultation('street')}
        />
      )}
    </div>
  );
}

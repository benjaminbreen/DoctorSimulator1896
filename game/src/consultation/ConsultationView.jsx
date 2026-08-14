// The consultation proper, built to the introspection mockups: the patient's
// words sit in a framed stage at the foot of the screen, thought cards weigh
// them, speech cards answer them, and a consultation rail waits on the right.
// The engine still decides everything; this component only asks and shows.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildCaseNotebook } from './caseNotebook.js';
import { consultationTiming } from './engine.js';
import {
  availableDiagnoses,
  availableDialoguePrompts,
  availableExaminations,
  availableTreatments,
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

function signed(value) {
  return `${value > 0 ? '+' : ''}${value}`;
}

function money(cents) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

function ResultModal({
  result,
  patientLabel,
  view,
  setView,
  onNextPatient,
  onWaitingRoom,
  onStreet,
}) {
  if (!result) return null;
  const immediate = result.immediate || {};
  const summary = result.summary || {};
  const satisfaction = Math.max(0, Math.min(10, immediate.satisfactionOutOfTen ?? (immediate.satisfaction || 0) / 10));
  const satisfactionBand = satisfaction >= 7 ? 'high' : satisfaction >= 4.5 ? 'mid' : 'low';
  const month = result.oneMonth || {};
  const outcomeLabel = {
    improved: 'Improved',
    'little-change': 'Little change',
    worse: 'Worsened',
    harmed: 'Harmed',
  }[month.band] || 'Outcome recorded';
  const metricClass = (value) => (value > 0 ? 'is-positive' : value < 0 ? 'is-negative' : 'is-neutral');
  return (
    <div className="gcon-result-backdrop" role="presentation">
      <section className="gcon-result-modal gcon-frame" role="dialog" aria-modal="true" aria-labelledby="gcon-result-title">
        <header className="gcon-result-header">
          <p className="gcon-eyebrow">{view === 'immediate' ? 'Consultation Complete' : 'One Month Later'}</p>
          <h2 id="gcon-result-title">{view === 'immediate' ? `As ${patientLabel} Leaves` : 'What Followed'}</h2>
          <div className="gcon-result-tabs" role="tablist" aria-label="Consultation outcome views">
            <button type="button" role="tab" aria-selected={view === 'immediate'} className={view === 'immediate' ? 'is-active' : ''} onClick={() => setView('immediate')}>
              Patient reaction
            </button>
            <button type="button" role="tab" aria-selected={view === 'month'} className={view === 'month' ? 'is-active' : ''} onClick={() => setView('month')}>
              One month later
            </button>
          </div>
        </header>
        <Ornament />
        {view === 'immediate' ? (
          <>
            <blockquote className="gcon-result-departure">{immediate.departureLine}</blockquote>
            <p className="gcon-result-narrative">{immediate.narrative}</p>
            <div className="gcon-result-payment">
              <span>Fee received</span>
              <strong>{money(immediate.paymentCents)}</strong>
              <small>{immediate.paymentLabel}</small>
            </div>
            <div className="gcon-result-satisfaction">
              <div><span>Patient satisfaction</span><strong>{satisfaction.toFixed(1)} / 10</strong></div>
              <div className={`gcon-result-bar is-${satisfactionBand}`} aria-label={`Patient satisfaction ${satisfaction.toFixed(1)} out of 10`}>
                <i style={{ width: `${satisfaction * 10}%` }} />
              </div>
            </div>
            <div className="gcon-result-stats">
              <div><strong>{summary.questionsAsked ?? 0}</strong><span>Questions asked</span></div>
              <div><strong>{summary.examinationsPerformed ?? 0}</strong><span>Examinations</span></div>
              <div><strong>{summary.minutesUsed ?? 0}</strong><span>Minutes used</span></div>
            </div>
            <div className="gcon-result-feedback">
              {result.feedback?.strengths?.[0] && <p><strong>Well done</strong>{result.feedback.strengths[0]}</p>}
              {result.feedback?.improvements?.[0] && <p><strong>Consider next time</strong>{result.feedback.improvements[0]}</p>}
            </div>
          </>
        ) : (
          <>
            <div className={`gcon-outcome-stamp is-${month.band || 'neutral'}`}>{outcomeLabel}</div>
            <p className="gcon-result-narrative">{month.narrative}</p>
            <div className="gcon-result-stats">
              <div className={metricClass(month.healthChange || 0)}><strong>{signed(month.healthChange || 0)}</strong><span>Health</span></div>
              <div className={metricClass(month.functionChange || 0)}><strong>{signed(month.functionChange || 0)}</strong><span>Daily function</span></div>
              <div className="is-reasoning"><strong>{result.scores?.diagnosis ?? 5}<small>/10</small></strong><span>Reasoning</span></div>
            </div>
            <div className="gcon-result-reading">
              <details className="gcon-debrief"><summary>Modern debrief</summary><p>{result.modernDebrief}</p></details>
              <details className="gcon-debrief"><summary>Letter from William James</summary><p>{result.james?.letter}</p><small>{result.james?.disclaimer}</small></details>
            </div>
          </>
        )}
        <footer className="gcon-result-footer">
          <p>Where will you go now?</p>
          <div className="gcon-result-actions">
            <button type="button" className="is-primary" onClick={onNextPatient}>
              <strong>Receive next patient</strong><span>Remain in the consulting room</span>
            </button>
            <button type="button" onClick={onWaitingRoom}>
              <strong>Go to waiting room</strong><span>Leave consultation mode</span>
            </button>
            <button type="button" onClick={onStreet}>
              <strong>Go out to the street</strong><span>Leave the practice</span>
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

  useEffect(() => {
    setPhase('thought');
    setBookOpen(false);
    setPlayerNotes(patient ? loadPatientNotes(patient) : []);
    setNoteEditor(null);
    setCustomSpeech('');
    setCustomThought('');
    setCustomThoughtOpen(false);
    setResultView('immediate');
    setSpeechPending(false);
    setPreviewMinutes(0);
    setShowAllDecisions(false);
  }, [state?.patientId, patient?.profile?.seed]);

  useEffect(() => {
    if (!noteEditor) return;
    noteInput.current?.focus();
    noteInput.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [noteEditor]);

  useEffect(() => setCursor(-1), [phase, stage, state?.mode, state?.patientId]);

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
  const treatments = useMemo(() => (patient && state && !showAllDecisions ? availableTreatments(patient, state) : patient?.treatments || []), [patient, state, showAllDecisions]);
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
  } else if (stage === 'decision') {
    const pool = [...diagnoses, ...treatments];
    nav.count = pool.length;
    nav.cols = pool.length || 1;
    nav.select = (index) => {
      const diagnosis = index < diagnoses.length;
      runtime.dispatch(diagnosis
        ? { type: 'select-diagnosis', id: diagnoses[index].id }
        : { type: 'select-treatment', id: treatments[index - diagnoses.length].id });
    };
  }

  const navRef = useRef(nav);
  navRef.current = { ...nav, cursor, bookOpen, canEnd, endEarly, queueVisible, dismissQueue };

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
      if (current.bookOpen || !current.count) return;

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
      else if (event.key === 'Enter' && current.cursor >= 0) {
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
      return (
        <>
          {utterance && (
            <blockquote className={`gcon-quote${utterance.observation ? ' gcon-quote--observation' : ''}`}>
              {markedQuote(utterance.text, clueTokens)}
            </blockquote>
          )}
          <Ornament />
          <div className="gcon-options gcon-options--exams">
            {examinations.map((exam, index) => (
              <button
                key={exam.id}
                type="button"
                className={`gcon-card gcon-card--speech${cursor === index ? ' is-hot' : ''}`}
                onMouseEnter={() => { setCursor(index); setPreviewMinutes(exam.minutes ?? 3); }}
                onMouseLeave={() => setPreviewMinutes(0)}
                onFocus={() => setPreviewMinutes(exam.minutes ?? 3)}
                onBlur={() => setPreviewMinutes(0)}
                onClick={() => runExam(exam)}
              >
                <span className="gcon-roundel" aria-hidden="true"><StethoscopeIcon size={24} /></span>
                {exam.label}
                <span className="gcon-action-cost">{exam.minutes ?? 3} min</span>
              </button>
            ))}
            {!examinations.length && <p className="gcon-empty-state">The focused examinations are complete.</p>}
          </div>
          <footer className="gcon-hint">
            <button type="button" className="gcon-hint-link" onClick={toInterview}>Return to the interview</button>
          </footer>
        </>
      );
    }

    if (stage === 'decision') {
      return (
        <>
          <p className="gcon-eyebrow">Working Diagnosis</p>
          <div className="gcon-options gcon-options--row gcon-options--decisions">
            {diagnoses.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`gcon-card gcon-card--speech${cursor === index ? ' is-hot' : ''}${state.diagnosisId === item.id ? ' is-chosen' : ''}`}
                {...cardMouse(index)}
                onClick={() => runtime.dispatch({ type: 'select-diagnosis', id: item.id })}
              >
                {item.label}
                {item.description && <span className="gcon-card-sub">{item.description}</span>}
              </button>
            ))}
          </div>
          <div style={{ height: 14 }} />
          <p className="gcon-eyebrow">Course of Treatment</p>
          <div className="gcon-options gcon-options--row gcon-options--decisions">
            {treatments.map((item, index) => {
              const navIndex = diagnoses.length + index;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`gcon-card gcon-card--speech${cursor === navIndex ? ' is-hot' : ''}${state.treatmentId === item.id ? ' is-chosen' : ''}`}
                  {...cardMouse(navIndex)}
                  onClick={() => runtime.dispatch({ type: 'select-treatment', id: item.id })}
                >
                  {item.label}
                  {item.description && <span className="gcon-card-sub">{item.description}</span>}
                </button>
              );
            })}
          </div>
          <footer className="gcon-hint">
            <button type="button" className="gcon-hint-link" onClick={() => setShowAllDecisions((value) => !value)}>
              {showAllDecisions ? 'Show likely options' : 'Consider other diagnoses and treatments'}
            </button>
            <button
              type="button"
              className="gcon-hint-link"
              disabled={!state.diagnosisId || !state.treatmentId}
              onClick={() => runtime.dispatch({ type: 'begin-case-note' })}
            >
              Write the case note
            </button>
          </footer>
        </>
      );
    }

    if (stage === 'case-note') {
      const minimumEvidence = patient.caseNote.minimumEvidenceSelections ?? 0;
      const maximumEvidence = patient.caseNote.maximumEvidenceSelections ?? 3;
      const selectedEvidence = state.caseRecordFactIds || [];
      const knownFacts = patient.facts.filter((fact) => state.disclosedFactIds.includes(fact.id));
      return (
        <>
          <p className="gcon-eyebrow">Sign the Case Record</p>
          <p className="gcon-record-instruction">
            {minimumEvidence > 0
              ? `Select the ${minimumEvidence}–${maximumEvidence} findings that best support your decision. The written note is optional.`
              : `You may select up to ${maximumEvidence} supporting findings or add a written note. Both are optional.`}
          </p>
          <div className="gcon-record-facts">
            {knownFacts.map((fact) => (
              <button
                key={fact.id}
                type="button"
                className={selectedEvidence.includes(fact.id) ? 'is-selected' : ''}
                onClick={() => runtime.dispatch({ type: 'select-record-fact', id: fact.id })}
              >
                <strong>{fact.label}</strong><span>{fact.value}</span>
              </button>
            ))}
          </div>
          <textarea
            className="gcon-notefield"
            placeholder="Optional note in your own words…"
            value={state.caseNote}
            onChange={(event) => runtime.dispatch({ type: 'write-case-note', text: event.target.value })}
          />
          <footer className="gcon-hint">
            <button
              type="button"
              className="gcon-hint-link"
              disabled={selectedEvidence.length < minimumEvidence}
              onClick={() => runtime.dispatch({ type: 'submit-case-note' })}
            >
              Sign and close the case
            </button>
            <span className="gcon-hint-note">{selectedEvidence.length} findings selected</span>
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

  const stageKey = `${state ? stage : 'queue'}-${phase}-${state?.mode ?? ''}`;

  // The interview's question grid runs wider than the interpretation row,
  // matching the two mockups' panel widths.
  const wideStage = (stage === 'inquiry' && (phase === 'speech' || phase === 'exam'))
    || stage === 'decision' || stage === 'result';

  if (!patient && queueDismissed) return null;

  return (
    <div
      className={`gcon${bookOpen ? ' gcon--book' : ''}${patient && state ? ' gcon--active' : ''}`}
      aria-label="Consultation"
    >
      {patient && state && (
        <aside className="gcon-rail gcon-frame" aria-label="Consultation actions">
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

      <section className={`gcon-stage gcon-frame${wideStage ? ' gcon-stage--wide' : ''}`} aria-label="The patient before you">
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

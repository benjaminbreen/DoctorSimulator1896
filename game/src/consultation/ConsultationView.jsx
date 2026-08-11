// The consultation proper, built to the introspection mockups: the patient's
// words sit in a framed stage at the foot of the screen, thought cards weigh
// them, speech cards answer them, and a consultation rail waits on the right.
// The engine still decides everything; this component only asks and shows.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { patientProfileRows } from '../../../shared/patients/profile.js';
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

function NotesIcon({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5.5 2.8h8.6l2.9 2.9v13.5H5.5Z" />
      <path d="M14.1 2.8v2.9H17" />
      <path d="M8 9h6M8 12h6M8 15h4" />
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

function EyeGlyph({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.6 11S6 5.9 11 5.9 19.4 11 19.4 11 16 16.1 11 16.1 2.6 11 2.6 11Z" />
      <circle cx="11" cy="11" r="2.3" />
    </svg>
  );
}

function Diamond() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 0.8 9.2 5 5 9.2 0.8 5Z" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Ornament() {
  return (
    <div className="gcon-ornament" aria-hidden="true">
      <Diamond />
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

function trustPhrase(trust) {
  if (trust >= 70) return 'forthcoming';
  if (trust >= 55) return 'attentive';
  if (trust >= 40) return 'guarded';
  if (trust >= 25) return 'wary';
  return 'close to leaving';
}

function possessive(profile) {
  const sex = profile?.identity?.sex;
  return sex === 'female' ? 'her' : sex === 'male' ? 'his' : 'their';
}

function signed(value) {
  return `${value > 0 ? '+' : ''}${value}`;
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

const RAIL_ICONS = { interview: SpeechIcon, examine: StethoscopeIcon, notes: NotesIcon, treatment: BottleIcon };

export default function ConsultationView({ runtime, onRegenerate }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.get, runtime.get);
  const patients = runtime.patients();
  const patient = patients.find((candidate) => candidate.id === state?.patientId) || null;

  // 'thought' | 'speech' | 'exam'; only meaningful during the inquiry stage.
  const [phase, setPhase] = useState('thought');
  const [cursor, setCursor] = useState(-1);
  const [bookOpen, setBookOpen] = useState(false);
  const [errorNote, setErrorNote] = useState('');
  const errorTimer = useRef(null);

  const stage = state?.stage ?? null;
  const history = state?.history ?? [];
  const inquiryCount = useMemo(
    () => history.filter((event) => event.kind === 'speech' || event.kind === 'examination').length,
    [history],
  );

  // The opening complaint is already on screen, so inquiry starts at once.
  useEffect(() => {
    if (stage === 'opening') runtime.dispatch({ type: 'begin-inquiry' });
  }, [stage, runtime]);

  useEffect(() => {
    setPhase('thought');
    setBookOpen(false);
  }, [state?.patientId]);

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
    () => (patient ? (patient.prompts?.length ? patient.prompts : fallbackPrompts(patient)) : []),
    [patient],
  );
  const asked = useMemo(
    () => new Set(history.filter((event) => event.kind === 'speech').map((event) => event.input)),
    [history],
  );
  const examined = new Set(state?.observedFactIds ?? []);
  const remainingThoughts = interpretations.some((item) => !noted.has(item.id));

  const clueTokens = useMemo(() => {
    if (!patient || !state) return [];
    const known = new Set(state.disclosedFactIds);
    return patient.facts
      .filter((fact) => fact.disclosure === 'withheld' && !known.has(fact.id))
      .flatMap((fact) => fact.releaseOn || [])
      .map((token) => String(token).toLowerCase());
  }, [patient, state]);

  const speakPrompt = (prompt) => {
    runtime.speak({ text: prompt.text, stance: prompt.stance });
    const after = runtime.get();
    if (after?.stage === 'inquiry') {
      setPhase(remainingThoughts ? 'thought' : 'speech');
    }
  };

  const chooseThought = (item) => {
    if (noted.has(item.id)) return;
    runtime.dispatch({ type: 'interpret', id: item.id });
    setPhase('speech');
  };

  const runExam = (exam) => {
    runtime.dispatch({ type: 'examine', id: exam.id });
  };

  const toInterview = () => {
    if (stage === 'inquiry' && state.mode !== 'patient') runtime.dispatch({ type: 'set-mode', mode: 'patient' });
    setPhase('speech');
  };

  const toExamination = () => {
    if (stage === 'inquiry' && state.mode !== 'examination') runtime.dispatch({ type: 'set-mode', mode: 'examination' });
    setPhase('exam');
  };

  const toDecision = () => {
    if (stage === 'inquiry') runtime.dispatch({ type: 'begin-decision' });
  };

  /* ------- the one keyboard map: arrows rove, return commits ------- */

  const nav = { count: 0, cols: 1, select: () => {} };
  if (!state || !patient) {
    nav.count = patients.length;
    nav.cols = patients.length || 1;
    nav.select = (index) => runtime.start(patients[index].id);
  } else if (stage === 'inquiry' && phase === 'thought') {
    nav.count = interpretations.length;
    nav.cols = interpretations.length || 1;
    nav.select = (index) => chooseThought(interpretations[index]);
  } else if (stage === 'inquiry' && phase === 'speech') {
    nav.count = prompts.length;
    nav.cols = 2;
    nav.select = (index) => speakPrompt(prompts[index]);
  } else if (stage === 'inquiry' && phase === 'exam') {
    nav.count = patient.examinations.length;
    nav.cols = 2;
    nav.select = (index) => runExam(patient.examinations[index]);
  } else if (stage === 'decision') {
    const pool = [...patient.diagnoses, ...patient.treatments];
    nav.count = pool.length;
    nav.cols = pool.length || 1;
    nav.select = (index) => {
      const diagnosis = index < patient.diagnoses.length;
      runtime.dispatch(diagnosis
        ? { type: 'select-diagnosis', id: patient.diagnoses[index].id }
        : { type: 'select-treatment', id: patient.treatments[index - patient.diagnoses.length].id });
    };
  }

  const navRef = useRef(nav);
  navRef.current = { ...nav, cursor, bookOpen };

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
      if (event.code === 'Escape' && current.bookOpen) {
        event.preventDefault();
        setBookOpen(false);
        return;
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

  const railItems = patient && state ? [
    {
      id: 'interview',
      title: 'Interview',
      sub: `Ask about ${possessive(patient.profile)} symptoms`,
      active: stage === 'inquiry' && phase === 'speech' && state.mode === 'patient',
      disabled: stage !== 'inquiry',
      act: toInterview,
    },
    {
      id: 'examine',
      title: 'Examine',
      sub: 'Physical assessment',
      active: stage === 'inquiry' && phase === 'exam',
      disabled: stage !== 'inquiry',
      act: toExamination,
    },
    {
      id: 'notes',
      title: 'Consult Notes',
      sub: 'Review case details',
      active: bookOpen,
      disabled: false,
      act: () => setBookOpen((open) => !open),
    },
    {
      id: 'treatment',
      title: 'Consider Treatment',
      sub: stage === 'inquiry' && inquiryCount === 0 ? 'Speak with the patient first' : 'Plan next steps',
      active: stage === 'decision' || stage === 'case-note',
      disabled: stage !== 'inquiry' || inquiryCount === 0,
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
                <span className="gcon-eye" aria-hidden="true"><EyeGlyph /></span>
              </button>
            ))}
          </div>
          {onRegenerate && (
            <footer className="gcon-hint">
              <button type="button" className="gcon-hint-link" onClick={onRegenerate}>Prepare a different morning list</button>
            </footer>
          )}
        </>
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
              const done = noted.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`gcon-card gcon-card--thought${cursor === index && !done ? ' is-hot' : ''}${done ? ' is-done' : ''}`}
                  {...cardMouse(index)}
                  onClick={() => chooseThought(item)}
                >
                  {item.text}
                  {done
                    ? <span className="gcon-check" aria-hidden="true">✓</span>
                    : <span className="gcon-dots" aria-hidden="true">···</span>}
                  <span className="gcon-eye" aria-hidden="true"><EyeGlyph /></span>
                </button>
              );
            })}
          </div>
          <footer className="gcon-hint">
            <span>
              Select an interpretation or{' '}
              <button type="button" className="gcon-hint-link" onClick={toInterview}>continue the conversation</button>
            </span>
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
                className={`gcon-card gcon-card--speech${cursor === index ? ' is-hot' : ''}${asked.has(prompt.text) ? ' is-done' : ''}`}
                {...cardMouse(index)}
                onClick={() => speakPrompt(prompt)}
              >
                <span className="gcon-roundel" aria-hidden="true"><SpeechIcon size={15} /></span>
                {prompt.text}
              </button>
            ))}
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
            {patient.examinations.map((exam, index) => (
              <button
                key={exam.id}
                type="button"
                className={`gcon-card gcon-card--speech${cursor === index ? ' is-hot' : ''}${examined.has(exam.factId) ? ' is-done' : ''}`}
                {...cardMouse(index)}
                onClick={() => runExam(exam)}
              >
                <span className="gcon-roundel" aria-hidden="true"><StethoscopeIcon size={16} /></span>
                {exam.label}
              </button>
            ))}
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
          <div className="gcon-options gcon-options--row">
            {patient.diagnoses.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`gcon-card gcon-card--speech${cursor === index ? ' is-hot' : ''}${state.diagnosisId === item.id ? ' is-chosen' : ''}`}
                {...cardMouse(index)}
                onClick={() => runtime.dispatch({ type: 'select-diagnosis', id: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div style={{ height: 14 }} />
          <p className="gcon-eyebrow">Course of Treatment</p>
          <div className="gcon-options gcon-options--row">
            {patient.treatments.map((item, index) => {
              const navIndex = patient.diagnoses.length + index;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`gcon-card gcon-card--speech${cursor === navIndex ? ' is-hot' : ''}${state.treatmentId === item.id ? ' is-chosen' : ''}`}
                  {...cardMouse(navIndex)}
                  onClick={() => runtime.dispatch({ type: 'select-treatment', id: item.id })}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <footer className="gcon-hint">
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
      const words = state.caseNote.trim().split(/\s+/).filter(Boolean).length;
      return (
        <>
          <p className="gcon-eyebrow">The Case Note</p>
          <textarea
            className="gcon-notefield"
            placeholder={`Record the case in your own hand — at least ${patient.caseNote.minimumWords} words.`}
            value={state.caseNote}
            onChange={(event) => runtime.dispatch({ type: 'write-case-note', text: event.target.value })}
          />
          <footer className="gcon-hint">
            <button
              type="button"
              className="gcon-hint-link"
              disabled={words < patient.caseNote.minimumWords}
              onClick={() => runtime.dispatch({ type: 'submit-case-note' })}
            >
              Close the case
            </button>
            <span className="gcon-hint-note">{words} {words === 1 ? 'word' : 'words'}</span>
          </footer>
        </>
      );
    }

    if (stage === 'result') {
      return (
        <>
          <p className="gcon-eyebrow">The Consultation Concludes</p>
          <div className="gcon-figures">
            <div className="gcon-figure"><strong>{signed(state.result.reputation)}</strong><span>Reputation</span></div>
            <div className="gcon-figure"><strong>{signed(state.result.record)}</strong><span>Patient Record</span></div>
            <div className="gcon-figure"><strong>{state.result.noteCoverage}%</strong><span>Note Coverage</span></div>
          </div>
          <footer className="gcon-hint">
            <button type="button" className="gcon-hint-link" onClick={() => runtime.reset()}>Receive the next patient</button>
          </footer>
        </>
      );
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

  return (
    <div className="gcon" aria-label="Consultation">
      {patient && state && (
        <aside className="gcon-rail gcon-frame" aria-label="Consultation actions">
          <h2 className="gcon-rail-title">Consultation</h2>
          <Ornament />
          {railItems.map((item) => {
            const Icon = RAIL_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`gcon-rail-item${item.active ? ' is-active' : ''}`}
                disabled={item.disabled}
                onClick={item.act}
              >
                <span className="gcon-rail-icon"><Icon /></span>
                <span className="gcon-rail-text">
                  <strong>{item.title}</strong>
                  <small>{item.sub}</small>
                </span>
              </button>
            );
          })}
          <div className="gcon-rail-divider"><Ornament /></div>
          <button type="button" className="gcon-rail-book" onClick={() => setBookOpen((open) => !open)}>
            <span>Case Notebook</span>
            <span className="gcon-key">TAB</span>
          </button>
          <p className="gcon-rail-followup"><span>Follow-Up Unavailable</span></p>
        </aside>
      )}

      <section className="gcon-stage gcon-frame" aria-label="The patient before you">
        <div key={stageKey} className="gcon-swap">
          {renderStage()}
          {errorNote && <p className="gcon-error">{errorNote}</p>}
        </div>
      </section>

      {bookOpen && patient && state && (
        <div className="gcon-scrim" onClick={() => setBookOpen(false)}>
          <div
            className="gcon-book gcon-frame"
            role="dialog"
            aria-label="Case notebook"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="gcon-book-head">
              <h2>Case Notebook</h2>
              <span>{patient.label}</span>
            </header>
            <Ornament />
            <section className="gcon-book-section">
              <h3>The Patient</h3>
              <dl className="gcon-book-rows">
                {patientProfileRows(patient.profile).map((row) => (
                  <div key={row.label} style={{ display: 'contents' }}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="gcon-book-section">
              <h3>Particulars Recorded</h3>
              {state.disclosedFactIds.length ? (
                <dl className="gcon-book-rows">
                  {state.disclosedFactIds.map((factId) => {
                    const fact = patient.facts.find((candidate) => candidate.id === factId);
                    if (!fact) return null;
                    return (
                      <div key={factId} style={{ display: 'contents' }}>
                        <dt>{fact.label}</dt>
                        <dd>
                          {fact.value}
                          {examined.has(factId) && <span className="gcon-book-fact-note">observed directly</span>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : <p className="gcon-book-empty">Nothing recorded yet.</p>}
            </section>
            <section className="gcon-book-section">
              <h3>Private Impressions</h3>
              {state.interpretationIds.length ? (
                <ul className="gcon-book-list">
                  {state.interpretationIds.map((id) => {
                    const item = interpretations.find((candidate) => candidate.id === id);
                    return item ? <li key={id}>{item.text}</li> : null;
                  })}
                </ul>
              ) : <p className="gcon-book-empty">No impressions set down yet.</p>}
            </section>
            <footer className="gcon-book-foot">
              <span>{state.elapsedMinutes} minutes elapsed · the patient seems {trustPhrase(state.trust)}</span>
              <button type="button" onClick={() => { setBookOpen(false); runtime.reset(); }}>Change patient</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

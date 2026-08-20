// Close examination: the object fills the picture, the notebook rail runs
// down the right.
//
// Everything shown comes from a record: authored in examine/examinables.js for
// the three subjects that carry the story, built on the spot in
// examine/subjects.js for anything the player picks out of the world.
// Procedures are deterministic and cost minutes; the question box is the only
// part that reaches a model, and it may only render facts the record holds.

import { useEffect, useRef, useState } from 'react';
import { stopUsing } from '../world/interaction.js';
import { setTypingMode } from '../input/uiMode.js';
import { CONFIDENCE } from '../examine/examinables.js';
import {
  beginExamination,
  disclosedFacts,
  endExamination,
  getExamination,
  openProcedures,
  recordQuestion,
  requestAction,
  runProcedure,
  setPending,
  subscribe,
} from '../examine/session.js';
import { askAboutObject } from '../examine/client.js';
import { ink, label, keycap, keycapStyle } from './theme.js';
import './examine.css';

function Hint({ keys, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={keycap} style={keycapStyle}>{keys}</span>
      <span className="text-[11px]" style={{ color: ink.muted }}>{children}</span>
    </span>
  );
}

function Finding({ finding }) {
  return (
    <div className="examine-finding mt-2.5 px-3 py-2">
      <p className="text-[13px]" style={{ color: ink.live }}>
        <span className={label} style={{ color: ink.brass }}>Recorded </span>
        {finding.label}: {finding.value}
      </p>
      <p className="mt-0.5 text-[11px] italic" style={{ color: ink.faint }}>
        {CONFIDENCE[finding.confidence] ?? finding.confidence}
      </p>
    </div>
  );
}

function Entry({ entry }) {
  if (entry.kind === 'question') {
    return (
      <div className="border-t px-5 py-4" style={{ borderColor: ink.hair }}>
        <p className="text-[13px] italic" style={{ color: ink.brass }}>{entry.question}</p>
        <p className="examine-prose mt-2">{entry.text}</p>
      </div>
    );
  }
  return (
    <div className="border-t px-5 py-4" style={{ borderColor: ink.hair }}>
      <p className={label} style={{ color: ink.brass }}>
        {entry.kind === 'observation' ? 'Direct observation' : entry.label}
      </p>
      <p className="examine-prose mt-2">{entry.text}</p>
      {entry.finding && <Finding finding={entry.finding} />}
    </div>
  );
}

export default function ExaminePanel({ examining, worldClock }) {
  const [session, setSession] = useState(() => getExamination());
  const [question, setQuestion] = useState('');
  const notesRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => subscribe(setSession), []);

  // One session per entry into the mode. Leaving by any route — Escape, the
  // close button, a zone change — tears it down, so a second look starts fresh.
  const subjectId = examining?.subject ?? null;
  useEffect(() => {
    if (!subjectId) return undefined;
    beginExamination(subjectId, examining.record);
    setQuestion('');
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
      endExamination();
    };
  }, [subjectId]);

  // Gameplay keys must not fire while the question box has focus.
  useEffect(() => () => setTypingMode(false), []);

  // Escape steps back, the way it leaves every other focused interaction.
  useEffect(() => {
    if (!subjectId) return undefined;
    const onKey = (event) => {
      if (event.code === 'Escape') stopUsing();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [subjectId]);

  // New notes arrive at the bottom of the rail; follow them down.
  useEffect(() => {
    const notes = notesRef.current;
    if (notes) notes.scrollTop = notes.scrollHeight;
  }, [session?.entries.length]);

  if (!examining || !session) return null;
  const { record } = session;
  const remaining = openProcedures();

  const perform = (id) => {
    const result = runProcedure(id);
    if (result) worldClock?.advanceMinutes(result.minutes, { reason: 'examination' });
  };

  const ask = async (event) => {
    event.preventDefault();
    const text = question.trim();
    if (!text || session.pending) return;
    setQuestion('');
    setPending(true);
    const sessionId = session.id;
    const request = new AbortController();
    requestRef.current = request;
    const { facts, seen } = disclosedFacts();
    try {
      const reply = await askAboutObject({
        subjectId: session.subjectId,
        question: text,
        facts,
        seen,
        signal: request.signal,
      });
      if (recordQuestion(text, reply.answer, reply.source, sessionId)) {
        worldClock?.advanceMinutes(1, { reason: 'examination' });
      }
    } catch (error) {
      if (error?.name !== 'AbortError') throw error;
    } finally {
      if (requestRef.current === request) requestRef.current = null;
    }
  };

  return (
    <>
      {/* Over the scene, clear of the rail. */}
      <div className="pointer-events-none absolute left-6 top-8 z-20 max-w-lg sm:left-8 sm:top-10">
        <div className="flex items-center gap-3">
          <span className="block h-px w-8" style={{ background: ink.edge }} />
          <p className={label} style={{ color: ink.brass }}>Close examination</p>
        </div>
        <h2 className="examine-title mt-2">{record.title}</h2>
        <p className="mt-1 text-[13px] italic" style={{ color: 'rgba(232, 227, 212, 0.62)' }}>
          {record.subtitle}
        </p>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-6 z-20 flex flex-wrap items-center gap-4 sm:left-8">
        <Hint keys="Drag">turn it</Hint>
        <Hint keys="Wheel">draw closer</Hint>
        <Hint keys="Esc">step back</Hint>
      </div>

      <aside className="examine-rail" aria-label="Examination notes">
        <header className="flex items-start gap-3 border-b px-5 py-4" style={{ borderColor: ink.hair }}>
          <div className="min-w-0 flex-1">
            <p className={label} style={{ color: ink.brass }}>Examination notes</p>
            <p className="mt-1 text-[13px]" style={{ color: ink.muted }}>
              {session.done.length === record.procedures.length
                ? 'Nothing further to be had by looking.'
                : 'Look freely. Findings are yours once you have made them.'}
              {session.minutes > 0 && ` · ${session.minutes} min`}
            </p>
          </div>
          <button
            type="button"
            onClick={stopUsing}
            aria-label="Stop examining"
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xl leading-none transition-colors hover:bg-white/10"
            style={{ borderColor: ink.edge, color: ink.ivory, background: ink.raised }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="examine-notes" ref={notesRef}>
          {session.entries.map((entry) => <Entry key={entry.id} entry={entry} />)}
          {session.pending && (
            <div className="border-t px-5 py-4" style={{ borderColor: ink.hair }}>
              <p className="examine-prose italic" style={{ color: ink.faint }}>Looking closer…</p>
            </div>
          )}
        </div>

        <div className="border-t px-5 py-4" style={{ borderColor: ink.hair }}>
          {remaining.length > 0 && (
            <>
              <p className={label} style={{ color: ink.brass }}>Try something</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {remaining.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => perform(step.id)}
                    className="rounded border px-3 py-1.5 text-[12px] transition-colors hover:bg-white/10"
                    style={{ borderColor: ink.edge, color: ink.ivory, background: ink.raised }}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <form onSubmit={ask} className="mt-3 flex items-center gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onFocus={() => setTypingMode(true)}
              onBlur={() => setTypingMode(false)}
              placeholder="Ask something of it…"
              maxLength={200}
              className="min-w-0 flex-1 rounded border bg-transparent px-3 py-2 text-[13px] italic outline-none focus:ring-1"
              style={{ borderColor: ink.hair, color: ink.ivory }}
            />
            <button
              type="submit"
              disabled={session.pending || question.trim().length === 0}
              className="rounded border px-3 py-2 text-[12px] disabled:opacity-40"
              style={{ borderColor: ink.edge, color: ink.brass, background: 'rgba(168, 134, 63, 0.08)' }}
            >
              Ask
            </button>
          </form>

          {record.action && (
            <button
              type="button"
              onClick={() => requestAction(record.action.id)}
              className="mt-3 w-full rounded border px-3 py-2 text-[12px] uppercase tracking-[0.16em] transition-colors hover:bg-white/10"
              style={{ borderColor: ink.edge, color: ink.live, background: ink.raised }}
            >
              {record.action.label}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

import { useState, useSyncExternalStore } from 'react';
import { patientProfileRows } from '../../../shared/patients/profile.js';

function Button({ selected = false, children, ...props }) {
  return (
    <button
      type="button"
      className={`rounded border px-2 py-1 text-left text-xs ${selected ? 'border-amber-400 bg-amber-950' : 'border-neutral-600 bg-neutral-900 hover:bg-neutral-800'}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Profile({ patient, compact = false }) {
  const rows = patientProfileRows(patient.profile);
  return (
    <dl className={`grid gap-x-3 text-xs ${compact ? 'grid-cols-[auto_1fr]' : 'grid-cols-[7.5rem_1fr]'}`}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-neutral-500">{row.label}</dt>
          <dd className="text-neutral-200">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ConsultationDevPanel({ runtime, onRegenerate }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.get, runtime.get);
  const [speech, setSpeech] = useState('Can you tell me more about what happens at night?');
  const [stance, setStance] = useState('question');
  const patients = runtime.patients();
  const patient = patients.find((candidate) => candidate.id === state?.patientId);
  const last = state?.history[state.history.length - 1];

  const start = (candidate) => {
    runtime.start(candidate.id);
  };

  if (!state || !patient) {
    return (
      <aside className="absolute bottom-24 left-4 z-50 w-[390px] rounded border border-amber-800 bg-neutral-950/95 p-3 text-neutral-100 shadow-2xl">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-amber-400">Consultation test</p>
        <p className="mb-3 text-xs text-neutral-400">Generated draft profiles with technical case fixtures. Historical distributions still require review.</p>
        <p className="mb-2 text-xs text-neutral-200">Choose the patient to begin:</p>
        <div className="grid gap-2">
          {patients.map((candidate) => (
            <Button key={candidate.id} onClick={() => start(candidate)}>
              <span className="block font-semibold text-amber-100">{candidate.label}</span>
              <span className="block text-neutral-400">
                Aged {candidate.profile.identity.age} · {candidate.profile.social.occupation || candidate.profile.social.householdPosition}
              </span>
            </Button>
          ))}
          {onRegenerate && <Button onClick={onRegenerate}>Generate another patient set</Button>}
        </div>
      </aside>
    );
  }

  return (
    <aside className="absolute bottom-24 left-4 top-28 z-50 w-[430px] overflow-y-auto rounded border border-amber-800 bg-neutral-950/95 p-3 text-neutral-100 shadow-2xl">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-400">Technical consultation fixture</p>
          <h2 className="font-serif text-lg">{patient.label}</h2>
        </div>
        <div className="grid justify-items-end gap-1 text-right text-[10px] text-neutral-400">
          <div>{state.stage} · {state.mode}</div>
          <div>{state.elapsedMinutes} min · trust {state.trust}</div>
          <button type="button" className="text-amber-300 underline hover:text-amber-200" onClick={() => runtime.reset()}>
            Change patient
          </button>
        </div>
      </div>

      {last && (
        <div className="mb-3 rounded bg-neutral-900 p-2 text-xs">
          <p className="text-neutral-400">{last.kind}</p>
          <p>{last.dialogue || last.reply || last.text || last.behavior || 'State updated.'}</p>
          {last.fact && <p className="mt-1 text-emerald-300">{last.fact.label}: {last.fact.value}</p>}
        </div>
      )}

      <div className="mb-3 rounded border border-neutral-800 bg-neutral-950/70 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wider text-neutral-500">Generated patient profile · draft</p>
        <Profile patient={patient} />
      </div>

      {state.stage === 'opening' && (
        <Button onClick={() => runtime.dispatch({ type: 'begin-inquiry' })}>Begin inquiry</Button>
      )}

      {state.stage === 'inquiry' && (
        <div className="grid gap-3">
          <div className="flex gap-2">
            <Button selected={state.mode === 'patient'} onClick={() => runtime.dispatch({ type: 'set-mode', mode: 'patient' })}>Patient</Button>
            <Button selected={state.mode === 'examination'} onClick={() => runtime.dispatch({ type: 'set-mode', mode: 'examination' })}>Examination</Button>
          </div>

          {state.mode === 'patient' ? (
            <>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-emerald-400">Private interpretation · no time</p>
                <div className="grid gap-1">
                  {patient.interpretations.map((item) => (
                    <Button key={item.id} selected={state.interpretationIds.includes(item.id)} onClick={() => runtime.dispatch({ type: 'interpret', id: item.id })}>{item.text}</Button>
                  ))}
                </div>
              </div>
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  runtime.speak({ text: speech, stance });
                }}
              >
                <p className="text-[10px] uppercase tracking-wider text-amber-400">Speech · five minutes</p>
                <select className="rounded border border-neutral-600 bg-neutral-900 p-1 text-xs" value={stance} onChange={(event) => setStance(event.target.value)}>
                  <option value="question">Question</option>
                  <option value="reassure">Reassure</option>
                  <option value="challenge">Challenge</option>
                  <option value="suggest">Suggest</option>
                </select>
                <textarea className="min-h-16 rounded border border-neutral-600 bg-neutral-900 p-2 text-xs" value={speech} onChange={(event) => setSpeech(event.target.value)} />
                <Button type="submit">Speak</Button>
              </form>
            </>
          ) : (
            <div className="grid gap-1">
              {patient.examinations.map((item) => (
                <Button key={item.id} onClick={() => runtime.dispatch({ type: 'examine', id: item.id })}>{item.label} · {item.minutes ?? 3} min</Button>
              ))}
            </div>
          )}
          <Button onClick={() => runtime.dispatch({ type: 'begin-decision' })}>Proceed to diagnosis</Button>
        </div>
      )}

      {state.stage === 'decision' && (
        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">Diagnosis</p>
            {patient.diagnoses.map((item) => <Button key={item.id} selected={state.diagnosisId === item.id} onClick={() => runtime.dispatch({ type: 'select-diagnosis', id: item.id })}>{item.label}</Button>)}
          </div>
          <div className="grid gap-1">
            <p className="text-[10px] uppercase tracking-wider text-neutral-400">Treatment</p>
            {patient.treatments.map((item) => <Button key={item.id} selected={state.treatmentId === item.id} onClick={() => runtime.dispatch({ type: 'select-treatment', id: item.id })}>{item.label}</Button>)}
          </div>
          <Button onClick={() => runtime.dispatch({ type: 'begin-case-note' })}>Write case note</Button>
        </div>
      )}

      {state.stage === 'case-note' && (
        <div className="grid gap-2">
          <textarea
            className="min-h-32 rounded border border-neutral-600 bg-neutral-900 p-2 text-xs"
            placeholder={`At least ${patient.caseNote.minimumWords} words`}
            value={state.caseNote}
            onChange={(event) => runtime.dispatch({ type: 'write-case-note', text: event.target.value })}
          />
          <Button onClick={() => runtime.dispatch({ type: 'submit-case-note' })}>Close the case</Button>
        </div>
      )}

      {state.stage === 'result' && (
        <div className="grid gap-2 text-sm">
          <p>Reputation ledger: <strong>{state.result.reputation}</strong></p>
          <p>Patient record: <strong>{state.result.record}</strong></p>
          <p>Case-note coverage: <strong>{state.result.noteCoverage}%</strong></p>
          <div className="grid grid-cols-3 gap-1">
            {patients.map((candidate) => <Button key={candidate.id} onClick={() => start(candidate)}>{candidate.id}</Button>)}
          </div>
        </div>
      )}

      {state.stage === 'terminated' && (
        <div className="grid gap-2">
          <p className="text-sm text-red-300">The patient ended the consultation.</p>
          <Button onClick={() => runtime.start(patient.id)}>Restart this consultation</Button>
        </div>
      )}
      {state.errors.length > 0 && <p className="mt-3 text-xs text-red-300">{state.errors[state.errors.length - 1]}</p>}
    </aside>
  );
}

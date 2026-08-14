import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  addPatientNote,
  deletePatientNote,
  editPatientNote,
  loadPatientNotes,
  savePatientNotes,
} from '../consultation/patientNotes.js';
import {
  getCasebookRecords,
  getCasebookRevision,
  subscribeCasebook,
} from './casebookState.js';
import { useDismissableOverlay } from './useDismissableOverlay.js';
import './casebook.css';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function titleCase(value) {
  const text = String(value || '');
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : '';
}

function patientName(patient) {
  const { givenName, familyName } = patient.profile.identity;
  return `${givenName} ${familyName}`;
}

function initials(patient) {
  const { givenName, familyName } = patient.profile.identity;
  return `${givenName?.[0] || ''}${familyName?.[0] || ''}`;
}

function portraitPath(patient, recordPhoto) {
  return `/ui/patients/${patient.id}${recordPhoto ? '-record' : ''}.webp`;
}

function formatDate(stamp, compact = false) {
  if (!stamp?.date) return 'Not yet seen';
  const { year, month, date } = stamp.date;
  return compact
    ? `${MONTHS[month - 1]?.slice(0, 3) || ''}. ${date}`
    : `${MONTHS[month - 1] || ''} ${date}, ${year}`;
}

function statusFor(record) {
  if (!record) return { id: 'waiting', label: 'Waiting today', legend: 'Waiting today' };
  if (record.status === 'in-progress') return { id: 'active', label: 'In consultation', legend: 'Active case' };
  if (record.status === 'complete') return { id: 'outcome', label: 'Outcome recorded', legend: 'Outcome recorded' };
  return { id: 'inactive', label: 'Case closed', legend: 'Inactive' };
}

function PatientPortrait({ patient, className = '', recordPhoto = false }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`casebook-portrait ${className}${failed ? ' is-fallback' : ''}`}>
      {!failed ? (
        <img src={portraitPath(patient, recordPhoto)} alt="" onError={() => setFailed(true)} draggable={false} />
      ) : (
        <span aria-hidden="true">{initials(patient)}</span>
      )}
    </span>
  );
}

function StatusDot({ status }) {
  return <i className={`casebook-status-dot is-${status.id}`} aria-hidden="true" />;
}

function VisitTimeline({ record, expanded = false }) {
  const visits = record?.visits || [];
  if (!visits.length) {
    return <p className="casebook-empty">No consultation has been recorded yet.</p>;
  }
  return (
    <ol className="casebook-timeline">
      {visits.map((visit, index) => {
        const observations = expanded ? visit.observations : visit.observations.slice(0, 2);
        return (
          <li key={visit.id} className={`casebook-visit is-${visit.status}`}>
            <span className="casebook-visit-node" aria-hidden="true" />
            <time>{formatDate(visit.startedAt, true).toUpperCase()}</time>
            <div className="casebook-visit-copy">
              <h4>{index === 0 ? 'Initial consultation' : `Consultation ${index + 1}`}</h4>
              {visit.status === 'in-progress' && <p className="casebook-visit-state">Consultation in progress.</p>}
              {observations.map((entry, observationIndex) => (
                <p key={`${entry.label}-${observationIndex}`}><em>{entry.label}:</em> {entry.text}</p>
              ))}
              {visit.evidence.map((entry) => (
                <p key={entry.id}><strong>{entry.label}:</strong> {entry.text}</p>
              ))}
              {visit.diagnosis && <p><strong>Assessment:</strong> <em>{visit.diagnosis.label} — provisional.</em></p>}
              {visit.treatment && <p><strong>Treatment:</strong> <em>{visit.treatment.label}.</em></p>}
              {expanded && visit.caseNote && <blockquote>{visit.caseNote}</blockquote>}
            </div>
          </li>
        );
      })}
      {visits.at(-1)?.oneMonthOutcome?.narrative && (
        <li className="casebook-visit is-outcome">
          <span className="casebook-visit-node" aria-hidden="true" />
          <time>ONE MONTH LATER</time>
          <div className="casebook-visit-copy">
            <h4>Outcome received</h4>
            <p><em>{visits.at(-1).oneMonthOutcome.narrative}</em></p>
          </div>
        </li>
      )}
    </ol>
  );
}

function NotesEditor({ patient, notes, setNotes, onDone }) {
  const [editor, setEditor] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editor) requestAnimationFrame(() => inputRef.current?.focus());
  }, [editor]);

  const persist = (next) => {
    setNotes(next);
    savePatientNotes(patient, next);
  };

  const save = () => {
    if (!editor?.text.trim()) return;
    const next = editor.id
      ? editPatientNote(notes, editor.id, editor.text)
      : addPatientNote(notes, editor.text);
    persist(next);
    setEditor(null);
  };

  return (
    <section className="casebook-notes-editor">
      <div className="casebook-section-heading">
        <h3>Notes</h3>
        {!editor && (
          <button type="button" className="casebook-text-button" onClick={() => setEditor({ id: null, text: '' })}>
            <span aria-hidden="true">✎</span> Add note
          </button>
        )}
      </div>
      {notes.length ? (
        <div className="casebook-note-list">
          {notes.map((note) => (
            <article key={note.id} className="casebook-note">
              <p>“{note.text}”</p>
              <div>
                <button type="button" onClick={() => setEditor(note)}>Edit</button>
                <button type="button" onClick={() => persist(deletePatientNote(notes, note.id))}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : !editor ? <p className="casebook-empty">No private notes have been added.</p> : null}
      {editor && (
        <div className="casebook-note-compose">
          <textarea
            ref={inputRef}
            aria-label={editor.id ? 'Edit patient note' : 'New patient note'}
            maxLength={2000}
            placeholder="Write in your own hand…"
            value={editor.text}
            onChange={(event) => setEditor({ ...editor, text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditor(null);
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) save();
            }}
          />
          <div>
            <button type="button" onClick={() => setEditor(null)}>Cancel</button>
            <button type="button" className="is-primary" disabled={!editor.text.trim()} onClick={save}>Save note</button>
          </div>
        </div>
      )}
      {onDone && <button type="button" className="casebook-done" onClick={onDone}>Return to overview</button>}
    </section>
  );
}

function RecordPaper({ patient, record, status, notes, setNotes, tab, setTab, onBack }) {
  const visits = record?.visits || [];
  const latestVisit = visits.at(-1);
  const occupation = titleCase(patient.profile.social.occupation);
  const complaint = titleCase(patient.profile.clinical.presentingComplaint);
  return (
    <article className="casebook-record" key={patient.id} aria-label={`${patientName(patient)} patient record`}>
      <button type="button" className="casebook-mobile-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Patients
      </button>
      <header className="casebook-record-head">
        <div className="casebook-photo">
          <PatientPortrait patient={patient} recordPhoto />
          <i className="casebook-paperclip" aria-hidden="true" />
        </div>
        <div className="casebook-record-identity">
          <h2>{patientName(patient)}</h2>
          <span className="casebook-name-rule" aria-hidden="true" />
          <p>{occupation} <b aria-hidden="true">·</b> Age {patient.profile.identity.age}</p>
          <p>{record?.firstSeenAt ? `First seen ${formatDate(record.firstSeenAt)}` : 'Not yet seen'}</p>
        </div>
        <span className={`casebook-status-stamp is-${status.id}`}>{status.legend}</span>
      </header>

      <nav className="casebook-tabs" role="tablist" aria-label="Patient record sections">
        {[
          ['overview', 'Overview', null],
          ['visits', 'Visits', visits.length],
          ['notes', 'Notes', notes.length],
        ].map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-active' : ''}
            onClick={() => setTab(id)}
          >
            {label}{count !== null && <span>{count}</span>}
          </button>
        ))}
      </nav>

      <div className="casebook-record-body" key={tab}>
        {tab === 'overview' && (
          <>
            <section className="casebook-paper-section">
              <h3>Presenting complaint</h3>
              <p className="casebook-complaint">{complaint}.</p>
            </section>
            <section className="casebook-paper-section">
              <div className="casebook-section-heading">
                <h3>Visits</h3>
                {visits.length > 1 && <button type="button" className="casebook-text-button" onClick={() => setTab('visits')}>View all</button>}
              </div>
              <VisitTimeline record={record} />
            </section>
            <section className="casebook-paper-section casebook-notes-preview">
              <div className="casebook-section-heading">
                <h3>Notes</h3>
                <button type="button" className="casebook-edit-notes" onClick={() => setTab('notes')}>
                  <span aria-hidden="true">✎</span> Edit notes
                </button>
              </div>
              {notes.length ? notes.slice(-3).map((note) => <p key={note.id}>“{note.text}”</p>) : (
                <p className="casebook-empty">No private notes have been added.</p>
              )}
            </section>
          </>
        )}
        {tab === 'visits' && (
          <section className="casebook-paper-section casebook-all-visits">
            <h3>Visit history</h3>
            <VisitTimeline record={record} expanded />
          </section>
        )}
        {tab === 'notes' && (
          <NotesEditor patient={patient} notes={notes} setNotes={setNotes} onDone={() => setTab('overview')} />
        )}
      </div>
      {latestVisit?.status === 'in-progress' && (
        <p className="casebook-live-indicator"><i /> This record is being updated by the current consultation.</p>
      )}
    </article>
  );
}

export default function CasebookModal({ open, onClose, patients = [], day }) {
  useSyncExternalStore(subscribeCasebook, getCasebookRevision, getCasebookRevision);
  const records = getCasebookRecords();
  const [selectedId, setSelectedId] = useState(patients[0]?.id || null);
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('overview');
  const [notes, setNotes] = useState([]);
  const [mobileRecordOpen, setMobileRecordOpen] = useState(false);
  const containerRef = useDismissableOverlay(open, onClose);

  const activePatients = useMemo(
    () => patients.filter((patient) => records[patient.id]?.status !== 'closed'),
    [patients, records],
  );
  const visiblePatients = useMemo(() => {
    const source = filter === 'active' ? activePatients : patients;
    const query = search.trim().toLowerCase();
    return query
      ? source.filter((patient) => [patientName(patient), patient.profile.clinical.presentingComplaint]
        .some((value) => value.toLowerCase().includes(query)))
      : source;
  }, [activePatients, filter, patients, search]);
  const selected = patients.find((patient) => patient.id === selectedId) || visiblePatients[0] || patients[0];
  const selectedRecord = selected ? records[selected.id] || null : null;
  const selectedStatus = statusFor(selectedRecord);

  useEffect(() => {
    if (!open || !selected) return;
    setNotes(loadPatientNotes(selected));
    setTab('overview');
  }, [open, selected]);

  useEffect(() => {
    if (!open) setMobileRecordOpen(false);
  }, [open]);

  if (!open || !selected) return null;
  const dateLine = `${MONTHS[(day?.month || 1) - 1]} ${day?.date || 1}, ${day?.year || 1896}`;

  return (
    <div
      className="casebook-scrim"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={containerRef}
        className="casebook-shell"
        data-mobile-view={mobileRecordOpen ? 'record' : 'index'}
        role="dialog"
        aria-modal="true"
        aria-label="Casebook"
      >
        <button type="button" className="casebook-close" onClick={onClose} aria-label="Close casebook">×</button>
        <aside className="casebook-index">
          <header className="casebook-brand">
            <div>
              <h1>Casebook</h1>
              <p>My Practice <i aria-hidden="true">·</i> New York</p>
              <time>{dateLine}</time>
            </div>
          </header>

          <div className="casebook-filters" role="group" aria-label="Filter patient records">
            <button type="button" className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')}>Active ({activePatients.length})</button>
            <button type="button" className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')}>All ({patients.length})</button>
          </div>
          <label className="casebook-search">
            <span aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patients…" />
          </label>

          <div className="casebook-patient-list" role="listbox" aria-label="Patients">
            {visiblePatients.map((patient) => {
              const record = records[patient.id] || null;
              const status = statusFor(record);
              return (
                <button
                  key={patient.id}
                  type="button"
                  role="option"
                  aria-selected={patient.id === selected.id}
                  className={`casebook-patient${patient.id === selected.id ? ' is-selected' : ''}`}
                  onClick={() => {
                    setSelectedId(patient.id);
                    setMobileRecordOpen(true);
                  }}
                >
                  <StatusDot status={status} />
                  <PatientPortrait patient={patient} className="is-thumbnail" />
                  <span className="casebook-patient-copy">
                    <strong>{patientName(patient)}</strong>
                    <small>{titleCase(patient.profile.clinical.presentingComplaint)}</small>
                  </span>
                  <span className={`casebook-patient-status is-${status.id}`}>
                    <em>{status.label}</em><b aria-hidden="true">→</b>
                  </span>
                </button>
              );
            })}
            {!visiblePatients.length && <p className="casebook-index-empty">No matching patients.</p>}
          </div>

          <footer className="casebook-legend">
            {[
              { id: 'active', legend: 'Active case' },
              { id: 'waiting', legend: 'Waiting today' },
              { id: 'outcome', legend: 'Outcome recorded' },
              { id: 'inactive', legend: 'Inactive' },
            ].map((status) => <span key={status.id}><StatusDot status={status} />{status.legend}</span>)}
          </footer>
        </aside>

        <main className="casebook-paper-wrap">
          <RecordPaper
            patient={selected}
            record={selectedRecord}
            status={selectedStatus}
            notes={notes}
            setNotes={setNotes}
            tab={tab}
            setTab={setTab}
            onBack={() => setMobileRecordOpen(false)}
          />
        </main>
      </section>
    </div>
  );
}
